import logging
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.modules.auth.dependencies import get_current_staff
from app.modules.auth.models import Customer, StaffUser
from app.modules.catalog.models import Product
from app.modules.invoicing.models import Invoice

logger = logging.getLogger("app.search")

search_router = APIRouter(prefix="/api/search", tags=["Global Search"])


class ProductSearchResult(BaseModel):
    id: str
    name: str
    sku: str
    barcode: str | None = None
    selling_price: str
    current_stock: str


class CustomerSearchResult(BaseModel):
    id: str
    name: str
    phone: str | None = None
    email: str


class InvoiceSearchResult(BaseModel):
    id: str
    invoice_number: str
    buyer_name: str
    invoice_date: str
    total_amount: str


class GlobalSearchResponse(BaseModel):
    products: list[ProductSearchResult]
    customers: list[CustomerSearchResult]
    invoices: list[InvoiceSearchResult]


@search_router.get("", response_model=GlobalSearchResponse)
def global_search(
    q: str = Query(..., min_length=1, description="Search query string"),
    db: Session = Depends(get_db),
    current_staff: StaffUser = Depends(get_current_staff),
):
    """
    Unified global search for authorized staff across Products, Customers, and Invoices.
    Returns up to 5 results per entity type.
    """
    clean_q = q.strip()
    if not clean_q:
        return GlobalSearchResponse(products=[], customers=[], invoices=[])

    search_pattern = f"%{clean_q}%"

    # 1. Search Products
    prod_rows = (
        db.query(Product)
        .filter(
            Product.is_active == True,
            (
                Product.name.ilike(search_pattern)
                | Product.sku.ilike(search_pattern)
                | (Product.barcode.isnot(None) & Product.barcode.ilike(search_pattern))
            ),
        )
        .limit(5)
        .all()
    )
    products = [
        ProductSearchResult(
            id=str(p.id),
            name=p.name,
            sku=p.sku,
            barcode=p.barcode,
            selling_price=str(p.selling_price),
            current_stock=str(p.current_stock),
        )
        for p in prod_rows
    ]

    # 2. Search Customers
    cust_rows = (
        db.query(Customer)
        .filter(
            Customer.is_active == True,
            (
                Customer.name.ilike(search_pattern)
                | (Customer.phone.isnot(None) & Customer.phone.ilike(search_pattern))
                | Customer.email.ilike(search_pattern)
            ),
        )
        .limit(5)
        .all()
    )
    customers = [
        CustomerSearchResult(
            id=str(c.id),
            name=c.name,
            phone=c.phone,
            email=c.email,
        )
        for c in cust_rows
    ]

    # 3. Search Invoices
    inv_rows = (
        db.query(Invoice)
        .filter(
            Invoice.invoice_number.ilike(search_pattern)
            | Invoice.buyer_name.ilike(search_pattern)
        )
        .order_by(Invoice.created_at.desc())
        .limit(5)
        .all()
    )
    invoices = [
        InvoiceSearchResult(
            id=str(i.id),
            invoice_number=i.invoice_number,
            buyer_name=i.buyer_name,
            invoice_date=str(i.invoice_date),
            total_amount=str(i.grand_total),
        )
        for i in inv_rows
    ]

    return GlobalSearchResponse(
        products=products,
        customers=customers,
        invoices=invoices,
    )
