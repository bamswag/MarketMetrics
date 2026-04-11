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

    def register_and_login(self, email="tester@example.com", password="password123", display_name="Tester"):
        register_response = self.client.post(
            "/auth/register",
            json={
                "email": email,
                "password": password,
                "displayName": display_name,
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
    def test_register_and_login_returns_bearer_token(self):
        response = self.client.post(
            "/auth/register",
            json={
                "email": "auth@example.com",
                "password": "password123",
                "displayName": "Auth User",
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["email"], "auth@example.com")

        login_response = self.client.post(
            "/auth/login",
            data={"username": "auth@example.com", "password": "password123"},
        )
        self.assertEqual(login_response.status_code, 200)
        payload = login_response.json()
        self.assertIn("access_token", payload)
        self.assertEqual(payload["token_type"], "bearer")

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

    @patch("app.api.routes.auth.build_google_authorization_url")
    def test_google_login_redirects_to_google_provider(self, mock_build_google_url):
        mock_build_google_url.return_value = "https://accounts.google.com/o/oauth2/v2/auth?client_id=test"

        response = self.client.get("/auth/google/login", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(
            response.headers["location"],
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
        )

    @patch("app.api.routes.auth.exchange_google_code_for_userinfo", new_callable=AsyncMock)
    def test_google_callback_creates_user_and_redirects_with_token(self, mock_exchange_google_code):
        mock_exchange_google_code.return_value = (
            {
                "email": "googleuser@example.com",
                "name": "Google User",
            },
            "/",
        )

        response = self.client.get(
            "/auth/google/callback",
            params={"code": "google-code", "state": "signed-state"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 307)
        self.assertTrue(response.headers["location"].startswith("http://127.0.0.1:5173/#token="))

        with self.TestingSessionLocal() as db:
            user = db.query(UserDB).filter_by(email="googleuser@example.com").first()
            self.assertIsNotNone(user)
            self.assertEqual(user.displayName, "Google User")

    def test_protected_route_requires_valid_token(self):
        token = self.register_and_login()
        response = self.client.get("/alerts/", headers=self.auth_headers(token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["totalCount"], 0)
