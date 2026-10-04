"""Pure normalisers used by the OCR draft and the evaluation harness.

These functions take strings (predicted or ground-truth) and turn them into
the canonical form used for comparison. They are deliberately small, pure,
and easy to unit-test — no I/O, no globals, no logging.
"""

from __future__ import annotations

import re

# Fields where only digits count. ``+91``, dashes, spaces, parens are all
# stripped so MRP and OCR can match the same number printed differently.
_NUMERIC_FIELDS = frozenset(
    {
        "fssai",
        "pincode",
        "customer_care",
        "cin",
        "gstin",
        "bis_cml",
        "is_number",
    }
)

# Fields where a fuzzy match (SequenceMatcher) is acceptable because the label
# often prints "Manufactured by: ACME FOODS PVT LTD" or with diacritics, etc.
_FUZZY_FIELDS = frozenset({"manufacturer_name", "name", "address"})

# Tesseract-style misreads inside digits only. Letters in words are left alone.
_DIGIT_FIXES = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "B": "8"})

# Strips ``+91``, ``0``, spaces, dashes, parens, dots; keeps only digits.
_NON_DIGIT = re.compile(r"[^0-9]")

# Apply the digit fixes (O→0, l→1, S→5, B→8) only inside runs of digits.
# Letters inside words (e.g. "ABC") stay untouched so we don't corrupt them.
_DIGIT_FIX = re.compile(r"[0-9A-Za-z]+")
_DIGIT_FIXES_PER_CHAR = str.maketrans(
    {"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "B": "8"}
)

_WHITESPACE = re.compile(r"\s+")

# Recognises a run of digits (with optional decimal point) suitable for MRP.
_MRP_DIGITS = re.compile(r"\d+(?:\.\d+)?")


def norm_text(value: object) -> str:
    """Normalise a free-text value for exact comparison.

    * ``None`` and empty values become ``""``.
    * Strings are upper-cased and have whitespace collapsed.
    * Non-string values are stringified with ``str(...)``.

    >>> norm_text("  Acme Foods  Pvt Ltd  ")
    'ACME FOODS PVT LTD'
    """
    if value is None:
        return ""
    s = str(value)
    s = _WHITESPACE.sub(" ", s).strip()
    return s.upper()


def norm_numeric(value: object, *, apply_digit_fixes: bool = True) -> str:
    """Normalise a numeric value to digits-only.

    ``+91``, dashes, spaces, parens, dots are stripped. The B→8, O→0, I/l→1,
    S→5 corrections are applied **only inside runs that contain at least one
    digit** — pure-letter words (e.g. "ABC") are not modified before being
    stripped.

    >>> norm_numeric("+91 73407-58758")
    '917340758758'
    >>> norm_numeric("10012022 000123")
    '10012022000123'
    >>> norm_numeric("ABC-1234")
    '1234'
    >>> norm_numeric("O1234")
    '01234'
    >>> norm_numeric("12B34")
    '12834'
    """
    if value is None:
        return ""
    s = str(value)
    if apply_digit_fixes:
        # Translate each alphanumeric run independently. If a run contains at
        # least one digit, treat it as a number and apply the fixes; otherwise
        # leave it alone (it's a word that will be stripped anyway).
        def _fix_run(m: re.Match) -> str:
            run = m.group(0)
            if any(ch.isdigit() for ch in run):
                return run.translate(_DIGIT_FIXES_PER_CHAR)
            return run

        s = _DIGIT_FIX.sub(_fix_run, s)
    # Strip everything that isn't a digit or a dot (preserve decimals).
    return re.sub(r"[^0-9.]", "", s)


def norm_mrp(value: object) -> str:
    """Normalise an MRP to ``XX.XX`` when digits can be extracted.

    * If the value yields a single number like ``"MRP Rs. 40/-"`` → ``"40.00"``
    * If it is already ``"40"`` → ``"40.00"``
    * If it is ``"39.85"`` → ``"39.85"``
    * If no digits are present the original (norm_text) form is returned.

    >>> norm_mrp("MRP Rs. 40/-")
    '40.00'
    >>> norm_mrp("₹39.85")
    '39.85'
    """
    if value is None:
        return ""
    s = norm_numeric(value)  # applies the same B→8 / O→0 / l→1 / S→5 fixes
    m = _MRP_DIGITS.search(s)
    if not m:
        # No digits → preserve the readable form (upper-cased) so the operator
        # can spot a misread in the CSV.
        return norm_text(str(value))
    num = m.group(0)
    if "." not in num:
        return f"{num}.00"
    whole, _, frac = num.partition(".")
    frac = (frac + "00")[:2]
    return f"{whole}.{frac}"


def norm_customer_care(value: object, *, joiner: str = " | ") -> str:
    """Normalise a customer-care value to digits-only, ``"-joined"``.

    Accepts a single string, a list of strings, or None.

    >>> norm_customer_care("+91 7340758758")
    '917340758758'
    >>> norm_customer_care(["1800-123-456", "022-41304130"])
    '1800123456 | 02241304130'
    """
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        parts = [norm_numeric(v) for v in value]
    else:
        # Multiple numbers can be pipe-joined in a single string already.
        parts = [norm_numeric(p) for p in str(value).split("|")]
    parts = [p for p in parts if p]
    return joiner.join(parts)


def norm_field(value: object, field: str) -> str:
    """Dispatch to the right normaliser for ``field``."""
    if field in ("mrp",):
        return norm_mrp(value)
    if field == "customer_care":
        return norm_customer_care(value)
    if field in _NUMERIC_FIELDS:
        return norm_numeric(value)
    return norm_text(value)


def is_fuzzy_field(field: str) -> bool:
    """Return ``True`` if ``field`` should be compared with fuzzy matching."""
    return field in _FUZZY_FIELDS


if __name__ == "__main__":  # pragma: no cover
    import doctest

    doctest.testmod(verbose=True)