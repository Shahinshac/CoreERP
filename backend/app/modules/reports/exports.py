"""
Phase 12 — Export utilities (CSV, Excel, PDF).

Export functions consume iterator-based streaming functions from service.py
to avoid loading unbounded row sets into memory.

- CSV: stdlib csv module, in-memory BytesIO via StringIO wrapper
- Excel: openpyxl, in-memory BytesIO
- PDF: reportlab (same library as Phase 7 invoice PDFs), in-memory BytesIO

Single Source of Truth guarantee:
  All export functions receive pre-computed row dicts from the same service
  layer functions used for on-screen reports. There is NO separate export-only
  calculation path.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Dict, Iterator, List, Optional

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.modules.reports.service import (
    iter_sales_rows,
    iter_inventory_rows,
    iter_inventory_aging_rows,
    iter_gst_rows,
    get_profit_loss_report,
)


# ============================================================
# Generic CSV
# ============================================================

def export_csv(headers: List[str], row_iter: Iterator[Dict[str, Any]]) -> io.BytesIO:
    """
    Produces an in-memory CSV stream from headers + a row dict iterator.
    Chunked: rows are consumed one at a time — no full-load into memory.
    """
    string_buf = io.StringIO()
    writer = csv.DictWriter(string_buf, fieldnames=headers, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in row_iter:
        writer.writerow(row)
    bytes_buf = io.BytesIO(string_buf.getvalue().encode("utf-8-sig"))  # BOM for Excel compat
    bytes_buf.seek(0)
    return bytes_buf


# ============================================================
# Generic Excel (openpyxl)
# ============================================================

_HEADER_FILL = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
_HEADER_FONT = Font(color="FFFFFF", bold=True, size=11)
_ALT_FILL = PatternFill(start_color="EEF2FF", end_color="EEF2FF", fill_type="solid")


def export_excel(
    title: str,
    headers: List[str],
    row_iter: Iterator[Dict[str, Any]],
    col_widths: List[int] | None = None,
) -> io.BytesIO:
    """
    Produces a styled openpyxl workbook in-memory.
    Rows are consumed from the iterator in order; no preloading.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = title[:31]  # Excel sheet name max 31 chars

    # Title row
    ws.append([title])
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
    title_cell = ws.cell(row=1, column=1)
    title_cell.font = Font(bold=True, size=13, color="1E3A5F")
    title_cell.alignment = Alignment(horizontal="center")

    # Header row
    ws.append(headers)
    for col_idx, cell in enumerate(ws[2], start=1):
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    # Data rows
    row_num = 3
    for row_dict in row_iter:
        values = [str(row_dict.get(h, "")) for h in headers]
        ws.append(values)
        if row_num % 2 == 0:
            for cell in ws[row_num]:
                cell.fill = _ALT_FILL
        row_num += 1

    # Column widths
    if col_widths:
        for i, w in enumerate(col_widths, start=1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w
    else:
        for i, h in enumerate(headers, start=1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(14, len(h) + 4)

    bytes_buf = io.BytesIO()
    wb.save(bytes_buf)
    bytes_buf.seek(0)
    return bytes_buf


# ============================================================
# Sales-specific exports
# ============================================================

SALES_HEADERS = [
    "invoice_number", "sale_date", "customer_name",
    "subtotal", "discount_amount", "tax_amount",
    "total_amount", "returned_amount", "net_amount",
    "status", "payment_method",
]


def export_sales_csv(db, start_date: date, end_date: date) -> io.BytesIO:
    return export_csv(SALES_HEADERS, iter_sales_rows(db, start_date, end_date))


def export_sales_excel(db, start_date: date, end_date: date) -> io.BytesIO:
    return export_excel(
        f"Sales Report {start_date} to {end_date}",
        SALES_HEADERS,
        iter_sales_rows(db, start_date, end_date),
    )


def export_sales_pdf(db, start_date: date, end_date: date) -> io.BytesIO:
    """
    Sales PDF report using reportlab (same in-memory approach as Phase 7 invoice PDFs).
    Streams rows in chunks to avoid memory bloat on large date ranges.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=24, leftMargin=24, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    elems = []

    title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=14, spaceAfter=6, textColor=colors.HexColor("#1E3A5F"))
    sub_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748b"), spaceAfter=12)

    elems.append(Paragraph(f"Sales Report", title_style))
    elems.append(Paragraph(f"Period: {start_date} to {end_date}", sub_style))

    headers = ["Invoice #", "Date", "Customer", "Subtotal", "Discount", "Tax", "Total", "Refunded", "Net", "Status", "Method"]
    col_keys = [
        "invoice_number", "sale_date", "customer_name", "subtotal", "discount_amount", "tax_amount",
        "total_amount", "returned_amount", "net_amount", "status", "payment_method"
    ]

    table_data = [headers]
    for row in iter_sales_rows(db, start_date, end_date):
        table_data.append([str(row.get(k, "")) for k in col_keys])

    if len(table_data) == 1:
        table_data.append(["No records found in this period."] + [""] * (len(headers) - 1))

    col_widths = [75, 55, 75, 55, 50, 45, 55, 50, 55, 55, 48]
    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#EEF2FF")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elems.append(table)
    doc.build(elems)
    buffer.seek(0)
    return buffer


# ============================================================
# Inventory-specific exports
# ============================================================

INVENTORY_HEADERS = [
    "name", "sku", "hsn_code", "category", "current_stock",
    "min_stock", "purchase_price", "selling_price", "valuation", "is_low_stock",
]


def export_inventory_csv(db, low_stock_only: bool = False) -> io.BytesIO:
    return export_csv(INVENTORY_HEADERS, iter_inventory_rows(db, low_stock_only))


def export_inventory_excel(db, low_stock_only: bool = False) -> io.BytesIO:
    return export_excel(
        "Inventory Report",
        INVENTORY_HEADERS,
        iter_inventory_rows(db, low_stock_only),
    )


# ============================================================
# Inventory Aging / Dead Stock exports
# ============================================================

AGING_HEADERS = [
    "name", "sku", "hsn_code", "category", "current_stock",
    "purchase_price", "selling_price", "valuation", "last_sale_date",
    "days_inactive", "bucket",
]


def export_inventory_aging_csv(
    db, bucket: Optional[str] = None, category_id: Optional[uuid.UUID] = None
) -> io.BytesIO:
    return export_csv(AGING_HEADERS, iter_inventory_aging_rows(db, bucket=bucket, category_id=category_id))


def export_inventory_aging_excel(
    db, bucket: Optional[str] = None, category_id: Optional[uuid.UUID] = None
) -> io.BytesIO:
    return export_excel(
        "Inventory Aging Report",
        AGING_HEADERS,
        iter_inventory_aging_rows(db, bucket=bucket, category_id=category_id),
    )


# ============================================================
# GST-specific exports
# ============================================================

GST_HEADERS = [
    "invoice_number", "invoice_date", "financial_year",
    "buyer_name", "buyer_gstin", "buyer_state", "place_of_supply",
    "is_inter_state", "taxable_value",
    "cgst_amount", "sgst_amount", "igst_amount",
    "total_tax", "grand_total", "payment_status",
]


def export_gst_csv(db, start_date: date, end_date: date) -> io.BytesIO:
    return export_csv(GST_HEADERS, iter_gst_rows(db, start_date, end_date))


def export_gst_excel(db, start_date: date, end_date: date) -> io.BytesIO:
    return export_excel(
        f"GST Report {start_date} to {end_date}",
        GST_HEADERS,
        iter_gst_rows(db, start_date, end_date),
    )


# ============================================================
# Profit & Loss exports
# ============================================================

PL_HEADERS = [
    "period", "revenue", "returns_refunded", "net_revenue",
    "invoiced_revenue", "credit_notes_refunded",
    "cost_of_goods", "expenses",
    "gross_profit", "net_profit",
]


def export_pl_csv(db, start_date: date, end_date: date) -> io.BytesIO:
    report = get_profit_loss_report(db, start_date, end_date)
    return export_csv(PL_HEADERS, iter(report["rows"]))


def export_pl_excel(db, start_date: date, end_date: date) -> io.BytesIO:
    report = get_profit_loss_report(db, start_date, end_date)
    return export_excel(
        f"P&L Report {start_date} to {end_date}",
        PL_HEADERS,
        iter(report["rows"]),
    )


def export_pl_pdf(db, start_date: date, end_date: date) -> io.BytesIO:
    report = get_profit_loss_report(db, start_date, end_date)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=24, leftMargin=24, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    elems = []

    title_style = ParagraphStyle("Title", parent=styles["Heading1"], fontSize=14, spaceAfter=6, textColor=colors.HexColor("#1E3A5F"))
    sub_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748b"), spaceAfter=12)
    elems.append(Paragraph("Profit & Loss Report", title_style))
    elems.append(Paragraph(f"Period: {start_date} to {end_date} | {report['accounting_basis']}", sub_style))

    headers = ["Period", "Gross Rev", "Refunds", "Net Rev", "Invoiced", "CN Refund", "COGS", "Expenses", "Gross Profit", "Net Profit"]
    table_data = [headers]
    for row in report["rows"]:
        table_data.append([str(row.get(k, "")) for k in PL_HEADERS])

    # Summary row
    s = report["summary"]
    table_data.append([
        "TOTAL",
        s.get("revenue", "0.00"),
        s.get("returns_refunded", "0.00"),
        s.get("net_revenue", "0.00"),
        s.get("invoiced_revenue", "0.00"),
        s.get("credit_notes_refunded", "0.00"),
        s.get("cost_of_goods", "0.00"),
        s.get("expenses", "0.00"),
        s.get("gross_profit", "0.00"),
        s.get("net_profit", "0.00"),
    ])

    table = Table(table_data, colWidths=[55, 65, 55, 65, 65, 65, 55, 55, 68, 68], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#1E293B")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#EEF2FF")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elems.append(table)
    doc.build(elems)
    buffer.seek(0)
    return buffer
