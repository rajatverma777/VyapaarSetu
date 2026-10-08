from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel

TWO_PLACES = Decimal("0.01")

def to_decimal(val: Any) -> Decimal:
    """Convert input to Decimal safely, handling None, int, float, string."""
    if val is None:
        return Decimal("0.00")
    if isinstance(val, Decimal):
        return val
    try:
        # String conversion preserves exact textual representation without float binary drift
        return Decimal(str(val).strip())
    except Exception:
        return Decimal("0.00")

def round_currency(val: Decimal) -> Decimal:
    """Round to 2 decimal places using standard ROUND_HALF_UP (bank/commercial standard)."""
    return val.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

class LineItemCalcResult(BaseModel):
    rate: float
    quantity: float
    gross_amount: float
    discount_percent: float
    discount_amount: float
    taxable_amount: float
    gst_rate: float
    cgst_rate: float
    sgst_rate: float
    igst_rate: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total_tax: float
    total_amount: float

class InvoiceCalcResult(BaseModel):
    subtotal: float
    total_taxable: float
    discount_percent: float
    discount_amount: float
    total_cgst: float
    total_sgst: float
    total_igst: float
    total_tax: float
    round_off: float
    total_amount: float
    paid_amount: float
    balance_amount: float
    items: List[Dict[str, Any]]

class GSTCalculator:
    """Deterministic, Decimal-safe calculation engine for Indian GST compliance."""

    @staticmethod
    def calculate_line_item(
        rate: Union[Decimal, float, str, int],
        quantity: Union[Decimal, float, str, int],
        gst_rate: Union[Decimal, float, str, int] = 0,
        discount_percent: Union[Decimal, float, str, int] = 0,
        discount_amount: Union[Decimal, float, str, int] = 0,
        is_igst: bool = False
    ) -> Dict[str, Any]:
        d_rate = to_decimal(rate)
        d_qty = to_decimal(quantity)
        d_gst_rate = to_decimal(gst_rate)
        d_disc_pct = to_decimal(discount_percent)
        d_disc_amt = to_decimal(discount_amount)

        # Gross amount = rate * quantity
        d_gross = round_currency(d_rate * d_qty)

        # Item-level discount
        if d_disc_pct > 0:
            calc_disc = round_currency(d_gross * (d_disc_pct / Decimal("100.0")))
            d_disc_amt = max(d_disc_amt, calc_disc)

        d_disc_amt = min(d_gross, d_disc_amt)
        d_taxable = round_currency(d_gross - d_disc_amt)

        if is_igst:
            d_igst_rate = d_gst_rate
            d_cgst_rate = Decimal("0.00")
            d_sgst_rate = Decimal("0.00")
            d_igst_amt = round_currency(d_taxable * (d_igst_rate / Decimal("100.0")))
            d_cgst_amt = Decimal("0.00")
            d_sgst_amt = Decimal("0.00")
        else:
            d_igst_rate = Decimal("0.00")
            d_cgst_rate = d_gst_rate / Decimal("2.0")
            d_sgst_rate = d_gst_rate / Decimal("2.0")
            d_igst_amt = Decimal("0.00")
            d_cgst_amt = round_currency(d_taxable * (d_cgst_rate / Decimal("100.0")))
            d_sgst_amt = round_currency(d_taxable * (d_sgst_rate / Decimal("100.0")))

        d_total_tax = d_cgst_amt + d_sgst_amt + d_igst_amt
        d_total_amount = d_taxable + d_total_tax

        return {
            "rate": float(d_rate),
            "quantity": float(d_qty),
            "gross_amount": float(d_gross),
            "discount_percent": float(d_disc_pct),
            "discount_amount": float(d_disc_amt),
            "taxable_amount": float(d_taxable),
            "gst_rate": float(d_gst_rate),
            "cgst_rate": float(d_cgst_rate),
            "sgst_rate": float(d_sgst_rate),
            "igst_rate": float(d_igst_rate),
            "cgst_amount": float(d_cgst_amt),
            "sgst_amount": float(d_sgst_amt),
            "igst_amount": float(d_igst_amt),
            "total_tax": float(d_total_tax),
            "total_amount": float(d_total_amount),
        }

    @classmethod
    def calculate_invoice(
        cls,
        items: List[Dict[str, Any]],
        is_igst: bool = False,
        discount_percent: Union[Decimal, float, str, int] = 0,
        discount_amount: Union[Decimal, float, str, int] = 0,
        paid_amount: Union[Decimal, float, str, int] = 0,
        enable_round_off: bool = False
    ) -> Dict[str, Any]:
        """Calculate complete invoice summary and item breakdown."""
        calculated_items = []
        d_subtotal = Decimal("0.00")
        d_total_taxable = Decimal("0.00")
        d_total_cgst = Decimal("0.00")
        d_total_sgst = Decimal("0.00")
        d_total_igst = Decimal("0.00")

        for item in items:
            rate = item.get("rate", item.get("purchase_price", item.get("selling_price", 0)))
            qty = item.get("quantity", item.get("qty", 1))
            gst_rate = item.get("gst_rate", 0)
            disc_pct = item.get("discount_percent", 0)
            disc_amt = item.get("discount_amount", 0)

            res = cls.calculate_line_item(
                rate=rate,
                quantity=qty,
                gst_rate=gst_rate,
                discount_percent=disc_pct,
                discount_amount=disc_amt,
                is_igst=is_igst
            )

            # Preserve all original item metadata
            enriched = dict(item)
            enriched.update(res)
            calculated_items.append(enriched)

            d_subtotal += to_decimal(res["gross_amount"])
            d_total_taxable += to_decimal(res["taxable_amount"])
            d_total_cgst += to_decimal(res["cgst_amount"])
            d_total_sgst += to_decimal(res["sgst_amount"])
            d_total_igst += to_decimal(res["igst_amount"])

        # Invoice-level discount applied to taxable amount
        d_inv_disc_pct = to_decimal(discount_percent)
        d_inv_disc_amt = to_decimal(discount_amount)
        if d_inv_disc_pct > 0:
            calc_inv_disc = round_currency(d_total_taxable * (d_inv_disc_pct / Decimal("100.0")))
            d_inv_disc_amt = max(d_inv_disc_amt, calc_inv_disc)

        d_final_taxable = max(Decimal("0.00"), d_total_taxable - d_inv_disc_amt)
        d_total_tax = d_total_cgst + d_total_sgst + d_total_igst
        d_raw_total = d_final_taxable + d_total_tax

        # Round-off calculation (Indian rupee standard rounding to nearest integer)
        d_round_off = Decimal("0.00")
        if enable_round_off:
            rounded_total = d_raw_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            d_round_off = rounded_total - d_raw_total
            d_final_total = rounded_total
        else:
            d_final_total = round_currency(d_raw_total)

        d_paid = to_decimal(paid_amount)
        d_balance = round_currency(d_final_total - d_paid)

        return {
            "subtotal": float(d_subtotal),
            "total_taxable": float(d_final_taxable),
            "discount_percent": float(d_inv_disc_pct),
            "discount_amount": float(d_inv_disc_amt),
            "total_cgst": float(d_total_cgst),
            "total_sgst": float(d_total_sgst),
            "total_igst": float(d_total_igst),
            "total_tax": float(d_total_tax),
            "round_off": float(d_round_off),
            "total_amount": float(d_final_total),
            "paid_amount": float(d_paid),
            "balance_amount": float(d_balance),
            "items": calculated_items
        }
