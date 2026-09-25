"""portal_support_notifications

Revision ID: f2234567890f
Revises: f1234567890f
Create Date: 2026-09-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2234567890f'
down_revision: Union[str, None] = 'f1234567890f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. warranties table
    op.create_table(
        'warranties',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('product_id', sa.Uuid(), nullable=False),
        sa.Column('customer_id', sa.Uuid(), nullable=False),
        sa.Column('sale_item_id', sa.Uuid(), nullable=True),
        sa.Column('serial_number', sa.String(length=100), nullable=True),
        sa.Column('purchase_date', sa.Date(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('is_claimed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('claimed_at', sa.DateTime(), nullable=True),
        sa.Column('claim_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['sale_item_id'], ['sale_items.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_warranties_customer_id'), 'warranties', ['customer_id'], unique=False)
    op.create_index(op.f('ix_warranties_product_id'), 'warranties', ['product_id'], unique=False)
    op.create_index(op.f('ix_warranties_sale_item_id'), 'warranties', ['sale_item_id'], unique=False)
    op.create_index(op.f('ix_warranties_serial_number'), 'warranties', ['serial_number'], unique=False)

    # 2. support_tickets table
    op.create_table(
        'support_tickets',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('ticket_number', sa.String(length=50), nullable=False),
        sa.Column('customer_id', sa.Uuid(), nullable=False),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('attachment_path', sa.String(length=500), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='open', nullable=False),
        sa.Column('priority', sa.String(length=50), server_default='medium', nullable=False),
        sa.Column('assigned_staff_id', sa.Uuid(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('closed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['assigned_staff_id'], ['staff_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_support_tickets_assigned_staff_id'), 'support_tickets', ['assigned_staff_id'], unique=False)
    op.create_index(op.f('ix_support_tickets_customer_id'), 'support_tickets', ['customer_id'], unique=False)
    op.create_index(op.f('ix_support_tickets_status'), 'support_tickets', ['status'], unique=False)
    op.create_index(op.f('ix_support_tickets_ticket_number'), 'support_tickets', ['ticket_number'], unique=True)

    # 3. ticket_comments table
    op.create_table(
        'ticket_comments',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('ticket_id', sa.Uuid(), nullable=False),
        sa.Column('author_id', sa.Uuid(), nullable=False),
        sa.Column('author_type', sa.String(length=20), nullable=False),
        sa.Column('author_name', sa.String(length=150), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ticket_comments_author_id'), 'ticket_comments', ['author_id'], unique=False)
    op.create_index(op.f('ix_ticket_comments_ticket_id'), 'ticket_comments', ['ticket_id'], unique=False)

    # 4. notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('recipient_id', sa.Uuid(), nullable=False),
        sa.Column('recipient_type', sa.String(length=20), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('link', sa.String(length=300), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_read_at'), 'notifications', ['read_at'], unique=False)
    op.create_index(op.f('ix_notifications_recipient_id'), 'notifications', ['recipient_id'], unique=False)
    op.create_index(op.f('ix_notifications_recipient_type'), 'notifications', ['recipient_type'], unique=False)
    op.create_index(op.f('ix_notifications_type'), 'notifications', ['type'], unique=False)

    # 5. automation_job_runs table
    op.create_table(
        'automation_job_runs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('job_name', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), server_default='success', nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('items_processed', sa.Integer(), server_default='0', nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_automation_job_runs_job_name'), 'automation_job_runs', ['job_name'], unique=False)


def downgrade() -> None:
    op.drop_table('automation_job_runs')
    op.drop_table('notifications')
    op.drop_table('ticket_comments')
    op.drop_table('support_tickets')
    op.drop_table('warranties')
