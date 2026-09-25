"""create_cash_drawer_reconciliation_tables

Revision ID: i1234567890i
Revises: h1234567890h
Create Date: 2026-09-24 23:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i1234567890i'
down_revision: Union[str, None] = 'h1234567890h'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cash_drawer_sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('cashier_id', sa.Uuid(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='open'),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('opening_cash', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0.00'),
        sa.Column('closing_cash', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('expected_cash', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('variance', sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column('opening_notes', sa.Text(), nullable=True),
        sa.Column('closing_notes', sa.Text(), nullable=True),
        sa.Column('denominations', sa.JSON(), nullable=True),
        sa.Column('summary_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['cashier_id'], ['staff_users.id'], ondelete='RESTRICT'),
    )
    op.create_index(op.f('ix_cash_drawer_sessions_cashier_id'), 'cash_drawer_sessions', ['cashier_id'], unique=False)
    op.create_index(op.f('ix_cash_drawer_sessions_status'), 'cash_drawer_sessions', ['status'], unique=False)

    op.create_table(
        'cash_movements',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('session_id', sa.Uuid(), nullable=False),
        sa.Column('movement_type', sa.String(length=30), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('reason', sa.String(length=255), nullable=False),
        sa.Column('performed_by_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['session_id'], ['cash_drawer_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['performed_by_id'], ['staff_users.id'], ondelete='RESTRICT'),
    )
    op.create_index(op.f('ix_cash_movements_session_id'), 'cash_movements', ['session_id'], unique=False)
    op.create_index(op.f('ix_cash_movements_movement_type'), 'cash_movements', ['movement_type'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_cash_movements_movement_type'), table_name='cash_movements')
    op.drop_index(op.f('ix_cash_movements_session_id'), table_name='cash_movements')
    op.drop_table('cash_movements')

    op.drop_index(op.f('ix_cash_drawer_sessions_status'), table_name='cash_drawer_sessions')
    op.drop_index(op.f('ix_cash_drawer_sessions_cashier_id'), table_name='cash_drawer_sessions')
    op.drop_table('cash_drawer_sessions')
