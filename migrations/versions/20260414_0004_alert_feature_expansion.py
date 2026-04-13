"""expand price_alerts schema and add alert_events table

Adds columns: severity, expiresAt, referencePrice, lowerBound, upperBound.
Expands condition check constraint for percent_change and range_exit.
Drops unique constraint (uniqueness enforced in service layer).
Creates alert_events table for trigger history logging.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260414_0004"
down_revision = "20260412_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- alert_events table --------------------------------------------------
    op.create_table(
        "alert_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "alertID",
            sa.String(),
            sa.ForeignKey("price_alerts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "userID",
            sa.String(),
            sa.ForeignKey("users.userID"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("condition", sa.String(), nullable=False),
        sa.Column("targetPrice", sa.Float(), nullable=True),
        sa.Column("triggerPrice", sa.Float(), nullable=False),
        sa.Column("triggeredAt", sa.DateTime(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_alert_event_alert_id", "alert_events", ["alertID"])
    op.create_index("idx_alert_event_user_id", "alert_events", ["userID"])

    # -- price_alerts table changes ------------------------------------------
    with op.batch_alter_table("price_alerts") as batch_op:
        # New columns
        batch_op.add_column(sa.Column("severity", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("expiresAt", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("referencePrice", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("lowerBound", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("upperBound", sa.Float(), nullable=True))

        # Make targetPrice nullable (range_exit alerts use bounds instead)
        batch_op.alter_column("targetPrice", existing_type=sa.Float(), nullable=True)

        # Drop old constraints
        batch_op.drop_constraint(
            "ck_price_alert_condition",
            type_="check",
        )
        batch_op.drop_constraint(
            "uq_price_alert_user_symbol_condition_target",
            type_="unique",
        )
        batch_op.drop_constraint(
            "ck_price_alert_target_price_positive",
            type_="check",
        )

        # Recreate condition check with new types
        batch_op.create_check_constraint(
            "ck_price_alert_condition",
            "condition IN ('above', 'below', 'percent_change', 'range_exit')",
        )


def downgrade() -> None:
    with op.batch_alter_table("price_alerts") as batch_op:
        batch_op.drop_constraint("ck_price_alert_condition", type_="check")

        batch_op.drop_column("upperBound")
        batch_op.drop_column("lowerBound")
        batch_op.drop_column("referencePrice")
        batch_op.drop_column("expiresAt")
        batch_op.drop_column("severity")

        batch_op.alter_column("targetPrice", existing_type=sa.Float(), nullable=False)

        batch_op.create_check_constraint(
            "ck_price_alert_condition",
            "condition IN ('above', 'below')",
        )
        batch_op.create_check_constraint(
            "ck_price_alert_target_price_positive",
            "targetPrice > 0",
        )
        batch_op.create_unique_constraint(
            "uq_price_alert_user_symbol_condition_target",
            ["userID", "symbol", "condition", "targetPrice"],
        )

    op.drop_index("idx_alert_event_user_id", table_name="alert_events")
    op.drop_index("idx_alert_event_alert_id", table_name="alert_events")
    op.drop_table("alert_events")
