from app.ocr import OcrLine, grouped_rows
from app.receipt_parser import parse_rule_candidate


def line(identifier, text, y, score=0.95):
    return OcrLine(
        identifier,
        text,
        [[0, y], [200, y], [200, y + 10], [0, y + 10]],
        score,
    )


def test_parser_extracts_receipt_fields_and_explicit_item_quantity():
    rows = grouped_rows(
        [
            line("l1", "TOKO BERKAH", 0),
            line("l2", "Tanggal 25/11/2026", 20, 0.9),
            line("l3", "BERAS 2 x 12.500 25.000", 40, 0.88),
            line("l4", "GRAND TOTAL Rp 25.000", 60, 0.99),
        ]
    )

    candidate = parse_rule_candidate(rows, "IDR")

    assert candidate["merchant"] == "TOKO BERKAH"
    assert candidate["merchant_line_ids"] == ["l1"]
    assert candidate["purchased_on"] == "2026-11-25"
    assert candidate["date_line_ids"] == ["l2"]
    assert candidate["total_minor"] == 25000
    assert candidate["total_line_ids"] == ["l4"]
    assert candidate["items"] == [
        {
            "name": "BERAS",
            "qty_milli": 2000,
            "unit_price_minor": 12500,
            "amount_minor": 25000,
            "line_ids": ["l3"],
            "confidence": 0.88,
        }
    ]
    assert candidate["issues"] == []


def test_parser_flags_missing_fields_and_total_mismatch():
    rows = grouped_rows(
        [
            line("l1", "ROTI 10.000", 0),
            line("l2", "TOTAL 12.000", 20),
        ]
    )

    candidate = parse_rule_candidate(rows, "IDR")

    assert candidate["merchant"] is None
    assert candidate["purchased_on"] is None
    assert candidate["issues"] == [
        "MERCHANT_MISSING",
        "DATE_MISSING",
        "TOTAL_MISMATCH",
    ]


def test_parser_marks_missing_items_for_manual_entry():
    candidate = parse_rule_candidate([], "IDR")

    assert candidate["issues"] == [
        "MERCHANT_MISSING",
        "DATE_MISSING",
        "EXTRACTION_FAILED",
        "ITEMS_NOT_DETECTED",
    ]


def test_parser_handles_multiline_items_payment_lines_and_numbered_merchant():
    rows = grouped_rows(
        [
            line("l1", "INDOMARET 24", 0, 0.96),
            line("l2", "25.11.2026 14:30", 20, 0.92),
            line("l3", "INDOMIE GORENG", 40, 0.91),
            line("l4", "2 x 3.100  6.200", 60, 0.90),
            line("l5", "AIR MINERAL 600ML 4.000", 80, 0.93),
            line("l6", "TOTAL ITEM 2", 100, 0.95),
            line("l7", "SUB TOTAL 10.200", 120, 0.95),
            line("l8", "TOTAL BELANJA Rp 10.200", 140, 0.98),
            line("l9", "TUNAI 20.000", 160, 0.97),
            line("l10", "KEMBALIAN 9.800", 180, 0.97),
        ]
    )

    candidate = parse_rule_candidate(rows, "IDR")

    assert candidate["merchant"] == "INDOMARET 24"
    assert candidate["purchased_on"] == "2026-11-25"
    assert candidate["total_minor"] == 10200
    assert candidate["total_line_ids"] == ["l8"]
    assert len(candidate["items"]) == 2
    assert candidate["items"][0] == {
        "name": "INDOMIE GORENG",
        "qty_milli": 2000,
        "unit_price_minor": 3100,
        "amount_minor": 6200,
        "line_ids": ["l3", "l4"],
        "confidence": 0.905,
    }
    assert candidate["items"][1]["name"] == "AIR MINERAL 600ML"
    assert candidate["items"][1]["amount_minor"] == 4000
    assert candidate["issues"] == []


def test_parser_accounts_for_tax_and_service_without_false_total_mismatch():
    rows = grouped_rows(
        [
            line("l1", "KOPI KENANGAN", 0),
            line("l2", "2026-11-25", 20),
            line("l3", "ES KOPI SUSU 20.000", 40),
            line("l4", "SUBTOTAL 20.000", 60),
            line("l5", "PB1 10% 2.000", 80),
            line("l6", "SERVICE CHARGE 1.000", 100),
            line("l7", "GRAND TOTAL 23.000", 120),
        ]
    )

    candidate = parse_rule_candidate(rows, "IDR")

    assert candidate["total_minor"] == 23000
    assert len(candidate["items"]) == 1
    assert candidate["issues"] == []
