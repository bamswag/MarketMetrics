import os
import tempfile
import unittest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.core.websocket_auth as ws_auth_module
import app.orm_models  # noqa: F401
from app.api.routes import websocket_quotes as ws_quotes_router
from app.core.config import settings
from app.core.database import Base
from app.core.db_dependencies import get_db
from app.main import app
from app.orm_models.user import UserDB
from app.services import market_overview as market_overview_service
from app.services import price_history as price_history_service
from app.services import quotes as quotes_service

try:
    import joblib  # noqa: F401
    import numpy  # noqa: F401
    import pandas  # noqa: F401
    import sklearn  # noqa: F401

    ML_DEPENDENCIES_AVAILABLE = True
except Exception:
    ML_DEPENDENCIES_AVAILABLE = False


class BaseAPITestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db_fd, cls.db_path = tempfile.mkstemp(suffix=".db")
        database_url = f"sqlite:///{cls.db_path}"
        cls.engine = create_engine(database_url, connect_args={"check_same_thread": False})
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db

        cls.original_ws_auth_session_local = ws_auth_module.SessionLocal
        cls.original_ws_quotes_session_local = ws_quotes_router.SessionLocal
        ws_auth_module.SessionLocal = cls.TestingSessionLocal
        ws_quotes_router.SessionLocal = cls.TestingSessionLocal

        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        app.dependency_overrides.clear()
        ws_auth_module.SessionLocal = cls.original_ws_auth_session_local
        ws_quotes_router.SessionLocal = cls.original_ws_quotes_session_local
        cls.engine.dispose()
        os.close(cls.db_fd)
        os.unlink(cls.db_path)

    def setUp(self):
        with self.TestingSessionLocal() as db:
            for table in reversed(Base.metadata.sorted_tables):
                db.execute(table.delete())
            db.commit()
        quotes_service._quote_cache.clear()
        quotes_service._quote_locks.clear()
        price_history_service._history_cache.clear()
        price_history_service._history_locks.clear()
        market_overview_service._movers_cache.clear()
        market_overview_service._movers_cache_locks.clear()
        market_overview_service._featured_mover_cache.clear()
        market_overview_service._featured_mover_cache_locks.clear()

    def register_and_login(self, email="tester@example.com", password="password123", display_name="Tester"):
        with patch("app.services.auth.send_welcome_email", return_value=True):
            register_response = self.client.post(
                "/auth/register",
                json={
                    "email": email,
                    "password": password,
                    "displayName": display_name,
                    "acceptedTerms": True,
                },
            )
        self.assertEqual(register_response.status_code, 201)

        login_response = self.client.post(
            "/auth/login",
            data={"username": email, "password": password},
        )
        self.assertEqual(login_response.status_code, 200)
        return login_response.json()["access_token"]

    def auth_headers(self, token: str):
        return {"Authorization": f"Bearer {token}"}


def _generate_synthetic_rows(start_day: date, count: int, start_price: float, slope: float):
    rows = []
    current_day = start_day
    current_price = start_price
    index = 0
    while len(rows) < count:
        if current_day.weekday() < 5:
            close = round(current_price, 4)
            rows.append(
                {
                    "date": current_day,
                    "open": round(close * 0.998, 4),
                    "high": round(close * 1.01, 4),
                    "low": round(close * 0.99, 4),
                    "close": close,
                    "volume": 1_000_000 + (index * 1000),
                }
            )
            current_price *= 1 + slope + (0.0008 if index % 7 == 0 else -0.0002)
            index += 1
        current_day += timedelta(days=1)
    return rows


class AuthTests(BaseAPITestCase):
    @patch("app.services.auth.send_welcome_email", return_value=True)
    def test_register_and_login_returns_bearer_token(self, mock_send_welcome_email):
        response = self.client.post(
            "/auth/register",
            json={
                "email": "auth@example.com",
                "password": "password123",
                "displayName": "Auth User",
                "acceptedTerms": True,
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["email"], "auth@example.com")
        self.assertEqual(response.json()["primaryAuthProvider"], "password")
        self.assertEqual(response.json()["planName"], "Free")
        self.assertEqual(response.json()["accountStatus"], "Active")
        mock_send_welcome_email.assert_called_once_with("auth@example.com", "Auth User")

        login_response = self.client.post(
            "/auth/login",
            data={"username": "auth@example.com", "password": "password123"},
        )
        self.assertEqual(login_response.status_code, 200)
        payload = login_response.json()
        self.assertIn("access_token", payload)
        self.assertEqual(payload["token_type"], "bearer")

    @patch("app.services.auth.send_welcome_email", return_value=False)
    def test_register_succeeds_when_welcome_email_delivery_fails(self, mock_send_welcome_email):
        response = self.client.post(
            "/auth/register",
            json={
                "email": "welcome-failure@example.com",
                "password": "password123",
                "displayName": "Welcome Failure",
                "acceptedTerms": True,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["email"], "welcome-failure@example.com")
        mock_send_welcome_email.assert_called_once_with(
            "welcome-failure@example.com",
            "Welcome Failure",
        )

    def test_authenticated_user_profile_returns_display_name(self):
        token = self.register_and_login(
            email="profile@example.com",
            password="password123",
            display_name="Profile User",
        )

        response = self.client.get("/auth/me", headers=self.auth_headers(token))
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertEqual(payload["email"], "profile@example.com")
        self.assertEqual(payload["displayName"], "Profile User")
        self.assertEqual(payload["primaryAuthProvider"], "password")

    @patch("app.api.routes.auth.build_google_authorization_url")
    def test_google_login_redirects_to_google_provider(self, mock_build_google_url):
        mock_build_google_url.return_value = "https://accounts.google.com/o/oauth2/v2/auth?client_id=test"

        response = self.client.get("/auth/google/login", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(
            response.headers["location"],
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
        )
        mock_build_google_url.assert_called_once_with(
            "/",
            intent="login",
            accepted_terms=False,
            frontend_origin=None,
            request_origin="http://testserver",
        )

    @patch("app.services.auth.send_welcome_email", return_value=True)
    @patch("app.api.routes.auth.exchange_google_code_for_userinfo", new_callable=AsyncMock)
    def test_google_callback_creates_user_and_redirects_with_token(
        self,
        mock_exchange_google_code,
        mock_send_welcome_email,
    ):
        mock_exchange_google_code.return_value = (
            {
                "email": "googleuser@example.com",
                "name": "Google User",
                "sub": "google-sub-1",
            },
            {"returnTo": "/", "intent": "signup", "acceptedTerms": True},
        )

        response = self.client.get(
            "/auth/google/callback",
            params={"code": "google-code", "state": "signed-state"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 307)
        self.assertTrue(
            response.headers["location"].startswith(f"{settings.frontend_base_url.rstrip('/')}/#token=")
        )
        mock_exchange_google_code.assert_awaited_once_with(
            "google-code",
            "signed-state",
            request_origin="http://testserver",
        )

        with self.TestingSessionLocal() as db:
            user = db.query(UserDB).filter_by(email="googleuser@example.com").first()
            self.assertIsNotNone(user)
            self.assertEqual(user.displayName, "Google User")
            self.assertEqual(user.primaryAuthProvider, "google")
            self.assertFalse(user.passwordAuthEnabled)
            self.assertEqual(user.googleSubject, "google-sub-1")
            self.assertIsNotNone(user.emailVerifiedAt)
        mock_send_welcome_email.assert_called_once_with("googleuser@example.com", "Google User")

    @patch("app.services.auth.send_welcome_email", return_value=True)
    @patch("app.api.routes.auth.exchange_google_code_for_userinfo", new_callable=AsyncMock)
    def test_google_callback_existing_google_user_does_not_send_welcome_email(
        self,
        mock_exchange_google_code,
        mock_send_welcome_email,
    ):
        mock_exchange_google_code.return_value = (
            {
                "email": "returning-google@example.com",
                "name": "Returning Google",
                "sub": "google-sub-returning",
            },
            {"returnTo": "/", "intent": "signup", "acceptedTerms": True},
        )

        first_response = self.client.get(
            "/auth/google/callback",
            params={"code": "google-code", "state": "signed-state"},
            follow_redirects=False,
        )
        self.assertEqual(first_response.status_code, 307)
        mock_send_welcome_email.assert_called_once_with(
            "returning-google@example.com",
            "Returning Google",
        )

        mock_send_welcome_email.reset_mock()
        mock_exchange_google_code.return_value = (
            {
                "email": "returning-google@example.com",
                "name": "Returning Google",
                "sub": "google-sub-returning",
            },
            {"returnTo": "/", "intent": "login", "acceptedTerms": False},
        )

        second_response = self.client.get(
            "/auth/google/callback",
            params={"code": "google-code", "state": "signed-state"},
            follow_redirects=False,
        )

        self.assertEqual(second_response.status_code, 307)
        mock_send_welcome_email.assert_not_called()

    @patch("app.services.auth.send_welcome_email", return_value=True)
    @patch("app.api.routes.auth.exchange_google_code_for_userinfo", new_callable=AsyncMock)
    def test_google_callback_links_existing_password_account_without_weakening_password_rules(
        self,
        mock_exchange_google_code,
        mock_send_welcome_email,
    ):
        token = self.register_and_login(email="hybrid@example.com", password="password123")
        mock_send_welcome_email.reset_mock()
        mock_exchange_google_code.return_value = (
            {
                "email": "hybrid@example.com",
                "name": "Hybrid User",
                "sub": "google-sub-hybrid",
            },
            {"returnTo": "/", "intent": "login", "acceptedTerms": False},
        )

        response = self.client.get(
            "/auth/google/callback",
            params={"code": "google-code", "state": "signed-state"},
            follow_redirects=False,
        )

        self.assertEqual(response.status_code, 307)
        with self.TestingSessionLocal() as db:
            user = db.query(UserDB).filter_by(email="hybrid@example.com").first()
            self.assertIsNotNone(user)
            self.assertEqual(user.primaryAuthProvider, "password")
            self.assertTrue(user.passwordAuthEnabled)
            self.assertEqual(user.googleSubject, "google-sub-hybrid")
        mock_send_welcome_email.assert_not_called()

        missing_current_password_response = self.client.post(
            "/auth/me/password",
            json={"newPassword": "newpassword123"},
            headers=self.auth_headers(token),
        )
        self.assertEqual(missing_current_password_response.status_code, 400)
        self.assertIn("current password", missing_current_password_response.text)

        change_response = self.client.post(
            "/auth/me/password",
            json={"currentPassword": "password123", "newPassword": "newpassword123"},
            headers=self.auth_headers(token),
        )
        self.assertEqual(change_response.status_code, 200)

    def test_protected_route_requires_valid_token(self):
        token = self.register_and_login()
        response = self.client.get("/alerts/", headers=self.auth_headers(token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["totalCount"], 0)

    def test_register_requires_terms_acceptance(self):
        response = self.client.post(
            "/auth/register",
            json={
                "email": "missingterms@example.com",
                "password": "password123",
                "displayName": "Missing Terms",
                "acceptedTerms": False,
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("Terms", response.text)

    def test_update_profile_changes_display_name(self):
        token = self.register_and_login(
            email="rename@example.com",
            password="password123",
            display_name="Original Name",
        )

        response = self.client.patch(
            "/auth/me",
            json={"displayName": "Updated Name"},
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["displayName"], "Updated Name")
        self.assertEqual(response.json()["email"], "rename@example.com")

    @patch("app.services.auth.send_email_change_verification_email", return_value=True)
    @patch("app.services.auth._generate_one_time_token", return_value="email-change-token")
    def test_email_change_request_stores_pending_email(
        self,
        _mock_token,
        mock_send_email,
    ):
        token = self.register_and_login(email="profilechange@example.com")

        response = self.client.patch(
            "/auth/me",
            json={"email": "newprofile@example.com"},
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["email"], "profilechange@example.com")
        self.assertEqual(payload["pendingEmail"], "newprofile@example.com")
        self.assertIsNotNone(payload["emailVerifiedAt"])
        mock_send_email.assert_called_once()
        _, _, verification_url = mock_send_email.call_args.args
        self.assertEqual(
            verification_url,
            f"{settings.frontend_base_url.rstrip('/')}/verify-email/email-change-token",
        )

        with self.TestingSessionLocal() as db:
            user = db.query(UserDB).filter_by(email="profilechange@example.com").first()
            self.assertIsNotNone(user)
            self.assertEqual(user.pendingEmail, "newprofile@example.com")
            self.assertIsNotNone(user.pendingEmailTokenHash)
            self.assertIsNotNone(user.pendingEmailTokenExpiresAt)

    @patch("app.services.auth.send_email_change_verification_email", return_value=True)
    @patch("app.services.auth._generate_one_time_token", return_value="verify-email-token")
    def test_verify_email_commits_pending_email(self, _mock_token, _mock_send_email):
        token = self.register_and_login(email="beforeverify@example.com")

        request_response = self.client.patch(
            "/auth/me",
            json={"email": "afterverify@example.com"},
            headers=self.auth_headers(token),
        )
        self.assertEqual(request_response.status_code, 200)

        verify_response = self.client.post(
            "/auth/email/verify",
            json={"token": "verify-email-token"},
        )

        self.assertEqual(verify_response.status_code, 200)
        self.assertEqual(verify_response.json()["message"], "Email verified successfully.")

        old_login_response = self.client.post(
            "/auth/login",
            data={"username": "beforeverify@example.com", "password": "password123"},
        )
        self.assertEqual(old_login_response.status_code, 401)

        new_login_response = self.client.post(
            "/auth/login",
            data={"username": "afterverify@example.com", "password": "password123"},
        )
        self.assertEqual(new_login_response.status_code, 200)

    @patch("app.services.auth.send_password_reset_email", return_value=True)
    @patch("app.services.auth._generate_one_time_token", return_value="password-reset-token")
    def test_forgot_password_returns_generic_message_for_known_and_unknown_emails(
        self,
        _mock_token,
        mock_send_email,
    ):
        self.register_and_login(email="recoverable@example.com")

        known_response = self.client.post(
            "/auth/password/forgot",
            json={"email": "recoverable@example.com"},
        )
        unknown_response = self.client.post(
            "/auth/password/forgot",
            json={"email": "unknown@example.com"},
        )

        self.assertEqual(known_response.status_code, 200)
        self.assertEqual(unknown_response.status_code, 200)
        self.assertEqual(known_response.json(), unknown_response.json())
        mock_send_email.assert_called_once()
        _, _, reset_url = mock_send_email.call_args.args
        self.assertEqual(
            reset_url,
            f"{settings.frontend_base_url.rstrip('/')}/reset-password/password-reset-token",
        )

    @patch.dict(os.environ, {"FRONTEND_BASE_URL": "https://marketmetrics.dev\n"}, clear=False)
    @patch("app.services.auth.send_password_reset_email", return_value=True)
    @patch("app.services.auth._generate_one_time_token", return_value="token with/slash")
    def test_forgot_password_sanitizes_and_encodes_reset_url(
        self,
        _mock_token,
        mock_send_email,
    ):
        self.register_and_login(email="newline-base-url@example.com")

        response = self.client.post(
            "/auth/password/forgot",
            json={"email": "newline-base-url@example.com"},
        )

        self.assertEqual(response.status_code, 200)
        mock_send_email.assert_called_once()
        _, _, reset_url = mock_send_email.call_args.args
        self.assertEqual(
            reset_url,
            "https://marketmetrics.dev/reset-password/token%20with%2Fslash",
        )
        self.assertNotIn("\n", reset_url)

    def test_password_reset_email_html_keeps_action_links_continuous(self):
        from app.services.email import _build_password_reset_email_html

        html = _build_password_reset_email_html(
            "Ayo <Admin>",
            "https://marketmetrics.dev\n/reset-password/reset-token",
        )

        expected_href = 'href="https://marketmetrics.dev/reset-password/reset-token"'
        self.assertEqual(html.count(expected_href), 2)
        self.assertNotIn("https://marketmetrics.dev\n/reset-password", html)
        self.assertIn("Ayo &lt;Admin&gt;", html)

    def test_welcome_email_html_escapes_display_name(self):
        from app.services.email import _build_welcome_email_html

        html = _build_welcome_email_html(
            "Ayo <Admin>",
            "https://marketmetrics.dev\n/account",
        )

        self.assertIn("Welcome to MarketMetrics", html)
        self.assertIn("Ayo &lt;Admin&gt;", html)
        self.assertNotIn("Ayo <Admin>", html)
        self.assertEqual(html.count('href="https://marketmetrics.dev/account"'), 2)
        self.assertNotIn("https://marketmetrics.dev\n/account", html)

    def test_email_action_url_redaction_keeps_tokens_out_of_logs(self):
        from app.services.email import _redact_action_url

        redacted_url = _redact_action_url(
            "https://marketmetrics.dev\n/reset-password/private-reset-token",
        )

        self.assertEqual(redacted_url, "https://marketmetrics.dev/reset-password/<redacted>")
        self.assertNotIn("private-reset-token", redacted_url)
        self.assertNotIn("\n", redacted_url)

    @patch.dict(
        os.environ,
        {
            "BREVO_TRANSACTIONAL_EMAIL_URL": "https://api.brevo.com/v3/smtp/email\n",
            "BREVO_API_KEY": "\tbrevo-key\n",
            "EMAIL_FROM_ADDRESS": "noreply@marketmetrics.dev\n",
        },
        clear=False,
    )
    def test_email_provider_config_strips_hidden_control_whitespace(self):
        self.assertEqual(settings.brevo_transactional_email_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(settings.brevo_api_key, "brevo-key")
        self.assertEqual(settings.email_from_address, "noreply@marketmetrics.dev")

    @patch("app.services.auth.send_password_reset_email", return_value=True)
    @patch("app.services.auth._generate_one_time_token", return_value="live-reset-token")
    def test_password_reset_consumes_token_and_allows_new_login(self, _mock_token, _mock_send_email):
        self.register_and_login(
            email="resetme@example.com",
            password="password123",
            display_name="Reset Me",
        )

        forgot_response = self.client.post(
            "/auth/password/forgot",
            json={"email": "resetme@example.com"},
        )
        self.assertEqual(forgot_response.status_code, 200)

        reset_response = self.client.post(
            "/auth/password/reset",
            json={"token": "live-reset-token", "newPassword": "newpassword123"},
        )
        self.assertEqual(reset_response.status_code, 200)

        reused_response = self.client.post(
            "/auth/password/reset",
            json={"token": "live-reset-token", "newPassword": "anotherpassword123"},
        )
        self.assertEqual(reused_response.status_code, 400)

        old_login_response = self.client.post(
            "/auth/login",
            data={"username": "resetme@example.com", "password": "password123"},
        )
        self.assertEqual(old_login_response.status_code, 401)

        new_login_response = self.client.post(
            "/auth/login",
            data={"username": "resetme@example.com", "password": "newpassword123"},
        )
        self.assertEqual(new_login_response.status_code, 200)

    def test_change_password_requires_current_password_and_invalidates_token(self):
        token = self.register_and_login(email="changepw@example.com", password="password123")

        missing_current_response = self.client.post(
            "/auth/me/password",
            json={"newPassword": "brandnewpass123"},
            headers=self.auth_headers(token),
        )
        self.assertEqual(missing_current_response.status_code, 400)

        update_response = self.client.post(
            "/auth/me/password",
            json={"currentPassword": "password123", "newPassword": "brandnewpass123"},
            headers=self.auth_headers(token),
        )
        self.assertEqual(update_response.status_code, 200)

        expired_token_response = self.client.get("/auth/me", headers=self.auth_headers(token))
        self.assertEqual(expired_token_response.status_code, 401)

        new_login_response = self.client.post(
            "/auth/login",
            data={"username": "changepw@example.com", "password": "brandnewpass123"},
        )
        self.assertEqual(new_login_response.status_code, 200)

    def test_logout_all_invalidates_existing_token(self):
        token = self.register_and_login(email="logoutall@example.com")

        logout_response = self.client.post(
            "/auth/me/logout-all",
            headers=self.auth_headers(token),
        )

        self.assertEqual(logout_response.status_code, 200)
        self.assertEqual(logout_response.json()["message"], "Signed out of all sessions.")

        expired_token_response = self.client.get("/auth/me", headers=self.auth_headers(token))
        self.assertEqual(expired_token_response.status_code, 401)
