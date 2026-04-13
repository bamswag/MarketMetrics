"""add account auth extension columns to users

Adds provider tracking, email verification state, reset-token storage,
and session invalidation support for account management flows.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260422_0006"
down_revision = "20260421_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "primaryAuthProvider",
                sa.String(),
                nullable=False,
                server_default=sa.text("'password'"),
            ),
        )
        batch_op.add_column(sa.Column("emailVerifiedAt", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("pendingEmail", sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "sessionVersion",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            ),
        )
        batch_op.add_column(sa.Column("passwordResetTokenHash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("passwordResetTokenExpiresAt", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("pendingEmailTokenHash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("pendingEmailTokenExpiresAt", sa.DateTime(), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE users
            SET "primaryAuthProvider" = COALESCE("primaryAuthProvider", 'password'),
                "sessionVersion" = COALESCE("sessionVersion", 1),
                "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt")
            """
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("pendingEmailTokenExpiresAt")
        batch_op.drop_column("pendingEmailTokenHash")
        batch_op.drop_column("passwordResetTokenExpiresAt")
        batch_op.drop_column("passwordResetTokenHash")
        batch_op.drop_column("sessionVersion")
        batch_op.drop_column("pendingEmail")
        batch_op.drop_column("emailVerifiedAt")
        batch_op.drop_column("primaryAuthProvider")
