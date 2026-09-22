# Central registry of all ORM models for metadata discovery
from app.modules.auth.models import Customer, StaffRole, StaffUser
from app.modules.catalog.models import Brand, Category, Product
from app.modules.finance.models import Expense
from app.modules.inventory.models import MovementType, StockMovement
from app.modules.invoicing.models import (
    CreditNote,
    CreditNoteItem,
    Invoice,
    InvoiceItem,
    InvoiceSequence,
)
from app.modules.sales.models import (
    Purchase,
    PurchaseItem,
    ReturnItem,
    Sale,
    SaleItem,
    SaleReturn,
    Supplier,
)

__all__ = [
    "StaffRole",
    "StaffUser",
    "Customer",
    "Category",
    "Brand",
    "Product",
    "MovementType",
    "StockMovement",
    "Supplier",
    "Purchase",
    "PurchaseItem",
    "Sale",
    "SaleItem",
    "SaleReturn",
    "ReturnItem",
    "InvoiceSequence",
    "Invoice",
    "InvoiceItem",
    "CreditNote",
    "CreditNoteItem",
    "Expense",
]
