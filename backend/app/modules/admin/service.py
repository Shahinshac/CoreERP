"""
System Administration Service — Configuration management with audit logging.

IMPORTANT: Changing system configuration (e.g., GST rates, invoice prefix)
must NEVER retroactively alter historical invoices, sales, or payments.
New configuration applies only to future transactions.
"""
import logging
from typing import Dict, List, Optional
import uuid

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.admin.models import SystemConfig
from app.modules.audit.service import log_audit_event

logger = logging.getLogger("app.admin.service")

# Default configuration seed data — only inserted if keys don't already exist.
# The `settings` object from config.py provides initial values.
DEFAULT_CONFIGS: List[Dict] = [
    # Business Information
    {"key": "business_name", "value": "", "category": "business", "description": "Business / store name", "value_type": "string"},
    {"key": "business_address", "value": "", "category": "business", "description": "Business address", "value_type": "string"},
    {"key": "business_phone", "value": "", "category": "business", "description": "Business phone number", "value_type": "string"},
    {"key": "business_email", "value": "", "category": "business", "description": "Business email", "value_type": "string"},
    {"key": "business_gstin", "value": "", "category": "business", "description": "Business GSTIN", "value_type": "string"},
    {"key": "business_state", "value": "", "category": "business", "description": "Business state", "value_type": "string"},
    {"key": "business_state_code", "value": "", "category": "business", "description": "State code (2-digit)", "value_type": "string"},
    {"key": "business_upi_id", "value": "", "category": "business", "description": "UPI payment ID", "value_type": "string"},
    {"key": "business_upi_name", "value": "", "category": "business", "description": "UPI payee name", "value_type": "string"},
    {"key": "currency_symbol", "value": "₹", "category": "business", "description": "Currency symbol", "value_type": "string"},
    {"key": "financial_year_start_month", "value": "4", "category": "business", "description": "Financial year start month (1-12)", "value_type": "number"},

    # GST & Tax Configuration
    {"key": "gst_enabled", "value": "true", "category": "gst", "description": "Whether GST is enabled for invoicing", "value_type": "boolean"},
    {"key": "default_gst_rate", "value": "18", "category": "gst", "description": "Default GST rate (%) for new products", "value_type": "number"},
    {"key": "gst_rates_available", "value": "0,5,12,18,28", "category": "gst", "description": "Comma-separated list of allowed GST rates (%)", "value_type": "string"},
    {"key": "tax_inclusive_pricing", "value": "false", "category": "gst", "description": "Whether selling prices include GST", "value_type": "boolean"},
    {"key": "tax_rounding", "value": "round_half_up", "category": "gst", "description": "Tax rounding method: round_half_up, round_down, round_up", "value_type": "string"},

    # Invoice & Billing
    {"key": "invoice_prefix", "value": "INV", "category": "invoice", "description": "Invoice number prefix", "value_type": "string"},
    {"key": "invoice_suffix", "value": "", "category": "invoice", "description": "Invoice number suffix (optional)", "value_type": "string"},
    {"key": "quotation_prefix", "value": "QTN", "category": "invoice", "description": "Quotation number prefix", "value_type": "string"},
    {"key": "credit_note_prefix", "value": "CN", "category": "invoice", "description": "Credit note number prefix", "value_type": "string"},
    {"key": "invoice_terms", "value": "Thank you for your business!", "category": "invoice", "description": "Default terms printed on invoices", "value_type": "string"},
    {"key": "invoice_footer_note", "value": "This is a computer-generated invoice.", "category": "invoice", "description": "Footer note on invoices", "value_type": "string"},
    {"key": "thermal_receipt_width", "value": "80", "category": "invoice", "description": "Thermal receipt printer width (mm)", "value_type": "number"},
    {"key": "show_hsn_on_invoice", "value": "true", "category": "invoice", "description": "Show HSN/SAC code on invoice line items", "value_type": "boolean"},

    # Inventory
    {"key": "default_low_stock_threshold", "value": "10", "category": "inventory", "description": "Default low stock alert threshold", "value_type": "number"},
    {"key": "sku_prefix", "value": "SKU", "category": "inventory", "description": "SKU auto-generation prefix", "value_type": "string"},
    {"key": "sku_digits", "value": "6", "category": "inventory", "description": "Number of digits in auto-generated SKU", "value_type": "number"},
    {"key": "track_stock_movements", "value": "true", "category": "inventory", "description": "Track all stock in/out movements", "value_type": "boolean"},

    # Payments & Finance
    {"key": "payment_methods_enabled", "value": "cash,upi,card,bank_transfer,cheque", "category": "payment", "description": "Enabled payment methods (comma-separated)", "value_type": "string"},
    {"key": "cash_rounding_enabled", "value": "true", "category": "payment", "description": "Round cash payments to nearest rupee", "value_type": "boolean"},
    {"key": "partial_payment_allowed", "value": "true", "category": "payment", "description": "Allow partial payments on invoices", "value_type": "boolean"},
    {"key": "default_emi_interest_rate", "value": "0", "category": "payment", "description": "Default EMI interest rate (%)", "value_type": "number"},
    {"key": "max_emi_months", "value": "24", "category": "payment", "description": "Maximum EMI tenure (months)", "value_type": "number"},

    # System
    {"key": "maintenance_mode", "value": "false", "category": "system", "description": "Enable maintenance mode (blocks non-admin access)", "value_type": "boolean", "is_sensitive": True},
    {"key": "app_version", "value": "1.0.0", "category": "system", "description": "Application version", "value_type": "string"},
]


def seed_default_configs(db: Session) -> int:
    """
    Seeds default configuration keys into the database.
    Does NOT overwrite existing values — only inserts new keys.
    Populates initial values from `settings` (config.py) where applicable.
    Returns count of newly created configs.
    """
    existing_keys = set(
        row[0] for row in db.execute(select(SystemConfig.key)).all()
    )

    # Map config.py settings to their DB keys for initial population
    settings_map = {
        "business_name": settings.SELLER_NAME,
        "business_address": settings.SELLER_ADDRESS,
        "business_phone": settings.SELLER_PHONE,
        "business_email": settings.SELLER_EMAIL,
        "business_gstin": settings.SELLER_GSTIN,
        "business_state": settings.SELLER_STATE,
        "business_state_code": settings.SELLER_STATE_CODE,
        "business_upi_id": settings.SELLER_UPI_ID,
        "business_upi_name": settings.SELLER_UPI_NAME,
    }

    created = 0
    for cfg_def in DEFAULT_CONFIGS:
        if cfg_def["key"] not in existing_keys:
            # Use settings value if available, otherwise use default from seed
            initial_value = settings_map.get(cfg_def["key"], cfg_def.get("value", ""))
            config = SystemConfig(
                key=cfg_def["key"],
                value=str(initial_value),
                category=cfg_def["category"],
                description=cfg_def.get("description"),
                value_type=cfg_def.get("value_type", "string"),
                is_sensitive=cfg_def.get("is_sensitive", False),
            )
            db.add(config)
            created += 1

    if created > 0:
        db.commit()
        logger.info(f"Seeded {created} default system configuration entries.")

    return created


def get_all_configs(db: Session, category: Optional[str] = None) -> List[SystemConfig]:
    """Retrieve all system configs, optionally filtered by category."""
    stmt = select(SystemConfig)
    if category:
        stmt = stmt.where(SystemConfig.category == category)
    stmt = stmt.order_by(SystemConfig.category, SystemConfig.key)
    return list(db.execute(stmt).scalars().all())


def get_config_value(db: Session, key: str, default: str = "") -> str:
    """Get a single config value by key."""
    config = db.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    ).scalar_one_or_none()
    return config.value if config else default


def update_config(
    db: Session,
    key: str,
    new_value: str,
    actor_id: Optional[uuid.UUID] = None,
    actor_email: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    reason: Optional[str] = None,
) -> Optional[SystemConfig]:
    """
    Update a single system config value, creating an audit log entry.
    Returns the updated config or None if key not found.
    """
    config = db.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    ).scalar_one_or_none()

    if not config:
        return None

    old_value = config.value

    # Validate numeric types
    if config.value_type == "number":
        try:
            float(new_value)
        except ValueError:
            raise ValueError(f"Configuration '{key}' requires a numeric value. Got: '{new_value}'")

    # Validate boolean types
    if config.value_type == "boolean":
        if new_value.lower() not in ("true", "false"):
            raise ValueError(f"Configuration '{key}' requires a boolean value (true/false). Got: '{new_value}'")
        new_value = new_value.lower()

    if old_value == new_value:
        return config  # No change

    config.value = new_value

    # Immutable audit trail
    log_audit_event(
        db=db,
        event_type="admin.config_changed",
        description=f"Configuration '{key}' changed from '{old_value}' to '{new_value}'.",
        actor_id=actor_id,
        actor_type="staff",
        actor_email=actor_email,
        ip_address=ip_address,
        user_agent=user_agent,
        resource_type="system_config",
        resource_id=key,
        details={
            "key": key,
            "category": config.category,
            "old_value": old_value,
            "new_value": new_value,
            "reason": reason,
        },
    )

    db.commit()
    db.refresh(config)
    return config


def bulk_update_configs(
    db: Session,
    updates: Dict[str, str],
    actor_id: Optional[uuid.UUID] = None,
    actor_email: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    reason: Optional[str] = None,
) -> List[SystemConfig]:
    """
    Update multiple configs atomically with individual audit log entries.
    """
    updated = []
    for key, new_value in updates.items():
        config = update_config(
            db, key, new_value,
            actor_id=actor_id,
            actor_email=actor_email,
            ip_address=ip_address,
            user_agent=user_agent,
            reason=reason,
        )
        if config:
            updated.append(config)
    return updated
