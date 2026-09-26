import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.money import quantize_money
from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.finance.service import compute_financial_summary
from app.modules.invoicing.models import CreditNote, Invoice
from app.modules.invoicing.service import generate_invoice_for_sale
from app.modules.payments.models import Payment, PaymentStatus
from app.modules.reports.service import get_gst_report, get_profit_loss_report, get_sales_report
from app.modules.sales.models import Sale, SaleItem, SaleReturn


@pytest.fixture
def auth_pos_staff(client: TestClient, db_session: Session):
    admin = StaffUser(
        email=f"pos_admin_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("AdminPass123!"),
        role=StaffRole.ADMIN,
        full_name="POS Admin",
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    token = create_access_token(subject=str(admin.id), audience="staff", role=admin.role.value)
    return {"Authorization": f"Bearer {token}"}, admin


def test_pos_return_creates_credit_note_and_financial_cascade(
    client: TestClient,
    auth_pos_staff,
    db_session: Session,
):
    headers, staff = auth_pos_staff
    today_date = date.today()
    period_str = today_date.strftime("%Y-%m")

    # 1. Setup Category, Brand & Product
    cat = Category(name=f"Electronics {uuid.uuid4().hex[:6]}")
    db_session.add(cat)
    db_session.flush()

    brand = Brand(name=f"AudioBrand {uuid.uuid4().hex[:6]}")
    db_session.add(brand)
    db_session.flush()

    prod = Product(
        name="Ultra ANC Headphones",
        sku=f"HEAD-{uuid.uuid4().hex[:6].upper()}",
        category_id=cat.id,
        brand_id=brand.id,
        purchase_price=Decimal("400.00"),
        selling_price=Decimal("1000.00"),
        gst_rate=Decimal("18.00"),
        current_stock=Decimal("20.000"),
        min_stock=Decimal("5.000"),
        is_active=True,
    )
    db_session.add(prod)
    db_session.flush()

    cust = Customer(
        name="John Doe",
        email=f"johndoe_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("Pass123!"),
        state="Kerala",
        is_active=True,
    )
    db_session.add(cust)
    db_session.flush()

    # 2. Complete POS Checkout for 2 units (Total = ₹2,000.00)
    checkout_payload = {
        "customer_id": str(cust.id),
        "payment_method": "cash",
        "items": [
            {
                "product_id": str(prod.id),
                "quantity": "2.000",
                "unit_price": "1000.00",
                "discount_amount": "0.00",
            }
        ],
        "order_discount": "0.00",
        "notes": "Test sale for return financial validation",
    }
    r_sale = client.post("/api/pos/checkout", headers=headers, json=checkout_payload)
    assert r_sale.status_code == 201, r_sale.text
    sale_data = r_sale.json()
    sale_id = uuid.UUID(sale_data["id"])

    # Stock decremented from 20 to 18
    db_session.expire_all()
    prod_in_db = db_session.get(Product, prod.id)
    assert prod_in_db.current_stock == Decimal("18.000")

    # Generate tax invoice for the sale
    invoice = generate_invoice_for_sale(db_session, sale_id, staff.id)
    db_session.commit()
    assert invoice is not None
    assert invoice.payment_status == "unpaid"

    # Pre-return: Verify initial financial summary
    pre_summary = compute_financial_summary(db_session, period_str)
    assert pre_summary.revenue >= Decimal("2000.00")
    assert pre_summary.returns_refunded == Decimal("0.00")
    assert pre_summary.net_revenue == pre_summary.revenue

    # Pre-return: Verify sales report
    pre_sales_rep = get_sales_report(db_session, today_date, today_date)
    assert Decimal(pre_sales_rep["summary"]["total_refunds"]) == Decimal("0.00")
    assert Decimal(pre_sales_rep["summary"]["net_revenue"]) == Decimal(pre_sales_rep["summary"]["total_revenue"])

    # Pre-return: Verify dashboard today
    from app.modules.reports.dashboard_routes import _CACHE
    _CACHE["expires_at"] = 0.0
    _CACHE["data"] = None

    r_dash = client.get("/api/dashboard/today", headers=headers)
    assert r_dash.status_code == 200
    assert Decimal(r_dash.json()["total_sales"]) >= Decimal("2000.00")
    assert r_dash.json()["returns_refunded"] == "0.00"

    # 3. Process POS Return for 1 unit (₹1,000.00 refund)
    sale_item_id = sale_data["items"][0]["id"]
    return_payload = {
        "sale_id": str(sale_id),
        "reason": "Customer changed mind",
        "items": [
            {
                "sale_item_id": sale_item_id,
                "quantity": "1.000",
            }
        ],
    }
    r_return = client.post("/api/pos/returns", headers=headers, json=return_payload)
    assert r_return.status_code == 201, r_return.text
    ret_data = r_return.json()

    assert Decimal(ret_data["total_refund_amount"]) == Decimal("1000.00")
    assert ret_data["credit_note_id"] is not None
    assert ret_data["credit_note_number"].startswith("CN/")

    # Verify Credit Note was created in DB
    cn = db_session.get(CreditNote, uuid.UUID(ret_data["credit_note_id"]))
    assert cn is not None
    assert cn.invoice_id == invoice.id
    assert cn.grand_total_refunded == Decimal("1180.00")
    assert cn.subtotal_refunded == Decimal("1000.00")
    assert cn.total_tax_refunded == Decimal("180.00")
    assert len(cn.items) == 1
    assert cn.items[0].quantity == Decimal("1.000")

    # Verify Invoice status was updated to partially_refunded
    db_session.refresh(invoice)
    assert invoice.payment_status == "partially_refunded"
    assert invoice.is_cancelled is False

    # Verify Product stock restored from 18 to 19
    db_session.refresh(prod_in_db)
    assert prod_in_db.current_stock == Decimal("19.000")

    # 4. Financial Summary Cascade Verification
    post_summary = compute_financial_summary(db_session, period_str)
    assert post_summary.returns_refunded >= Decimal("1000.00")
    # Net revenue must reflect revenue minus returns_refunded
    expected_net = quantize_money(post_summary.revenue - post_summary.returns_refunded)
    assert post_summary.net_revenue == expected_net
    # Gross profit must be net_revenue minus cost_of_goods
    assert post_summary.gross_profit == quantize_money(post_summary.net_revenue - post_summary.cost_of_goods)

    # 5. Sales Report Cascade Verification
    post_sales_rep = get_sales_report(db_session, today_date, today_date)
    assert Decimal(post_sales_rep["summary"]["total_refunds"]) >= Decimal("1000.00")
    assert post_sales_rep["summary"]["total_returns_count"] >= 1
    exp_sales_net = quantize_money(
        Decimal(post_sales_rep["summary"]["total_revenue"]) - Decimal(post_sales_rep["summary"]["total_refunds"])
    )
    assert Decimal(post_sales_rep["summary"]["net_revenue"]) == exp_sales_net

    # Find row for our returned sale
    our_row = next((r for r in post_sales_rep["rows"] if r["id"] == str(sale_id)), None)
    assert our_row is not None
    assert our_row["returned_amount"] == "1000.00"
    assert our_row["net_amount"] == "1000.00"
    assert our_row["status"] == "partially_returned"

    # 6. GST Report Cascade Verification
    gst_rep = get_gst_report(db_session, today_date, today_date)
    assert gst_rep["summary"]["credit_notes_count"] >= 1
    assert Decimal(gst_rep["summary"]["credit_notes_taxable_value"]) > Decimal("0.00")
    assert Decimal(gst_rep["summary"]["credit_notes_tax_refunded"]) > Decimal("0.00")
    assert Decimal(gst_rep["summary"]["credit_notes_grand_total"]) >= Decimal("1000.00")

    # Net taxable value = gross taxable - credit note taxable
    gross_taxable = Decimal(gst_rep["summary"]["total_taxable_value"])
    cn_taxable = Decimal(gst_rep["summary"]["credit_notes_taxable_value"])
    assert Decimal(gst_rep["summary"]["net_taxable_value"]) == quantize_money(gross_taxable - cn_taxable)

    # 7. Profit & Loss Report Cascade Verification
    pl_rep = get_profit_loss_report(db_session, today_date, today_date)
    assert Decimal(pl_rep["summary"]["returns_refunded"]) >= Decimal("1000.00")
    assert Decimal(pl_rep["summary"]["net_revenue"]) == quantize_money(
        Decimal(pl_rep["summary"]["revenue"]) - Decimal(pl_rep["summary"]["returns_refunded"])
    )

    # 8. Dashboard Today Cascade Verification
    # Clear cache to get fresh live computation
    _CACHE["expires_at"] = 0.0
    _CACHE["data"] = None

    r_dash_post = client.get("/api/dashboard/today", headers=headers)
    assert r_dash_post.status_code == 200
    dash_data = r_dash_post.json()
    assert Decimal(dash_data["returns_refunded"]) >= Decimal("1000.00")
    assert dash_data["returns_count"] >= 1
    # total_sales is net sales
    assert Decimal(dash_data["total_sales"]) == quantize_money(
        Decimal(dash_data["gross_sales"]) - Decimal(dash_data["returns_refunded"])
    )

    # 9. Return the remaining 1 unit -> invoice becomes fully refunded and cancelled
    r_return_final = client.post(
        "/api/pos/returns",
        headers=headers,
        json={
            "sale_id": str(sale_id),
            "reason": "Defective piece",
            "items": [{"sale_item_id": sale_item_id, "quantity": "1.000"}],
        },
    )
    assert r_return_final.status_code == 201
    db_session.refresh(invoice)
    assert invoice.payment_status == "refunded"
    assert invoice.is_cancelled is True

    # Sale status updated to "returned"
    sale_db = db_session.get(Sale, sale_id)
    assert sale_db.status == "returned"

    # Final stock restored to 20
    db_session.refresh(prod_in_db)
    assert prod_in_db.current_stock == Decimal("20.000")
