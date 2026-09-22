"""phase8_payments

Revision ID: e1234567890c
Revises: d1234567890b
Create Date: 2026-09-22 19:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1234567890c'
down_revision: Union[str, None] = 'd1234567890b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'payments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('invoice_id', sa.Uuid(), nullable=True),
        sa.Column('customer_id', sa.Uuid(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=False),
        sa.Column('method', sa.String(length=50), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('idempotency_key', sa.String(length=100), nullable=False),
        sa.Column('reference_id', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['staff_users.id'], name=op.f('fk_payments_created_by_staff_users'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_payments_customer_id_customers'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], name=op.f('fk_payments_invoice_id_invoices'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_payments'))
    )
    op.create_index(op.f('ix_payments_created_by'), 'payments', ['created_by'], unique=False)
    op.create_index(op.f('ix_payments_customer_id'), 'payments', ['customer_id'], unique=False)
    op.create_index(op.f('ix_payments_idempotency_key'), 'payments', ['idempotency_key'], unique=True)
    op.create_index(op.f('ix_payments_invoice_id'), 'payments', ['invoice_id'], unique=False)
    op.create_index(op.f('ix_payments_method'), 'payments', ['method'], unique=False)
    op.create_index(op.f('ix_payments_status'), 'payments', ['status'], unique=False)


def downgrade() -> None:
    op.drop_table('payments')
