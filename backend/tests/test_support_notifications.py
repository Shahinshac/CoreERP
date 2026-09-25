import io
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.notifications.models import Notification
from app.modules.sales.models import Purchase, PurchaseItem, Supplier
from app.modules.support.models import (
    SupportTicket,
    TicketComment,
    TicketPriority,
    TicketStatus,
    Warranty,
)


@pytest.fixture
def support_setup(db_session: Session):
    admin = StaffUser(
        email="admin_support@erp.local",
        password_hash=hash_password("adminpass123"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    staff = StaffUser(
        email="staff_agent@erp.local",
        password_hash=hash_password("staffpass123"),
        role=StaffRole.STAFF,
        is_active=True,
    )
    db_session.add_all([admin, staff])
    db_session.flush()

    customer_a = Customer(
        email="cust_sup_a@example.com",
        password_hash=hash_password("custpass123"),
        name="Customer Alice",
        phone="9876543210",
        address="123 Alice St, Mumbai",
        state="Maharashtra",
        is_active=True,
    )
    customer_b = Customer(
        email="cust_sup_b@example.com",
        password_hash=hash_password("custpass123"),
        name="Customer Bob",
        phone="9876543211",
        address="456 Bob St, Pune",
        state="Maharashtra",
        is_active=True,
    )
    db_session.add_all([customer_a, customer_b])
    db_session.flush()

    cat = Category(name="Electronics", description="Electronics")
    brand = Brand(name="Acme")
    supplier = Supplier(name="Global Supplier Inc.")
    db_session.add_all([cat, brand, supplier])
    db_session.flush()

    prod = Product(
        name="Smart Tablet Pro",
        sku="SKU-TAB-01",
        category_id=cat.id,
        brand_id=brand.id,
        barcode="BAR-TAB-01",
        selling_price=Decimal("15000.00"),
        purchase_price=Decimal("10000.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("10.000"),
        min_stock=Decimal("2.000"),
    )
    db_session.add(prod)
    db_session.commit()

    admin_token = create_access_token(subject=str(admin.id), audience="staff", role=admin.role.value)
    staff_token = create_access_token(subject=str(staff.id), audience="staff", role=staff.role.value)
    cust_a_token = create_access_token(subject=str(customer_a.id), audience="customer")
    cust_b_token = create_access_token(subject=str(customer_b.id), audience="customer")

    return {
        "admin": admin,
        "staff": staff,
        "customer_a": customer_a,
        "customer_b": customer_b,
        "product": prod,
        "supplier": supplier,
        "admin_headers": {"Authorization": f"Bearer {admin_token}"},
        "staff_headers": {"Authorization": f"Bearer {staff_token}"},
        "cust_a_headers": {"Authorization": f"Bearer {cust_a_token}"},
        "cust_b_headers": {"Authorization": f"Bearer {cust_b_token}"},
    }


# ==========================================
# 1. PURCHASE RECEIVING WRITE-SIDE TAGGING
# ==========================================

def test_purchase_receiving_sets_reference_type(client: TestClient, db_session: Session, support_setup):
    """
    Asserts that receiving a purchase writes a StockMovement with:
    - movement_type == 'in'
    - reference_type == 'purchase'
    - reference_id == purchase.id
    """
    setup = support_setup
    admin = setup["admin"]
    supplier = setup["supplier"]
    product = setup["product"]

    # 1. Create a Purchase with 1 item
    purchase = Purchase(
        supplier_id=supplier.id,
        purchase_date=date.today(),
        total_amount=Decimal("50000.00"),
        status="pending",
        created_by=admin.id,
    )
    db_session.add(purchase)
    db_session.flush()

    p_item = PurchaseItem(
        purchase_id=purchase.id,
        product_id=product.id,
        quantity=Decimal("5.000"),
        unit_price=Decimal("10000.00"),
        total_price=Decimal("50000.00"),
    )
    db_session.add(p_item)
    db_session.commit()

    initial_stock = product.current_stock

    # 2. Receive the purchase via staff endpoint
    res = client.post(
        f"/api/inventory/purchases/{purchase.id}/receive",
        headers=setup["admin_headers"],
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "received"

    # 3. Verify stock increased
    db_session.refresh(product)
    assert product.current_stock == initial_stock + Decimal("5.000")

    # 4. Verify StockMovement created with reference_type="purchase"
    movement = (
        db_session.query(StockMovement)
        .filter(StockMovement.reference_id == purchase.id)
        .first()
    )
    assert movement is not None
    assert movement.movement_type == MovementType.IN
    assert movement.reference_type == "purchase"
    assert movement.quantity == Decimal("5.000")
    assert movement.product_id == product.id


# ==========================================
# 2. WARRANTY DYNAMIC STATUS COMPUTATION
# ==========================================

def test_warranty_status_computation(client: TestClient, db_session: Session, support_setup):
    """
    Tests dynamic computation of warranty status:
    - Active: start_date <= today <= end_date
    - Expired: end_date < today
    - Claimed: is_claimed=True overrides dates
    """
    setup = support_setup
    cust_a = setup["customer_a"]
    product = setup["product"]
    today = date.today()

    # Active warranty
    w_active = Warranty(
        product_id=product.id,
        customer_id=cust_a.id,
        serial_number="SN-ACTIVE-01",
        purchase_date=today - timedelta(days=30),
        start_date=today - timedelta(days=30),
        end_date=today + timedelta(days=335),
    )
    # Expired warranty (ended yesterday)
    w_expired = Warranty(
        product_id=product.id,
        customer_id=cust_a.id,
        serial_number="SN-EXPIRED-01",
        purchase_date=today - timedelta(days=400),
        start_date=today - timedelta(days=400),
        end_date=today - timedelta(days=1),
    )
    # Claimed warranty (valid dates, but claimed)
    w_claimed = Warranty(
        product_id=product.id,
        customer_id=cust_a.id,
        serial_number="SN-CLAIMED-01",
        purchase_date=today - timedelta(days=60),
        start_date=today - timedelta(days=60),
        end_date=today + timedelta(days=300),
        is_claimed=True,
        claimed_at=datetime.utcnow(),
        claim_notes="Screen replacement completed",
    )
    db_session.add_all([w_active, w_expired, w_claimed])
    db_session.commit()

    assert w_active.status == "active"
    assert w_expired.status == "expired"
    assert w_claimed.status == "claimed"

    # Staff list endpoint returns properly computed status
    res = client.get("/api/support/warranties", headers=setup["admin_headers"])
    assert res.status_code == 200
    w_list = res.json()
    status_map = {item["serial_number"]: item["status"] for item in w_list}
    assert status_map["SN-ACTIVE-01"] == "active"
    assert status_map["SN-EXPIRED-01"] == "expired"
    assert status_map["SN-CLAIMED-01"] == "claimed"

    # Claim active warranty via staff claim endpoint
    claim_res = client.post(
        f"/api/support/warranties/{w_active.id}/claim",
        headers=setup["admin_headers"],
        json={"claim_notes": "Motherboard replacement approved."},
    )
    assert claim_res.status_code == 200
    claimed_data = claim_res.json()
    assert claimed_data["is_claimed"] is True
    assert claimed_data["status"] == "claimed"


# ==========================================
# 3. PORTAL WARRANTIES & ISOLATION
# ==========================================

def test_portal_warranties_isolation(client: TestClient, db_session: Session, support_setup):
    """
    Asserts Customer A only sees own warranties. Customer B gets 403 on Customer A's warranty.
    """
    setup = support_setup
    cust_a = setup["customer_a"]
    cust_b = setup["customer_b"]
    product = setup["product"]
    today = date.today()

    w_a = Warranty(
        product_id=product.id,
        customer_id=cust_a.id,
        serial_number="SN-ALICE-100",
        purchase_date=today,
        start_date=today,
        end_date=today + timedelta(days=365),
    )
    w_b = Warranty(
        product_id=product.id,
        customer_id=cust_b.id,
        serial_number="SN-BOB-200",
        purchase_date=today,
        start_date=today,
        end_date=today + timedelta(days=365),
    )
    db_session.add_all([w_a, w_b])
    db_session.commit()

    # Customer A lists warranties
    res_a = client.get("/api/portal/warranties", headers=setup["cust_a_headers"])
    assert res_a.status_code == 200
    serials_a = [w["serial_number"] for w in res_a.json()]
    assert "SN-ALICE-100" in serials_a
    assert "SN-BOB-200" not in serials_a

    # Customer B attempts to fetch Customer A's single warranty -> 403 Forbidden
    res_forbidden = client.get(f"/api/portal/warranties/{w_a.id}", headers=setup["cust_b_headers"])
    assert res_forbidden.status_code == 403

    # Non-existent warranty -> 404 Not Found
    res_404 = client.get(f"/api/portal/warranties/{uuid.uuid4()}", headers=setup["cust_a_headers"])
    assert res_404.status_code == 404


# ==========================================
# 4. SUPPORT TICKET CREATION & ISOLATION
# ==========================================

def test_support_ticket_lifecycle_and_isolation(client: TestClient, db_session: Session, support_setup):
    """
    Tests ticket creation, comment thread (append-only), and tenant isolation.
    """
    setup = support_setup

    # Customer A creates a ticket
    ticket_payload = {
        "subject": "Screen flickering issue",
        "description": "The device display flickers intermittently when plugged in.",
        "priority": "high",
    }
    create_res = client.post(
        "/api/portal/tickets",
        headers=setup["cust_a_headers"],
        data=ticket_payload,
    )
    assert create_res.status_code == 201, create_res.text
    ticket_data = create_res.json()
    ticket_id = ticket_data["id"]
    assert ticket_data["status"] == "open"
    assert ticket_data["priority"] == "high"

    # Customer A views ticket
    get_res = client.get(f"/api/portal/tickets/{ticket_id}", headers=setup["cust_a_headers"])
    assert get_res.status_code == 200
    assert get_res.json()["subject"] == "Screen flickering issue"

    # Customer B attempts to access Customer A's ticket -> 403 Forbidden
    res_b = client.get(f"/api/portal/tickets/{ticket_id}", headers=setup["cust_b_headers"])
    assert res_b.status_code == 403

    # Customer B attempts to comment on Customer A's ticket -> 403 Forbidden
    res_b_comment = client.post(
        f"/api/portal/tickets/{ticket_id}/comments",
        headers=setup["cust_b_headers"],
        json={"body": "Malicious comment"},
    )
    assert res_b_comment.status_code == 403

    # Customer A adds a comment
    comment_res = client.post(
        f"/api/portal/tickets/{ticket_id}/comments",
        headers=setup["cust_a_headers"],
        json={"body": "Also happens under heavy battery load."},
    )
    assert comment_res.status_code == 201
    c_data = comment_res.json()
    assert c_data["author_type"] == "customer"
    assert c_data["body"] == "Also happens under heavy battery load."

    # Staff responds to ticket
    staff_reply_res = client.post(
        f"/api/support/tickets/{ticket_id}/comments",
        headers=setup["staff_headers"],
        json={"body": "Thank you for the report. Please update the firmware."},
    )
    assert staff_reply_res.status_code == 201
    assert staff_reply_res.json()["author_type"] == "staff"


# ==========================================
# 5. ATTACHMENT VALIDATION
# ==========================================

def test_ticket_attachment_validation(client: TestClient, support_setup):
    """
    Tests attachment MIME type and size limits:
    - Allowed: image/jpeg, image/png, image/webp, application/pdf
    - Rejected: invalid content type, size > 2MB
    """
    setup = support_setup

    # 1. Invalid content type (.exe / binary)
    invalid_file = ("script.exe", b"binarycontent", "application/x-msdownload")
    res_invalid_type = client.post(
        "/api/portal/tickets",
        headers=setup["cust_a_headers"],
        data={"subject": "Malware test", "description": "Invalid file upload"},
        files={"attachment": invalid_file},
    )
    assert res_invalid_type.status_code == 400
    msg_1 = res_invalid_type.json().get("detail", res_invalid_type.json().get("error", {}).get("message", ""))
    assert "Invalid file type" in msg_1

    # 2. Oversized file (> 2MB)
    oversized_content = b"0" * (2 * 1024 * 1024 + 1024)
    oversized_file = ("large.png", oversized_content, "image/png")
    res_oversized = client.post(
        "/api/portal/tickets",
        headers=setup["cust_a_headers"],
        data={"subject": "Oversized test", "description": "Too big attachment"},
        files={"attachment": oversized_file},
    )
    assert res_oversized.status_code == 400
    msg_2 = res_oversized.json().get("detail", res_oversized.json().get("error", {}).get("message", ""))
    assert "exceeds maximum limit" in msg_2

    # 3. Valid attachment (PNG < 2MB)
    valid_file = ("screenshot.png", b"\x89PNG\r\n\x1a\nfakeimagebytes", "image/png")
    res_valid = client.post(
        "/api/portal/tickets",
        headers=setup["cust_a_headers"],
        data={"subject": "Valid Attachment Test", "description": "With screenshot"},
        files={"attachment": valid_file},
    )
    assert res_valid.status_code == 201
    assert res_valid.json()["attachment_path"] is not None


# ==========================================
# 6. TICKET STATUS CHANGE & RBAC RULES
# ==========================================

def test_ticket_status_change_notifications_and_rbac(client: TestClient, db_session: Session, support_setup):
    """
    Tests:
    - Status change triggers exactly 1 in-app notification to customer.
    - Only assigned staff or Admin/Manager can close ticket.
    """
    setup = support_setup
    admin = setup["admin"]
    staff = setup["staff"]
    cust_a = setup["customer_a"]

    # 1. Create ticket
    ticket = SupportTicket(
        ticket_number="TKT-TEST-999",
        customer_id=cust_a.id,
        subject="Charger not working",
        description="Adapter does not charge the device.",
        status=TicketStatus.OPEN.value,
    )
    db_session.add(ticket)
    db_session.commit()

    # Initial notification count for customer
    initial_notifs = (
        db_session.query(Notification)
        .filter(Notification.recipient_id == cust_a.id, Notification.recipient_type == "customer")
        .count()
    )

    # 2. Staff updates status to in_progress -> 200 OK
    status_res = client.patch(
        f"/api/support/tickets/{ticket.id}/status",
        headers=setup["staff_headers"],
        json={"status": "in_progress"},
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "in_progress"

    # Exactly 1 notification created
    new_notifs = (
        db_session.query(Notification)
        .filter(Notification.recipient_id == cust_a.id, Notification.recipient_type == "customer")
        .count()
    )
    assert new_notifs == initial_notifs + 1

    # 3. Unassigned staff attempts to close ticket -> 403 Forbidden
    close_attempt_res = client.patch(
        f"/api/support/tickets/{ticket.id}/status",
        headers=setup["staff_headers"],
        json={"status": "closed"},
    )
    assert close_attempt_res.status_code == 403
    close_msg = close_attempt_res.json().get("detail", close_attempt_res.json().get("error", {}).get("message", ""))
    assert "Only the assigned staff member or a Manager/Admin" in close_msg

    # 4. Admin closes ticket -> 200 OK
    admin_close_res = client.patch(
        f"/api/support/tickets/{ticket.id}/status",
        headers=setup["admin_headers"],
        json={"status": "closed"},
    )
    assert admin_close_res.status_code == 200
    assert admin_close_res.json()["status"] == "closed"


# ==========================================
# 7. LIVE DASHBOARD OPEN TICKETS COUNT
# ==========================================

def test_dashboard_real_open_tickets_count(client: TestClient, db_session: Session, support_setup):
    """
    Tests that /api/portal/dashboard accurately counts open & in_progress tickets.
    """
    setup = support_setup
    cust_a = setup["customer_a"]
    cust_b = setup["customer_b"]

    # Customer A: 2 open, 1 resolved
    t1 = SupportTicket(ticket_number="TKT-A1", customer_id=cust_a.id, subject="Sub 1", description="D 1", status="open")
    t2 = SupportTicket(ticket_number="TKT-A2", customer_id=cust_a.id, subject="Sub 2", description="D 2", status="in_progress")
    t3 = SupportTicket(ticket_number="TKT-A3", customer_id=cust_a.id, subject="Sub 3", description="D 3", status="resolved")

    # Customer B: 1 open
    t4 = SupportTicket(ticket_number="TKT-B1", customer_id=cust_b.id, subject="Sub 4", description="D 4", status="open")

    db_session.add_all([t1, t2, t3, t4])
    db_session.commit()

    # Customer A dashboard
    dash_res = client.get("/api/portal/dashboard", headers=setup["cust_a_headers"])
    assert dash_res.status_code == 200
    dash_data = dash_res.json()
    assert dash_data["open_tickets_count"] == 2


# ==========================================
# 8. NOTIFICATION MARK AS READ IDEMPOTENCY
# ==========================================

def test_notification_mark_as_read_idempotent(client: TestClient, db_session: Session, support_setup):
    """
    Tests that marking a notification as read is idempotent.
    """
    setup = support_setup
    cust_a = setup["customer_a"]

    notif = Notification(
        recipient_id=cust_a.id,
        recipient_type="customer",
        type="test_alert",
        title="Test Alert",
        message="This is a test notification message.",
    )
    db_session.add(notif)
    db_session.commit()

    # 1. Unread initially
    list_res = client.get("/api/portal/notifications", headers=setup["cust_a_headers"])
    assert list_res.status_code == 200
    assert list_res.json()["unread_count"] >= 1

    # 2. Mark as read
    read_res1 = client.post(f"/api/portal/notifications/{notif.id}/read", headers=setup["cust_a_headers"])
    assert read_res1.status_code == 200
    read_at_1 = read_res1.json()["read_at"]
    assert read_at_1 is not None

    # 3. Mark as read second time (idempotent)
    read_res2 = client.post(f"/api/portal/notifications/{notif.id}/read", headers=setup["cust_a_headers"])
    assert read_res2.status_code == 200
    read_at_2 = read_res2.json()["read_at"]
    assert read_at_1 == read_at_2  # Timestamp unaltered
