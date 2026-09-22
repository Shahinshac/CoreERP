"""phase7_invoicing

Revision ID: d1234567890b
Revises: c1234567890a
Create Date: 2026-09-22 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1234567890b'
down_revision: Union[str, None] = 'c1234567890a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add GST fields to customers
    op.add_column('customers', sa.Column('gstin', sa.String(length=20), nullable=True))
    op.add_column('customers', sa.Column('state', sa.String(length=100), nullable=True))

    # 2. Add HSN code to products
    op.add_column('products', sa.Column('hsn_code', sa.String(length=50), nullable=True))

    # 3. Create invoice_sequences
    op.create_table(
        'invoice_sequences',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('financial_year', sa.String(length=10), nullable=False),
        sa.Column('sequence_type', sa.String(length=20), nullable=False),
        sa.Column('last_number', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_invoice_sequences')),
        sa.UniqueConstraint('financial_year', 'sequence_type', name='uq_invoice_seq_fy_type')
    )
    op.create_index(op.f('ix_invoice_sequences_financial_year'), 'invoice_sequences', ['financial_year'], unique=False)

    # 4. Create invoices
    op.create_table(
        'invoices',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('invoice_number', sa.String(length=100), nullable=False),
        sa.Column('financial_year', sa.String(length=10), nullable=False),
        sa.Column('invoice_date', sa.Date(), nullable=False),
        sa.Column('sale_id', sa.Uuid(), nullable=True),
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
        sa.Column('payment_status', sa.String(length=50), nullable=False),
        sa.Column('is_cancelled', sa.Boolean(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_invoices_customer_id_customers'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], name=op.f('fk_invoices_sale_id_sales'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['staff_id'], ['staff_users.id'], name=op.f('fk_invoices_staff_id_staff_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_invoices')),
        sa.UniqueConstraint('sale_id', name=op.f('uq_invoices_sale_id'))
    )
    op.create_index(op.f('ix_invoices_customer_id'), 'invoices', ['customer_id'], unique=False)
    op.create_index(op.f('ix_invoices_financial_year'), 'invoices', ['financial_year'], unique=False)
    op.create_index(op.f('ix_invoices_invoice_date'), 'invoices', ['invoice_date'], unique=False)
    op.create_index(op.f('ix_invoices_invoice_number'), 'invoices', ['invoice_number'], unique=True)
    op.create_index(op.f('ix_invoices_payment_status'), 'invoices', ['payment_status'], unique=False)
    op.create_index(op.f('ix_invoices_staff_id'), 'invoices', ['staff_id'], unique=False)

    # 5. Create invoice_items
    op.create_table(
        'invoice_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('invoice_id', sa.Uuid(), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=True),
        sa.Column('product_name', sa.String(length=255), nullable=False),
        sa.Column('product_sku', sa.String(length=100), nullable=False),
        sa.Column('hsn_code', sa.String(length=50), nullable=True),
        sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=14, scale=2), nullable=False),
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
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], name=op.f('fk_invoice_items_invoice_id_invoices'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name=op.f('fk_invoice_items_product_id_products'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_invoice_items'))
    )
    op.create_index(op.f('ix_invoice_items_invoice_id'), 'invoice_items', ['invoice_id'], unique=False)
    op.create_index(op.f('ix_invoice_items_product_id'), 'invoice_items', ['product_id'], unique=False)

    # 6. Create credit_notes
    op.create_table(
        'credit_notes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('credit_note_number', sa.String(length=100), nullable=False),
        sa.Column('financial_year', sa.String(length=10), nullable=False),
        sa.Column('credit_note_date', sa.Date(), nullable=False),
        sa.Column('invoice_id', sa.Uuid(), nullable=False),
        sa.Column('staff_id', sa.Uuid(), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=False),
        sa.Column('subtotal_refunded', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('cgst_refunded', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('sgst_refunded', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('igst_refunded', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_tax_refunded', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('grand_total_refunded', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], name=op.f('fk_credit_notes_invoice_id_invoices'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['staff_id'], ['staff_users.id'], name=op.f('fk_credit_notes_staff_id_staff_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_credit_notes'))
    )
    op.create_index(op.f('ix_credit_notes_credit_note_date'), 'credit_notes', ['credit_note_date'], unique=False)
    op.create_index(op.f('ix_credit_notes_credit_note_number'), 'credit_notes', ['credit_note_number'], unique=True)
    op.create_index(op.f('ix_credit_notes_financial_year'), 'credit_notes', ['financial_year'], unique=False)
    op.create_index(op.f('ix_credit_notes_invoice_id'), 'credit_notes', ['invoice_id'], unique=False)
    op.create_index(op.f('ix_credit_notes_staff_id'), 'credit_notes', ['staff_id'], unique=False)

    # 7. Create credit_note_items
    op.create_table(
        'credit_note_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('credit_note_id', sa.Uuid(), nullable=False),
        sa.Column('invoice_item_id', sa.Uuid(), nullable=True),
        sa.Column('product_name', sa.String(length=255), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('taxable_value', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('cgst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('sgst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('igst_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['credit_note_id'], ['credit_notes.id'], name=op.f('fk_credit_note_items_credit_note_id_credit_notes'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['invoice_item_id'], ['invoice_items.id'], name=op.f('fk_credit_note_items_invoice_item_id_invoice_items'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_credit_note_items'))
    )
    op.create_index(op.f('ix_credit_note_items_credit_note_id'), 'credit_note_items', ['credit_note_id'], unique=False)


def downgrade() -> None:
    op.drop_table('credit_note_items')
    op.drop_table('credit_notes')
    op.drop_table('invoice_items')
    op.drop_table('invoices')
    op.drop_table('invoice_sequences')
    op.drop_column('products', 'hsn_code')
    op.drop_column('customers', 'state')
    op.drop_column('customers', 'gstin')
