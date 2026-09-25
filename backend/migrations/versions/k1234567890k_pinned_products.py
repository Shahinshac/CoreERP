"""Add is_pinned column to products

Revision ID: k1234567890k
Revises: j1234567890j
Create Date: 2026-09-25 08:08:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k1234567890k'
down_revision: Union[str, None] = 'j1234567890j'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_pinned', sa.Boolean(), server_default='0', nullable=False))
        batch_op.create_index('ix_products_is_pinned', ['is_pinned'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_index('ix_products_is_pinned')
        batch_op.drop_column('is_pinned')
