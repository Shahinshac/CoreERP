"""
Phase 19b Section 9 — Dead-Stock / Inventory Aging Report Tests

Tests cover:
1. Report shape, bucket calculations (0-30, 31-60, 61-90, 90+), inactive days, and valuations.
2. Outbound StockMovement recency takes precedence over product creation date.
3. Filtering by aging bucket (e.g. bucket=90+ for dead stock).
4. Category and search term filtering.
5. CSV and Excel export endpoints streaming correctly.
6. RBAC access restriction (STAFF forbidden 403, ADMIN allowed 200).
"""
import io
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.inventory.models import MovementType, StockMovement


@pytest.fixture
def admin_headers(client: TestClient, db_session: Session):
    admin = StaffUser(
        email=f"aging_admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Admin123!"),
        role=StaffRole.ADMIN,
        full_name="Aging Admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    token = create_access_token(subject=str(admin.id), audience="staff", role=admin.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def staff_headers(client: TestClient, db_session: Session):
    staff = StaffUser(
        email=f"aging_staff_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("Staff123!"),
        role=StaffRole.STAFF,
        full_name="Aging Staff",
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()
    db_session.refresh(staff)
    token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seeded_aging_products(db_session: Session):
    cat = Category(name=f"AgingCat_{uuid.uuid4().hex[:4]}")
    brand = Brand(name=f"AgingBrand_{uuid.uuid4().hex[:4]}")
    db_session.add_all([cat, brand])
    db_session.commit()
    db_session.refresh(cat)
    db_session.refresh(brand)

    now = datetime.now(timezone.utc)
    # Product 1: Created 10 days ago, no movements -> 0-30 bucket
    p1 = Product(
        name="Fresh Product",
        sku=f"SKU-030-{uuid.uuid4().hex[:4]}",
        hsn_code="84713010",
        category_id=cat.id,
        brand_id=brand.id,
        current_stock=10,
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("150.00"),
        created_at=now - timedelta(days=10),
        is_active=True,
    )

    # Product 2: Created 150 days ago, but has an OUT movement 40 days ago -> 31-60 bucket
    p2 = Product(
        name="Moderate Aging Product",
        sku=f"SKU-3160-{uuid.uuid4().hex[:4]}",
        category_id=cat.id,
        brand_id=brand.id,
        current_stock=5,
        purchase_price=Decimal("200.00"),
        selling_price=Decimal("250.00"),
        created_at=now - timedelta(days=150),
        is_active=True,
    )

    # Product 3: Created 70 days ago, no movements -> 61-90 bucket
    p3 = Product(
        name="Slow Product",
        sku=f"SKU-6190-{uuid.uuid4().hex[:4]}",
        category_id=cat.id,
        brand_id=brand.id,
        current_stock=2,
        purchase_price=Decimal("500.00"),
        selling_price=Decimal("600.00"),
        created_at=now - timedelta(days=70),
        is_active=True,
    )

    # Product 4: Created 120 days ago, no movements -> 90+ bucket (Dead Stock)
    p4 = Product(
        name="Dead Stock Product",
        sku=f"SKU-90P-{uuid.uuid4().hex[:4]}",
        category_id=cat.id,
        brand_id=brand.id,
        current_stock=8,
        purchase_price=Decimal("300.00"),
        selling_price=Decimal("350.00"),
        created_at=now - timedelta(days=120),
        is_active=True,
    )

    db_session.add_all([p1, p2, p3, p4])
    db_session.commit()
    db_session.refresh(p2)

    # Add StockMovement OUT for p2 40 days ago
    sm = StockMovement(
        product_id=p2.id,
        movement_type=MovementType.OUT,
        quantity=Decimal("2.000"),
        reference_type="sale",
        created_at=now - timedelta(days=40),
    )
    db_session.add(sm)
    db_session.commit()

    return {"cat": cat, "brand": brand, "p1": p1, "p2": p2, "p3": p3, "p4": p4}


def test_inventory_aging_report_and_buckets(client: TestClient, db_session: Session, admin_headers, seeded_aging_products):
    # Call inventory aging report
    resp = client.get("/api/reports/inventory-aging", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["report_type"] == "inventory-aging"
    summary = data["summary"]
    assert "buckets" in summary
    assert "0-30" in summary["buckets"]
    assert "31-60" in summary["buckets"]
    assert "61-90" in summary["buckets"]
    assert "90+" in summary["buckets"]

    # Verify bucket assignments in rows
    row_map = {r["name"]: r for r in data["rows"]}
    assert row_map["Fresh Product"]["bucket"] == "0-30"
    assert row_map["Moderate Aging Product"]["bucket"] == "31-60"
    assert row_map["Slow Product"]["bucket"] == "61-90"
    assert row_map["Dead Stock Product"]["bucket"] == "90+"

    # Check dead stock valuation for p4: 8 * 300 = 2400.00
    assert Decimal(row_map["Dead Stock Product"]["valuation"]) == Decimal("2400.00")
    assert row_map["Fresh Product"]["hsn_code"] == "84713010"


def test_inventory_aging_bucket_filter(client: TestClient, db_session: Session, admin_headers, seeded_aging_products):
    resp = client.get("/api/reports/inventory-aging?bucket=90+", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["rows"]) >= 1
    for row in data["rows"]:
        assert row["bucket"] == "90+"


def test_inventory_aging_search_filter(client: TestClient, db_session: Session, admin_headers, seeded_aging_products):
    resp = client.get("/api/reports/inventory-aging?search=Dead Stock", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["rows"]) >= 1
    assert all("Dead Stock" in r["name"] or "Dead Stock" in r["sku"] for r in data["rows"])


def test_inventory_aging_export(client: TestClient, db_session: Session, admin_headers, seeded_aging_products):
    # CSV export
    csv_resp = client.get("/api/reports/inventory-aging/export?format=csv", headers=admin_headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "attachment; filename=inventory_aging.csv" in csv_resp.headers.get("content-disposition", "")
    content = csv_resp.content.decode("utf-8-sig")
    assert "name,sku,hsn_code,category,current_stock" in content

    # Excel export
    excel_resp = client.get("/api/reports/inventory-aging/export?format=excel", headers=admin_headers)
    assert excel_resp.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in excel_resp.headers["content-type"]


def test_inventory_aging_rbac(client: TestClient, db_session: Session, staff_headers):
    resp = client.get("/api/reports/inventory-aging", headers=staff_headers)
    assert resp.status_code == 403
