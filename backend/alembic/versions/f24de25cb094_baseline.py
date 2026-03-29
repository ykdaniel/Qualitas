"""Baseline

Revision ID: f24de25cb094
Revises:
Create Date: 2026-02-22 22:42:37.281139

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'f24de25cb094'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
