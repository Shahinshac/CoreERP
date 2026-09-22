from decimal import Decimal
import pytest
from app.core.money import quantize_money, quantize_quantity, parse_decimal


def test_quantize_money_round_half_up():
    """
    Test quantize_money produces exact 2 decimal places with ROUND_HALF_UP.
    """
    assert quantize_money(Decimal("10.005")) == Decimal("10.01")
    assert quantize_money(Decimal("10.004")) == Decimal("10.00")
    assert quantize_money(Decimal("10.005001")) == Decimal("10.01")
    assert quantize_money("125.555") == Decimal("125.56")
    assert quantize_money(100) == Decimal("100.00")
    assert str(quantize_money("42.1")) == "42.10"


def test_quantize_quantity_round_half_up():
    """
    Test quantize_quantity produces exact 3 decimal places with ROUND_HALF_UP.
    """
    assert quantize_quantity(Decimal("1.1235")) == Decimal("1.124")
    assert quantize_quantity(Decimal("1.1234")) == Decimal("1.123")
    assert quantize_quantity("50.5") == Decimal("50.500")
    assert quantize_quantity(10) == Decimal("10.000")


def test_money_helpers_reject_floats():
    """
    Test that float inputs are strictly prohibited to avoid precision hazards.
    """
    with pytest.raises(TypeError, match="must not be a float"):
        quantize_money(10.55)

    with pytest.raises(TypeError, match="must not be a float"):
        quantize_quantity(1.234)

    with pytest.raises(TypeError, match="must not be a float"):
        parse_decimal(19.99)


def test_money_helpers_reject_nan_and_infinity():
    """
    Test that NaN and +/-Infinity are strictly rejected.
    """
    for invalid in ["NaN", "sNaN", "Infinity", "-Infinity", "+inf", "-inf"]:
        with pytest.raises(ValueError):
            parse_decimal(Decimal(invalid))

        with pytest.raises(ValueError):
            quantize_money(invalid)


def test_money_helpers_negative_handling():
    """
    Test that negative amounts are rejected by default unless allow_negative=True.
    """
    with pytest.raises(ValueError, match="cannot be negative"):
        quantize_money(Decimal("-5.00"))

    with pytest.raises(ValueError, match="cannot be negative"):
        quantize_quantity("-0.001")

    # Allowed when explicitly specified
    assert quantize_money("-12.345", allow_negative=True) == Decimal("-12.35")
    assert quantize_quantity(Decimal("-5.6784"), allow_negative=True) == Decimal("-5.678")
