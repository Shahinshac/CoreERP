"""cloudinary_public_id

Revision ID: g1234567890g
Revises: f1234567890f
Create Date: 2026-09-24 21:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g1234567890g'
down_revision: Union[str, None] = 'f2234567890f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add image_public_id to products
    op.add_column('products', sa.Column('image_public_id', sa.String(length=255), nullable=True))
    
    # Add attachment_public_id to support_tickets
    op.add_column('support_tickets', sa.Column('attachment_public_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('support_tickets', 'attachment_public_id')
    op.drop_column('products', 'image_public_id')
