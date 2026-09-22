# Phase 7 — GST and Invoicing Implementation Walkthrough

## 1. Overview & Statutory Architecture
Phase 7 introduces an authoritative, legally compliant Indian Goods and Services Tax (GST) invoicing engine and full credit-note reversal workflow. Built upon Phases 1–6 without altering POS checkout's core atomic execution, it seamlessly extends POS sales into formal, sequential, and immutable Tax Invoices.

### Authoritative GST Place-of-Supply Rules (IGST Act 2017 & CGST Act 2017)
- **Section 10(1)(c) IGST Act 2017**: For over-the-counter counter sales / walk-in customers where supply does not involve movement of goods, the place of supply is the seller's business location.
- **Intra-State Supply** (`seller_state == buyer_state` or walk-in):
  - Split 50% **CGST** + 50% **SGST**.
  - `igst = 0`.
- **Inter-State Supply** (`seller_state != buyer_state`):
  - 100% **IGST**.
  - `cgst = 0`, `sgst = 0`.
- **Pure Function**: [compute_gst](file:///c:/Users/Shahinsha/Desktop/web%20based/backend/app/modules/invoicing/gst.py) serves as the single source of truth across all modules and tests, strictly utilizing `Decimal` with `ROUND_HALF_UP` quantization.

---

## 2. Changes Made

### Backend Implementation (`app/modules/invoicing/`)
1. **Config (`app/core/config.py`)**:
   - Added seller statutory GST parameters: `SELLER_NAME`, `SELLER_GSTIN`, `SELLER_STATE`, `SELLER_STATE_CODE`, `SELLER_ADDRESS`, `SELLER_PHONE`, `SELLER_EMAIL`.
2. **GST Logic (`app/modules/invoicing/gst.py`)**:
   - Pure function `compute_gst(seller_state, buyer_state, taxable_value, gst_rate)`: returns CGST/SGST/IGST rates and amounts with round-half-up precision.
   - Financial year helper `get_financial_year(dt)`: accurately maps dates to the Indian FY calendar (`2026-27`).
3. **Database Schema & Models (`app/modules/invoicing/models.py`)**:
   - `InvoiceSequence`: Tracks gapless sequence numbers per financial year (`sequence_type="INV"`, `sequence_type="CN"`).
   - `Invoice`: Immutable tax invoice records with snapshots of buyer/seller GSTIN, state codes, place of supply, taxable subtotal, CGST, SGST, IGST, total tax, and grand total.
   - `InvoiceItem`: Line items recording HSN code, unit price, quantity, taxable value, and tax breakdown.
   - `CreditNote` & `CreditNoteItem`: Reversal records referencing original invoices with identical GST breakdown in reverse.
   - Added `gstin` and `state` to `Customer` and `hsn_code` to `Product`.
4. **Migration (`migrations/versions/d1234567890b_phase7_invoicing.py`)**:
   - Created tables and constraints with explicit naming conventions.
5. **In-Memory PDF Generation (`app/modules/invoicing/pdf.py`)**:
   - Server-side generation using `reportlab` inside an ephemeral `io.BytesIO` buffer.
   - Zero local disk writes, completely compliant with free-tier / serverless constraints.
6. **API Routes (`app/modules/invoicing/routes.py`)**:
   - `POST /api/invoicing/from-sale/{sale_id}`: Atomically generates a gapless sequential invoice number from a POS sale using row-locking.
   - `GET /api/invoicing/{id}`: View invoice with customer isolation checks.
   - `GET /api/invoicing/{id}/pdf`: In-memory streaming response returning `application/pdf` with `Content-Disposition: inline`.
   - `GET /api/invoicing`: Multi-faceted search and filter (date range, customer, payment status).
   - `POST /api/invoicing/{id}/credit-note`: Issues credit notes reversing invoices.
   - **Immutability Guaranteed**: No PUT or PATCH endpoints exist for invoices.

### Frontend Implementation
1. **Invoicing API (`src/features/invoicing/api.ts`)**:
   - Complete TypeScript interfaces and API methods for generating, querying, viewing, downloading PDF, and issuing credit notes.
2. **POS Receipt Modal Extension (`src/features/pos/ReceiptModal.tsx`)**:
   - Extended POS checkout completion to offer a direct "Generate Statutory GST Tax Invoice" action with optional buyer name, GSTIN, and state input.
   - Directly links to invoice view or in-memory PDF download.
3. **Invoices List Page (`src/routes/staff/InvoicesPage.tsx`)**:
   - Searchable and filterable table by date range, payment status, customer, and search term.
   - Displays GST type badges (IGST vs CGST+SGST), taxable amount, tax amount, and grand total.
4. **Invoice Detail Page (`src/routes/staff/InvoiceDetailPage.tsx`)**:
   - Statutory Indian GST Tax Invoice layout with seller/buyer cards, HSN line items, GST breakdown table, legal disclaimers, and credit note history.
5. **Credit Note Reversal Modal (`src/features/invoicing/CreditNoteModal.tsx`)**:
   - Minimalist modal allowing full or itemized quantity reversal with audit reason.
6. **Navigation & Code Splitting (`src/routes/index.tsx`)**:
   - Wired `/staff/invoices` and `/staff/invoices/:id` using `React.lazy` and `Suspense`.

---

## 3. Verification Results

### Automated Backend Tests (`pytest`)
All 45 unit and integration tests passed (100% pass rate):
- `test_compute_gst_intra_state_walkin`: Asserts 50-50 split into CGST and SGST with 0 IGST.
- `test_compute_gst_intra_state_same_state`: Asserts case-insensitive intra-state matching.
- `test_compute_gst_inter_state`: Asserts 100% IGST when buyer state differs from seller state.
- `test_compute_gst_rounding_half_up`: Asserts `ROUND_HALF_UP` on odd fractions.
- `test_financial_year_helper`: Asserts April 1 – March 31 boundary rules.
- `test_invoice_creation_intra_state_from_sale`: Asserts full invoice generation from POS sale.
- `test_invoice_creation_inter_state`: Asserts 100% IGST on inter-state sale.
- `test_invoice_sequential_gapless_numbering`: Asserts consecutive gapless numbers (`INV/2026-27/00001`, `INV/2026-27/00002`, `INV/2026-27/00003`).
- `test_invoice_cannot_duplicate_for_same_sale`: Asserts 400 rejection on duplicate generation attempt.
- `test_invoice_immutability`: Asserts 405 Method Not Allowed on PUT and PATCH.
- `test_invoice_pdf_streaming`: Asserts streaming `%PDF-` signature and headers without disk writes.
- `test_credit_note_reversal_workflow`: Asserts credit note creation, original invoice cancellation, and duplicate prevention.
- `test_customer_invoice_isolation`: Asserts Customer 2 cannot access Customer 1's invoices (403 Forbidden).

### Frontend Production Build (`npm run build`)
- Built in 12.15s with 0 TypeScript errors.
- Separate lazy chunks generated:
  - `InvoicesPage-Co9i8LR5.js` (8.63 kB)
  - `InvoiceDetailPage-0maXIE9c.js` (20.80 kB)
  - `POSPage-BRDoUh2X.js` (19.02 kB)

---

## 4. Flagged Follow-ups
> [!IMPORTANT]
> **Postgres / Supabase `with_for_update()` Row Locking**:
> - In our local automated testing environment with SQLite, transactional serialization is enforced by database-level write locks.
> - On real Postgres/Supabase deployments, `with_for_update()` on `invoice_sequences` actively holds an exclusive row-level lock across concurrent checkout transactions until commit or rollback.
> - As instructed, this is flagged as a follow-up item to verify on staging/production Postgres once connected to live Supabase.

---

# Phase 8 — Payments & Settlement Ledger Walkthrough

## 1. Overview & Architecture
Phase 8 implements an immutable, append-only payments ledger and zero-cost UPI intent/QR generation engine. It seamlessly ties settlement transactions to invoices generated in Phase 7 without modifying GST calculation rules, place-of-supply logic, or invoice immutability.

### Append-Only Ledger Design
- **Immutability Principle**: A payment cannot be updated or deleted (`PUT`, `PATCH`, and `DELETE` requests to `/api/payments/{id}` or `/api/payments` strictly return `405 Method Not Allowed`).
- **Audit Correction Strategy**: Reversals or adjustments must be recorded as distinct offsetting payment entries rather than mutating historical records.
- **Atomic Invoice Payment Status Reconciliation**:
  - Derived dynamically within the same database transaction:
    $$\text{paid\_sum} = \sum_{\text{status}=\text{paid}} \text{payment.amount}$$
  - $\text{paid\_sum} \ge \text{invoice.grand\_total} \implies \text{payment\_status} = \text{"paid"}$
  - $0 < \text{paid\_sum} < \text{invoice.grand\_total} \implies \text{payment\_status} = \text{"partially\_paid"}$
  - $\text{paid\_sum} = 0 \implies \text{payment\_status} = \text{"unpaid"}$
- **Strict Idempotency**:
  - Client sends a unique `idempotency_key` (UUID v4).
  - If a payment with the same `idempotency_key` already exists, the server returns the existing payment record (HTTP 200/201) rather than creating a duplicate or raising a generic error.
- **Overpayment Protection**:
  - Payment amount exceeding remaining balance is blocked (`400 Bad Request`).
  - Overpayment allowance requires `allow_overpayment=true`, which is strictly restricted to `Admin` and `Super Admin` roles (`403 Forbidden` for non-admin staff).

### Free-Tier Zero-Cost Payment Link & UPI Intent Strategy
- **Gateway Avoidance**: Traditional payment gateways (Razorpay, Stripe, Cashfree) charge setup fees and 2% + GST per transaction.
- **Static UPI Intent URL**:
  - Formatted per National Payments Corporation of India (NPCI) specification:
    `upi://pay?pa={SELLER_UPI_ID}&pn={SELLER_NAME}&am={REMAINING_AMOUNT}&cu=INR&tn={INVOICE_NUMBER}`
  - Zero transaction fees, instant peer-to-merchant or peer-to-peer settlement.
  - Client renders a clean QR code via public QR service with copyable intent links.
  - Manual staff confirmation of receipt ("Mark as Received & Record") records the transaction into the append-only ledger upon verification in the store's UPI app or bank account.
  - **Flagged Note**: A real payment gateway integration would incur recurring transaction fees and requires explicit stakeholder approval before adding.

---

## 2. Changes Made

### Backend Implementation (`app/modules/payments/`)
1. **Config (`app/core/config.py`)**:
   - Added `SELLER_UPI_ID` (default: `"retailstore@upi"`) and `SELLER_UPI_NAME` (default: `"My Retail Store"`).
2. **Models (`app/modules/payments/models.py`)**:
   - `PaymentMethod`: `cash`, `upi`, `card`, `payment_link`, `emi` (reserved for Phase 9).
   - `PaymentStatus`: `pending`, `paid`, `failed`, `expired`.
   - `Payment`: UUID primary key, `invoice_id` (nullable for general customer advance), `customer_id` (nullable), `created_by`, `amount` (`Numeric(14,2)`), `idempotency_key` (unique), `reference_id` (nullable for cash), `notes`, and audit timestamps.
3. **Database Relationships & Migration**:
   - Added `payments` relationship on `Invoice` in `app/modules/invoicing/models.py`.
   - Registered `Payment` in `app/core/models.py`.
   - Generated Alembic migration `e1234567890c_phase8_payments.py`.
4. **Validation Schemas (`app/modules/payments/schemas.py`)**:
   - Strict decimal validation via `app/core/money.py` (rejecting NaN, inf, negative, and zero values).
   - `PaymentCreateRequest` with `allow_overpayment` flag.
   - `PaymentResponse` and `PaymentListResponse`.
   - `UPIIntentResponse`.
5. **API Routes (`app/modules/payments/routes.py`)**:
   - `POST /api/payments`: Idempotent payment recording, overpayment validation, and atomic invoice status update.
   - `GET /api/payments`: Filterable ledger list by `invoice_id`, `customer_id`, `status`, `method`, and date range.
   - `GET /api/payments/{id}`: Detailed receipt view.
   - `GET /api/payments/upi-intent/{invoice_id}`: Static UPI URI and payee parameters.
   - Method Not Allowed guards for `PUT`, `PATCH`, `DELETE` to enforce append-only ledger immutability.
6. **Main Router Registration (`app/main.py`)**:
   - Mounted `payments_router` with prefix `/api/payments`.

### Frontend Implementation
1. **Payments API Client (`src/features/payments/api.ts`)**:
   - Full TypeScript types for `Payment`, `PaymentCreateRequest`, `PaymentListParams`, and `UPIIntentResponse`.
   - API endpoints for recording payments, listing transactions, and generating UPI intent.
2. **Payment Record Modal (`src/features/payments/PaymentRecordModal.tsx`)**:
   - Method selector (`cash`, `upi`, `card`, `payment_link`, `emi`).
   - Client-side UUID idempotency key generator.
   - `<NumericInput>` amount pre-filled with remaining invoice balance.
   - Admin-only overpayment toggle with clear warning cues.
   - Direct button to switch to UPI QR generator.
3. **UPI QR Generator Modal (`src/features/payments/UPIQRModal.tsx`)**:
   - Visual QR code generated from static UPI URI.
   - Copyable UPI intent link for sharing with customers via WhatsApp/SMS.
   - Payee UPI ID, merchant name, and invoice reference display.
   - Direct staff "Mark as Received & Record" action button.
4. **Invoice Detail Page Integration (`src/routes/staff/InvoiceDetailPage.tsx`)**:
   - Added "Scan UPI QR" and "Record Payment" buttons to action bar.
   - Added **Payment History & Settlement Ledger** section:
     - Real-time settled total and balance remaining indicators.
     - Formatted table of payment receipts with timestamp, method badge, gateway/reference ID, status badge, and amount.
     - Automatic balance and payment status synchronization after recording payments.
5. **Payments Ledger List Page (`src/routes/staff/PaymentsPage.tsx`)**:
   - Filter by status (`paid`, `pending`, `failed`, `expired`), method (`cash`, `upi`, `card`, `payment_link`, `emi`), invoice ID, and date range.
   - KPI metric cards: Total Settled, Cash Collections, Digital / UPI / Cards, and Ledger Audit Status.
   - Transaction receipt detail drawer.
6. **Route Wiring & Code Splitting (`src/routes/index.tsx`)**:
   - Lazy-loaded `PaymentsPage` under `/staff/payments` with `StaffRouteGuard`.

---

## 3. Verification & Test Results

### Automated Pytest Suite (`pytest`)
All **51 tests passed** (100% pass rate):
- `test_idempotent_duplicate_key_returns_original_result`: Asserts submitting identical `idempotency_key` returns the original payment record without creating duplicate ledger records.
- `test_invoice_payment_status_reconciliation`: Asserts cumulative payments advance invoice `payment_status` from `unpaid` $\to$ `partially_paid` $\to$ `paid`.
- `test_overpayment_protection_and_admin_allowance`: Asserts non-admin overpayment is blocked with `400 Bad Request`; non-admin attempt with `allow_overpayment=true` is rejected with `403 Forbidden`; admin with `allow_overpayment=true` is accepted.
- `test_payments_ledger_append_only_immutability`: Asserts `PUT`, `PATCH`, and `DELETE` return `405 Method Not Allowed`.
- `test_invalid_and_negative_amounts_rejected`: Asserts negative amounts, zero amounts, and invalid inputs are rejected with 422 Unprocessable Entity.
- `test_upi_intent_generation`: Asserts correct format of `upi://pay?pa=...` URI.

### Frontend Production Build (`npm run build`)
- Successfully built in 2.42s with **0 TypeScript errors**.
- Dynamic chunk splitting verified:
  - `PaymentsPage-DWbrV_pl.js` (15.91 kB)
  - `PaymentRecordModal-Cti_ASFI.js` (7.96 kB)
  - `InvoiceDetailPage-CkuUQOID.js` (28.68 kB)

---

# Phase 9 — EMI (Installment Financing) Walkthrough

## 1. Overview & Business Rules

Phase 9 introduces in-store installment financing (EMI) for retail customers. It builds on Phases 1–8 without mutating historical transactions: all EMI repayments are recorded into the immutable append-only `Payment` ledger with `method="emi"` and bidirectional links to `EmiPlan` and `EmiInstallment`.

### Core Architectural Decisions & Business Rules

#### 1. Interest-Bearing Support Decision
- **Promotional No-Cost EMI (0% Interest)**: Supported by default. Retail customers pay zero interest, and financed amount equals $\text{principal} - \text{down\_payment}$.
- **Flat Simple Interest EMI**: Supported when `interest_rate > 0`. The total interest is computed as:
  $$\text{interest\_amount} = \text{quantize\_money}\left((\text{principal} - \text{down\_payment}) \times \frac{\text{interest\_rate}}{100} \times \frac{\text{number\_of\_installments}}{12}\right)$$
  $$\text{total\_financed} = (\text{principal} - \text{down\_payment}) + \text{interest\_amount}$$
- **Documented Boundary**: Reducing-balance banking amortization schedules are intentionally excluded as in-store point-of-sale consumer financing operates on transparent flat or zero-cost promotional terms.

#### 2. Exact Rounding Remainder Handling
To prevent silent gains or losses of paise over the financing tenure:
1. Base monthly installment is quantized to 2 decimal places with `ROUND_HALF_UP`:
   $$\text{base} = \text{quantize\_money}\left(\frac{\text{total\_financed}}{N}\right)$$
2. Installments $1 \dots (N-1)$ are set to $\text{base}$.
3. Final installment $N$ absorbs the exact fractional remainder:
   $$\text{installment}[N].\text{amount\_due} = \text{total\_financed} - \sum_{i=1}^{N-1} \text{installment}[i].\text{amount\_due}$$
$$\sum_{i=1}^N \text{installment}[i].\text{amount\_due} \equiv \text{total\_financed} \quad (\text{zero paise lost})$$

#### 3. Sequential Waterfall Overpayment Allocation Strategy
- When a customer makes a payment targeting installment $k$, funds are first applied to settle installment $k$ up to its remaining unpaid amount.
- Any surplus immediately **cascades automatically** to subsequent installments $k+1, k+2, \dots$, marking them `partial` or `paid`.
- If an unallocated surplus remains and the total exceeds the entire plan's remaining unpaid balance, it is blocked (`400 Bad Request`) unless authorized with `allow_overpayment=true` by an **Administrator** (`403 Forbidden` for standard staff).

#### 4. Overdue Detection & 90-Day NPA Default Rule
- **Overdue Installment**: Evaluated dynamically whenever $\text{as\_of\_date} > \text{due\_date}$ and $\text{amount\_paid} < \text{amount\_due}$ (with $\le 90$ days overdue).
- **Default Status Rule**: Modeled after standard Indian banking/retail credit regulations (RBI 90-day Non-Performing Asset norm). A plan transitions to `defaulted` if:
  1. Any installment is overdue by **> 90 calendar days** beyond its due date; OR
  2. The customer accumulates **3 or more overdue installments**.
- **Closure**: When all installments reach `paid`, `EmiPlan.status` automatically updates to `"completed"` in the same atomic transaction as the final payment.

---

## 2. Changes Made

### Backend Implementation (`app/modules/emi/`)
1. **Models (`app/modules/emi/models.py`)**:
   - `EmiPlanStatus`: `active`, `completed`, `defaulted`, `cancelled`.
   - `EmiInstallmentStatus`: `pending`, `paid`, `partial`, `overdue`, `defaulted`.
   - `EmiPlan`: `customer_id`, `invoice_id`, `created_by`, `principal`, `down_payment`, `number_of_installments`, `interest_rate`, `interest_amount`, `total_financed`, `installment_amount`, `start_date`, `status`, `notes`.
   - `EmiInstallment`: `emi_plan_id`, `installment_number`, `due_date`, `amount_due`, `amount_paid`, `status`.
2. **Payments Integration (`app/modules/payments/models.py`)**:
   - Added `emi_plan_id` and `emi_installment_id` foreign keys to `Payment` table for bidirectional ledger auditing.
3. **Database Migration (`migrations/versions/e2234567890d_phase9_emi.py`)**:
   - Created `emi_plans`, `emi_installments`, and altered `payments` table.
4. **Schedule Helper (`app/modules/emi/schedule.py`)**:
   - `compute_emi_schedule`: Generates calendar-adjusted monthly dates and remainder-allocated amounts.
   - `evaluate_installment_status`: Categorizes installments into `pending`, `paid`, `partial`, `overdue`, and `defaulted`.
   - `evaluate_plan_status`: Dynamically computes plan completion and 90-day/3-overdue default transitions.
5. **Validation Schemas (`app/modules/emi/schemas.py`)**:
   - `EmiPlanPreviewRequest`, `EmiPlanPreviewResponse`, `EmiPlanCreateRequest`, `EmiPlanDetailResponse`, `EmiPaymentRequest`, `OverdueInstallmentResponse`.
6. **API Routes (`app/modules/emi/routes.py`)**:
   - `POST /api/emi/plans/preview`: Live calculation preview.
   - `POST /api/emi/plans`: Single-transaction plan and schedule creation.
   - `GET /api/emi/plans`: Paginated plan listing with customer and status filters.
   - `GET /api/emi/plans/{id}`: Detailed plan with full schedule and linked payments.
   - `POST /api/emi/plans/{id}/pay` & `/installments/{n}/pay`: Waterfall cascading payments with idempotency.
   - `GET /api/emi/overdue`: Overdue installments tracking list.
7. **Main Router Registration (`app/main.py`)**:
   - Mounted `emi_router` at `/api/emi`.

### Frontend Implementation
1. **Client API (`src/features/emi/api.ts`)**:
   - TypeScript definitions and API methods for preview, plan creation, installment payments, and overdue retrieval.
2. **Create Plan Modal (`src/features/emi/CreateEmiPlanModal.tsx`)**:
   - Customer picker, optional invoice linkage, principal, down payment, tenure selector (3–24 mos), interest rate, and live schedule preview table.
3. **Payment Modal (`src/features/emi/EmiPaymentModal.tsx`)**:
   - Channel selector (UPI, Cash, Card, Bank), client-side UUID idempotency key, due amount pre-fill, and admin overpayment toggle.
4. **EMI Detail Page (`src/routes/staff/EmiDetailPage.tsx`)**:
   - Plan KPIs, settlement progress bar, customer/invoice cards, full installment schedule table with inline pay actions, and payments history.
5. **EMI Management Page (`src/routes/staff/EmiPage.tsx`)**:
   - KPI metrics (Active Plans, Total Financed, Capital Collected, Overdue Count).
   - Tabbed view: "All Financing Plans" and "Overdue Installments Alert Center".
   - Status filters and modal triggers.
6. **Route Wiring (`src/routes/index.tsx`)**:
   - Lazy-loaded `/staff/emi` and `/staff/emi/:id` routes with `StaffRouteGuard`.

---

## 3. Verification & Test Results

### Automated Pytest Suite (`pytest`)
All **57 tests passed** (100% pass rate):
- `test_exact_rounding_remainder_allocation`: Tested non-evenly divisible principal (₹10,000 / 3) and verified ₹3,333.33 + ₹3,333.33 + ₹3,333.34 = exactly ₹10,000.00; tested ₹1,000 with ₹100 down payment over 7 installments = exactly ₹900.00; tested 12% flat simple interest.
- `test_emi_plan_creation_and_preview`: Tested preview and persistent creation of EMI plan with schedule generation.
- `test_waterfall_cascading_overpayment_and_plan_completion`: Verified paying ₹1,500 on ₹1,000 installment pays installment 1 and cascades ₹500 to installment 2; paying remaining ₹1,500 automatically transitions plan to `completed`.
- `test_overpayment_beyond_plan_balance_rejected`: Verified payment beyond total plan balance is blocked (400), `allow_overpayment=true` rejected for cashier (403), and allowed for Admin.
- `test_overdue_and_default_status_evaluation`: Verified overdue evaluation, >90 day NPA default trigger, and 3-overdue installments plan default rule.
- `test_idempotent_duplicate_payment_returns_original_state`: Verified duplicate idempotency keys return existing state without duplicate ledger entries or double charging.

### Frontend Production Build (`npm run build`)
- Successfully built in 2.58s with **0 TypeScript errors**.
- Dynamic chunk splitting verified:
  - `EmiPage-BdGei1-e.js` (25.00 kB)
  - `EmiDetailPage-Bl_JtQdP.js` (17.33 kB)
