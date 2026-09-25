from io import BytesIO
import uuid
import pytest
from app.core.security import create_access_token, hash_password
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product


def create_test_admin(db_session):
    user = StaffUser(
        email=f"admin_{uuid.uuid4().hex[:6]}@erp.local",
        password_hash=hash_password("password123"),
        role=StaffRole.ADMIN,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id), audience="staff", role=user.role.value)
    return user, {"Authorization": f"Bearer {token}"}


def test_product_csv_preview_and_confirm(client, db_session):
    _, headers = create_test_admin(db_session)
    # Setup Category and Brand
    cat = Category(name="Electronics", description="Gadgets")
    br = Brand(name="Sony")
    db_session.add_all([cat, br])
    db_session.commit()

    csv_content = (
        "name,sku,barcode,hsn_code,category,brand,unit,purchase_price,selling_price,gst_rate,min_stock,is_pinned\n"
        "Headphones,SONY-WH-01,123456789012,8518,Electronics,Sony,pcs,1500.00,2499.00,18.00,5.000,true\n"
        "Broken Item,,123456789012,,MissingCat,MissingBrand,pcs,-10.00,abc,0.00,0.00,false\n"
    )

    # 1. Preview
    files = {"file": ("products.csv", BytesIO(csv_content.encode("utf-8")), "text/csv")}
    preview_res = client.post("/api/catalog/products/import/preview", files=files, headers=headers)
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert pdata["total_rows"] == 2
    assert pdata["valid_count"] == 1
    assert pdata["invalid_count"] == 1
    assert pdata["rows"][0]["is_valid"] is True
    assert pdata["rows"][1]["is_valid"] is False
    assert len(pdata["rows"][1]["errors"]) > 0

    # Ensure preview committed NOTHING
    prod_check = db_session.query(Product).filter(Product.sku == "SONY-WH-01").first()
    assert prod_check is None

    # 2. Confirm (commits valid rows only)
    files_confirm = {"file": ("products.csv", BytesIO(csv_content.encode("utf-8")), "text/csv")}
    confirm_res = client.post("/api/catalog/products/import/confirm", files=files_confirm, headers=headers)
    assert confirm_res.status_code == 200
    cdata = confirm_res.json()
    assert cdata["total_processed"] == 2
    assert cdata["imported_count"] == 1
    assert cdata["skipped_count"] == 1

    # Verify committed product
    imported = db_session.query(Product).filter(Product.sku == "SONY-WH-01").first()
    assert imported is not None
    assert imported.name == "Headphones"
    assert imported.hsn_code == "8518"
    assert imported.is_pinned is True


def test_customer_csv_preview_and_confirm(client, db_session):
    _, headers = create_test_admin(db_session)

    csv_content = (
        "name,email,phone,address,gstin,state\n"
        "John Doe,john.doe@example.com,9876543210,123 Main St,29ABCDE1234F1Z5,Karnataka\n"
        ",invalid-email,9876543210,,,\n"
    )

    # 1. Preview
    files = {"file": ("customers.csv", BytesIO(csv_content.encode("utf-8")), "text/csv")}
    preview_res = client.post("/api/staff/customers/import/preview", files=files, headers=headers)
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert pdata["total_rows"] == 2
    assert pdata["valid_count"] == 1
    assert pdata["invalid_count"] == 1

    # Ensure preview committed NOTHING
    cust_check = db_session.query(Customer).filter(Customer.email == "john.doe@example.com").first()
    assert cust_check is None

    # 2. Confirm
    files_confirm = {"file": ("customers.csv", BytesIO(csv_content.encode("utf-8")), "text/csv")}
    confirm_res = client.post("/api/staff/customers/import/confirm", files=files_confirm, headers=headers)
    assert confirm_res.status_code == 200
    cdata = confirm_res.json()
    assert cdata["imported_count"] == 1
    assert cdata["skipped_count"] == 1

    # Verify committed customer
    cust = db_session.query(Customer).filter(Customer.email == "john.doe@example.com").first()
    assert cust is not None
    assert cust.name == "John Doe"
    assert cust.phone == "9876543210"
