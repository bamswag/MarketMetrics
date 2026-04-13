from datetime import datetime, timedelta

from app.orm_models.price_alert import PriceAlertDB
from app.orm_models.alert_event import AlertEventDB
from test_auth import BaseAPITestCase


class AlertCrudTests(BaseAPITestCase):
    def test_alert_crud_and_reset_flow(self):
        token = self.register_and_login()

        create_response = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={
                "symbol": "AAPL",
                "condition": "above",
                "targetPrice": 200,
            },
        )
        self.assertEqual(create_response.status_code, 201)
        alert_data = create_response.json()
        alert_id = alert_data["id"]
        self.assertEqual(alert_data["severity"], "normal")
        self.assertIsNone(alert_data["expiresAt"])
        self.assertIsNone(alert_data["referencePrice"])
        self.assertIsNone(alert_data["lowerBound"])
        self.assertIsNone(alert_data["upperBound"])
        self.assertEqual(alert_data["status"], "active")

        list_response = self.client.get("/alerts/", headers=self.auth_headers(token))
        self.assertEqual(list_response.status_code, 200)
        list_payload = list_response.json()
        self.assertEqual(list_payload["activeCount"], 1)
        self.assertEqual(list_payload["pausedCount"], 0)
        self.assertEqual(list_payload["triggeredCount"], 0)

        with self.TestingSessionLocal() as db:
            alert = db.query(PriceAlertDB).filter_by(id=alert_id).first()
            alert.isActive = False
            alert.triggeredAt = datetime.utcnow()
            db.commit()

        triggered_response = self.client.get("/alerts/triggered", headers=self.auth_headers(token))
        self.assertEqual(triggered_response.status_code, 200)
        self.assertEqual(len(triggered_response.json()), 1)

        reset_response = self.client.patch(
            f"/alerts/{alert_id}",
            headers=self.auth_headers(token),
            json={"resetTriggered": True},
        )
        self.assertEqual(reset_response.status_code, 200)
        self.assertTrue(reset_response.json()["isActive"])
        self.assertIsNone(reset_response.json()["triggeredAt"])

        delete_response = self.client.delete(
            f"/alerts/{alert_id}",
            headers=self.auth_headers(token),
        )
        self.assertEqual(delete_response.status_code, 204)

    def test_duplicate_alert_returns_friendly_error(self):
        token = self.register_and_login()

        self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "MSFT", "condition": "below", "targetPrice": 100},
        )
        dup = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "MSFT", "condition": "below", "targetPrice": 100},
        )
        self.assertEqual(dup.status_code, 400)
        self.assertIn("already have an alert", dup.json()["detail"])

    def test_pause_and_resume_alert(self):
        token = self.register_and_login()

        create = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "TSLA", "condition": "above", "targetPrice": 300},
        )
        alert_id = create.json()["id"]

        # Pause
        pause = self.client.patch(
            f"/alerts/{alert_id}",
            headers=self.auth_headers(token),
            json={"isActive": False},
        )
        self.assertEqual(pause.status_code, 200)
        self.assertFalse(pause.json()["isActive"])
        self.assertEqual(pause.json()["status"], "paused")

        # List should show in paused bucket
        alerts = self.client.get("/alerts/", headers=self.auth_headers(token)).json()
        self.assertEqual(alerts["pausedCount"], 1)
        self.assertEqual(alerts["activeCount"], 0)

        # Resume
        resume = self.client.patch(
            f"/alerts/{alert_id}",
            headers=self.auth_headers(token),
            json={"isActive": True},
        )
        self.assertEqual(resume.status_code, 200)
        self.assertTrue(resume.json()["isActive"])
        self.assertEqual(resume.json()["status"], "active")

    def test_edit_alert_target_and_condition(self):
        token = self.register_and_login()

        create = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "GOOG", "condition": "above", "targetPrice": 150},
        )
        alert_id = create.json()["id"]

        update = self.client.patch(
            f"/alerts/{alert_id}",
            headers=self.auth_headers(token),
            json={"condition": "below", "targetPrice": 120},
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["condition"], "below")
        self.assertEqual(update.json()["targetPrice"], 120)

    def test_severity_field(self):
        token = self.register_and_login()

        create = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "AMZN", "condition": "above", "targetPrice": 200, "severity": "urgent"},
        )
        self.assertEqual(create.status_code, 201)
        self.assertEqual(create.json()["severity"], "urgent")

        # Update severity
        alert_id = create.json()["id"]
        update = self.client.patch(
            f"/alerts/{alert_id}",
            headers=self.auth_headers(token),
            json={"severity": "normal"},
        )
        self.assertEqual(update.json()["severity"], "normal")

    def test_percent_change_alert(self):
        token = self.register_and_login()

        create = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={
                "symbol": "NVDA",
                "condition": "percent_change",
                "targetPrice": 5,
                "referencePrice": 100,
            },
        )
        self.assertEqual(create.status_code, 201)
        data = create.json()
        self.assertEqual(data["condition"], "percent_change")
        self.assertEqual(data["targetPrice"], 5)
        self.assertEqual(data["referencePrice"], 100)

    def test_range_exit_alert(self):
        token = self.register_and_login()

        create = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={
                "symbol": "META",
                "condition": "range_exit",
                "lowerBound": 400,
                "upperBound": 500,
            },
        )
        self.assertEqual(create.status_code, 201)
        data = create.json()
        self.assertEqual(data["condition"], "range_exit")
        self.assertIsNone(data["targetPrice"])
        self.assertEqual(data["lowerBound"], 400)
        self.assertEqual(data["upperBound"], 500)

    def test_range_exit_validation_lower_gte_upper(self):
        token = self.register_and_login()

        resp = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={
                "symbol": "META",
                "condition": "range_exit",
                "lowerBound": 500,
                "upperBound": 400,
            },
        )
        self.assertEqual(resp.status_code, 422)

    def test_expiration_field(self):
        token = self.register_and_login()

        expires = (datetime.utcnow() + timedelta(days=7)).isoformat()
        create = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={
                "symbol": "AAPL",
                "condition": "below",
                "targetPrice": 150,
                "expiresAt": expires,
            },
        )
        self.assertEqual(create.status_code, 201)
        self.assertIsNotNone(create.json()["expiresAt"])

    def test_filter_alerts_by_symbol(self):
        token = self.register_and_login()

        self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "AAPL", "condition": "above", "targetPrice": 200},
        )
        self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "MSFT", "condition": "above", "targetPrice": 400},
        )

        filtered = self.client.get(
            "/alerts/?symbol=AAPL", headers=self.auth_headers(token)
        ).json()
        self.assertEqual(filtered["totalCount"], 1)
        self.assertEqual(filtered["activeAlerts"][0]["symbol"], "AAPL")

    def test_bulk_pause_and_delete(self):
        token = self.register_and_login()

        ids = []
        for sym in ("AAPL", "MSFT", "GOOG"):
            resp = self.client.post(
                "/alerts/",
                headers=self.auth_headers(token),
                json={"symbol": sym, "condition": "above", "targetPrice": 200},
            )
            ids.append(resp.json()["id"])

        # Bulk pause
        pause = self.client.post(
            "/alerts/bulk",
            headers=self.auth_headers(token),
            json={"alertIds": ids[:2], "action": "pause"},
        )
        self.assertEqual(pause.status_code, 200)
        self.assertEqual(pause.json()["affected"], 2)

        alerts = self.client.get("/alerts/", headers=self.auth_headers(token)).json()
        self.assertEqual(alerts["pausedCount"], 2)
        self.assertEqual(alerts["activeCount"], 1)

        # Bulk delete
        delete = self.client.post(
            "/alerts/bulk",
            headers=self.auth_headers(token),
            json={"alertIds": ids, "action": "delete"},
        )
        self.assertEqual(delete.json()["affected"], 3)

        alerts = self.client.get("/alerts/", headers=self.auth_headers(token)).json()
        self.assertEqual(alerts["totalCount"], 0)

    def test_alert_history_endpoint(self):
        token = self.register_and_login()

        create = self.client.post(
            "/alerts/",
            headers=self.auth_headers(token),
            json={"symbol": "AAPL", "condition": "above", "targetPrice": 200},
        )
        alert_id = create.json()["id"]

        # Manually create an alert event
        with self.TestingSessionLocal() as db:
            alert = db.query(PriceAlertDB).filter_by(id=alert_id).first()
            alert.isActive = False
            alert.triggeredAt = datetime.utcnow()
            event = AlertEventDB(
                alertID=alert_id,
                userID=alert.userID,
                symbol="AAPL",
                condition="above",
                targetPrice=200,
                triggerPrice=205,
                triggeredAt=datetime.utcnow(),
            )
            db.add(event)
            db.commit()

        # Fetch history for specific alert
        history = self.client.get(
            f"/alerts/{alert_id}/history",
            headers=self.auth_headers(token),
        )
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json()["totalCount"], 1)
        self.assertEqual(history.json()["events"][0]["triggerPrice"], 205)

        # Fetch recent events across all alerts
        recent = self.client.get("/alerts/history", headers=self.auth_headers(token))
        self.assertEqual(recent.status_code, 200)
        self.assertGreaterEqual(recent.json()["totalCount"], 1)

    def test_email_preferences_toggle(self):
        token = self.register_and_login()

        me = self.client.get("/auth/me", headers=self.auth_headers(token)).json()
        self.assertFalse(me.get("emailNotificationsEnabled", False))

        update = self.client.patch(
            "/auth/me/preferences",
            headers=self.auth_headers(token),
            json={"emailNotificationsEnabled": True},
        )
        self.assertEqual(update.status_code, 200)
        self.assertTrue(update.json()["emailNotificationsEnabled"])

        # Toggle off
        update2 = self.client.patch(
            "/auth/me/preferences",
            headers=self.auth_headers(token),
            json={"emailNotificationsEnabled": False},
        )
        self.assertFalse(update2.json()["emailNotificationsEnabled"])
