"""expand simulation history"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0002"
down_revision = "20260401_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("simulation_history") as batch_op:
        batch_op.add_column(sa.Column("recurringContribution", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("contributionFrequency", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("investedAmount", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("annualizedReturnPct", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("volatilityPct", sa.Float(), nullable=True))

    op.execute('UPDATE simulation_history SET "recurringContribution" = 0.0 WHERE "recurringContribution" IS NULL')
    op.execute('UPDATE simulation_history SET "investedAmount" = "initialAmount" WHERE "investedAmount" IS NULL')

    with op.batch_alter_table("simulation_history") as batch_op:
        batch_op.alter_column("recurringContribution", nullable=False)
        batch_op.alter_column("investedAmount", nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("simulation_history") as batch_op:
        batch_op.drop_column("volatilityPct")
        batch_op.drop_column("annualizedReturnPct")
        batch_op.drop_column("investedAmount")
        batch_op.drop_column("contributionFrequency")
        batch_op.drop_column("recurringContribution")
