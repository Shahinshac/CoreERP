"""phase11_finance_expenses

Revision ID: f1234567890f
Revises: e3234567890e
Create Date: 2026-09-22 20:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1234567890f'
down_revision: Union[str, None] = 'e3234567890e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add source, reference_id, and soft delete audit columns to expenses table
    op.add_column('expenses', sa.Column('source', sa.String(length=50), server_default='manual', nullable=False))
    op.add_column('expenses', sa.Column('reference_id', sa.String(length=255), nullable=True))
    op.add_column('expenses', sa.Column('is_deleted', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('expenses', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('expenses', sa.Column('deleted_by', sa.Uuid(), nullable=True))

    op.create_foreign_key(
        'fk_expenses_deleted_by_staff_users',
        'expenses', 'staff_users',
        ['deleted_by'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index(op.f('ix_expenses_source'), 'expenses', ['source'], unique=False)
    op.create_index(op.f('ix_expenses_reference_id'), 'expenses', ['reference_id'], unique=False)
    op.create_index(op.f('ix_expenses_is_deleted'), 'expenses', ['is_deleted'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_expenses_is_deleted'), table_name='expenses')
    op.drop_index(op.f('ix_expenses_reference_id'), table_name='expenses')
    op.drop_index(op.f('ix_expenses_source'), table_name='expenses')
    op.drop_constraint('fk_expenses_deleted_by_staff_users', 'expenses', type_='foreignkey')
    op.drop_column('expenses', 'deleted_by')
    op.drop_column('expenses', 'deleted_at')
    op.drop_column('expenses', 'is_deleted')
    op.drop_column('expenses', 'reference_id')
    op.drop_column('expenses', 'source')
