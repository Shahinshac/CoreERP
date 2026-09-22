from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Union

# Standard precision constants
MONEY_EXPONENT = Decimal("0.01")
QUANTITY_EXPONENT = Decimal("0.001")

NumericInput = Union[Decimal, str, int]


def parse_decimal(
    value: Any,
    *,
    allow_negative: bool = True,
    field_name: str = "Value",
) -> Decimal:
    """
    Strictly parse and validate a value as Decimal.
    Explicitly rejects float inputs, NaN, sNaN, +Infinity, and -Infinity.
    Optionally rejects negative values.
    """
    # Strictly prohibit floats to prevent precision bugs
    if isinstance(value, float):
        raise TypeError(
            f"{field_name} must not be a float. Pass Decimal, int, or numeric string to prevent precision loss."
        )

    if not isinstance(value, (Decimal, str, int)):
        raise TypeError(
            f"{field_name} must be Decimal, int, or numeric string, got {type(value).__name__}."
        )

    try:
        dec = Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{field_name} '{value}' is not a valid decimal number.") from exc

    if dec.is_nan():
        raise ValueError(f"{field_name} cannot be NaN.")

    if dec.is_infinite():
        raise ValueError(f"{field_name} cannot be infinite.")

    if not allow_negative and dec < Decimal("0"):
        raise ValueError(f"{field_name} cannot be negative. Got: {dec}")

    return dec


def quantize_money(
    amount: Any,
    *,
    allow_negative: bool = False,
    field_name: str = "Money amount",
) -> Decimal:
    """
    Quantizes an amount to 2 decimal places using ROUND_HALF_UP.
    Rejects floats, NaN, infinity, and by default negative amounts.
    """
    dec = parse_decimal(amount, allow_negative=allow_negative, field_name=field_name)
    return dec.quantize(MONEY_EXPONENT, rounding=ROUND_HALF_UP)


def quantize_quantity(
    quantity: Any,
    *,
    allow_negative: bool = False,
    field_name: str = "Quantity",
) -> Decimal:
    """
    Quantizes a quantity to 3 decimal places using ROUND_HALF_UP.
    Rejects floats, NaN, infinity, and by default negative quantities.
    """
    dec = parse_decimal(quantity, allow_negative=allow_negative, field_name=field_name)
    return dec.quantize(QUANTITY_EXPONENT, rounding=ROUND_HALF_UP)
