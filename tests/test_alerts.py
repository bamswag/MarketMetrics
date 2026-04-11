from datetime import datetime

from app.orm_models.price_alert import PriceAlertDB
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
        alert_id = create_response.json()["id"]

        list_response = self.client.get("/alerts/", headers=self.auth_headers(token))
        self.assertEqual(list_response.status_code, 200)
        list_payload = list_response.json()
        self.assertEqual(list_payload["activeCount"], 1)
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
