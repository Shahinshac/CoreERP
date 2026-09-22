"""phase6_sales_pos

Revision ID: c1234567890a
Revises: b789046f1234
Create Date: 2026-09-22 19:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1234567890a'
down_revision: Union[str, None] = 'b789046f1234'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add address to customers
    op.add_column('customers', sa.Column('address', sa.Text(), nullable=True))

    # 2. Create sales table
    op.create_table(
        'sales',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('invoice_number', sa.String(length=100), nullable=False),
        sa.Column('customer_id', sa.Uuid(), nullable=True),
        sa.Column('staff_id', sa.Uuid(), nullable=False),
        sa.Column('subtotal', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('discount_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('tax_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('payment_method', sa.String(length=50), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], name=op.f('fk_sales_customer_id_customers'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['staff_id'], ['staff_users.id'], name=op.f('fk_sales_staff_id_staff_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_sales'))
    )
    op.create_index(op.f('ix_sales_customer_id'), 'sales', ['customer_id'], unique=False)
    op.create_index(op.f('ix_sales_invoice_number'), 'sales', ['invoice_number'], unique=True)
    op.create_index(op.f('ix_sales_staff_id'), 'sales', ['staff_id'], unique=False)
    op.create_index(op.f('ix_sales_status'), 'sales', ['status'], unique=False)

    # 3. Create sale_items table
    op.create_table(
        'sale_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('sale_id', sa.Uuid(), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('unit_price', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('discount_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('total_price', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('returned_quantity', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name=op.f('fk_sale_items_product_id_products'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], name=op.f('fk_sale_items_sale_id_sales'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_sale_items'))
    )
    op.create_index(op.f('ix_sale_items_product_id'), 'sale_items', ['product_id'], unique=False)
    op.create_index(op.f('ix_sale_items_sale_id'), 'sale_items', ['sale_id'], unique=False)

    # 4. Create sale_returns table
    op.create_table(
        'sale_returns',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('return_number', sa.String(length=100), nullable=False),
        sa.Column('sale_id', sa.Uuid(), nullable=False),
        sa.Column('staff_id', sa.Uuid(), nullable=False),
        sa.Column('total_refund_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], name=op.f('fk_sale_returns_sale_id_sales'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['staff_id'], ['staff_users.id'], name=op.f('fk_sale_returns_staff_id_staff_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_sale_returns'))
    )
    op.create_index(op.f('ix_sale_returns_return_number'), 'sale_returns', ['return_number'], unique=True)
    op.create_index(op.f('ix_sale_returns_sale_id'), 'sale_returns', ['sale_id'], unique=False)
    op.create_index(op.f('ix_sale_returns_staff_id'), 'sale_returns', ['staff_id'], unique=False)

    # 5. Create return_items table
    op.create_table(
        'return_items',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('return_id', sa.Uuid(), nullable=False),
        sa.Column('sale_item_id', sa.Uuid(), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=False),
        sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
        sa.Column('refund_amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], name=op.f('fk_return_items_product_id_products'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['return_id'], ['sale_returns.id'], name=op.f('fk_return_items_return_id_sale_returns'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['sale_item_id'], ['sale_items.id'], name=op.f('fk_return_items_sale_item_id_sale_items'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_return_items'))
    )
    op.create_index(op.f('ix_return_items_product_id'), 'return_items', ['product_id'], unique=False)
    op.create_index(op.f('ix_return_items_return_id'), 'return_items', ['return_id'], unique=False)
    op.create_index(op.f('ix_return_items_sale_item_id'), 'return_items', ['sale_item_id'], unique=False)


def downgrade() -> None:
    op.drop_table('return_items')
    op.drop_table('sale_returns')
    op.drop_table('sale_items')
    op.drop_table('sales')
    op.drop_column('customers', 'address')
