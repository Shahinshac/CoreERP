"""
r1234567890r_warranty_and_staff_onboarding

Adds:
  1. products.has_warranty (boolean, default false)
  2. products.warranty_months (integer, nullable)
  3. staff_users.must_change_password (boolean, default false)
  4. staff_users.welcome_email_sent (boolean, default false)

These columns are all backward-compatible (server defaults keep existing rows valid).
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "r1234567890r"
down_revision = "q1234567890q"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Product warranty policy columns ─────────────────────────
    op.add_column(
        "products",
        sa.Column(
            "has_warranty",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "products",
        sa.Column(
            "warranty_months",
            sa.Integer(),
            nullable=True,
        ),
    )

    # ── Staff onboarding columns ─────────────────────────────────
    op.add_column(
        "staff_users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "staff_users",
        sa.Column(
            "welcome_email_sent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("staff_users", "welcome_email_sent")
    op.drop_column("staff_users", "must_change_password")
    op.drop_column("products", "warranty_months")
    op.drop_column("products", "has_warranty")
