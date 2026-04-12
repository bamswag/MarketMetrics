"""add composite index on price_alerts (userID, symbol, isActive)"""

from alembic import op


revision = "20260412_0003"
down_revision = "20260402_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "idx_price_alert_user_symbol_active",
        "price_alerts",
        ["userID", "symbol", "isActive"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_price_alert_user_symbol_active",
        table_name="price_alerts",
    )
