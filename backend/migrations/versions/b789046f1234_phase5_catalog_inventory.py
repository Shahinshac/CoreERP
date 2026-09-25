"""phase5_catalog_inventory

Revision ID: b789046f1234
Revises: a678035f9774
Create Date: 2026-09-22 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b789046f1234'
down_revision: Union[str, None] = 'a678035f9774'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add image_path to products
    op.add_column('products', sa.Column('image_path', sa.String(length=500), nullable=True))
    
    # Add notes to stock_movements
    op.add_column('stock_movements', sa.Column('notes', sa.String(length=500), nullable=True))

    # Drop the check constraint on products current_stock if it exists
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TABLE products DROP CONSTRAINT IF EXISTS ck_products_ck_products_current_stock_positive;"))
        op.execute(sa.text("ALTER TABLE products DROP CONSTRAINT IF EXISTS ck_products_ck_products_ck_products_current_stock_positive;"))
    else:
        try:
            with op.batch_alter_table('products') as batch_op:
                batch_op.drop_constraint('ck_products_ck_products_current_stock_positive', type_='check')
        except Exception:
            pass


def downgrade() -> None:
    try:
        with op.batch_alter_table('products') as batch_op:
            batch_op.create_check_constraint(
                'ck_products_ck_products_current_stock_positive',
                'current_stock >= 0'
            )
    except Exception:
        pass
    op.drop_column('stock_movements', 'notes')
    op.drop_column('products', 'image_path')
