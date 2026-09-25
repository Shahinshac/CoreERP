from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.audit.models import AuditLog
from app.modules.auth.models import StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.sales.models import CashDrawerSession, Sale, SaleItem, SaleReturn


def create_staff(db_session: Session, role: StaffRole = StaffRole.STAFF):
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
        name=f"Product {uuid.uuid4().hex[:4]}",
        sku=f"SKU-{uuid.uuid4().hex[:6]}",
        category_id=cat.id,
        brand_id=brand.id,
        unit="pcs",
        purchase_price=Decimal("50.00"),
        selling_price=Decimal(price),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal(stock),
        min_stock=Decimal("5.000"),
    )
    db_session.add(prod)
    db_session.commit()
    return prod


def test_open_drawer_and_prevent_duplicate_active_session(client: TestClient, db_session: Session):
    cashier, headers = create_staff(db_session, StaffRole.STAFF)

    # 1. Open drawer successfully with float ₹1,000.00
    resp = client.post(
        "/api/pos/cash-drawer/open",
        json={"opening_cash": "1000.00", "opening_notes": "Morning shift opening float"},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "open"
    assert data["opening_cash"] == "1000.00"
    assert data["cashier_email"] == cashier.email
    session_id = data["id"]

    # 2. Check current status
    cur_resp = client.get("/api/pos/cash-drawer/current", headers=headers)
    assert cur_resp.status_code == 200
    cur_data = cur_resp.json()
    assert cur_data["active"] is True
    assert cur_data["session"]["id"] == session_id
    assert cur_data["session"]["expected_cash"] == "1000.00"

    # 3. Attempting to open another session for same cashier must fail
    dup_resp = client.post(
        "/api/pos/cash-drawer/open",
        json={"opening_cash": "500.00"},
        headers=headers,
    )
    assert dup_resp.status_code == 400
    err_msg = dup_resp.json().get("error", {}).get("message", "")
    assert "already open" in err_msg


def test_cash_sales_and_movements_affect_expected_cash(client: TestClient, db_session: Session):
    cashier, headers = create_staff(db_session, StaffRole.STAFF)
    prod = create_sample_product(db_session, price="150.00", stock="20.000")

    # 1. Open drawer with ₹500.00
    open_resp = client.post(
        "/api/pos/cash-drawer/open",
        json={"opening_cash": "500.00"},
        headers=headers,
    )
    assert open_resp.status_code == 201

    # 2. Record Cash POS Sale: 2 x ₹150.00 = ₹300.00
    sale_resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "2.000", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "cash",
        },
        headers=headers,
    )
    assert sale_resp.status_code == 201

    # 3. Record Card POS Sale: 1 x ₹150.00 = ₹150.00 (Should NOT affect cash drawer)
    card_resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "1.000", "discount_amount": "0.00"}],
            "discount_amount": "0.00",
            "payment_method": "card",
        },
        headers=headers,
    )
    assert card_resp.status_code == 201

    # 4. Check live expected cash: 500 (open) + 300 (cash sale) = 800.00
    status_resp = client.get("/api/pos/cash-drawer/current", headers=headers)
    assert status_resp.status_code == 200
    s_data = status_resp.json()["session"]
    assert s_data["cash_sales_amount"] == "300.00"
    assert s_data["cash_sales_count"] == 1
    assert s_data["total_sales_amount"] == "450.00"  # 300 cash + 150 card
    assert s_data["expected_cash"] == "800.00"

    # 5. Record Manual Cash In: ₹100.00
    cin_resp = client.post(
        "/api/pos/cash-drawer/movements",
        json={"movement_type": "cash_in", "amount": "100.00", "reason": "Added change from safe"},
        headers=headers,
    )
    assert cin_resp.status_code == 201

    # 6. Record Manual Cash Out (Cash Drop to Safe): ₹200.00
    cout_resp = client.post(
        "/api/pos/cash-drawer/movements",
        json={"movement_type": "cash_drop", "amount": "200.00", "reason": "Mid-day excess cash drop"},
        headers=headers,
    )
    assert cout_resp.status_code == 201

    # Live expected cash: 500 + 300 + 100 - 200 = 700.00
    status_resp2 = client.get("/api/pos/cash-drawer/current", headers=headers)
    assert status_resp2.json()["session"]["expected_cash"] == "700.00"


def test_cash_refund_affects_expected_cash(client: TestClient, db_session: Session):
    cashier, headers = create_staff(db_session, StaffRole.STAFF)
    prod = create_sample_product(db_session, price="200.00", stock="10.000")

    # 1. Open drawer with ₹1,000.00
    client.post("/api/pos/cash-drawer/open", json={"opening_cash": "1000.00"}, headers=headers)

    # 2. Complete Cash Sale of 2 items = ₹400.00
    sale_resp = client.post(
        "/api/pos/checkout",
        json={
            "items": [{"product_id": str(prod.id), "quantity": "2.000", "discount_amount": "0.00"}],
            "payment_method": "cash",
        },
        headers=headers,
    )
    assert sale_resp.status_code == 201
    sale_data = sale_resp.json()
    sale_item_id = sale_data["items"][0]["id"]

    # 3. Process return of 1 item = refund ₹200.00
    ret_resp = client.post(
        "/api/pos/returns",
        json={
            "sale_id": sale_data["id"],
            "reason": "Customer change of mind",
            "items": [{"sale_item_id": sale_item_id, "quantity": "1.000"}],
        },
        headers=headers,
    )
    assert ret_resp.status_code == 201

    # Expected cash: 1000 (open) + 400 (sale) - 200 (refund) = 1200.00
    status_resp = client.get("/api/pos/cash-drawer/current", headers=headers)
    assert status_resp.json()["session"]["cash_refunds_amount"] == "200.00"
    assert status_resp.json()["session"]["expected_cash"] == "1200.00"


def test_x_report_does_not_close_session(client: TestClient, db_session: Session):
    cashier, headers = create_staff(db_session, StaffRole.STAFF)
    prod = create_sample_product(db_session, price="100.00", stock="10.000")

    client.post("/api/pos/cash-drawer/open", json={"opening_cash": "500.00"}, headers=headers)
    ch_resp = client.post(
        "/api/pos/checkout",
        json={"items": [{"product_id": str(prod.id), "quantity": "1.000"}], "payment_method": "cash"},
        headers=headers,
    )
    assert ch_resp.status_code == 201

    # Request X Report with counted cash ₹620.00 (Over by 20.00)
    x_resp = client.get("/api/pos/cash-drawer/x-report?counted_cash=620.00", headers=headers)
    assert x_resp.status_code == 200
    x_data = x_resp.json()
    assert x_data["status"] == "open"
    assert x_data["opening_cash"] == "500.00"
    assert x_data["cash_sales_amount"] == "100.00"
    assert x_data["expected_cash"] == "600.00"
    assert x_data["counted_cash"] == "620.00"
    assert x_data["variance"] == "20.00"

    # CRITICAL: Verify session is STILL OPEN
    cur_resp = client.get("/api/pos/cash-drawer/current", headers=headers)
    assert cur_resp.json()["active"] is True
    assert cur_resp.json()["session"]["status"] == "open"


def test_close_drawer_and_z_report_variance(client: TestClient, db_session: Session):
    cashier, headers = create_staff(db_session, StaffRole.STAFF)
    prod = create_sample_product(db_session, price="250.00", stock="10.000")

    open_res = client.post("/api/pos/cash-drawer/open", json={"opening_cash": "1000.00"}, headers=headers)
    session_id = open_res.json()["id"]

    # Sale ₹250 cash
    ch_resp = client.post(
        "/api/pos/checkout",
        json={"items": [{"product_id": str(prod.id), "quantity": "1.000"}], "payment_method": "cash"},
        headers=headers,
    )
    assert ch_resp.status_code == 201

    # Expected: 1000 + 250 = 1250.00
    # Actual counted: ₹1230.00 (SHORT by ₹20.00)
    denominations = {"500": 2, "200": 1, "100": 0, "20": 1, "10": 1}  # 1000 + 200 + 20 + 10 = 1230

    close_resp = client.post(
        "/api/pos/cash-drawer/close",
        json={
            "closing_cash": "1230.00",
            "denominations": denominations,
            "closing_notes": "Short by ₹20, minor change rounding error",
        },
        headers=headers,
    )
    assert close_resp.status_code == 200
    z_data = close_resp.json()
    assert z_data["status"] == "closed"
    assert z_data["opening_cash"] == "1000.00"
    assert z_data["cash_sales_amount"] == "250.00"
    assert z_data["expected_cash"] == "1250.00"
    assert z_data["actual_cash"] == "1230.00"
    assert z_data["variance"] == "-20.00"
    assert z_data["denominations"] == denominations
    assert z_data["closing_notes"] == "Short by ₹20, minor change rounding error"

    # Verify session is now inactive
    cur_resp = client.get("/api/pos/cash-drawer/current", headers=headers)
    assert cur_resp.json()["active"] is False

    # Verify immutable Z Report endpoint retrieves exact same data
    z_get_resp = client.get(f"/api/pos/cash-drawer/sessions/{session_id}/z-report", headers=headers)
    assert z_get_resp.status_code == 200
    assert z_get_resp.json()["variance"] == "-20.00"
    assert z_get_resp.json()["actual_cash"] == "1230.00"


def test_role_authorization_and_audit_logging(client: TestClient, db_session: Session):
    cashier_a, headers_a = create_staff(db_session, StaffRole.STAFF)
    cashier_b, headers_b = create_staff(db_session, StaffRole.STAFF)
    admin, admin_headers = create_staff(db_session, StaffRole.ADMIN)

    # Cashier A opens drawer
    open_resp = client.post("/api/pos/cash-drawer/open", json={"opening_cash": "500.00"}, headers=headers_a)
    session_a_id = open_resp.json()["id"]

    # Cashier B tries to view Cashier A's session detail -> 403 Forbidden
    forbid_resp = client.get(f"/api/pos/cash-drawer/sessions/{session_a_id}", headers=headers_b)
    assert forbid_resp.status_code == 403

    # Admin CAN view Cashier A's session -> 200 OK
    admin_view_resp = client.get(f"/api/pos/cash-drawer/sessions/{session_a_id}", headers=admin_headers)
    assert admin_view_resp.status_code == 200
    assert admin_view_resp.json()["session_id"] == session_a_id

    # Cashier A closes drawer with variance
    client.post(
        "/api/pos/cash-drawer/close",
        json={"closing_cash": "550.00", "closing_notes": "Found extra ₹50"},
        headers=headers_a,
    )

    # Verify Audit Logs were written
    logs = (
        db_session.query(AuditLog)
        .filter(AuditLog.resource_id == session_a_id)
        .all()
    )
    event_types = [l.event_type for l in logs]
    assert "cash_drawer.session_opened" in event_types
    assert "cash_drawer.session_closed" in event_types
    assert "cash_drawer.variance_recorded" in event_types
