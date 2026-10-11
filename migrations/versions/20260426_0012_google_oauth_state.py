"""add one-time Google OAuth state storage

Stores only a hash of each short-lived OAuth nonce so a signed state token can
be consumed once across multiple application workers.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260426_0012"
down_revision = "20260425_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "google_oauth_states",
        sa.Column("nonceHash", sa.String(), nullable=False),
        sa.Column("expiresAt", sa.DateTime(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("nonceHash"),
    )
    op.create_index(
        "ix_google_oauth_states_expiresAt",
        "google_oauth_states",
        ["expiresAt"],
    )


def downgrade() -> None:
    op.drop_index("ix_google_oauth_states_expiresAt", table_name="google_oauth_states")
    op.drop_table("google_oauth_states")
