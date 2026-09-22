"""phase10_staff_salary

Revision ID: e3234567890e
Revises: e2234567890d
Create Date: 2026-09-22 20:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3234567890e'
down_revision: Union[str, None] = 'e2234567890d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add staff profile and salary configuration columns to staff_users
    op.add_column('staff_users', sa.Column('full_name', sa.String(length=255), nullable=True))
    op.add_column('staff_users', sa.Column('phone', sa.String(length=50), nullable=True))
    op.add_column('staff_users', sa.Column('employee_code', sa.String(length=50), nullable=True))
    op.add_column('staff_users', sa.Column('joining_date', sa.Date(), nullable=True))
    op.add_column('staff_users', sa.Column('base_salary', sa.Numeric(precision=14, scale=2), server_default='0.00', nullable=False))
    op.add_column('staff_users', sa.Column('deductions_config', sa.JSON(), nullable=True))
    op.add_column('staff_users', sa.Column('deactivated_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_staff_users_employee_code'), 'staff_users', ['employee_code'], unique=True)

    # 2. Create salary_records table
    op.create_table(
        'salary_records',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('staff_id', sa.Uuid(), nullable=False),
        sa.Column('period', sa.String(length=7), nullable=False),
        sa.Column('base_salary', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('deductions', sa.JSON(), nullable=False),
        sa.Column('total_deductions', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('net_salary', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='generated', nullable=False),
        sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('generated_by', sa.Uuid(), nullable=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('paid_by', sa.Uuid(), nullable=True),
        sa.Column('payment_id', sa.Uuid(), nullable=True),
        sa.Column('expense_id', sa.Uuid(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['staff_id'], ['staff_users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['generated_by'], ['staff_users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['paid_by'], ['staff_users.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['payment_id'], ['payments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['expense_id'], ['expenses.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('staff_id', 'period', name='uq_salary_records_staff_period')
    )
    op.create_index(op.f('ix_salary_records_staff_id'), 'salary_records', ['staff_id'], unique=False)
    op.create_index(op.f('ix_salary_records_period'), 'salary_records', ['period'], unique=False)
    op.create_index(op.f('ix_salary_records_status'), 'salary_records', ['status'], unique=False)
    op.create_index(op.f('ix_salary_records_payment_id'), 'salary_records', ['payment_id'], unique=False)
    op.create_index(op.f('ix_salary_records_expense_id'), 'salary_records', ['expense_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_salary_records_expense_id'), table_name='salary_records')
    op.drop_index(op.f('ix_salary_records_payment_id'), table_name='salary_records')
    op.drop_index(op.f('ix_salary_records_status'), table_name='salary_records')
    op.drop_index(op.f('ix_salary_records_period'), table_name='salary_records')
    op.drop_index(op.f('ix_salary_records_staff_id'), table_name='salary_records')
    op.drop_table('salary_records')

    op.drop_index(op.f('ix_staff_users_employee_code'), table_name='staff_users')
    op.drop_column('staff_users', 'deactivated_at')
    op.drop_column('staff_users', 'deductions_config')
    op.drop_column('staff_users', 'base_salary')
    op.drop_column('staff_users', 'joining_date')
    op.drop_column('staff_users', 'employee_code')
    op.drop_column('staff_users', 'phone')
    op.drop_column('staff_users', 'full_name')
