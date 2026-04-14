"""add riskProfile to users table

Adds a string column to store the user's self-assessed risk profile
(conservative, moderate, or aggressive). Null means not yet assessed.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260423_0007"
down_revision = "20260422_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("riskProfile", sa.String(), nullable=True),
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("riskProfile")
