"""add payment_details to sales

Revision ID: j1234567890j
Revises: i1234567890i
Create Date: 2026-09-24

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j1234567890j'
down_revision = 'i1234567890i'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('sales', sa.Column('payment_details', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('sales', 'payment_details')
