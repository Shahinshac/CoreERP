"""Add product_sequences table for sequential SKU and Barcode generation

Revision ID: p1234567890p
Revises: o1234567890o
Create Date: 2026-09-27 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p1234567890p'
down_revision: Union[str, None] = 'o1234567890o'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_sequences',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('sequence_name', sa.String(length=50), nullable=False),
        sa.Column('last_number', sa.Integer(), server_default='0', nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_product_sequences')),
    )
    op.create_index(op.f('ix_product_sequences_sequence_name'), 'product_sequences', ['sequence_name'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_product_sequences_sequence_name'), table_name='product_sequences')
    op.drop_table('product_sequences')
