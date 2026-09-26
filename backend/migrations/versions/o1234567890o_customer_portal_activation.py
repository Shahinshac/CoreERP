"""Add is_portal_activated column to customers table

Revision ID: o1234567890o
Revises: n1234567890n
Create Date: 2026-09-26 01:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'o1234567890o'
down_revision: Union[str, None] = 'n1234567890n'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'customers',
        sa.Column('is_portal_activated', sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('customers', 'is_portal_activated')
