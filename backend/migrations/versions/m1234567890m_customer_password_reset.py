"""Add customer_password_resets table

Revision ID: m1234567890m
Revises: l1234567890l
Create Date: 2026-09-25 17:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm1234567890m'
down_revision: Union[str, None] = 'l1234567890l'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'customer_password_resets',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('customer_id', sa.Uuid(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_customer_password_resets_customer_id_customers'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_customer_password_resets'))
    )
    op.create_index(op.f('ix_customer_password_resets_customer_id'), 'customer_password_resets', ['customer_id'], unique=False)
    op.create_index(op.f('ix_customer_password_resets_token_hash'), 'customer_password_resets', ['token_hash'], unique=False)


def downgrade() -> None:
    op.drop_table('customer_password_resets')
