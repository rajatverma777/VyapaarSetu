import pytest
from decimal import Decimal
from app.core.finance.tax_calculator import GSTCalculator, to_decimal, round_currency

def test_single_item_intra_state_gst():
    # Intra-state: 18% GST -> 9% CGST, 9% SGST
    result = GSTCalculator.calculate_line_item(
        rate=100.0,
        quantity=2.0,
        gst_rate=18.0,
        is_igst=False
    )
    assert result["gross_amount"] == 200.0
    assert result["taxable_amount"] == 200.0
    assert result["cgst_rate"] == 9.0
    assert result["sgst_rate"] == 9.0
    assert result["igst_rate"] == 0.0
    assert result["cgst_amount"] == 18.0
    assert result["sgst_amount"] == 18.0
    assert result["igst_amount"] == 0.0
    assert result["total_tax"] == 36.0
    assert result["total_amount"] == 236.0

def test_single_item_inter_state_igst():
    # Inter-state: 18% IGST -> 0 CGST, 0 SGST, 18% IGST
    result = GSTCalculator.calculate_line_item(
        rate=100.0,
        quantity=2.0,
        gst_rate=18.0,
        is_igst=True
    )
    assert result["gross_amount"] == 200.0
    assert result["taxable_amount"] == 200.0
    assert result["cgst_amount"] == 0.0
    assert result["sgst_amount"] == 0.0
    assert result["igst_rate"] == 18.0
    assert result["igst_amount"] == 36.0
    assert result["total_tax"] == 36.0
    assert result["total_amount"] == 236.0

def test_item_discount_before_tax():
    # Rate 500, Qty 1, Discount 10% -> Gross 500, Disc 50, Taxable 450
    # GST 12% on 450 -> CGST 27, SGST 27, Total 504
    result = GSTCalculator.calculate_line_item(
        rate=500.0,
        quantity=1.0,
        discount_percent=10.0,
        gst_rate=12.0,
        is_igst=False
    )
    assert result["gross_amount"] == 500.0
    assert result["discount_amount"] == 50.0
    assert result["taxable_amount"] == 450.0
    assert result["cgst_amount"] == 27.0
    assert result["sgst_amount"] == 27.0
    assert result["total_amount"] == 504.0

def test_one_cent_rounding_precision():
    # Fractional paise: Rate 105.55, Qty 1, 5% GST (2.5% CGST, 2.5% SGST)
    # 105.55 * 0.025 = 2.63875 -> rounds to 2.64
    result = GSTCalculator.calculate_line_item(
        rate="105.55",
        quantity="1.0",
        gst_rate="5.0",
        is_igst=False
    )
    assert result["taxable_amount"] == 105.55
    assert result["cgst_amount"] == 2.64
    assert result["sgst_amount"] == 2.64
    assert result["total_tax"] == 5.28
    assert result["total_amount"] == 110.83

def test_mixed_gst_rates_invoice():
    items = [
        {"rate": 100.0, "quantity": 1, "gst_rate": 0.0},    # Tax 0
        {"rate": 200.0, "quantity": 1, "gst_rate": 5.0},    # Tax 10 (5+5)
        {"rate": 300.0, "quantity": 1, "gst_rate": 12.0},   # Tax 36 (18+18)
        {"rate": 400.0, "quantity": 1, "gst_rate": 18.0},   # Tax 72 (36+36)
        {"rate": 500.0, "quantity": 1, "gst_rate": 28.0},   # Tax 140 (70+70)
    ]
    inv = GSTCalculator.calculate_invoice(items, is_igst=False)
    assert inv["subtotal"] == 1500.0
    assert inv["total_taxable"] == 1500.0
    assert inv["total_cgst"] == 129.0
    assert inv["total_sgst"] == 129.0
    assert inv["total_tax"] == 258.0
    assert inv["total_amount"] == 1758.0

def test_partial_payment_and_balance():
    items = [{"rate": 1000.0, "quantity": 1, "gst_rate": 18.0}]
    inv = GSTCalculator.calculate_invoice(items, paid_amount=500.0)
    assert inv["total_amount"] == 1180.0
    assert inv["paid_amount"] == 500.0
    assert inv["balance_amount"] == 680.0

def test_round_off_flag():
    # Total with tax = 100 + 18.55 = 118.55 -> rounds to 119.0 with round_off = 0.45
    items = [{"rate": "100.0", "quantity": "1", "gst_rate": "18.55"}]
    inv = GSTCalculator.calculate_invoice(items, is_igst=True, enable_round_off=True)
    assert inv["total_amount"] == 119.0
    assert inv["round_off"] == 0.45
