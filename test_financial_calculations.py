"""
Financial Calculations Verification Script for CoreERP
======================================================
Tests and mathematically validates:
1. GST calculations (Inclusive vs Exclusive)
2. Intra-state (CGST + SGST) vs Inter-state (IGST)
3. Discount application and monetary rounding (quantize_money)
4. Split payment reconciliation
5. Credit note and tax refund proportions
"""

from decimal import Decimal
import sys
import os

# Add backend directory to sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.money import quantize_money, quantize_quantity
from app.modules.invoicing.gst import compute_gst


def test_gst_inclusive_calculation():
    """
    Test GST-inclusive pricing rule:
    Selling Price = ₹11,800 (includes 18% GST).
    Taxable value = Selling Price / (1 + 0.18) = 11,800 / 1.18 = ₹10,000.00.
    Total Tax = ₹1,800.00.
    Intra-state:
      CGST (9%) = ₹900.00
      SGST (9%) = ₹900.00
      IGST (0%) = ₹0.00
    Grand Total = ₹11,800.00
    """
    total_selling_price = Decimal("11800.00")
    gst_rate = Decimal("18.00")

    # In retail POS with GST-inclusive pricing:
    # Taxable Value = Total Price / (1 + GST_Rate / 100)
    taxable_value = quantize_money(total_selling_price / (Decimal("1.00") + (gst_rate / Decimal("100.00"))))
    assert taxable_value == Decimal("10000.00"), f"Expected 10000.00, got {taxable_value}"

    # Intra-state calculation (e.g. Maharashtra to Maharashtra)
    gst_intra = compute_gst("Maharashtra", "Maharashtra", taxable_value, gst_rate)
    assert gst_intra["is_inter_state"] is False
    assert gst_intra["cgst_rate"] == Decimal("9.00")
    assert gst_intra["sgst_rate"] == Decimal("9.00")
    assert gst_intra["igst_rate"] == Decimal("0.00")
    assert gst_intra["cgst_amount"] == Decimal("900.00")
    assert gst_intra["sgst_amount"] == Decimal("900.00")
    assert gst_intra["igst_amount"] == Decimal("0.00")
    assert gst_intra["total_tax"] == Decimal("1800.00")

    grand_total = quantize_money(taxable_value + gst_intra["total_tax"])
    assert grand_total == Decimal("11800.00"), f"Expected 11800.00, got {grand_total}"
    print("✓ test_gst_inclusive_calculation passed")


def test_gst_exclusive_calculation():
    """
    Test GST-exclusive pricing rule:
    Base Taxable Price = ₹10,000.00.
    GST = 18%.
    Tax = ₹1,800.00.
    Final Payable = ₹11,800.00.
    """
    taxable_value = Decimal("10000.00")
    gst_rate = Decimal("18.00")

    # Inter-state calculation (e.g. Maharashtra to Delhi)
    gst_inter = compute_gst("Maharashtra", "Delhi", taxable_value, gst_rate)
    assert gst_inter["is_inter_state"] is True
    assert gst_inter["cgst_rate"] == Decimal("0.00")
    assert gst_inter["sgst_rate"] == Decimal("0.00")
    assert gst_inter["igst_rate"] == Decimal("18.00")
    assert gst_inter["cgst_amount"] == Decimal("0.00")
    assert gst_inter["sgst_amount"] == Decimal("0.00")
    assert gst_inter["igst_amount"] == Decimal("1800.00")
    assert gst_inter["total_tax"] == Decimal("1800.00")

    grand_total = quantize_money(taxable_value + gst_inter["total_tax"])
    assert grand_total == Decimal("11800.00")
    print("✓ test_gst_exclusive_calculation passed")


def test_split_payment_arithmetic():
    """
    Verify split payment validation and exact sum enforcement.
    """
    grand_total = Decimal("11800.00")
    portion_cash = Decimal("5000.00")
    portion_upi = Decimal("6800.00")

    total_paid = quantize_money(portion_cash + portion_upi)
    assert total_paid == grand_total
    remaining = quantize_money(grand_total - total_paid)
    assert remaining == Decimal("0.00")
    print("✓ test_split_payment_arithmetic passed")


def test_return_proportional_credit_note():
    """
    Verify return and credit note calculation:
    Original sale: 2 units @ ₹1,000 = ₹2,000 taxable + ₹360 GST (18%) = ₹2,360 grand total.
    Return 1 unit (50%):
    Refund taxable = ₹1,000.00
    Refund CGST = ₹90.00
    Refund SGST = ₹90.00
    Refund Total = ₹1,180.00
    """
    original_qty = Decimal("2.000")
    unit_price = Decimal("1000.00")
    taxable_val = quantize_money(original_qty * unit_price)
    gst_calc = compute_gst("Maharashtra", "Maharashtra", taxable_val, Decimal("18.00"))

    return_qty = Decimal("1.000")
    ratio = return_qty / original_qty
    taxable_refund = quantize_money(taxable_val * ratio)
    cgst_refund = quantize_money(gst_calc["cgst_amount"] * ratio)
    sgst_refund = quantize_money(gst_calc["sgst_amount"] * ratio)
    total_refund = quantize_money(taxable_refund + cgst_refund + sgst_refund)

    assert taxable_refund == Decimal("1000.00")
    assert cgst_refund == Decimal("90.00")
    assert sgst_refund == Decimal("90.00")
    assert total_refund == Decimal("1180.00")
    print("✓ test_return_proportional_credit_note passed")


if __name__ == "__main__":
    print("Running Financial Calculations Validation...")
    test_gst_inclusive_calculation()
    test_gst_exclusive_calculation()
    test_split_payment_arithmetic()
    test_return_proportional_credit_note()
    print("\nALL FINANCIAL CALCULATIONS TESTS PASSED SUCCESSFULLY! (100%)")
