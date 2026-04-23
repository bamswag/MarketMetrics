"""rework simulation_history for growth projection runs

Replaces the buy-and-hold/DCA-oriented columns with growth-projection
params and result metrics. The old columns were never written to from the
frontend, so no data migration is required.
"""

import sqlalchemy as sa
from alembic import op

revision = "20260425_0009"
down_revision = "20260424_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("simulation_history") as batch_op:
        # Remove old buy-and-hold / DCA columns
        batch_op.drop_column("strategy")
        batch_op.drop_column("startDate")
        batch_op.drop_column("endDate")
        batch_op.drop_column("recurringContribution")
        batch_op.drop_column("contributionFrequency")
        batch_op.drop_column("investedAmount")
        batch_op.drop_column("finalValue")
        batch_op.drop_column("totalReturnPct")
        batch_op.drop_column("annualizedReturnPct")
        batch_op.drop_column("volatilityPct")
        batch_op.drop_column("maxDrawdownPct")

        # Add growth-projection request params
        batch_op.add_column(
            sa.Column("projectionYears", sa.Integer(), nullable=False, server_default="10")
        )
        batch_op.add_column(
            sa.Column("monthlyContribution", sa.Float(), nullable=False, server_default="0.0")
        )
        batch_op.add_column(
            sa.Column("inflationRate", sa.Float(), nullable=False, server_default="0.0")
        )

        # Add growth-projection result metrics
        batch_op.add_column(
            sa.Column("totalInvested", sa.Float(), nullable=False, server_default="0.0")
        )
        batch_op.add_column(
            sa.Column("baselineEndValue", sa.Float(), nullable=False, server_default="0.0")
        )
        batch_op.add_column(
            sa.Column("pessimisticEndValue", sa.Float(), nullable=False, server_default="0.0")
        )
        batch_op.add_column(
            sa.Column("optimisticEndValue", sa.Float(), nullable=False, server_default="0.0")
        )
        batch_op.add_column(
            sa.Column("baselineGrowthPct", sa.Float(), nullable=False, server_default="0.0")
        )
        batch_op.add_column(
            sa.Column("probabilityOfProfit", sa.Float(), nullable=False, server_default="0.0")
        )


def downgrade() -> None:
    with op.batch_alter_table("simulation_history") as batch_op:
        # Remove growth-projection columns
        batch_op.drop_column("probabilityOfProfit")
        batch_op.drop_column("baselineGrowthPct")
        batch_op.drop_column("optimisticEndValue")
        batch_op.drop_column("pessimisticEndValue")
        batch_op.drop_column("baselineEndValue")
        batch_op.drop_column("totalInvested")
        batch_op.drop_column("inflationRate")
        batch_op.drop_column("monthlyContribution")
        batch_op.drop_column("projectionYears")

        # Restore old columns
        batch_op.add_column(sa.Column("strategy", sa.String(), nullable=False, server_default="buy_and_hold"))
        batch_op.add_column(sa.Column("startDate", sa.String(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("endDate", sa.String(), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("recurringContribution", sa.Float(), nullable=False, server_default="0.0"))
        batch_op.add_column(sa.Column("contributionFrequency", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("investedAmount", sa.Float(), nullable=False, server_default="0.0"))
        batch_op.add_column(sa.Column("finalValue", sa.Float(), nullable=False, server_default="0.0"))
        batch_op.add_column(sa.Column("totalReturnPct", sa.Float(), nullable=False, server_default="0.0"))
        batch_op.add_column(sa.Column("annualizedReturnPct", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("volatilityPct", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("maxDrawdownPct", sa.Float(), nullable=True))
