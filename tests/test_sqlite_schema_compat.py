import os
import tempfile
import unittest

from sqlalchemy import create_engine, inspect, text

from app.core.database import ensure_local_sqlite_schema


class SQLiteSchemaCompatTests(unittest.TestCase):
    def test_ensure_local_sqlite_schema_adds_missing_local_dev_columns(self):
        db_fd, db_path = tempfile.mkstemp(suffix=".db")
        engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )

        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        CREATE TABLE users (
                            "userID" VARCHAR NOT NULL,
                            email VARCHAR NOT NULL,
                            "passwordHash" VARCHAR NOT NULL,
                            "displayName" VARCHAR NOT NULL,
                            "createdAt" DATETIME NOT NULL,
                            "lastLoginAt" DATETIME,
                            PRIMARY KEY ("userID")
                        )
                        """
                    )
                )
                connection.execute(
                    text(
                        """
                        CREATE TABLE price_alerts (
                            id VARCHAR NOT NULL,
                            "userID" VARCHAR NOT NULL,
                            symbol VARCHAR NOT NULL,
                            condition VARCHAR NOT NULL,
                            "targetPrice" FLOAT,
                            "isActive" BOOLEAN NOT NULL,
                            "createdAt" DATETIME NOT NULL,
                            "updatedAt" DATETIME NOT NULL,
                            "lastEvaluatedAt" DATETIME,
                            "triggeredAt" DATETIME,
                            PRIMARY KEY (id)
                        )
                        """
                    )
                )

            ensure_local_sqlite_schema(engine)
            ensure_local_sqlite_schema(engine)

            inspector = inspect(engine)
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            alert_columns = {column["name"] for column in inspector.get_columns("price_alerts")}

            self.assertIn("passwordAuthEnabled", user_columns)
            self.assertIn("googleSubject", user_columns)
            self.assertIn("emailNotificationsEnabled", user_columns)
            self.assertIn("riskProfile", user_columns)
            self.assertIn("sessionVersion", user_columns)
            self.assertIn("severity", alert_columns)
            self.assertIn("expiresAt", alert_columns)
            self.assertIn("referencePrice", alert_columns)
            self.assertIn("lowerBound", alert_columns)
            self.assertIn("upperBound", alert_columns)
            self.assertTrue(inspector.has_table("alert_events"))
            self.assertTrue(inspector.has_table("watchlist_items"))
        finally:
            engine.dispose()
            os.close(db_fd)
            os.unlink(db_path)
