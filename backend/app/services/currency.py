import datetime
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, List, Tuple

PAISE = Decimal("0.01")
ZERO = Decimal("0.00")
ONE_HUNDRED = Decimal("100.00")
TWO = Decimal("2.00")
DEFAULT_GST_RATE = Decimal("18.00")

def to_decimal(val: Any, default: Decimal = ZERO) -> Decimal:
    """
    Safely convert an input to a rounded Decimal with 2 decimal places.
    Never constructs Decimal directly from binary float arithmetic representation.
    """
    if val is None:
        return default
    if isinstance(val, Decimal):
        return val.quantize(PAISE, rounding=ROUND_HALF_UP)
    if isinstance(val, (int, bool)):
        return Decimal(str(int(val))).quantize(PAISE, rounding=ROUND_HALF_UP)
    if isinstance(val, float):
        return Decimal(f"{val:.2f}").quantize(PAISE, rounding=ROUND_HALF_UP)
    if isinstance(val, str):
        cleaned = val.strip().replace(",", "")
        if not cleaned:
            return default
        try:
            return Decimal(cleaned).quantize(PAISE, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            return default
    try:
        return Decimal(str(val)).quantize(PAISE, rounding=ROUND_HALF_UP)
    except Exception:
        return default

def round_currency(val: Decimal) -> Decimal:
    """Round a Decimal amount to 2 decimal places using ROUND_HALF_UP."""
    if not isinstance(val, Decimal):
        val = to_decimal(val)
    return val.quantize(PAISE, rounding=ROUND_HALF_UP)

def split_gst(total_amount: Decimal, gst_rate: Decimal = DEFAULT_GST_RATE) -> Tuple[Decimal, Decimal, Decimal]:
    """
    Calculates 18% inclusive GST breakdown:
    - Base Amount = Total / (1 + Rate / 100)
    - Total Tax = Total - Base Amount
    - CGST = Total Tax / 2 (rounded to paisa)
    - SGST = Total Tax - CGST (guarantees exact sum match)
    
    Invariant guaranteed: base_amount + cgst + sgst == total_amount
    """
    total = to_decimal(total_amount)
    rate = to_decimal(gst_rate, default=DEFAULT_GST_RATE)
    
    divisor = Decimal("1.00") + (rate / ONE_HUNDRED)
    base_amount = (total / divisor).quantize(PAISE, rounding=ROUND_HALF_UP)
    total_tax = total - base_amount
    cgst = (total_tax / TWO).quantize(PAISE, rounding=ROUND_HALF_UP)
    sgst = total_tax - cgst
    
    assert base_amount + cgst + sgst == total, "GST components must exactly equal total amount"
    return base_amount, cgst, sgst

def distribute_amount(total: Decimal, count: int) -> List[Decimal]:
    """
    Distribute total into count instalments rounded to nearest paisa,
    allocating any rounding remainder to the first instalment so that
    sum(parts) == total exactly.
    """
    if count <= 0:
        return []
    total_dec = to_decimal(total)
    base = (total_dec / Decimal(count)).quantize(PAISE, rounding=ROUND_HALF_UP)
    parts = [base] * count
    remainder = total_dec - sum(parts)
    if remainder != ZERO:
        parts[0] += remainder
    assert sum(parts) == total_dec, "Sum of distributed instalments must equal total"
    return parts

