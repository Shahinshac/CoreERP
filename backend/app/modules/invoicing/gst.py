from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict

from app.core.money import parse_decimal, quantize_money

# State code mapping for standard Indian GST states and union territories
INDIAN_STATES_BY_CODE = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
}

CODE_BY_STATE_NAME = {v.lower(): k for k, v in INDIAN_STATES_BY_CODE.items()}


def normalize_state(state: str | None) -> str:
    """Normalize state representation for comparison."""
    if not state:
        return ""
    clean = state.strip().lower()
    # Check if it's already a 2-digit code
    if clean in INDIAN_STATES_BY_CODE:
        return INDIAN_STATES_BY_CODE[clean].lower()
    return clean


def compute_gst(
    seller_state: str,
    buyer_state: str | None,
    taxable_value: Decimal | str | float | int,
    gst_rate: Decimal | str | float | int,
) -> Dict[str, Any]:
    """
    Pure authoritative Indian GST computation function.
    Single source of truth across POS, invoicing, and reporting.

    Rules:
    - Intra-State (seller_state == buyer_state or walk-in buyer without registered address):
      CGST = gst_rate / 2
      SGST = gst_rate / 2
      IGST = 0
    - Inter-State (seller_state != buyer_state):
      IGST = gst_rate
      CGST = 0
      SGST = 0

    Returns dictionary with:
      is_inter_state: bool
      cgst_rate: Decimal
      cgst: Decimal (amount)
      sgst_rate: Decimal
      sgst: Decimal (amount)
      igst_rate: Decimal
      igst: Decimal (amount)
      total_tax: Decimal
    """
    taxable = quantize_money(taxable_value, field_name="Taxable value")
    rate = quantize_money(gst_rate, field_name="GST rate")

    norm_seller = normalize_state(seller_state)
    norm_buyer = normalize_state(buyer_state)

    # If buyer state is unspecified/empty, under Section 10(1)(c) of IGST Act 2017,
    # over-the-counter counter sales take seller's state as place of supply.
    is_inter_state = bool(norm_buyer and norm_buyer != norm_seller)

    if is_inter_state:
        # 100% IGST
        cgst_rate = Decimal("0.00")
        cgst_amount = Decimal("0.00")
        sgst_rate = Decimal("0.00")
        sgst_amount = Decimal("0.00")
        igst_rate = rate
        igst_amount = quantize_money(taxable * (rate / Decimal("100")))
        total_tax = igst_amount
    else:
        # Split 50-50 into CGST and SGST
        half_rate = quantize_money(rate / Decimal("2"))
        cgst_rate = half_rate
        sgst_rate = half_rate
        igst_rate = Decimal("0.00")
        igst_amount = Decimal("0.00")

        # Calculate each component with HALF_UP rounding
        cgst_amount = quantize_money(taxable * (rate / Decimal("200")))
        sgst_amount = quantize_money(taxable * (rate / Decimal("200")))
        total_tax = quantize_money(cgst_amount + sgst_amount)

    return {
        "is_inter_state": is_inter_state,
        "cgst_rate": cgst_rate,
        "cgst": cgst_amount,
        "cgst_amount": cgst_amount,
        "sgst_rate": sgst_rate,
        "sgst": sgst_amount,
        "sgst_amount": sgst_amount,
        "igst_rate": igst_rate,
        "igst": igst_amount,
        "igst_amount": igst_amount,
        "total_tax": total_tax,
    }


def get_financial_year(dt: date | datetime | None = None) -> str:
    """
    Returns Indian Financial Year string (April 1 to March 31).
    Example: 2026-09-22 -> '2026-27'
             2027-02-15 -> '2026-27'
    """
    if dt is None:
        dt = date.today()
    elif isinstance(dt, datetime):
        dt = dt.date()

    if dt.month >= 4:
        start_year = dt.year
        end_year = (dt.year + 1) % 100
        return f"{start_year}-{end_year:02d}"
    else:
        start_year = dt.year - 1
        end_year = dt.year % 100
        return f"{start_year}-{end_year:02d}"
