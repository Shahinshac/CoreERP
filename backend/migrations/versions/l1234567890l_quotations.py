"""Add quotations and quotation_items tables

Revision ID: l1234567890l
Revises: k1234567890k
Create Date: 2026-09-25 14:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l1234567890l'
down_revision: Union[str, None] = 'k1234567890k'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create quotations
    op.create_table(
        'quotations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('quotation_number', sa.String(length=100), nullable=False),
        sa.Column('financial_year', sa.String(length=10), nullable=False),
        sa.Column('quotation_date', sa.Date(), nullable=False),
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('customer_id', sa.Uuid(), nullable=True),
        sa.Column('staff_id', sa.Uuid(), nullable=False),
        sa.Column('seller_name', sa.String(length=255), nullable=False),
        sa.Column('seller_gstin', sa.String(length=20), nullable=False),
        sa.Column('seller_state', sa.String(length=100), nullable=False),
        sa.Column('seller_state_code', sa.String(length=10), nullable=True),
        sa.Column('seller_address', sa.Text(), nullable=True),
        sa.Column('seller_phone', sa.String(length=50), nullable=True),
        sa.Column('buyer_name', sa.String(length=255), nullable=False),
        sa.Column('buyer_gstin', sa.String(length=20), nullable=True),
        sa.Column('buyer_state', sa.String(length=100), nullable=False),
        sa.Column('buyer_state_code', sa.String(length=10), nullable=True),
        sa.Column('buyer_address', sa.Text(), nullable=True),
        sa.Column('buyer_phone', sa.String(length=50), nullable=True),
        sa.Column('is_inter_state', sa.Boolean(), nullable=False),
        sa.Column('place_of_supply', sa.String(length=100), nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('cgst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('sgst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('igst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_tax', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('grand_total', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('converted_invoice_id', sa.Uuid(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_quotations_customer_id_customers'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['staff_id'], ['staff_users.id'], name=op.f('fk_quotations_staff_id_staff_users'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['converted_invoice_id'], ['invoices.id'], name=op.f('fk_quotations_converted_invoice_id_invoices'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_quotations'))
    )
    op.create_index(op.f('ix_quotations_quotation_number'), 'quotations', ['quotation_number'], unique=True)
    op.create_index(op.f('ix_quotations_financial_year'), 'quotations', ['financial_year'], unique=False)
    op.create_index(op.f('ix_quotations_quotation_date'), 'quotations', ['quotation_date'], unique=False)
    op.create_index(op.f('ix_quotations_customer_id'), 'quotations', ['customer_id'], unique=False)
    op.create_index(op.f('ix_quotations_staff_id'), 'quotations', ['staff_id'], unique=False)
    op.create_index(op.f('ix_quotations_status'), 'quotations', ['status'], unique=False)
    op.create_index(op.f('ix_quotations_converted_invoice_id'), 'quotations', ['converted_invoice_id'], unique=False)

    # 2. Create quotation_items
    op.create_table(
        'quotation_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('quotation_id', sa.Uuid(), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=True),
        sa.Column('product_name', sa.String(length=255), nullable=False),
        sa.Column('product_sku', sa.String(length=100), nullable=False),
        sa.Column('hsn_code', sa.String(length=50), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('discount_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('taxable_value', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('gst_rate', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('cgst_rate', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('cgst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('sgst_rate', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('sgst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('igst_rate', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('igst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['quotation_id'], ['quotations.id'], name=op.f('fk_quotation_items_quotation_id_quotations'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name=op.f('fk_quotation_items_product_id_products'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_quotation_items'))
    )
    op.create_index(op.f('ix_quotation_items_quotation_id'), 'quotation_items', ['quotation_id'], unique=False)
    op.create_index(op.f('ix_quotation_items_product_id'), 'quotation_items', ['product_id'], unique=False)


def downgrade() -> None:
    op.drop_table('quotation_items')
    op.drop_table('quotations')
