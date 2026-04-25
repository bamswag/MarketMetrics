"""add admin users and audit log

Adds isAdmin and isActive columns to users table and creates
admin_audit_logs table for tracking admin actions.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260425_0011"
down_revision = "20260425_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("isAdmin", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("isActive", sa.Boolean(), nullable=False, server_default=sa.true()))

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("adminUserID", sa.String(), nullable=False),
        sa.Column("targetUserID", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("details", sa.String(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_audit_logs_adminUserID", "admin_audit_logs", ["adminUserID"])
    op.create_index("ix_admin_audit_logs_createdAt", "admin_audit_logs", ["createdAt"])


def downgrade() -> None:
    op.drop_index("ix_admin_audit_logs_createdAt", "admin_audit_logs")
    op.drop_index("ix_admin_audit_logs_adminUserID", "admin_audit_logs")
    op.drop_table("admin_audit_logs")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("isActive")
        batch_op.drop_column("isAdmin")
