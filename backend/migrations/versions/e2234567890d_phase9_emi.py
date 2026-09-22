"""phase9_emi

Revision ID: e2234567890d
Revises: e1234567890c
Create Date: 2026-09-22 19:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2234567890d'
down_revision: Union[str, None] = 'e1234567890c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create emi_plans table
    op.create_table(
        'emi_plans',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('customer_id', sa.Uuid(), nullable=False),
        sa.Column('invoice_id', sa.Uuid(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('principal', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('down_payment', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('number_of_installments', sa.Integer(), nullable=False),
        sa.Column('interest_rate', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('interest_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_financed', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('installment_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['staff_users.id'], name=op.f('fk_emi_plans_created_by_staff_users'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_emi_plans_customer_id_customers'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], name=op.f('fk_emi_plans_invoice_id_invoices'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_emi_plans'))
    )
    op.create_index(op.f('ix_emi_plans_created_by'), 'emi_plans', ['created_by'], unique=False)
    op.create_index(op.f('ix_emi_plans_customer_id'), 'emi_plans', ['customer_id'], unique=False)
    op.create_index(op.f('ix_emi_plans_invoice_id'), 'emi_plans', ['invoice_id'], unique=False)
    op.create_index(op.f('ix_emi_plans_status'), 'emi_plans', ['status'], unique=False)

    # 2. Create emi_installments table
    op.create_table(
        'emi_installments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('emi_plan_id', sa.Uuid(), nullable=False),
        sa.Column('installment_number', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('amount_due', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('amount_paid', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['emi_plan_id'], ['emi_plans.id'], name=op.f('fk_emi_installments_emi_plan_id_emi_plans'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_emi_installments'))
    )
    op.create_index(op.f('ix_emi_installments_emi_plan_id'), 'emi_installments', ['emi_plan_id'], unique=False)
    op.create_index(op.f('ix_emi_installments_due_date'), 'emi_installments', ['due_date'], unique=False)
    op.create_index(op.f('ix_emi_installments_status'), 'emi_installments', ['status'], unique=False)

    # 3. Add emi foreign keys to payments table
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('emi_plan_id', sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column('emi_installment_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_payments_emi_plan_id_emi_plans'), 'emi_plans', ['emi_plan_id'], ['id'], ondelete='SET NULL')
        batch_op.create_foreign_key(batch_op.f('fk_payments_emi_installment_id_emi_installments'), 'emi_installments', ['emi_installment_id'], ['id'], ondelete='SET NULL')
        batch_op.create_index(batch_op.f('ix_payments_emi_plan_id'), ['emi_plan_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_payments_emi_installment_id'), ['emi_installment_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_payments_emi_installment_id'))
        batch_op.drop_index(batch_op.f('ix_payments_emi_plan_id'))
        batch_op.drop_constraint(batch_op.f('fk_payments_emi_installment_id_emi_installments'), type_='foreignkey')
        batch_op.drop_constraint(batch_op.f('fk_payments_emi_plan_id_emi_plans'), type_='foreignkey')
        batch_op.drop_column('emi_installment_id')
        batch_op.drop_column('emi_plan_id')

    op.drop_table('emi_installments')
    op.drop_table('emi_plans')
