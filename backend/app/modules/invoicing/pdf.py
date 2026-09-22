import io
from decimal import Decimal
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.modules.invoicing.models import Invoice


def generate_invoice_pdf(invoice: Invoice) -> io.BytesIO:
    """
    Generate an authoritative Indian GST Tax Invoice as an in-memory PDF stream.
    Zero local disk writes (100% ephemeral memory buffer).
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontSize=16,
        leading=20,
        alignment=1,  # Center
        textColor=colors.HexColor("#1e293b"),
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "InvoiceSubTitle",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        alignment=1,
        textColor=colors.HexColor("#64748b"),
    )
    header_style = ParagraphStyle(
        "PartyHeader",
        parent=styles["Normal"],
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
        fontName="Helvetica-Bold",
    )
    body_style = ParagraphStyle(
        "BodySmall",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )
    table_hdr_style = ParagraphStyle(
        "TableHdr",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
        alignment=1,
    )
    cell_style = ParagraphStyle(
        "CellSmall",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1e293b"),
    )
    cell_right = ParagraphStyle(
        "CellRight",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=2,  # Right
        textColor=colors.HexColor("#1e293b"),
    )
    cell_bold_right = ParagraphStyle(
        "CellBoldRight",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=2,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
    )

    story = []

    # Title & Subtitle
    story.append(Paragraph("TAX INVOICE", title_style))
    story.append(
        Paragraph(
            "(Issued under Section 31 of the Central Goods and Services Tax Act, 2017)",
            subtitle_style,
        )
    )
    story.append(Spacer(1, 12))

    # Invoice Meta & Seller/Buyer Grid
    # Left: Seller details; Right: Invoice metadata
    seller_html = f"""
    <b>{invoice.seller_name}</b><br/>
    {invoice.seller_address or ''}<br/>
    <b>GSTIN:</b> {invoice.seller_gstin}<br/>
    <b>State:</b> {invoice.seller_state} (Code: {invoice.seller_state_code or 'N/A'})<br/>
    <b>Phone:</b> {invoice.seller_phone or 'N/A'}
    """

    meta_html = f"""
    <b>Invoice No:</b> {invoice.invoice_number}<br/>
    <b>Invoice Date:</b> {invoice.invoice_date.strftime('%d-%b-%Y')}<br/>
    <b>Financial Year:</b> {invoice.financial_year}<br/>
    <b>Place of Supply:</b> {invoice.place_of_supply}<br/>
    <b>Supply Type:</b> {'Inter-State (IGST)' if invoice.is_inter_state else 'Intra-State (CGST + SGST)'}<br/>
    <b>Payment Status:</b> <font color="{'#16a34a' if invoice.payment_status == 'paid' else '#dc2626'}"><b>{invoice.payment_status.upper()}</b></font>
    """

    info_table_data = [
        [
            Paragraph("<b>DETAILS OF SUPPLIER</b>", header_style),
            Paragraph("<b>INVOICE METADATA</b>", header_style),
        ],
        [
            Paragraph(seller_html, body_style),
            Paragraph(meta_html, body_style),
        ],
    ]

    info_table = Table(info_table_data, colWidths=[270, 270])
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 8))

    # Buyer Details
    buyer_html = f"""
    <b>Name:</b> {invoice.buyer_name}<br/>
    <b>GSTIN:</b> {invoice.buyer_gstin or 'Unregistered / Consumer'}<br/>
    <b>State:</b> {invoice.buyer_state} (Code: {invoice.buyer_state_code or 'N/A'})<br/>
    <b>Address:</b> {invoice.buyer_address or 'Over-the-counter Walk-in'}
    """

    buyer_table_data = [
        [Paragraph("<b>DETAILS OF RECIPIENT / BILLED TO</b>", header_style)],
        [Paragraph(buyer_html, body_style)],
    ]
    buyer_table = Table(buyer_table_data, colWidths=[540])
    buyer_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(buyer_table)
    story.append(Spacer(1, 12))

    # Line Items Table
    if invoice.is_inter_state:
        # Columns: #, Item Description, HSN, Qty, Rate, Taxable, IGST %, IGST Amt, Total
        col_widths = [24, 150, 46, 40, 50, 60, 50, 55, 65]
        headers = [
            Paragraph("#", table_hdr_style),
            Paragraph("Item", table_hdr_style),
            Paragraph("HSN", table_hdr_style),
            Paragraph("Qty", table_hdr_style),
            Paragraph("Rate", table_hdr_style),
            Paragraph("Taxable", table_hdr_style),
            Paragraph("IGST %", table_hdr_style),
            Paragraph("IGST", table_hdr_style),
            Paragraph("Total (₹)", table_hdr_style),
        ]
        items_data = [headers]

        for idx, item in enumerate(invoice.items, start=1):
            items_data.append(
                [
                    Paragraph(str(idx), cell_style),
                    Paragraph(f"<b>{item.product_name}</b><br/>{item.product_sku}", cell_style),
                    Paragraph(item.hsn_code or "-", cell_style),
                    Paragraph(f"{item.quantity:.2f}", cell_right),
                    Paragraph(f"₹{item.unit_price:.2f}", cell_right),
                    Paragraph(f"₹{item.taxable_value:.2f}", cell_right),
                    Paragraph(f"{item.igst_rate:.1f}%", cell_right),
                    Paragraph(f"₹{item.igst_amount:.2f}", cell_right),
                    Paragraph(f"₹{item.total_amount:.2f}", cell_bold_right),
                ]
            )
    else:
        # Intra-state: CGST + SGST columns
        # Columns: #, Item Description, HSN, Qty, Rate, Taxable, CGST Amt, SGST Amt, Total
        col_widths = [20, 140, 45, 35, 50, 60, 60, 60, 70]
        headers = [
            Paragraph("#", table_hdr_style),
            Paragraph("Item", table_hdr_style),
            Paragraph("HSN", table_hdr_style),
            Paragraph("Qty", table_hdr_style),
            Paragraph("Rate", table_hdr_style),
            Paragraph("Taxable", table_hdr_style),
            Paragraph("CGST", table_hdr_style),
            Paragraph("SGST", table_hdr_style),
            Paragraph("Total (₹)", table_hdr_style),
        ]
        items_data = [headers]

        for idx, item in enumerate(invoice.items, start=1):
            items_data.append(
                [
                    Paragraph(str(idx), cell_style),
                    Paragraph(f"<b>{item.product_name}</b><br/>{item.product_sku}", cell_style),
                    Paragraph(item.hsn_code or "-", cell_style),
                    Paragraph(f"{item.quantity:.2f}", cell_right),
                    Paragraph(f"₹{item.unit_price:.2f}", cell_right),
                    Paragraph(f"₹{item.taxable_value:.2f}", cell_right),
                    Paragraph(f"₹{item.cgst_amount:.2f}<br/>({item.cgst_rate:.1f}%)", cell_right),
                    Paragraph(f"₹{item.sgst_amount:.2f}<br/>({item.sgst_rate:.1f}%)", cell_right),
                    Paragraph(f"₹{item.total_amount:.2f}", cell_bold_right),
                ]
            )

    items_table = Table(items_data, colWidths=col_widths)
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 10))

    # Summary Totals Table
    totals_data = [
        [Paragraph("Taxable Subtotal:", cell_bold_right), Paragraph(f"₹{invoice.subtotal:.2f}", cell_bold_right)],
    ]

    if invoice.is_inter_state:
        totals_data.append([Paragraph("Total IGST:", cell_bold_right), Paragraph(f"₹{invoice.igst_amount:.2f}", cell_bold_right)])
    else:
        totals_data.append([Paragraph("Total CGST:", cell_bold_right), Paragraph(f"₹{invoice.cgst_amount:.2f}", cell_bold_right)])
        totals_data.append([Paragraph("Total SGST:", cell_bold_right), Paragraph(f"₹{invoice.sgst_amount:.2f}", cell_bold_right)])

    totals_data.append([Paragraph("Total Tax Amount:", cell_bold_right), Paragraph(f"₹{invoice.total_tax:.2f}", cell_bold_right)])
    totals_data.append([Paragraph("<b>GRAND TOTAL (INR):</b>", header_style), Paragraph(f"<b>₹{invoice.grand_total:.2f}</b>", header_style)])

    totals_table = Table(totals_data, colWidths=[400, 140])
    totals_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f8fafc")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(totals_table)
    story.append(Spacer(1, 16))

    # Statutory Disclaimers and Signature Box
    footer_text = """
    <b>Terms & Conditions:</b><br/>
    1. Goods once sold will only be accepted in terms of company return/credit-note policy.<br/>
    2. Tax is payable on reverse charge basis: <b>No</b>.<br/>
    3. This is a computer-generated tax invoice generated pursuant to Section 31 of CGST Act.
    """
    sign_text = f"""
    For <b>{invoice.seller_name}</b><br/><br/><br/>
    <b>Authorized Signatory</b>
    """

    footer_data = [
        [Paragraph(footer_text, body_style), Paragraph(sign_text, cell_bold_right)]
    ]
    footer_table = Table(footer_data, colWidths=[360, 180])
    footer_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(footer_table)

    doc.build(story)
    buffer.seek(0)
    return buffer
