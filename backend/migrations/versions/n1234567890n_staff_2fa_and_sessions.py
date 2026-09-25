"""Add staff 2FA columns and staff_sessions table

Revision ID: n1234567890n
Revises: m1234567890m
Create Date: 2026-09-25 18:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'n1234567890n'
down_revision: Union[str, None] = 'm1234567890m'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add TOTP columns to staff_users
    op.add_column('staff_users', sa.Column('totp_secret', sa.String(length=64), nullable=True))
    op.add_column('staff_users', sa.Column('is_totp_enabled', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('staff_users', sa.Column('totp_backup_codes', sa.JSON(), nullable=True))

    # 2. Create staff_sessions table
    op.create_table(
        'staff_sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('staff_id', sa.Uuid(), nullable=False),
        sa.Column('refresh_token_hash', sa.String(length=64), nullable=False),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_revoked', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('last_active_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['staff_id'], ['staff_users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_staff_sessions_staff_id'), 'staff_sessions', ['staff_id'], unique=False)
    op.create_index(op.f('ix_staff_sessions_refresh_token_hash'), 'staff_sessions', ['refresh_token_hash'], unique=False)
    op.create_index(op.f('ix_staff_sessions_is_revoked'), 'staff_sessions', ['is_revoked'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_staff_sessions_is_revoked'), table_name='staff_sessions')
    op.drop_index(op.f('ix_staff_sessions_refresh_token_hash'), table_name='staff_sessions')
    op.drop_index(op.f('ix_staff_sessions_staff_id'), table_name='staff_sessions')
    op.drop_table('staff_sessions')

    op.drop_column('staff_users', 'totp_backup_codes')
    op.drop_column('staff_users', 'is_totp_enabled')
    op.drop_column('staff_users', 'totp_secret')
