import io
from decimal import Decimal
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
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


def _number_to_indian_words(num_val: Decimal) -> str:
    """Converts a monetary decimal into Indian English currency words."""
    try:
        units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
                 "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
                 "Seventeen", "Eighteen", "Nineteen"]
        tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

        def two_digits(n: int) -> str:
            if n == 0:
                return ""
            if n < 20:
                return units[n]
            return tens[n // 10] + (" " + units[n % 10] if n % 10 != 0 else "")

        int_part = int(num_val)
        dec_part = int(round((num_val - int_part) * 100))

        if int_part == 0:
            words = "Zero"
        else:
            crore = int_part // 10000000
            int_part %= 10000000
            lakh = int_part // 100000
            int_part %= 100000
            thousand = int_part // 1000
            int_part %= 1000
            hundred = int_part // 100
            rem = int_part % 100

            parts = []
            if crore:
                parts.append(two_digits(crore) + " Crore")
            if lakh:
                parts.append(two_digits(lakh) + " Lakh")
            if thousand:
                parts.append(two_digits(thousand) + " Thousand")
            if hundred:
                parts.append(two_digits(hundred) + " Hundred")
            if rem:
                parts.append(two_digits(rem))
            words = " ".join(parts).strip()

        paisa_str = f" and {two_digits(dec_part)} Paise" if dec_part > 0 else ""
        return f"Rupees {words}{paisa_str} Only"
    except Exception:
        return f"INR {num_val:.2f}"


def generate_invoice_pdf(invoice: Invoice) -> io.BytesIO:
    """
    Generate an authoritative Indian GST Tax Invoice in standard A4 format as an in-memory PDF.
    Printable width: ~538pt on standard A4 page.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=28,
        leftMargin=28,
        topMargin=28,
        bottomMargin=28,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontSize=15,
        leading=18,
        alignment=0,
        textColor=colors.HexColor("#0f172a"),
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "InvoiceSubTitle",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#475569"),
    )
    badge_style = ParagraphStyle(
        "TaxBadge",
        parent=styles["Normal"],
        fontSize=12,
        leading=14,
        alignment=2,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0284c7"),
    )
    meta_label = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        alignment=2,
    )
    meta_val = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
        alignment=2,
    )
    party_hdr = ParagraphStyle(
        "PartyHdr",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
    )
    party_body = ParagraphStyle(
        "PartyBody",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )
    table_hdr = ParagraphStyle(
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
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1e293b"),
    )
    cell_right = ParagraphStyle(
        "CellRight",
        parent=styles["Normal"],
        fontSize=7.5,
        leading=9.5,
        alignment=2,
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
    legal_style = ParagraphStyle(
        "LegalText",
        parent=styles["Normal"],
        fontSize=7,
        leading=9.5,
        textColor=colors.HexColor("#64748b"),
    )

    story = []

    # 1. Header Box: Seller branding left, Tax Invoice metadata right
    inv_date_str = invoice.invoice_date.strftime("%d-%b-%Y") if hasattr(invoice.invoice_date, "strftime") else str(invoice.invoice_date)

    header_left = f"""
    <b>{invoice.seller_name}</b><br/>
    {invoice.seller_address or 'Kerala, India'}<br/>
    Phone: {invoice.seller_phone or '-'} • Email: {invoice.seller_phone or '-'}<br/>
    <b>GSTIN:</b> {invoice.seller_gstin or 'Unregistered'} • <b>State:</b> {invoice.seller_state} (Code: {invoice.seller_state_code or '32'})
    """

    header_right = f"""
    <b>TAX INVOICE</b><br/>
    Invoice No: <b>{invoice.invoice_number}</b><br/>
    Date: <b>{inv_date_str}</b><br/>
    Place of Supply: <b>{invoice.place_of_supply}</b><br/>
    Reverse Charge: <b>No</b>
    """

    header_table = Table(
        [
            [Paragraph(header_left, party_body), Paragraph(header_right, meta_val)]
        ],
        colWidths=[338, 200]
    )
    header_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e1"), spaceAfter=8, spaceBefore=4))

    # 2. Billed To / Recipient Box
    buyer_info = f"""
    <b>Billed To (Recipient):</b><br/>
    <b>{invoice.buyer_name or 'Walk-in Customer'}</b><br/>
    {f"Phone: {invoice.buyer_phone}<br/>" if invoice.buyer_phone else ""}
    {f"Address: {invoice.buyer_address}<br/>" if invoice.buyer_address else ""}
    State: {invoice.buyer_state} (Code: {invoice.buyer_state_code or '32'}) • GSTIN: {invoice.buyer_gstin or 'Unregistered'}
    """

    supply_info = f"""
    <b>Payment & Supply Details:</b><br/>
    Status: <b>{(invoice.payment_status or 'PAID').upper()}</b><br/>
    Method: <b>{(invoice.payment_method or 'CASH').upper()}</b><br/>
    Taxation: <b>{"Inter-State (IGST)" if invoice.is_inter_state else "Intra-State (CGST + SGST)"}</b><br/>
    Financial Year: <b>{invoice.financial_year}</b>
    """

    party_table = Table(
        [
            [Paragraph(buyer_info, party_body), Paragraph(supply_info, party_body)]
        ],
        colWidths=[338, 200]
    )
    party_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(party_table)
    story.append(Spacer(1, 8))

    # 3. Itemized GST Line Items Table (A4 printable width = 538pt)
    if invoice.is_inter_state:
        # Columns: S.No (24), Item Description (184), HSN (50), Qty (40), Rate (50), Taxable (60), IGST (65), Total (65) = 538
        col_widths = [24, 184, 50, 40, 50, 60, 65, 65]
        headers = [
            Paragraph("#", table_hdr),
            Paragraph("Item Description", table_hdr),
            Paragraph("HSN", table_hdr),
            Paragraph("Qty", table_hdr),
            Paragraph("Rate (₹)", table_hdr),
            Paragraph("Taxable (₹)", table_hdr),
            Paragraph("IGST", table_hdr),
            Paragraph("Total (₹)", table_hdr),
        ]
        items_data = [headers]

        for idx, item in enumerate(invoice.items, start=1):
            items_data.append([
                Paragraph(str(idx), cell_style),
                Paragraph(f"<b>{item.product_name}</b><br/>SKU: {item.product_sku}", cell_style),
                Paragraph(item.hsn_code or "-", cell_style),
                Paragraph(f"{item.quantity:.3f}", cell_right),
                Paragraph(f"{item.unit_price:.2f}", cell_right),
                Paragraph(f"{item.taxable_value:.2f}", cell_right),
                Paragraph(f"{item.igst_amount:.2f}<br/>({item.igst_rate:.1f}%)", cell_right),
                Paragraph(f"{item.total_amount:.2f}", cell_bold_right),
            ])
    else:
        # Intra-state: S.No (22), Item (156), HSN (45), Qty (35), Rate (50), Taxable (55), CGST (55), SGST (55), Total (65) = 538
        col_widths = [22, 156, 45, 35, 50, 55, 55, 55, 65]
        headers = [
            Paragraph("#", table_hdr),
            Paragraph("Item Description", table_hdr),
            Paragraph("HSN", table_hdr),
            Paragraph("Qty", table_hdr),
            Paragraph("Rate (₹)", table_hdr),
            Paragraph("Taxable (₹)", table_hdr),
            Paragraph("CGST", table_hdr),
            Paragraph("SGST", table_hdr),
            Paragraph("Total (₹)", table_hdr),
        ]
        items_data = [headers]

        for idx, item in enumerate(invoice.items, start=1):
            items_data.append([
                Paragraph(str(idx), cell_style),
                Paragraph(f"<b>{item.product_name}</b><br/>SKU: {item.product_sku}", cell_style),
                Paragraph(item.hsn_code or "-", cell_style),
                Paragraph(f"{item.quantity:.3f}", cell_right),
                Paragraph(f"{item.unit_price:.2f}", cell_right),
                Paragraph(f"{item.taxable_value:.2f}", cell_right),
                Paragraph(f"{item.cgst_amount:.2f}<br/>({item.cgst_rate:.1f}%)", cell_right),
                Paragraph(f"{item.sgst_amount:.2f}<br/>({item.sgst_rate:.1f}%)", cell_right),
                Paragraph(f"{item.total_amount:.2f}", cell_bold_right),
            ])

    items_table = Table(items_data, colWidths=col_widths)
    items_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    story.append(items_table)
    story.append(Spacer(1, 8))

    # 4. Summary & Words Section
    words_text = f"<b>Amount in Words:</b><br/>{_number_to_indian_words(invoice.grand_total)}"

    totals_data = [
        [Paragraph("Taxable Subtotal:", cell_bold_right), Paragraph(f"₹{invoice.subtotal:.2f}", cell_bold_right)],
    ]
    if invoice.is_inter_state:
        totals_data.append([Paragraph("Total IGST:", cell_bold_right), Paragraph(f"₹{invoice.igst_amount:.2f}", cell_bold_right)])
    else:
        totals_data.append([Paragraph("Total CGST:", cell_bold_right), Paragraph(f"₹{invoice.cgst_amount:.2f}", cell_bold_right)])
        totals_data.append([Paragraph("Total SGST:", cell_bold_right), Paragraph(f"₹{invoice.sgst_amount:.2f}", cell_bold_right)])

    totals_data.append([Paragraph("Total GST Tax:", cell_bold_right), Paragraph(f"₹{invoice.total_tax:.2f}", cell_bold_right)])
    totals_data.append([Paragraph("<b>GRAND TOTAL:</b>", cell_bold_right), Paragraph(f"<b>₹{invoice.grand_total:.2f}</b>", cell_bold_right)])

    totals_table = Table(totals_data, colWidths=[140, 100])
    totals_table.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f8fafc")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ])
    )

    summary_block = Table(
        [
            [Paragraph(words_text, legal_style), totals_table]
        ],
        colWidths=[298, 240]
    )
    summary_block.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ])
    )
    story.append(summary_block)
    story.append(Spacer(1, 10))

    if getattr(invoice, "emi_plan", None):
        plan = invoice.emi_plan
        emi_box_text = f"""
        <b>EMI FINANCING & REPAYMENT TERMS:</b> Financed Amount: <b>₹{plan.total_financed:.2f}</b> | Down Payment: <b>₹{plan.down_payment:.2f}</b> | Tenure: <b>{plan.number_of_installments} Months</b> | Monthly EMI: <b>₹{plan.installment_amount:.2f}</b> | Status: <b>{plan.status.upper()}</b>
        """
        emi_table = Table([[Paragraph(emi_box_text, legal_style)]], colWidths=[538])
        emi_table.setStyle(
            TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#0284c7")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f9ff")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ])
        )
        story.append(emi_table)
        story.append(Spacer(1, 8))

    # 5. Terms, UPI, and Authorized Signatory Stamp
    footer_text = f"""
    <b>Terms & Conditions:</b><br/>
    1. Goods once sold will be accepted under company return/credit-note policy only.<br/>
    2. Tax is payable on reverse charge basis: <b>No</b>.<br/>
    3. UPI ID for instant settlement: <b>7594012761@superyes</b>.<br/>
    4. This is a computer-generated Tax Invoice under Section 31 of CGST Act.
    """
    sign_text = f"""
    For <b>{invoice.seller_name}</b><br/><br/><br/>
    <b>Authorized Signatory</b>
    """

    footer_data = [
        [Paragraph(footer_text, legal_style), Paragraph(sign_text, cell_bold_right)]
    ]
    footer_table = Table(footer_data, colWidths=[360, 178])
    footer_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(footer_table)

    doc.build(story)
    buffer.seek(0)
    return buffer
