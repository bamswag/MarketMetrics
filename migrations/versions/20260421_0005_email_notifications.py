"""add emailNotificationsEnabled to users table

Adds boolean column for toggling email notifications on triggered alerts.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260421_0005"
down_revision = "20260414_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("emailNotificationsEnabled", sa.Boolean(), nullable=True, server_default="0"),
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("emailNotificationsEnabled")
