import json
import uuid
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.sequences import (
    calculate_ean13_checksum,
    validate_ean13,
)
from app.modules.catalog.models import Product, ProductSequence


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


def test_ean13_checksum_algorithm():
    """Verify standard GS1 Modulo-10 checksum calculation and validation."""
    # Test standard GS1 EAN-13 barcodes
    assert calculate_ean13_checksum("400638133393") == 1
    assert validate_ean13("4006381333931") is True
    assert validate_ean13("4006381333939") is False

    # Test internal ERP sequence 200000000001
    chk = calculate_ean13_checksum("200000000001")
    assert chk == 5
    assert validate_ean13(f"200000000001{chk}") is True

    with pytest.raises(ValueError):
        calculate_ean13_checksum("123")  # not 12 digits
    with pytest.raises(ValueError):
        calculate_ean13_checksum("20000000000A")  # not numeric


def test_auto_generate_sku_and_barcode(client: TestClient, db_session: Session):
    """When creating a product without SKU and Barcode, both must be automatically generated."""
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)

    # 1. Create Category and Brand
    cat_res = client.post("/api/catalog/categories", json={"name": f"Auto Cat {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    assert cat_res.status_code == 201
    cat_id = cat_res.json()["id"]

    brand_res = client.post("/api/catalog/brands", json={"name": f"Auto Brand {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    assert brand_res.status_code == 201
    brand_id = brand_res.json()["id"]

    # 2. Create product with no SKU and no Barcode
    prod_payload = {
        "name": "Auto Identifier Product 1",
        "category_id": cat_id,
        "brand_id": brand_id,
        "purchase_price": "100.00",
        "selling_price": "150.00",
        "gst_rate": "18.00",
        "min_stock": "2.000",
        "hsn_code": "8471",
    }
    res = client.post("/api/catalog/products", json=prod_payload, headers=admin_headers)
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["sku"].startswith("SKU-")
    assert len(data["sku"]) == 10  # SKU-000001
    assert data["barcode"].startswith("200")
    assert len(data["barcode"]) == 13
    assert validate_ean13(data["barcode"]) is True
    assert data["hsn_code"] == "8471"


def test_multiple_products_sequential_uniqueness(client: TestClient, db_session: Session):
    """Creating 10 products generates sequential, strictly unique SKUs and barcodes."""
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)

    cat_res = client.post("/api/catalog/categories", json={"name": f"Seq Cat {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    cat_id = cat_res.json()["id"]
    brand_res = client.post("/api/catalog/brands", json={"name": f"Seq Brand {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    brand_id = brand_res.json()["id"]

    created_skus = []
    created_barcodes = []

    for i in range(10):
        res = client.post(
            "/api/catalog/products",
            json={
                "name": f"Batch Item {i}_{uuid.uuid4().hex[:4]}",
                "category_id": cat_id,
                "brand_id": brand_id,
                "purchase_price": "50.00",
                "selling_price": "75.00",
            },
            headers=admin_headers,
        )
        assert res.status_code == 201
        d = res.json()
        created_skus.append(d["sku"])
        created_barcodes.append(d["barcode"])
        assert validate_ean13(d["barcode"]) is True

    # Verify uniqueness
    assert len(set(created_skus)) == 10
    assert len(set(created_barcodes)) == 10


def test_manual_sku_and_barcode_uniqueness_validation(client: TestClient, db_session: Session):
    """Manual SKU and barcode are preserved when provided, but duplicates are strictly rejected."""
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)

    cat_res = client.post("/api/catalog/categories", json={"name": f"Manual Cat {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    cat_id = cat_res.json()["id"]
    brand_res = client.post("/api/catalog/brands", json={"name": f"Manual Brand {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    brand_id = brand_res.json()["id"]

    custom_sku = f"CUSTOM-SKU-{uuid.uuid4().hex[:6].upper()}"
    custom_barcode = f"890123{uuid.uuid4().hex[:7]}"

    # 1. Create with custom manual SKU and barcode
    res1 = client.post(
        "/api/catalog/products",
        json={
            "name": "Custom Product",
            "sku": custom_sku,
            "barcode": custom_barcode,
            "category_id": cat_id,
            "brand_id": brand_id,
            "purchase_price": "100.00",
            "selling_price": "199.00",
        },
        headers=admin_headers,
    )
    assert res1.status_code == 201
    d1 = res1.json()
    assert d1["sku"] == custom_sku
    assert d1["barcode"] == custom_barcode

    # 2. Try duplicate SKU
    res_dup_sku = client.post(
        "/api/catalog/products",
        json={
            "name": "Duplicate SKU Product",
            "sku": custom_sku,
            "category_id": cat_id,
            "brand_id": brand_id,
            "purchase_price": "100.00",
            "selling_price": "199.00",
        },
        headers=admin_headers,
    )
    assert res_dup_sku.status_code == 409
    assert "already exists" in res_dup_sku.json()["error"]["message"]

    # 3. Try duplicate barcode
    res_dup_bc = client.post(
        "/api/catalog/products",
        json={
            "name": "Duplicate Barcode Product",
            "barcode": custom_barcode,
            "category_id": cat_id,
            "brand_id": brand_id,
            "purchase_price": "100.00",
            "selling_price": "199.00",
        },
        headers=admin_headers,
    )
    assert res_dup_bc.status_code == 409
    assert "already exists" in res_dup_bc.json()["error"]["message"]


def test_hsn_sac_validation(client: TestClient, db_session: Session):
    """HSN/SAC must be between 2 and 8 digits; invalid values must be rejected."""
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)

    cat_res = client.post("/api/catalog/categories", json={"name": f"HSN Cat {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    cat_id = cat_res.json()["id"]
    brand_res = client.post("/api/catalog/brands", json={"name": f"HSN Brand {uuid.uuid4().hex[:6]}"}, headers=admin_headers)
    brand_id = brand_res.json()["id"]

    # Valid HSN 4 digits
    res_ok = client.post(
        "/api/catalog/products",
        json={
            "name": "Valid HSN Item",
            "category_id": cat_id,
            "brand_id": brand_id,
            "purchase_price": "10.00",
            "selling_price": "20.00",
            "hsn_code": "8517",
        },
        headers=admin_headers,
    )
    assert res_ok.status_code == 201
    assert res_ok.json()["hsn_code"] == "8517"

    # Invalid HSN with letters
    res_invalid_chars = client.post(
        "/api/catalog/products",
        json={
            "name": "Invalid HSN Item 1",
            "category_id": cat_id,
            "brand_id": brand_id,
            "purchase_price": "10.00",
            "selling_price": "20.00",
            "hsn_code": "8517AB",
        },
        headers=admin_headers,
    )
    assert res_invalid_chars.status_code == 422

    # Invalid HSN too long (> 8 digits)
    res_too_long = client.post(
        "/api/catalog/products",
        json={
            "name": "Invalid HSN Item 2",
            "category_id": cat_id,
            "brand_id": brand_id,
            "purchase_price": "10.00",
            "selling_price": "20.00",
            "hsn_code": "123456789",
        },
        headers=admin_headers,
    )
    assert res_too_long.status_code == 422


def test_backfill_missing_identifiers_endpoint(client: TestClient, db_session: Session):
    """Backfill endpoint populates missing SKUs or Barcodes without modifying existing ones."""
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)

    cat_id = client.post("/api/catalog/categories", json={"name": f"Backfill Cat {uuid.uuid4().hex[:6]}"}, headers=admin_headers).json()["id"]
    brand_id = client.post("/api/catalog/brands", json={"name": f"Backfill Brand {uuid.uuid4().hex[:6]}"}, headers=admin_headers).json()["id"]

    existing_sku = f"EX-SKU-{uuid.uuid4().hex[:6].upper()}"
    prod = Product(
        name="Direct DB Item Without Barcode",
        sku=existing_sku,
        barcode=None,
        category_id=uuid.UUID(cat_id),
        brand_id=uuid.UUID(brand_id),
        unit="pcs",
        purchase_price=Decimal("10.00"),
        selling_price=Decimal("20.00"),
        gst_rate=Decimal("18.00"),
        min_stock=Decimal("1.000"),
        current_stock=Decimal("5.000"),
        is_active=True,
    )
    db_session.add(prod)
    db_session.commit()

    # Call backfill endpoint
    res = client.post("/api/catalog/products/backfill-identifiers", headers=admin_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["barcode_backfilled_count"] >= 1
    assert "Backfill complete" in data["message"]

    # Verify that existing SKU was preserved, and barcode was added
    db_session.refresh(prod)
    assert prod.sku == existing_sku  # Not overwritten
    assert prod.barcode is not None
    assert prod.barcode.startswith("200")
    assert validate_ean13(prod.barcode) is True


def test_pos_barcode_and_qr_lookup(client: TestClient, db_session: Session):
    """POS barcode scanner can find the product via exact barcode, SKU, and JSON QR payload."""
    _, admin_headers = create_test_staff(db_session, StaffRole.ADMIN)
    _, staff_headers = create_test_staff(db_session, StaffRole.STAFF)

    cat_id = client.post("/api/catalog/categories", json={"name": f"POS Cat {uuid.uuid4().hex[:6]}"}, headers=admin_headers).json()["id"]
    brand_id = client.post("/api/catalog/brands", json={"name": f"POS Brand {uuid.uuid4().hex[:6]}"}, headers=admin_headers).json()["id"]

    prod_res = client.post(
        "/api/catalog/products",
        json={
            "name": "POS Barcode Scanner Product",
            "category_id": cat_id,
            "brand_id": brand_id,
            "purchase_price": "20.00",
            "selling_price": "40.00",
            "hsn_code": "84713010",
        },
        headers=admin_headers,
    )
    assert prod_res.status_code == 201
    prod = prod_res.json()
    barcode = prod["barcode"]
    sku = prod["sku"]

    # 1. Lookup by exact generated Barcode
    res_by_barcode = client.get(f"/api/pos/products/barcode?barcode={barcode}", headers=staff_headers)
    assert res_by_barcode.status_code == 200
    assert res_by_barcode.json()["id"] == prod["id"]
    assert res_by_barcode.json()["hsn_code"] == "84713010"

    # 2. Lookup by SKU
    res_by_sku = client.get(f"/api/pos/products/barcode?barcode={sku}", headers=staff_headers)
    assert res_by_sku.status_code == 200
    assert res_by_sku.json()["id"] == prod["id"]

    # 3. Lookup by 2D QR Scanner JSON payload
    qr_payload = json.dumps({
        "app": "CoreERP",
        "id": prod["id"],
        "sku": sku,
        "barcode": barcode,
        "name": prod["name"],
        "price": prod["selling_price"],
    })
    res_by_qr = client.get(f"/api/pos/products/barcode?barcode={qr_payload}", headers=staff_headers)
    assert res_by_qr.status_code == 200
    assert res_by_qr.json()["id"] == prod["id"]
