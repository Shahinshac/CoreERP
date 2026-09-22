from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
import uuid
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.inventory.models import MovementType, StockMovement


def create_test_staff(db_session: Session, role: StaffRole, email: str | None = None):
    email = email or f"{role.value.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}@erp.local"
    user = StaffUser(
        email=email,
        password_hash=hash_password("password123"),
        role=role,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id), audience="staff", role=role.value)
    return user, {"Authorization": f"Bearer {token}"}


def create_test_category_and_brand(db_session: Session):
    cat = Category(name=f"Electronics_{uuid.uuid4().hex[:6]}", description="Electronic devices")
    brand = Brand(name=f"Sony_{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()
    return cat, brand


# ==========================================
# 1. CATALOG CRUD & RBAC
# ==========================================

def test_catalog_rbac_and_crud(client: TestClient, db_session: Session):
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)
    _, staff_headers = create_test_staff(db_session, StaffRole.STAFF)

    # 1. Staff cannot create category (403)
    resp = client.post(
        "/api/catalog/categories",
        json={"name": "Audio", "description": "Sound equipment"},
        headers=staff_headers,
    )
    assert resp.status_code == 403

    # 2. Admin creates category (201)
    resp = client.post(
        "/api/catalog/categories",
        json={"name": "Audio", "description": "Sound equipment"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    cat_id = resp.json()["id"]

    # 3. Staff can read categories (200)
    resp = client.get("/api/catalog/categories", headers=staff_headers)
    assert resp.status_code == 200
    assert any(c["id"] == cat_id for c in resp.json())

    # 4. Admin creates brand
    resp = client.post(
        "/api/catalog/brands",
        json={"name": "Bose"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    brand_id = resp.json()["id"]

    # 5. Staff cannot create brand (403)
    resp = client.post(
        "/api/catalog/brands",
        json={"name": "JBL"},
        headers=staff_headers,
    )
    assert resp.status_code == 403


# ==========================================
# 2. PRODUCT DECIMAL VALIDATIONS
# ==========================================

def test_product_strict_decimal_validation(client: TestClient, db_session: Session):
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)
    cat, brand = create_test_category_and_brand(db_session)

    valid_payload = {
        "name": "Headphones WH-1000XM5",
        "sku": f"WH-1000XM5-{uuid.uuid4().hex[:6]}",
        "barcode": f"1234567890_{uuid.uuid4().hex[:4]}",
        "category_id": str(cat.id),
        "brand_id": str(brand.id),
        "unit": "pcs",
        "purchase_price": "250.00",
        "selling_price": "399.99",
        "gst_rate": "18.00",
        "min_stock": "5.000",
    }

    # Success with valid decimals
    resp = client.post("/api/catalog/products", json=valid_payload, headers=admin_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["purchase_price"] == "250.00"
    assert data["current_stock"] == "0.000"

    # Reject > 2 decimal places for purchase_price
    bad_price = dict(valid_payload, sku="SKU-BAD-1", barcode="BAR-1", purchase_price="250.555")
    resp = client.post("/api/catalog/products", json=bad_price, headers=admin_headers)
    assert resp.status_code == 422

    # Reject > 2 decimal places for gst_rate
    bad_gst = dict(valid_payload, sku="SKU-BAD-2", barcode="BAR-2", gst_rate="18.125")
    resp = client.post("/api/catalog/products", json=bad_gst, headers=admin_headers)
    assert resp.status_code == 422

    # Reject > 3 decimal places for min_stock
    bad_min_stock = dict(valid_payload, sku="SKU-BAD-3", barcode="BAR-3", min_stock="5.1234")
    resp = client.post("/api/catalog/products", json=bad_min_stock, headers=admin_headers)
    assert resp.status_code == 422

    # Reject negative money
    neg_price = dict(valid_payload, sku="SKU-BAD-4", barcode="BAR-4", purchase_price="-50.00")
    resp = client.post("/api/catalog/products", json=neg_price, headers=admin_headers)
    assert resp.status_code == 422

    # Reject NaN / inf / invalid characters
    nan_price = dict(valid_payload, sku="SKU-BAD-5", barcode="BAR-5", purchase_price="NaN")
    resp = client.post("/api/catalog/products", json=nan_price, headers=admin_headers)
    assert resp.status_code == 422

    char_price = dict(valid_payload, sku="SKU-BAD-6", barcode="BAR-6", purchase_price="abc")
    resp = client.post("/api/catalog/products", json=char_price, headers=admin_headers)
    assert resp.status_code == 422


# ==========================================
# 3. STOCK IN / STOCK OUT & ATOMCITY
# ==========================================

def test_stock_in_out_and_negative_rejection(client: TestClient, db_session: Session):
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)
    cat, brand = create_test_category_and_brand(db_session)

    # Create product
    prod_resp = client.post(
        "/api/catalog/products",
        json={
            "name": "Wireless Mouse",
            "sku": f"MOUSE-{uuid.uuid4().hex[:6]}",
            "category_id": str(cat.id),
            "brand_id": str(brand.id),
            "purchase_price": "15.00",
            "selling_price": "25.00",
            "gst_rate": "18.00",
            "min_stock": "10.000",
        },
        headers=admin_headers,
    )
    assert prod_resp.status_code == 201
    product_id = prod_resp.json()["id"]

    # 1. Stock In 50 units
    stock_in_resp = client.post(
        "/api/inventory/stock-in",
        json={"product_id": product_id, "quantity": "50.000", "reason": "Initial shipment"},
        headers=admin_headers,
    )
    assert stock_in_resp.status_code == 201
    assert stock_in_resp.json()["quantity"] == "50.000"
    assert stock_in_resp.json()["movement_type"] == "in"

    # Verify product current_stock is 50.000
    prod = client.get(f"/api/catalog/products/{product_id}", headers=admin_headers).json()
    assert Decimal(prod["current_stock"]) == Decimal("50.000")

    # 2. Stock Out 20 units
    stock_out_resp = client.post(
        "/api/inventory/stock-out",
        json={"product_id": product_id, "quantity": "20.000", "reason": "Customer delivery"},
        headers=admin_headers,
    )
    assert stock_out_resp.status_code == 201
    assert Decimal(stock_out_resp.json()["quantity"]) == Decimal("-20.000")
    assert stock_out_resp.json()["movement_type"] == "out"

    # Verify product current_stock is 30.000
    prod = client.get(f"/api/catalog/products/{product_id}", headers=admin_headers).json()
    assert Decimal(prod["current_stock"]) == Decimal("30.000")

    # 3. Reject Stock Out if stock would go negative (e.g. attempting 35 when 30 available)
    excess_out = client.post(
        "/api/inventory/stock-out",
        json={"product_id": product_id, "quantity": "35.000", "reason": "Excess deduction"},
        headers=admin_headers,
    )
    assert excess_out.status_code == 400
    err_msg = excess_out.json().get("detail") or excess_out.json().get("error", {}).get("message", "")
    assert "Insufficient stock" in err_msg

    # Stock should remain untouched at 30.000
    prod = client.get(f"/api/catalog/products/{product_id}", headers=admin_headers).json()
    assert Decimal(prod["current_stock"]) == Decimal("30.000")


def test_atomic_transaction_rollback_on_failure(client: TestClient, db_session: Session):
    """
    Simulates a failure mid-transaction (e.g. db.add(movement) fails or exception raised)
    and verifies that product.current_stock is left completely unchanged.
    """
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)
    cat, brand = create_test_category_and_brand(db_session)

    prod = Product(
        name="Atomic Test Product",
        sku=f"ATOMIC-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("10.00"),
        selling_price=Decimal("20.00"),
        current_stock=Decimal("100.000"),
        min_stock=Decimal("5.000"),
    )
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    # Patch StockMovement instantiation or db.commit to simulate mid-transaction failure
    with patch("app.modules.inventory.routes.StockMovement", side_effect=RuntimeError("Simulated DB crash mid-transaction")):
        try:
            client.post(
                "/api/inventory/stock-in",
                json={"product_id": str(prod.id), "quantity": "50.000"},
                headers=admin_headers,
            )
        except RuntimeError:
            pass

    # Re-query product from database
    db_session.expire_all()
    fresh_prod = db_session.query(Product).filter(Product.id == prod.id).first()
    assert fresh_prod.current_stock == Decimal("100.000"), "Stock must remain unchanged if transaction fails mid-flight"

    # Verify no stray stock movement was created
    movements_count = db_session.query(StockMovement).filter(StockMovement.product_id == prod.id).count()
    assert movements_count == 0


# ==========================================
# 4. ADJUSTMENT & OVERRIDE RBAC
# ==========================================

def test_stock_adjustment_and_override_rbac(client: TestClient, db_session: Session):
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)
    _, staff_headers = create_test_staff(db_session, StaffRole.STAFF)
    cat, brand = create_test_category_and_brand(db_session)

    prod = Product(
        name="Adjustment Product",
        sku=f"ADJ-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("50.00"),
        selling_price=Decimal("80.00"),
        current_stock=Decimal("10.000"),
        min_stock=Decimal("5.000"),
    )
    db_session.add(prod)
    db_session.commit()

    # 1. Normal adjustment by Staff (e.g. +5) succeeds
    resp = client.post(
        "/api/inventory/stock-adjustment",
        json={"product_id": str(prod.id), "quantity": "5.000", "reason": "Physical count +5"},
        headers=staff_headers,
    )
    assert resp.status_code == 201
    assert Decimal(resp.json()["quantity"]) == Decimal("5.000")

    # 2. Negative stock adjustment without override fails (e.g. -20 when stock is 15)
    resp = client.post(
        "/api/inventory/stock-adjustment",
        json={"product_id": str(prod.id), "quantity": "-20.000", "reason": "Missing items"},
        headers=staff_headers,
    )
    assert resp.status_code == 400
    err_msg = resp.json().get("detail") or resp.json().get("error", {}).get("message", "")
    assert "Requires Admin-flagged adjustment override" in err_msg

    # 3. Staff attempting is_override=True gets 403 Forbidden
    resp = client.post(
        "/api/inventory/stock-adjustment",
        json={"product_id": str(prod.id), "quantity": "-20.000", "is_override": True, "reason": "Forced negative"},
        headers=staff_headers,
    )
    assert resp.status_code == 403

    # 4. Admin with is_override=True succeeds and sets stock negative
    resp = client.post(
        "/api/inventory/stock-adjustment",
        json={"product_id": str(prod.id), "quantity": "-20.000", "is_override": True, "reason": "Audit override"},
        headers=admin_headers,
    )
    assert resp.status_code == 201

    db_session.expire_all()
    fresh_prod = db_session.query(Product).filter(Product.id == prod.id).first()
    assert fresh_prod.current_stock == Decimal("-5.000")


# ==========================================
# 5. VALUATION & LOW STOCK
# ==========================================

def test_inventory_valuation_and_low_stock(client: TestClient, db_session: Session):
    _, staff_headers = create_test_staff(db_session, StaffRole.STAFF)
    cat, brand = create_test_category_and_brand(db_session)

    # Product A: low stock (current 2 <= min 5)
    p1 = Product(
        name="Low Stock Item",
        sku=f"LOW-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("150.00"),
        current_stock=Decimal("2.000"),
        min_stock=Decimal("5.000"),
    )
    # Product B: normal stock (current 20 > min 5)
    p2 = Product(
        name="Normal Stock Item",
        sku=f"NORM-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("50.00"),
        selling_price=Decimal("75.00"),
        current_stock=Decimal("20.000"),
        min_stock=Decimal("5.000"),
    )
    db_session.add_all([p1, p2])
    db_session.commit()

    # 1. Low stock endpoint
    resp = client.get("/api/inventory/low-stock", headers=staff_headers)
    assert resp.status_code == 200
    items = resp.json()
    low_ids = [item["id"] for item in items]
    assert str(p1.id) in low_ids
    assert str(p2.id) not in low_ids

    # 2. Valuation endpoint: (2 * 100) + (20 * 50) = 200 + 1000 = 1200.00 (plus existing products if any)
    val_resp = client.get("/api/inventory/valuation", headers=staff_headers)
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert "total_valuation" in val_data
    assert "by_category" in val_data
    assert "by_product" in val_data


# ==========================================
# 6. IMAGE UPLOAD VALIDATION
# ==========================================

def test_image_upload_validation(client: TestClient, db_session: Session):
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)
    cat, brand = create_test_category_and_brand(db_session)

    prod = Product(
        name="Image Test Item",
        sku=f"IMG-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("10.00"),
        selling_price=Decimal("20.00"),
        current_stock=Decimal("10.000"),
        min_stock=Decimal("5.000"),
    )
    db_session.add(prod)
    db_session.commit()

    # 1. Reject invalid file type (e.g. text file)
    bad_type_file = {"file": ("test.txt", b"plain text data", "text/plain")}
    resp = client.post(f"/api/catalog/products/{prod.id}/image", files=bad_type_file, headers=admin_headers)
    assert resp.status_code == 400
    err_msg = resp.json().get("detail") or resp.json().get("error", {}).get("message", "")
    assert "Invalid image type" in err_msg

    # 2. Reject file > 2MB
    oversized_data = b"X" * (2 * 1024 * 1024 + 100)
    big_file = {"file": ("huge.jpg", oversized_data, "image/jpeg")}
    resp = client.post(f"/api/catalog/products/{prod.id}/image", files=big_file, headers=admin_headers)
    assert resp.status_code == 400
    err_msg2 = resp.json().get("detail") or resp.json().get("error", {}).get("message", "")
    assert "File size exceeds maximum allowed limit of 2MB" in err_msg2

    # 3. Accept valid PNG and convert to WebP
    img = Image.new("RGB", (200, 200), color="blue")
    img_buf = BytesIO()
    img.save(img_buf, format="PNG")
    valid_file = {"file": ("product.png", img_buf.getvalue(), "image/png")}

    resp = client.post(f"/api/catalog/products/{prod.id}/image", files=valid_file, headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["image_path"] is not None
    assert data["image_path"].startswith(f"products/{prod.id}/")
    assert data["image_path"].endswith(".webp")
