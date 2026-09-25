import decimal
from datetime import datetime, date, timedelta, timezone
from app.core.db import Base, engine, SessionLocal
import app.core.models as models
from app.core.security import hash_password

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 1. Staff Admin
        admin = db.query(models.StaffUser).filter_by(email="admin@company.com").first()
        if not admin:
            admin = models.StaffUser(
                email="admin@company.com",
                password_hash=hash_password("admin123"),
                role=models.StaffRole.SUPER_ADMIN,
                full_name="Super Admin",
            )
            db.add(admin)
            db.flush()

        # 2. Customer
        customer = db.query(models.Customer).filter_by(email="john@example.com").first()
        if not customer:
            customer = models.Customer(
                name="John Doe",
                email="john@example.com",
                phone="9876543210",
                password_hash=hash_password("password123"),
            )
            db.add(customer)
            db.flush()

        # 3. Category & Brand
        cat = db.query(models.Category).filter_by(name="Electronics").first()
        if not cat:
            cat = models.Category(name="Electronics", description="Electronic items")
            db.add(cat)
            db.flush()

        brand = db.query(models.Brand).filter_by(name="Dell").first()
        if not brand:
            brand = models.Brand(name="Dell")
            db.add(brand)
            db.flush()

        # 4. Products
        prod1 = db.query(models.Product).filter_by(sku="LAP-DELL-001").first()
        if not prod1:
            prod1 = models.Product(
                name="Dell XPS 15",
                sku="LAP-DELL-001",
                hsn_code="84713010",
                purchase_price=decimal.Decimal("90000.00"),
                selling_price=decimal.Decimal("120000.00"),
                gst_rate=decimal.Decimal("18.00"),
                min_stock=decimal.Decimal("5.000"),
                current_stock=decimal.Decimal("25.000"),
                category_id=cat.id,
                brand_id=brand.id,
                unit="pcs",
            )
            db.add(prod1)

        prod2 = db.query(models.Product).filter_by(sku="ACC-MOUSE-001").first()
        if not prod2:
            prod2 = models.Product(
                name="Dell Wireless Mouse",
                sku="ACC-MOUSE-001",
                hsn_code="84716060",
                purchase_price=decimal.Decimal("800.00"),
                selling_price=decimal.Decimal("1500.00"),
                gst_rate=decimal.Decimal("18.00"),
                min_stock=decimal.Decimal("10.000"),
                current_stock=decimal.Decimal("50.000"),
                category_id=cat.id,
                brand_id=brand.id,
                unit="pcs",
            )
            db.add(prod2)
        db.flush()

        exp = db.query(models.Expense).first()
        if not exp:
            exp = models.Expense(
                category=models.ExpenseCategory.OTHER.value,
                amount=decimal.Decimal("3500.00"),
                description="Office Stationery & Paper",
                date=date.today(),
                source=models.ExpenseSource.MANUAL.value,
                created_by=admin.id,
            )
            db.add(exp)

        # 6. Warranty
        warr = db.query(models.Warranty).first()
        if not warr:
            warr = models.Warranty(
                product_id=prod1.id,
                customer_id=customer.id,
                serial_number="DELL-SN-998877",
                purchase_date=date.today() - timedelta(days=30),
                start_date=date.today() - timedelta(days=30),
                end_date=date.today() + timedelta(days=335),
            )
            db.add(warr)

        # 7. Support Ticket
        ticket = db.query(models.SupportTicket).first()
        if not ticket:
            ticket = models.SupportTicket(
                ticket_number="TICK-2026-0001",
                customer_id=customer.id,
                subject="Screen flickering query",
                description="Occasionally my screen flickers when waking from sleep mode.",
                priority=models.TicketPriority.MEDIUM,
                status=models.TicketStatus.OPEN,
            )
            db.add(ticket)

        db.commit()
        print("Dev database seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed()
