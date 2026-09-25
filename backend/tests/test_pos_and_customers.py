from decimal import Decimal
from unittest.mock import patch
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.isolation import filter_customer_scope
from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.inventory.models import StockMovement
from app.modules.sales.models import Sale, SaleItem, SaleReturn


def create_test_staff(db_session: Session, role: StaffRole = StaffRole.STAFF):
    email = f"{role.value.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}@erp.local"
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


def create_sample_product(db_session: Session, price="100.00", stock="50.000"):
    cat = Category(name=f"Cat_{uuid.uuid4().hex[:6]}")
    brand = Brand(name=f"Brand_{uuid.uuid4().hex[:6]}")
    db_session.add_all([cat, brand])
    db_session.commit()

    prod = Product(
        name="Wireless Keyboard",
        sku=f"KB-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        unit="pcs",
        purchase_price=Decimal("60.00"),
        selling_price=Decimal(price),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal(stock),
        min_stock=Decimal("5.000"),
    )
    db_session.add(prod)
    db_session.commit()
    return prod


# ==========================================
# 1. ATOMIC CHECKOUT & STOCK REVERSAL
# ==========================================

def test_pos_checkout_atomic_and_computes_totals(client: TestClient, db_session: Session):
    _, staff_headers = create_test_staff(db_session)
    prod = create_sample_product(db_session, price="120.00", stock="10.000")

    # Client tries sending fabricated cheap total "10.00"
    payload = {
        "items": [
            {
                "product_id": str(prod.id),
                "quantity": "2.000",
                "discount_amount": "10.00",
            }
        ],
        "discount_amount": "5.00",
        "payment_method": "cash",
        "client_total": "10.00",  # Fake client total
    }

    resp = client.post("/api/pos/checkout", json=payload, headers=staff_headers)
    assert resp.status_code == 201
    data = resp.json()

    # Server computation check:
    # 2 * 120.00 = 240.00
    # line discount = 10.00 -> line total = 230.00
    # order discount = 5.00 -> grand total = 225.00
    assert Decimal(data["subtotal"]) == Decimal("230.00")
    assert Decimal(data["discount_amount"]) == Decimal("5.00")
    assert Decimal(data["total_amount"]) == Decimal("225.00")
    assert data["total_amount"] != "10.00", "Server must ignore client-sent total!"

    # Verify Product stock is decremented from 10 to 8
    db_session.expire_all()
    fresh_prod = db_session.query(Product).filter(Product.id == prod.id).first()
    assert fresh_prod.current_stock == Decimal("8.000")

    # Verify 1 StockMovement 'out' record written
    movement = db_session.query(StockMovement).filter(StockMovement.reference_id == uuid.UUID(data["id"])).first()
    assert movement is not None
    assert movement.movement_type.value == "out"
    assert movement.quantity == Decimal("-2.000")


def test_pos_checkout_atomic_rollback_on_failure(client: TestClient, db_session: Session):
    """
    Simulate a mid-transaction crash during checkout and ensure stock and sales ledger remain unchanged.
    """
    _, staff_headers = create_test_staff(db_session)
    prod = create_sample_product(db_session, price="50.00", stock="20.000")

    payload = {
        "items": [{"product_id": str(prod.id), "quantity": "5.000"}],
        "payment_method": "upi",
    }

    # Patch StockMovement creation to simulate mid-transaction failure
    with patch("app.modules.sales.routes.StockMovement", side_effect=RuntimeError("Simulated DB failure")):
        try:
            client.post("/api/pos/checkout", json=payload, headers=staff_headers)
        except RuntimeError:
            pass

    db_session.expire_all()
    fresh_prod = db_session.query(Product).filter(Product.id == prod.id).first()
    assert fresh_prod.current_stock == Decimal("20.000"), "Stock must not decrease on aborted transaction"

    # Verify no sales rows created
    sales_count = db_session.query(Sale).count()
    assert sales_count == 0


def test_pos_overselling_blocked(client: TestClient, db_session: Session):
    """
    Attempt checkout with quantity > current_stock. Must be rejected with 400.
    """
    _, staff_headers = create_test_staff(db_session)
    prod = create_sample_product(db_session, price="50.00", stock="4.000")

    payload = {
        "items": [{"product_id": str(prod.id), "quantity": "5.000"}],
        "payment_method": "card",
    }

    resp = client.post("/api/pos/checkout", json=payload, headers=staff_headers)
    assert resp.status_code == 400
    err_msg = resp.json().get("detail") or resp.json().get("error", {}).get("message", "")
    assert "Insufficient stock" in err_msg


def test_pos_discount_validation(client: TestClient, db_session: Session):
    """
    Rejects negative discount and discount > line or total value.
    """
    _, staff_headers = create_test_staff(db_session)
    prod = create_sample_product(db_session, price="100.00", stock="10.000")

    # 1. Negative line discount rejected by Pydantic (422)
    neg_resp = client.post(
        "/api/pos/checkout",
        json={"items": [{"product_id": str(prod.id), "quantity": "1.000", "discount_amount": "-10.00"}]},
        headers=staff_headers,
    )
    assert neg_resp.status_code == 422

    # 2. Line discount > item total rejected (400)
    over_resp = client.post(
        "/api/pos/checkout",
        json={"items": [{"product_id": str(prod.id), "quantity": "1.000", "discount_amount": "150.00"}]},
        headers=staff_headers,
    )
    assert over_resp.status_code == 400
    err_msg = over_resp.json().get("detail") or over_resp.json().get("error", {}).get("message", "")
    assert "exceeds item total" in err_msg


# ==========================================
# 2. RETURNS & DOUBLE-RETURN BLOCKING
# ==========================================

def test_pos_returns_reverses_stock_and_blocks_double_returns(client: TestClient, db_session: Session):
    _, staff_headers = create_test_staff(db_session)
    prod = create_sample_product(db_session, price="100.00", stock="10.000")

    # Step 1: Sell 4 items (stock becomes 6)
    sale_resp = client.post(
        "/api/pos/checkout",
        json={"items": [{"product_id": str(prod.id), "quantity": "4.000"}]},
        headers=staff_headers,
    )
    assert sale_resp.status_code == 201
    sale_data = sale_resp.json()
    sale_id = sale_data["id"]
    sale_item_id = sale_data["items"][0]["id"]

    db_session.expire_all()
    fresh_prod = db_session.query(Product).filter(Product.id == prod.id).first()
    assert fresh_prod.current_stock == Decimal("6.000")

    # Step 2: Return 2 items (stock becomes 8)
    ret_resp1 = client.post(
        "/api/pos/returns",
        json={
            "sale_id": sale_id,
            "reason": "Customer changed mind",
            "items": [{"sale_item_id": sale_item_id, "quantity": "2.000"}],
        },
        headers=staff_headers,
    )
    assert ret_resp1.status_code == 201
    assert Decimal(ret_resp1.json()["total_refund_amount"]) == Decimal("200.00")

    db_session.expire_all()
    fresh_prod = db_session.query(Product).filter(Product.id == prod.id).first()
    assert fresh_prod.current_stock == Decimal("8.000")

    # Verify StockMovement 'in' row recorded
    return_id = uuid.UUID(ret_resp1.json()["id"])
    ret_movement = db_session.query(StockMovement).filter(StockMovement.reference_id == return_id).first()
    assert ret_movement is not None
    assert ret_movement.movement_type.value == "in"
    assert ret_movement.quantity == Decimal("2.000")

    # Step 3: Attempt returning 3 items when only 2 remain (4 sold - 2 returned = 2 left)
    over_return = client.post(
        "/api/pos/returns",
        json={
            "sale_id": sale_id,
            "reason": "Excess return",
            "items": [{"sale_item_id": sale_item_id, "quantity": "3.000"}],
        },
        headers=staff_headers,
    )
    assert over_return.status_code == 400
    err_msg = over_return.json().get("detail") or over_return.json().get("error", {}).get("message", "")
    assert "exceeds returnable balance" in err_msg

    # Step 4: Return remaining 2 items (total returned = 4)
    ret_resp2 = client.post(
        "/api/pos/returns",
        json={
            "sale_id": sale_id,
            "items": [{"sale_item_id": sale_item_id, "quantity": "2.000"}],
        },
        headers=staff_headers,
    )
    assert ret_resp2.status_code == 201

    db_session.expire_all()
    fresh_prod = db_session.query(Product).filter(Product.id == prod.id).first()
    assert fresh_prod.current_stock == Decimal("10.000"), "Stock fully restored to initial 10"

    # Step 5: Double return - attempt returning 1 more when 0 remain
    double_ret = client.post(
        "/api/pos/returns",
        json={
            "sale_id": sale_id,
            "items": [{"sale_item_id": sale_item_id, "quantity": "1.000"}],
        },
        headers=staff_headers,
    )
    assert double_ret.status_code == 400
    assert "exceeds returnable balance" in (double_ret.json().get("detail") or double_ret.json().get("error", {}).get("message", ""))


# ==========================================
# 3. CUSTOMER DATA ISOLATION QUERY HELPER
# ==========================================

def test_customer_data_isolation_scope(db_session: Session):
    """
    Verifies filter_customer_scope enforces tenant isolation and cannot leak data across customers.
    """
    cust_a = Customer(
        email="cust.a@test.local",
        name="Customer A",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    cust_b = Customer(
        email="cust.b@test.local",
        name="Customer B",
        password_hash=hash_password("password123"),
        is_active=True,
    )
    staff, _ = create_test_staff(db_session)
    db_session.add_all([cust_a, cust_b])
    db_session.commit()

    sale_a = Sale(
        invoice_number="POS-A",
        customer_id=cust_a.id,
        staff_id=staff.id,
        subtotal=Decimal("100.00"),
        total_amount=Decimal("100.00"),
        status="completed",
        payment_method="cash",
    )
    sale_b = Sale(
        invoice_number="POS-B",
        customer_id=cust_b.id,
        staff_id=staff.id,
        subtotal=Decimal("200.00"),
        total_amount=Decimal("200.00"),
        status="completed",
        payment_method="cash",
    )
    db_session.add_all([sale_a, sale_b])
    db_session.commit()

    # Query scoped to Customer A
    base_query = db_session.query(Sale)
    isolated_query = filter_customer_scope(base_query, Sale, cust_a)
    results = isolated_query.all()

    assert len(results) == 1
    assert results[0].invoice_number == "POS-A"
    assert results[0].customer_id == cust_a.id

    # Model without customer_id raises ValueError
    with pytest.raises(ValueError, match="Customer isolation violation"):
        filter_customer_scope(db_session.query(Brand), Brand, cust_a)


# ==========================================
# 4. CUSTOMER STAFF CRUD
# ==========================================

def test_customer_staff_crud(client: TestClient, db_session: Session):
    _, staff_headers = create_test_staff(db_session)

    # 1. Create customer
    create_payload = {
        "name": "Alice Smith",
        "email": "alice.smith@client.local",
        "phone": "+91 9876543210",
        "address": "123 Market St, Bangalore",
    }
    resp = client.post("/api/staff/customers", json=create_payload, headers=staff_headers)
    assert resp.status_code == 201
    cust_id = resp.json()["id"]

    # 2. Get customer
    get_resp = client.get(f"/api/staff/customers/{cust_id}", headers=staff_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Alice Smith"
    assert get_resp.json()["address"] == "123 Market St, Bangalore"
    assert get_resp.json()["purchases"] == []

    # 3. Update customer
    upd_resp = client.put(
        f"/api/staff/customers/{cust_id}",
        json={"name": "Alice Johnson", "phone": "+91 9999999999"},
        headers=staff_headers,
    )
    assert upd_resp.status_code == 200
    assert upd_resp.json()["name"] == "Alice Johnson"
    assert upd_resp.json()["phone"] == "+91 9999999999"

    # 4. Search customer
    search_resp = client.get("/api/staff/customers?search=Johnson", headers=staff_headers)
    assert search_resp.status_code == 200
    assert any(c["id"] == cust_id for c in search_resp.json())


def test_pos_store_info_endpoint(client: TestClient, db_session: Session):
    """Verify that staff can retrieve configured store branding and contact details for thermal receipt printing."""
    _, staff_headers = create_test_staff(db_session)
    resp = client.get("/api/pos/store-info", headers=staff_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "store_name" in data
    assert "gstin" in data
    assert "address" in data
    assert "phone" in data
    assert "email" in data
    assert data["store_name"] is not None
