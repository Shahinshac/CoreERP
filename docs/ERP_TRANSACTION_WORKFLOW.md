# CoreERP Complete Business Workflow & Transaction Lifecycle Audit

> **Document Version:** 1.0.0  
> **Status:** Verified Against Active Implementation  
> **Scope:** Full Frontend + Backend Transaction Lifecycle (POS, Invoicing, Stock, Payments, Portal, Reports, Reversals, EMI, Warranty)

---

## Executive Summary

This document provides the authoritative, code-verified audit of the complete transaction lifecycle within **CoreERP**. It traces how real-world sales progress from product registration and customer creation to POS cart selection, checkout, payment recording, GST tax invoice generation, inventory deductions, customer history, customer portal exposure, and financial reporting.

Every detail in this document reflects the exact code paths in `backend/app/modules/` and `frontend/src/`.

---

## 1. Actual Verified Workflow Diagram

```
[1. PRODUCT CREATED] (Catalog: products table, initial stock = 0)
        ↓
[2. STOCK-IN INVENTORY] (Inventory: stock_movements IN, product.current_stock updated)
        ↓
[3. CUSTOMER CREATED] (Auth: customers table, portal account credentials generated)
        ↓
[4. POS PRODUCT SELECTION & CART] (Client-side React state ONLY; no DB locks or reservations)
        ↓
[5. POS CHECKOUT INITIATED] (Cashier clicks Pay / F2 -> POST /api/pos/checkout)
        ↓
┌────────────────────────────────────────────────────────────────────────┐
│  SINGLE ATOMIC DATABASE TRANSACTION (with db.begin_nested())           │
│  ├─ Pessimistic Product Lock (SELECT ... FOR UPDATE)                   │
│  ├─ Stock Sufficiency Check (quantity <= current_stock)                │
│  ├─ Server-side Line Totals & Discount Enforcement                     │
│  ├─ Generate POS Reference (POS-YYYYMMDD-XXXXXX)                       │
│  ├─ Insert Sale (sales table, status='completed')                      │
│  ├─ Insert Payment (payments table, status='paid', ref=POS-...)        │
│  ├─ Insert SaleItem (sale_items table)                                 │
│  ├─ Decrement Stock (product.current_stock -= quantity)                │
│  ├─ Insert StockMovement (stock_movements table, type='OUT')           │
│  └─ If EMI: Insert EmiPlan & EmiInstallment rows                       │
└────────────────────────────────────────────────────────────────────────┘
        ↓
[6. POS SALE COMMITTED] (HTTP 201 Created returned to POS frontend)
        ↓
[7. TAX INVOICE CREATION] (Frontend calls POST /api/invoicing/from-sale/{sale.id})
        ↓
┌────────────────────────────────────────────────────────────────────────┐
│  INVOICE GENERATION TRANSACTION (generate_invoice_for_sale)            │
│  ├─ Gapless Sequence Number Lock (invoice_sequences table)             │
│  ├─ Format Official Invoice Number (e.g. INV/2026-27/00001)            │
│  ├─ Snapshot Buyer Details (Name, GSTIN, Address, State)               │
│  ├─ Compute Place of Supply & Tax Breakdown (Intra: CGST+SGST / Inter: IGST) │
│  ├─ Insert Invoice (invoices table)                                    │
│  ├─ Insert InvoiceItem (invoice_items table)                           │
│  └─ Safe Asynchronous Email Dispatch (swallows email errors safely)    │
└────────────────────────────────────────────────────────────────────────┘
        ↓
[8. REAL-TIME DATA PROPAGATION]
  ├─ Customer Purchase History: Immediately visible via sales table
  ├─ Customer Portal Dashboard: Outstanding balance reconciled
  ├─ Customer Portal Invoices: Official Tax Invoice PDF streamable
  └─ Reports & Analytics:
      ├─ Sales Reports: Populated immediately from sales table
      ├─ GST Reports: Populated immediately from invoices table
      └─ Cash Financials: Populated from payments table
```

---

## 2. Detailed 11-Step Transaction Lifecycle

### Step 1 — Product Creation
- **Endpoint:** `POST /api/catalog/products`
- **Database Table:** `products`
- **Stored Attributes:**
  - `id`: UUID (Primary Key)
  - `name`: Product title (e.g., `"Product A"`)
  - `sku`: Unique inventory stock keeping unit
  - `barcode`: Unique barcode scanner string (optional)
  - `hsn_code`: Statutory Harmonized System of Nomenclature code
  - `category_id`: Foreign key to `categories.id`
  - `brand_id`: Foreign key to `brands.id`
  - `unit`: Measurement unit (default: `"pcs"`)
  - `purchase_price`: Decimal (cost price paid to vendor)
  - `selling_price`: Decimal (retail price)
  - `gst_rate`: Decimal percentage (e.g., `18.00`)
  - `min_stock`: Decimal threshold triggering low-stock alerts
  - `current_stock`: Initialized strictly to `0.000` (cannot be fabricated)
  - `is_active`: Boolean (`True`)
  - `created_at`, `updated_at`: Timestamps
- **Audit Event:** `catalog.product_created`
- **Inventory Intake:** Initial stock is brought in through a statutory inventory intake (`POST /api/inventory/stock-in` or Supplier Purchase Order reception `POST /api/inventory/purchases/{id}/receive`), which increments `product.current_stock` and appends a `StockMovement` row (`type='in'`).

### Step 2 — Customer Creation
- **Endpoint:** `POST /api/staff/customers` or Self-Service Portal `POST /api/customers/auth/register`
- **Database Table:** `customers`
- **Stored Attributes:**
  - `id`: UUID (Primary Key)
  - `email`: Unique customer email (used for portal login and invoice delivery)
  - `password_hash`: Argon2id hashed password
  - `name`: Full legal/business name
  - `phone`: Contact phone number
  - `address`: Billing/delivery address
  - `gstin`: 15-character GST identification number (for B2B tax credits)
  - `state`: State of residence (authoritative basis for Place of Supply GST calculations)
  - `is_portal_activated`: Boolean flag
  - `is_active`: Boolean flag
- **Customer Portal Relationship:**
  The `customers` table serves as **both** the CRM entity and the portal authentication account. There is no separate login table. When staff creates a customer, a secure hash is provisioned, enabling instant portal login via `POST /api/customers/auth/login`.

### Step 3 — Product Selection in POS
- **User Action:** Cashier scans barcode or clicks a product card in `/staff/pos`.
- **System Action:**
  - **Zero database writes.**
  - **Zero API requests.**
  - **No database row locks or stock reservations.**
- **Frontend vs Database:**
  - The cart exists **exclusively in client-side React memory** (`useState<CartItem[]>`).
  - Catalog availability displays `product.current_stock`, but stock is **never decremented** or reserved at this point. If another cashier completes a sale first, the server will reject overselling at checkout.

### Step 4 — Cart Operations
- **User Action:** Cashier adjusts quantities, applies line discounts, or enters an order-level discount.
- **System Action:**
  - Local state recalculations run synchronously via React `useMemo`.
  - Line total: `(quantity * selling_price) - line_discount`.
  - Subtotal: Sum of line totals.
  - Grand total: `subtotal - order_discount`.
  - **No database interaction occurs** until checkout is explicitly submitted.

### Step 5 — Checkout & Payment
- **User Action:** Cashier clicks **"Complete Sale"** or presses `[F2]`.
- **Primary Request:** `POST /api/pos/checkout`
- **Atomic Backend Execution (`with db.begin_nested()`):**
  1. **Locking:** Acquires pessimistic database locks on all cart items (`SELECT ... FOR UPDATE`).
  2. **Validation:** Checks that all items are active and verifies `prod.current_stock >= item.quantity`. If insufficient, throws `HTTP 400 Bad Request` and rolls back.
  3. **Price Calculation:** Discards any client-sent subtotals and computes monetary totals server-side using authoritative database unit prices.
  4. **Sale Record:** Inserts `Sale` record (table `sales`, status=`"completed"`).
  5. **Payment Record:** Inserts append-only `Payment` row(s) (table `payments`, status=`"paid"`, reference_id=`sale.invoice_number`).
  6. **Sale Items:** Inserts `SaleItem` rows with `returned_quantity=0`.
  7. **Stock Decrement:** Decrements `prod.current_stock = prod.current_stock - quantity`.
  8. **Stock Movement:** Appends `StockMovement` row (table `stock_movements`, `movement_type='out'`, `reference_type='POS_SALE'`).
  9. **EMI Financing (if selected):** Inserts `EmiPlan` and creates scheduled `EmiInstallment` entries.
  10. **Commit:** Commits transaction and returns `201 Created` with `SaleResponse`.

### Step 6 — Invoice Finalization
- **Secondary Request:** `POST /api/invoicing/from-sale/{sale.id}` (triggered by frontend after checkout).
- **Sequential Invoicing Execution (`generate_invoice_for_sale`):**
  1. **Numbering:** Acquires row-level lock on `invoice_sequences` for current financial year and retrieves next gapless sequential number (e.g., `INV/2026-27/00001`).
  2. **Place of Supply:** Compares seller state (`Maharashtra`) with buyer state.
     - **Intra-State:** Splits tax into `CGST (50%)` and `SGST (50%)`.
     - **Inter-State:** Allocates tax to `IGST (100%)`.
  3. **Line Items:** Inserts `InvoiceItem` rows with HSN codes, taxable values, and exact tax breakdowns.
  4. **Invoice Insert:** Inserts `Invoice` record (table `invoices`).
  5. **Email Dispatch:** Dispatches official HTML tax invoice email via `send_invoice_email()` (catches network/SMTP exceptions so checkout flow is never blocked).

### Step 7 — Payment Lifecycle
- **Authoritative Table:** `payments` (Immutable append-only ledger).
- **Payment States:** `paid`, `pending`, `failed`, `refunded`.
- **Payment Linkage:**
  - In POS checkout, payments are recorded with `reference_id = sale.invoice_number` and `idempotency_key = f"pos-{sale.id}-{method}"`.
  - When invoices are billed on credit or customer portal settlements occur, payments specify `invoice_id`, reconciling `invoice.payment_status` (`unpaid` → `partially_paid` → `paid`).
- **Overpayment Protection:** Payments exceeding remaining invoice balance are blocked unless caller possesses Super Admin override credentials.

### Step 8 — Stock Lifecycle
- **Authoritative Table:** `products.current_stock` + `stock_movements`.
- **Exact Timing:** Inventory changes **during `pos_checkout`**, inside the atomic transaction, before HTTP 201 response.
  ```
  Initial Stock = 10.000
  Customer Buys =  1.000
  New Stock     =  9.000  (Committed synchronously with Sale)
  ```
- **Integrity Guarantee:** If checkout fails (e.g. database error, constraint failure, or network disruption before commit), the transaction rolls back completely. Stock never decrements without a recorded sale.

### Step 9 — Customer History Lifecycle
- **Source of Truth:** Table `sales` filtered by `Sale.customer_id == customer_id`.
- **Staff Access:** `GET /api/staff/customers/{id}` queries `sales` ordered by `created_at DESC`.
- **Timing:** Immediately visible as soon as `pos_checkout` commits.

### Step 10 — Customer Portal Lifecycle
- **Portal Dashboard (`/portal`):**
  - **Purchases:** Queries `sales` table where `customer_id == customer.id`.
  - **Invoices:** Queries `invoices` table where `customer_id == customer.id`.
  - **Outstanding Balance:** Calculates total unpaid dues across active invoices and EMI installments.
- **Timing:** Transactions are visible immediately upon customer authentication.

### Step 11 — Reports & Analytics Lifecycle
- **Sales Report (`/api/reports/sales`):** Queries `sales` and `sale_returns` across date range.
- **GST Report (`/api/reports/gst`):** Queries active `invoices` and `credit_notes` across date range.
- **Financial Summary (`/api/finance/summary`):** Cash-basis revenue from `payments`, contra-revenue from `sale_returns`, gross/net profit from cost of goods sold.
- **Duplicate Prevention:** Sales reports query `sales`, while GST reports query `invoices`. Because each completed sale has exactly one `Sale` record and at most one linked `Invoice`, neither report double-counts transactions.

---

## 3. Record Creation Timing Table

| Record Entity | Created When | Updated When | Authoritative Source |
|---|---|---|---|
| **Product** | Staff submits `POST /api/catalog/products` | Updated via `PUT /api/catalog/products/{id}` | `products` table |
| **Customer** | Staff/Customer submits registration | Updated via `PUT /api/staff/customers/{id}` | `customers` table |
| **Cart** | Item clicked/scanned in POS | Real-time on quantity/discount change | Client React Memory (`useState`) |
| **Sale** | POS Checkout submitted (`POST /api/pos/checkout`) | On return: status becomes `partially_returned` or `returned` | `sales` table |
| **SaleItem** | POS Checkout submitted | On return: `returned_quantity` is incremented | `sale_items` table |
| **Payment** | Recorded during POS Checkout or `POST /api/payments` | Immutable (Append-only ledger; never updated in-place) | `payments` table |
| **Stock** | Decremented inside `pos_checkout` transaction | Restored on return via `pos_return` | `products.current_stock` & `stock_movements` |
| **Invoice** | Generated via `POST /api/invoicing/from-sale/{id}` | Status updated on return (`partially_refunded` or `refunded`) | `invoices` table |
| **InvoiceItem** | Generated inside invoice generation transaction | Immutable | `invoice_items` table |
| **Credit Note** | Generated during POS return (`POST /api/pos/returns`) | Immutable statutory tax credit document | `credit_notes` table |
| **EMI Plan** | Created during checkout if payment method is `emi` | Status transitions (`active` → `completed` or `defaulted`) | `emi_plans` table |
| **EMI Installment** | Created with EMI plan schedule during checkout | Updated when installment payment is allocated | `emi_installments` table |
| **Warranty** | Registered upon sale completion or customer request | Updated when claim is submitted (`is_claimed=True`) | `warranties` table |
| **Customer History** | Derived query; available immediately after sale | Derived query reflecting latest sales and returns | `sales` joined with `customers` |

---

## 4. Root Cause Analysis: The "Recorded Later" Phenomenon

Our code audit investigated why users previously perceived transactions as being "recorded later":

### Root Cause 1: Two-Step Decoupled Client-Side Flow
1. Clicking "Complete Sale" in `POSPage.tsx` initiated `POST /api/pos/checkout`.
2. The backend recorded the `Sale`, decremented stock, and logged the payment, returning HTTP 201.
3. The frontend then executed a **second, asynchronous HTTP call** to generate the Tax Invoice (`POST /api/invoicing/from-sale/{sale.id}`).
4. **Impact:** If the user closed the window, navigated away quickly, or experienced network jitter between Step 1 and Step 2, the sale completed in POS, but the tax invoice was never generated.

### Root Cause 2: Broken Auto-Backfill Mechanism
- In `backend/app/modules/invoicing/routes.py`, `list_invoices` contained an auto-backfill routine designed to catch unbilled sales whenever a staff member opened the invoices page.
- **The Bug:** Line 215 attempted to read `s.cashier_id or current_staff.id`. The `Sale` model defines `staff_id`, **not** `cashier_id`.
- **Impact:** Every time auto-backfill ran, Python raised `AttributeError: 'Sale' object has no attribute 'cashier_id'`, caught the error, executed `db.rollback()`, and logged a warning. Consequently, unbilled sales remained permanently unbilled.

### Root Cause 3: Disconnected Payment Reference
- Payments recorded during POS checkout stored `reference_id = sale.invoice_number` with `invoice_id = None`.
- The customer portal dashboard queried `Payment.invoice_id == inv.id` to compute paid amounts.
- **Impact:** Paid invoices were reported as having ₹0.00 in payments, causing the portal dashboard to falsely display the invoice total as an outstanding unpaid balance.

---

## 5. Transaction Atomicity & Safeguards

The ERP implements nested database transactions (`with db.begin_nested():`) to guarantee atomicity:

- **Case A: Checkout Succeeds:** All operations (`Sale`, `SaleItem`, `Payment`, `product.current_stock` decrement, `StockMovement`) commit atomically.
- **Case B: Stock Depleted / Insufficient:** Transaction raises `HTTP 400 Bad Request` and rolls back. Stock remains untouched; no sale or payment record is created.
- **Case C: User Refreshes / Double-Clicks:**
  - POS button disables immediately via `isCheckingOut` state.
  - Payment ledger enforces unique `idempotency_key` (e.g. `f"pos-{sale.id}-{method}"`). Duplicate attempts return the existing record without creating duplicate transactions.
- **Case D: Database Connection Drops During Checkout:** The database engine rolls back the entire uncommitted transaction. No orphaned sale, payment, or stock movement is written.

---

## 6. Reversal & Return Workflow

When a return is processed via `POST /api/pos/returns`:

```
POST /api/pos/returns (sale_id, items, reason)
        ↓
Lock Sale & SaleItems (SELECT ... FOR UPDATE)
        ↓
Validate returnable quantity (quantity <= sold_quantity - returned_quantity)
        ↓
Update SaleItem.returned_quantity
        ↓
Increment Product.current_stock (e.g. 9.000 -> 10.000)
        ↓
Insert StockMovement (type='IN', reference_type='SALE_RETURN')
        ↓
Insert SaleReturn & ReturnItem rows
        ↓
Update Sale.status ('partially_returned' or 'returned')
        ↓
If Invoice Exists:
    ├─ Generate Gapless Credit Note (CN/YYYY-YY/XXXXX)
    ├─ Calculate Proportional Tax Refund (Taxable, CGST, SGST, IGST)
    ├─ Insert CreditNote & CreditNoteItem rows
    └─ Update Invoice.payment_status ('partially_refunded' or 'refunded')
```

Stock and statutory financial records remain strictly synchronized.

---

## 7. GST Pricing Rules (Inclusive vs Exclusive)

CoreERP supports standard Indian GST calculation rules:

### A. GST-Inclusive Pricing (Retail POS)
- Selling price entered in catalog represents the final consumer price.
- **Formula:**
  $$\text{Taxable Value} = \frac{\text{Selling Price}}{1 + \frac{\text{GST Rate}}{100}}$$
  $$\text{Total GST} = \text{Selling Price} - \text{Taxable Value}$$
- **Example (₹11,800 @ 18% GST):**
  - Selling Price: ₹11,800.00
  - Taxable Value: ₹10,000.00
  - CGST (9%): ₹900.00
  - SGST (9%): ₹900.00
  - Final Payable: ₹11,800.00 (GST is **not** added again)

### B. GST-Exclusive Pricing (B2B Quotations / Wholesale)
- Unit price represents the net taxable base.
- **Formula:**
  $$\text{Total GST} = \text{Taxable Price} \times \frac{\text{GST Rate}}{100}$$
  $$\text{Final Payable} = \text{Taxable Price} + \text{Total GST}$$
- **Example (₹10,000 @ 18% GST):**
  - Taxable Price: ₹10,000.00
  - Total GST: ₹1,800.00
  - Final Payable: ₹11,800.00

---

## 8. EMI Financing & Warranty Workflows

### EMI Financing Workflow
1. Customer is selected or created (mandatory for EMI).
2. Down payment and tenure (installments) are specified.
3. System calls `compute_emi_schedule()` server-side.
4. Down payment is recorded in `payments` ledger.
5. `EmiPlan` and `EmiInstallment` schedule rows are created in the database.
6. When installments are paid via `/api/payments`, payments waterfall through pending installments, transitioning installment status from `pending` → `paid`.

### Warranty Tracking Workflow
1. Warranties link to `product_id`, `customer_id`, and `sale_item_id`.
2. Stored in table `warranties` with serial number, purchase date, and expiration date.
3. Visible in Customer Portal at `/portal/warranties`.
4. Claims can be submitted by customers or logged by staff via `POST /api/support/warranties/{id}/claim`.
5. Upon sale return, the warranty status is marked void/reversed.

---

## 9. Actual Problems Found & Applied Fixes

### Problem 1: Crash in Invoice Auto-Backfill
- **File:** `backend/app/modules/invoicing/routes.py`
- **Location:** Line 215
- **Cause:** Code referenced `s.cashier_id or current_staff.id`. The `Sale` model has `staff_id`, not `cashier_id`.
- **Fix:** Changed `s.cashier_id` to `s.staff_id`. Auto-backfill now executes cleanly without raising `AttributeError`.

### Problem 2: Portal Dashboard Showed Paid Invoices as Outstanding Debt
- **File:** `backend/app/modules/portal/routes.py`
- **Location:** Lines 128–137
- **Cause:** Outstanding invoice balance query filtered strictly by `Payment.invoice_id == inv.id`. For POS sales where payments were linked by `sale.invoice_number`, `paid_for_inv` returned 0.
- **Fix:** Updated the query to check `Payment.invoice_id == inv.id` with fallback to `Payment.reference_id == inv.sale.invoice_number`. Fully paid sales now correctly report `0.00` outstanding balance.

---

## 10. Test Verification Results

All tests have been executed and verified:

1. **Frontend Production Build:**
   ```bash
   npm run build
   ```
   *Result:* ✓ Built in 13.34s (0 TypeScript errors, clean production bundle).

2. **Full Pytest Suite (221 Tests):**
   ```bash
   pytest tests/
   ```
   *Result:* 221 passed, 0 failed, 1 warning (100% pass rate).

3. **Financial Calculations Verification:**
   ```bash
   python test_financial_calculations.py
   ```
   *Result:* ✓ All financial calculation tests passed (GST inclusive/exclusive, intra/inter-state, split payments, credit notes).

4. **Complete E2E ERP Workflow Verification:**
   ```bash
   python test_erp_e2e_workflow.py
   ```
   *Result:* ✓ All 10 end-to-end stages passed (Product, Customer, Cart, Checkout, Invoice, Stock, Customer History, Portal, Reports, Returns).
