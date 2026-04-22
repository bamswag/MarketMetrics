"""add google identity and password access tracking

Separates external Google identity linking from whether an account has a
usable password credential. This avoids changing password-security behavior
just because a password account signs in with Google.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260424_0008"
down_revision = "20260423_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "passwordAuthEnabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
        )
        batch_op.add_column(sa.Column("googleSubject", sa.String(), nullable=True))
        batch_op.create_index("ix_users_googleSubject", ["googleSubject"], unique=True)

    op.execute(
        sa.text(
            """
            UPDATE users
            SET "passwordAuthEnabled" = true
            WHERE "passwordAuthEnabled" IS NULL
            """
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_googleSubject")
        batch_op.drop_column("googleSubject")
        batch_op.drop_column("passwordAuthEnabled")
