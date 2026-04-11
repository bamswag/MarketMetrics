"""baseline schema"""

from alembic import op
import sqlalchemy as sa


revision = "20260401_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "price_alerts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("userID", sa.String(), nullable=False),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("condition", sa.String(), nullable=False),
        sa.Column("targetPrice", sa.Float(), nullable=False),
        sa.Column("isActive", sa.Boolean(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.Column("updatedAt", sa.DateTime(), nullable=False),
        sa.Column("lastEvaluatedAt", sa.DateTime(), nullable=True),
        sa.Column("triggeredAt", sa.DateTime(), nullable=True),
        sa.CheckConstraint("condition IN ('above', 'below')", name="ck_price_alert_condition"),
        sa.CheckConstraint("targetPrice > 0", name="ck_price_alert_target_price_positive"),
        sa.ForeignKeyConstraint(["userID"], ["users.userID"], name="fk_price_alerts_user_id_users"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "userID",
            "symbol",
            "condition",
            "targetPrice",
            name="uq_price_alert_user_symbol_condition_target",
        ),
    )
    op.create_index(op.f("ix_price_alerts_symbol"), "price_alerts", ["symbol"], unique=False)
    op.create_index(op.f("ix_price_alerts_userID"), "price_alerts", ["userID"], unique=False)

    op.create_table(
        "simulation_history",
        sa.Column("simulationId", sa.String(), nullable=False),
        sa.Column("userID", sa.String(), nullable=False),
        sa.Column("assetSymbol", sa.String(), nullable=False),
        sa.Column("assetName", sa.String(), nullable=True),
        sa.Column("strategy", sa.String(), nullable=False),
        sa.Column("startDate", sa.String(), nullable=False),
        sa.Column("endDate", sa.String(), nullable=False),
        sa.Column("initialAmount", sa.Float(), nullable=False),
        sa.Column("finalValue", sa.Float(), nullable=False),
        sa.Column("totalReturnPct", sa.Float(), nullable=False),
        sa.Column("maxDrawdownPct", sa.Float(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("simulationId"),
    )
    op.create_index(op.f("ix_simulation_history_simulationId"), "simulation_history", ["simulationId"], unique=False)
    op.create_index(op.f("ix_simulation_history_userID"), "simulation_history", ["userID"], unique=False)

    op.create_table(
        "users",
        sa.Column("userID", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("passwordHash", sa.String(), nullable=False),
        sa.Column("displayName", sa.String(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.Column("lastLoginAt", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("userID"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_userID"), "users", ["userID"], unique=False)

    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("userID", sa.String(), nullable=False),
        sa.Column("symbol", sa.String(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("userID", "symbol", name="uq_watchlist_user_symbol"),
    )
    op.create_index(op.f("ix_watchlist_items_symbol"), "watchlist_items", ["symbol"], unique=False)
    op.create_index(op.f("ix_watchlist_items_userID"), "watchlist_items", ["userID"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_watchlist_items_userID"), table_name="watchlist_items")
    op.drop_index(op.f("ix_watchlist_items_symbol"), table_name="watchlist_items")
    op.drop_table("watchlist_items")

    op.drop_index(op.f("ix_users_userID"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    op.drop_index(op.f("ix_simulation_history_userID"), table_name="simulation_history")
    op.drop_index(op.f("ix_simulation_history_simulationId"), table_name="simulation_history")
    op.drop_table("simulation_history")

    op.drop_index(op.f("ix_price_alerts_userID"), table_name="price_alerts")
    op.drop_index(op.f("ix_price_alerts_symbol"), table_name="price_alerts")
    op.drop_table("price_alerts")
