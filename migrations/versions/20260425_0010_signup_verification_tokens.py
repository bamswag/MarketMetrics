"""add signup verification token storage

Stores dedicated first-time account verification tokens so signup verification
does not share persistence with pending email-change verification.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260425_0010"
down_revision = "20260425_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("signupVerificationTokenHash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("signupVerificationTokenExpiresAt", sa.DateTime(), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE users
            SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt")
            WHERE "emailVerifiedAt" IS NULL
              AND "signupVerificationTokenHash" IS NULL
              AND "signupVerificationTokenExpiresAt" IS NULL
            """
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("signupVerificationTokenExpiresAt")
        batch_op.drop_column("signupVerificationTokenHash")
