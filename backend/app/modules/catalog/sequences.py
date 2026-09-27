import logging
import re
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.modules.catalog.models import Product, ProductSequence

logger = logging.getLogger("app.catalog.sequences")


def calculate_ean13_checksum(digits12: str) -> int:
    """
    Computes standard GS1 Modulo-10 checksum for a 12-digit string.
    Weights alternate 1 and 3 from left to right (index 0: weight 1, index 1: weight 3, ...).
    Formula: (10 - (sum % 10)) % 10
    """
    if len(digits12) != 12 or not digits12.isdigit():
        raise ValueError("EAN-13 base requires exactly 12 numeric digits.")

    total = sum(
        int(digit) * (1 if idx % 2 == 0 else 3)
        for idx, digit in enumerate(digits12)
    )
    checksum = (10 - (total % 10)) % 10
    return checksum


def validate_ean13(code: str) -> bool:
    """
    Validates whether a 13-digit string is a mathematically valid EAN-13 barcode.
    """
    if not code or len(code) != 13 or not code.isdigit():
        return False
    return calculate_ean13_checksum(code[:12]) == int(code[12])


def get_next_product_sku(db: Session) -> str:
    """
    Generates the next sequential unique SKU (format: SKU-000001, SKU-000002...).
    Uses pessimistic locking with_for_update() on product_sequences to prevent race conditions.
    Never overwrites existing products and skips any existing manually assigned SKUs.
    """
    seq = (
        db.query(ProductSequence)
        .filter(ProductSequence.sequence_name == "PRODUCT_SKU")
        .with_for_update()
        .first()
    )

    if not seq:
        # Determine highest existing numeric suffix of SKU-xxxxxx to initialize sequence cleanly
        max_num = 0
        existing_skus = db.query(Product.sku).filter(Product.sku.ilike("SKU-%")).all()
        for (sku_val,) in existing_skus:
            if sku_val:
                parts = sku_val.split("-", 1)
                if len(parts) == 2 and parts[1].isdigit():
                    num = int(parts[1])
                    if num > max_num:
                        max_num = num

        seq = ProductSequence(sequence_name="PRODUCT_SKU", last_number=max_num)
        db.add(seq)
        db.flush()

    while True:
        seq.last_number += 1
        candidate = f"SKU-{seq.last_number:06d}"
        exists = db.query(Product.id).filter(Product.sku.ilike(candidate)).first()
        if not exists:
            db.flush()
            return candidate


def get_next_product_barcode(db: Session) -> str:
    """
    Generates the next sequential unique EAN-13 barcode (format: 200xxxxxxxxxC).
    Uses restricted circulation prefix '200' (GS1 standard for internal in-store retail).
    Uses pessimistic locking with_for_update() on product_sequences to prevent race conditions.
    Calculates valid GS1 Modulo-10 checksum digit.
    """
    seq = (
        db.query(ProductSequence)
        .filter(ProductSequence.sequence_name == "PRODUCT_BARCODE")
        .with_for_update()
        .first()
    )

    if not seq:
        max_num = 0
        existing_barcodes = db.query(Product.barcode).filter(Product.barcode.like("200%")).all()
        for (b_val,) in existing_barcodes:
            if b_val and len(b_val) == 13 and b_val.isdigit():
                mid = b_val[3:12]
                if mid.isdigit():
                    num = int(mid)
                    if num > max_num:
                        max_num = num

        seq = ProductSequence(sequence_name="PRODUCT_BARCODE", last_number=max_num)
        db.add(seq)
        db.flush()

    while True:
        seq.last_number += 1
        prefix12 = f"200{seq.last_number:09d}"
        chk = calculate_ean13_checksum(prefix12)
        candidate = f"{prefix12}{chk}"
        exists = db.query(Product.id).filter(Product.barcode == candidate).first()
        if not exists:
            db.flush()
            return candidate


def backfill_missing_product_identifiers(db: Session) -> dict:
    """
    Safely backfills any existing products missing SKU or barcode.
    - Missing SKU -> generated sequential unique SKU (SKU-000001, ...)
    - Missing Barcode -> generated unique EAN-13 (2000000000015, ...)
    - NEVER overwrites an existing SKU or barcode.
    - Reports and returns exact counts of records inspected and updated.
    """
    products = db.query(Product).order_by(Product.created_at.asc()).all()
    sku_backfilled = 0
    barcode_backfilled = 0

    for prod in products:
        changed = False
        if not prod.sku or not prod.sku.strip():
            prod.sku = get_next_product_sku(db)
            sku_backfilled += 1
            changed = True

        if not prod.barcode or not prod.barcode.strip():
            prod.barcode = get_next_product_barcode(db)
            barcode_backfilled += 1
            changed = True

        if changed:
            db.flush()

    db.commit()
    logger.info(
        f"Product identifier backfill completed: checked {len(products)}, "
        f"backfilled {sku_backfilled} SKUs, {barcode_backfilled} barcodes."
    )
    return {
        "total_products_checked": len(products),
        "sku_backfilled_count": sku_backfilled,
        "barcode_backfilled_count": barcode_backfilled,
        "message": (
            f"Backfill complete: {sku_backfilled} SKUs and {barcode_backfilled} barcodes generated. "
            f"All existing values preserved."
        ),
    }
