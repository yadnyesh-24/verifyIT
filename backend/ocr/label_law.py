"""Legal Metrology label-law checks.

Eight rules derived from Rule 6 of the Legal Metrology (Packaged
Commodities) Rules, 2011. Every rule is a pure function: takes a
``fields`` dict, returns ``None`` (pass) or a flag dict matching
Aditya's contract:

    {
      "code": "MAKER_NAME_MISSING",
      "severity": "high",
      "en": "...",
      "hi": "...",
      "evidence": {"field": "...", "value": "..."},
    }

The top-level :func:`label_law_check` runs every rule and returns the
frozen Check schema from ``backend.providers``:

    {
      "id": "label_law",
      "status": "pass" | "warn" | "fail" | "not_checked",
      "flags": [<flag...>, ...]
    }

See ``docs/label_rules.md`` for the rule text and the Rule 6 references.
"""

from __future__ import annotations

import re
from typing import Any

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _val(fields: dict[str, Any], key: str) -> str | None:
    v = (fields.get(key) or {}).get("value")
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return None


def _has(fields: dict[str, Any], key: str) -> bool:
    return _val(fields, key) is not None


def _flag(
    code: str,
    severity: str,
    en: str,
    hi: str,
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "code": code,
        "severity": severity,
        "en": en,
        "hi": hi,
        "evidence": evidence,
    }
    return out


def _empty_check(check_id: str) -> dict[str, Any]:
    """Status the frontend renders as 'Verification pending'."""
    return {"id": check_id, "status": "not_checked", "flags": []}


# Common Hindi (Devanagari) messages — short, neutral, shopper-friendly.
# Source strings the team can edit later; the meaning is intentionally
# idiomatic rather than a literal translation.
_HI_MESSAGES = {
    "MAKER_NAME_MISSING": "पैकेज पर निर्माता / पैकर / आयातक का नाम लिखा होना चाहिए।",
    "ADDRESS_MISSING": "पैकेज पर निर्माता / पैकर / आयातक का पूरा पता और पिनकोड लिखा होना चाहिए।",
    "NET_QUANTITY_MISSING": "पैकेज पर नेट वज़न (जैसे 100 g / 200 ml) साफ़ तौर पर लिखा होना चाहिए।",
    "MRP_MISSING": "पैकेज पर अधिकतम खुदरा मूल्य (MRP) लिखा होना चाहिए।",
    "MRP_NOT_TAX_INCLUSIVE": "MRP में सभी कर शामिल होने चाहिए — 'incl. of all taxes' स्पष्ट लिखें।",
    "MFG_DATE_MISSING": "पैकेज पर बनाने / पैकिंग की माह और वर्ष लिखा होना चाहिए।",
    "CUSTOMER_CARE_MISSING": "पैकेज पर ग्राहक सेवा का फ़ोन नंबर या पता लिखा होना चाहिए।",
    "EXPIRED": "उत्पाद की समाप्ति तिथि बीत चुकी है — इसे न ख़रीदें।",
    "EXPIRY_DATE_MISSING": "ख़राब होने वाले उत्पाद पर समाप्ति तिथि या 'best before' अवश्य लिखा होना चाहिए।",
    "PRODUCT_NAME_MISSING": "पैकेज पर उत्पाद का नाम साफ़ तौर पर लिखा होना चाहिए।",
}

_EN_MESSAGES = {
    "MAKER_NAME_MISSING": "The package must show the manufacturer's / packer's / importer's name.",
    "ADDRESS_MISSING": "The package must show the manufacturer's / packer's / importer's address with a pincode.",
    "NET_QUANTITY_MISSING": "The package must clearly show the net quantity (e.g. 100 g, 200 ml).",
    "MRP_MISSING": "The package must show the maximum retail price (MRP).",
    "MRP_NOT_TAX_INCLUSIVE": "MRP must be inclusive of all taxes — print 'incl. of all taxes' explicitly.",
    "MFG_DATE_MISSING": "The package must show the month and year of manufacture or packing.",
    "CUSTOMER_CARE_MISSING": "The package must show a customer-care phone number or address.",
    "EXPIRED": "This product is past its expiry / best-before date — do not buy.",
    "EXPIRY_DATE_MISSING": "Perishable products must show an expiry date or best-before period.",
    "PRODUCT_NAME_MISSING": "The package must clearly show the product name.",
}


def _msg(code: str) -> tuple[str, str]:
    return _EN_MESSAGES.get(code) or code, _HI_MESSAGES.get(code) or code


# --------------------------------------------------------------------------- #
# R1 — maker name
# --------------------------------------------------------------------------- #

def r1_maker_name(fields: dict[str, Any]) -> dict[str, Any] | None:
    """The label must show a manufacturer / packer / importer name."""
    for key in ("manufacturer_name", "marketed_by_name"):
        if _has(fields, key):
            return None
    return _flag(
        "MAKER_NAME_MISSING", "high", *_msg("MAKER_NAME_MISSING"),
        evidence={"field": "manufacturer_name", "value": _val(fields, "manufacturer_name")},
    )


# --------------------------------------------------------------------------- #
# R2 — address and pincode
# --------------------------------------------------------------------------- #

def r2_address_and_pincode(fields: dict[str, Any]) -> dict[str, Any] | None:
    address = _val(fields, "manufacturer_address") or _val(fields, "marketed_by_address")
    pincode = _val(fields, "pincode")
    if address and pincode and re.fullmatch(r"[0-9]{6}", pincode):
        return None
    return _flag(
        "ADDRESS_MISSING", "medium", *_msg("ADDRESS_MISSING"),
        evidence={"field": "manufacturer_address", "value": address},
    )


# --------------------------------------------------------------------------- #
# R3 — net quantity in a standard unit
# --------------------------------------------------------------------------- #

_UNIT_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:g|gm|kg|ml|l|mg|oz|lb|pcs?|pieces?|tabs?|caps?|N|capsules?)",
    re.IGNORECASE,
)


def r3_net_quantity(fields: dict[str, Any]) -> dict[str, Any] | None:
    val = _val(fields, "net_quantity") or _val(fields, "net_qty")
    if val and _UNIT_RE.search(val):
        return None
    return _flag(
        "NET_QUANTITY_MISSING", "medium", *_msg("NET_QUANTITY_MISSING"),
        evidence={"field": "net_quantity", "value": val},
    )


# --------------------------------------------------------------------------- #
# R4 — MRP inclusive of taxes
# --------------------------------------------------------------------------- #

def r4_mrp_inclusive_of_taxes(fields: dict[str, Any]) -> dict[str, Any] | None:
    mrp = _val(fields, "mrp")
    if not mrp:
        return _flag(
            "MRP_MISSING", "medium", *_msg("MRP_MISSING"),
            evidence={"field": "mrp", "value": None},
        )
    # Rule 6 says the price "shall be printed with reference to standard unit".
    # We require two decimal places: "99.00", not "99".
    if not re.fullmatch(r"\d+\.\d{2}", mrp):
        return _flag(
            "MRP_MISSING", "medium", *_msg("MRP_MISSING"),
            evidence={"field": "mrp", "value": mrp},
        )
    return None  # Tax-inclusivity can't be checked from OCR text alone.


# --------------------------------------------------------------------------- #
# R5 — mfg / pack date
# --------------------------------------------------------------------------- #

def r5_mfg_date(fields: dict[str, Any]) -> dict[str, Any] | None:
    if _has(fields, "mfg_date"):
        return None
    return _flag(
        "MFG_DATE_MISSING", "low", *_msg("MFG_DATE_MISSING"),
        evidence={"field": "mfg_date", "value": _val(fields, "mfg_date")},
    )


# --------------------------------------------------------------------------- #
# R6 — customer care
# --------------------------------------------------------------------------- #

def r6_customer_care(fields: dict[str, Any]) -> dict[str, Any] | None:
    val = _val(fields, "customer_care")
    if val and val.strip():
        return None
    return _flag(
        "CUSTOMER_CARE_MISSING", "low", *_msg("CUSTOMER_CARE_MISSING"),
        evidence={"field": "customer_care", "value": val},
    )


# --------------------------------------------------------------------------- #
# R7 — not expired
# --------------------------------------------------------------------------- #

_MONTH_TO_NUM = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _parse_expiry(val: str) -> tuple[int, int] | None:
    """Return ``(year, month)`` for ``Aug-26``, ``Aug 2026``, ``08/2024``, etc."""
    val = val.strip()
    m = re.search(r"(?i)\b([A-Za-z]{3,9})[-\s/]+(\d{2,4})\b", val)
    if m:
        month = _MONTH_TO_NUM.get(m.group(1).lower()[:3])
        year = int(m.group(2))
        if year < 100:
            year += 2000
        if month:
            return year, month
    m = re.search(r"(\d{4})[-\/](\d{1,2})", val)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d{1,2})[-\/](\d{2,4})", val)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        year = b + (2000 if b < 100 else 0)
        return year, a
    return None


def r7_not_expired(
    fields: dict[str, Any],
    *,
    today: tuple[int, int] | None = None,
) -> dict[str, Any] | None:
    """Return ``EXPIRED`` if the label is past its date, ``None`` otherwise.

    Skipped when no expiry / best-before is printed (Legal Metrology rules
    only require it for perishables).
    """
    from datetime import date as _date

    expiry = _val(fields, "expiry_or_best_before") or _val(fields, "expiry")
    if not expiry:
        return None
    parsed = _parse_expiry(expiry)
    if not parsed:
        return None
    today = today or (_date.today().year, _date.today().month)
    if parsed < today:
        return _flag(
            "EXPIRED", "low", *_msg("EXPIRED"),
            evidence={"field": "expiry_or_best_before", "value": expiry},
        )
    return None


# --------------------------------------------------------------------------- #
# R8 — product name
# --------------------------------------------------------------------------- #

def r8_product_name(fields: dict[str, Any]) -> dict[str, Any] | None:
    if _has(fields, "product_name"):
        return None
    return _flag(
        "PRODUCT_NAME_MISSING", "high", *_msg("PRODUCT_NAME_MISSING"),
        evidence={"field": "product_name", "value": _val(fields, "product_name")},
    )


# --------------------------------------------------------------------------- #
# Top-level entry point
# --------------------------------------------------------------------------- #

CHECK_LABEL_LAW = "label_law"

_RULES = (
    r1_maker_name,
    r2_address_and_pincode,
    r3_net_quantity,
    r4_mrp_inclusive_of_taxes,
    r5_mfg_date,
    r6_customer_care,
    r7_not_expired,
    r8_product_name,
)


def label_law_check(fields: dict[str, Any] | None) -> dict[str, Any]:
    """Run every rule and return the frozen ``label_law`` check.

    * Empty input -> ``not_checked``.
    * Any high-severity flag -> ``fail``.
    * Any medium or low flag -> ``warn``.
    * Otherwise -> ``pass``.
    """
    if not fields:
        return _empty_check(CHECK_LABEL_LAW)

    flags: list[dict[str, Any]] = []
    for rule in _RULES:
        flag = rule(fields)
        if flag is not None:
            flags.append(flag)

    if any(f["severity"] == "high" for f in flags):
        status = "fail"
    elif flags:
        status = "warn"
    else:
        status = "pass"

    return {"id": CHECK_LABEL_LAW, "status": status, "flags": flags}


if __name__ == "__main__":  # pragma: no cover
    import json

    sample = {
        "manufacturer_name": {"value": "Acme Foods Pvt Ltd"},
        "manufacturer_address": {"value": "Plot 21, MIDC, Mumbai"},
        "pincode": {"value": "400001"},
        "net_quantity": {"value": "200 g"},
        "mrp": {"value": "99.00"},
        "mfg_date": {"value": "Aug-26"},
        "expiry_or_best_before": {"value": "Aug-27"},
        "customer_care": {"value": "1800-123-456"},
        "product_name": {"value": "Acme Sauce"},
    }
    print(json.dumps(label_law_check(sample), indent=2, ensure_ascii=False))