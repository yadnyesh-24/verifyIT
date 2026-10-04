"""Field extraction from an OCR result.

Pure helpers for the format-only fields (FSSAI 14-digit, pincode, MRP, net
quantity, customer care), plus anchor-based candidates for the rest
(manufacturer, marketed-by, address, packing/expiry, customer care line, BIS,
CIN, GSTIN, product name).

The output of :func:`extract` is a dict of ``ScanField`` objects matching
Aditya's ``backend.main.ScanField`` schema:

    {
      "<field_name>": {
        "value": str | None,
        "confidence": float | None,   # 0..1
        "uncertain": bool,
        "source": "ocr" | "llm" | "both" | None,
        "evidence": {"line": <line_index>, "raw": <original_text>},
      },
      ...
    }
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from backend.ocr import ocr

# --------------------------------------------------------------------------- #
# Schema & defaults
# --------------------------------------------------------------------------- #

# Order is the team's "OCR field set" per the brief; ``extract`` always
# returns at least these keys (None when nothing was found).
DEFAULT_FIELDS: tuple[str, ...] = (
    "mrp",
    "net_quantity",
    "customer_care",
    "mfg_date",
    "expiry_or_best_before",
    "bis_cml",
    "is_number",
    "pincode",
    "fssai",
    "cin",
    "gstin",
    "manufacturer_name",
    "manufacturer_address",
    "marketed_by_name",
    "marketed_by_address",
    "product_name",
)

# Empty ScanField used as the default for any field that isn't found.
_EMPTY: dict[str, Any] = {
    "value": None,
    "confidence": None,
    "uncertain": False,
    "source": None,
    "evidence": None,
}


def empty_field() -> dict[str, Any]:
    """Return a fresh empty ScanField."""
    return {**_EMPTY, "evidence": None}


# --------------------------------------------------------------------------- #
# Format extractors — pure, no I/O
# --------------------------------------------------------------------------- #

# FSSAI: 14 ASCII digits, NOT surrounded by anything digit-like.
# NOTE: ``\d`` in Python's re matches any Unicode digit (incl. Arabic-Indic)
# — we explicitly want only ASCII 0-9 to match the brief's "exactly 14 ASCII
# digits" rule.
_FSSAI_RE = re.compile(r"(?<![0-9])\d{14}(?![0-9])", re.ASCII)
# Pincode: 6 ASCII digits, the Indian convention. Allow leading zeros.
_PINCODE_RE = re.compile(r"(?<![0-9])\d{6}(?![0-9])", re.ASCII)
# MRP: "Rs. 40", "₹39.85", "40.00", "MRP Rs. 40/-". Capture the price.
_MRP_RE = re.compile(
    r"(?:MRP\s*)?(?:Rs\.?|INR|₹|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(?:/-)?",
    re.IGNORECASE | re.ASCII,
)
# Net quantity: "100 g", "1 N", "200ml", "1 kg", "500 GM". Capture the full
# "<number><space?><unit>" string.
_NET_QTY_RE = re.compile(
    r"(\d+(?:\.\d+)?\s*(?:g|gm|kg|ml|l|mg|oz|lb|pcs?|pieces?|tabs?|caps?|N|capsules?))",
    re.IGNORECASE | re.ASCII,
)
# BIS CML / IS number: "IS 1234", "ISI-1234", "BIS CML-XXXXX", "12345".
_BIS_RE = re.compile(
    r"(?:IS\s*[-:]?\s*|BIS\s*(?:CML|License)[-:\s]*)?(\d{4,7})", re.ASCII
)
# CIN: starts with 'U' or 'L', then 5 digits, then 4 groups separated by
# alphanumerics. Example: "U15100MH2009PTC123456".
_CIN_RE = re.compile(r"\b([UL]\d{5}[A-Z]{2}\d{4}[A-Z]{2,3}\d{6})\b", re.ASCII)
# GSTIN: 15 chars. Format: 2 digits (state) + 5 letters (PAN alpha) + 4
# digits (PAN num) + 1 letter (PAN holder) + 1 digit + 1 letter + 1 digit.
# e.g. "27AAPFU0939F1Z5".
_GSTIN_RE = re.compile(r"\b(\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d)\b", re.ASCII)
# Customer care: 10-13 digits, optionally preceded by '+91', '0', '1800', etc.
# We capture the FULL number including a leading 91 so the digits-only
# normalisation keeps the country code. The "toll-free" arm allows dashes
# inside the number so "1800-123-456" matches the whole 10 digits.
_CARE_DIGIT_RE = re.compile(
    r"(?<![0-9])(\+?91[-\s]?\d{4,5}[-\s]?\d{5,8}"
    r"|1?[78]00[-\s]?\d{3}[-\s]?\d{3,4}"
    r"|\d{4,5}[-\s]?\d{5,8}"
    r"|\d{10,13})(?![0-9])",
    re.ASCII,
)
# Dates / best-before: "Aug-26", "08/2024", "Aug 2026", "12 months".
_DATE_RE = re.compile(
    r"(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s]?\d{2,4}\b)"
    r"|(\b\d{1,2}/\d{2,4}\b)"
    r"|(\b\d{1,2}\s*(?:months?|yrs?|years?)\b)",
    re.IGNORECASE | re.ASCII,
)
_BEST_BEFORE_RE = re.compile(
    r"best\s*before\s*[:\-]?\s*(\d+\s*(?:days?|weeks?|months?|years?))",
    re.IGNORECASE | re.ASCII,
)


def _norm_digit_run(s: str) -> str:
    """``+91 73407-58758`` -> ``917340758758``."""
    return re.sub(r"[^0-9]", "", s)


def extract_fssai(text: str) -> str | None:
    m = _FSSAI_RE.search(text)
    return m.group(0) if m else None


def extract_pincode(text: str) -> str | None:
    m = _PINCODE_RE.search(text)
    return m.group(0) if m else None


def extract_mrp(text: str) -> str | None:
    m = _MRP_RE.search(text)
    if not m:
        return None
    val = m.group(1)
    if "." not in val:
        return f"{val}.00"
    whole, _, frac = val.partition(".")
    return f"{whole}.{(frac + '00')[:2]}"


def extract_net_quantity(text: str) -> str | None:
    m = _NET_QTY_RE.search(text)
    return m.group(1).replace(" ", "") if m else None


def extract_bis_cml(text: str) -> str | None:
    m = _BIS_RE.search(text)
    return m.group(1) if m and m.group(1) else None


def extract_cin(text: str) -> str | None:
    m = _CIN_RE.search(text)
    return m.group(1) if m else None


def extract_gstin(text: str) -> str | None:
    m = _GSTIN_RE.search(text)
    return m.group(1) if m else None


def extract_customer_care(text: str) -> str | None:
    """Return the first phone-like number, digits-only."""
    m = _CARE_DIGIT_RE.search(text)
    if not m:
        return None
    digits = _norm_digit_run(m.group(1))
    if len(digits) < 7:
        return None
    return digits


def extract_date(text: str) -> str | None:
    m = _DATE_RE.search(text)
    if not m:
        return None
    return next((g for g in m.groups() if g), None)


def extract_best_before(text: str) -> str | None:
    m = _BEST_BEFORE_RE.search(text)
    return m.group(1) if m else None


# Map field name -> format extractor.
FORMAT_EXTRACTORS: dict[str, Any] = {
    "fssai": extract_fssai,
    "pincode": extract_pincode,
    "mrp": extract_mrp,
    "net_quantity": extract_net_quantity,
    "bis_cml": extract_bis_cml,
    "is_number": extract_bis_cml,  # IS number is the same format
    "cin": extract_cin,
    "gstin": extract_gstin,
    "customer_care": extract_customer_care,
    "mfg_date": extract_date,
    "expiry_or_best_before": extract_date,
}


# --------------------------------------------------------------------------- #
# Anchor-based candidates (manufacturer, address, product name, ...)
# --------------------------------------------------------------------------- #

ANCHOR_PATTERNS: dict[str, tuple[str, ...]] = {
    "manufacturer_name": (
        "manufactured by",
        "mfd by",
        "mfg by",
        "mfd.",
        "manufacturer",
    ),
    "manufacturer_address": (
        "manufactured by",
        "mfd by",
        "mfg by",
        "mfd.",
    ),
    "marketed_by_name": (
        "marketed by",
        "mkt by",
        "marketed",
    ),
    "marketed_by_address": (
        "marketed by",
        "mkt by",
    ),
    "customer_care_line": (
        "customer care",
        "consumer care",
        "for queries",
        "feedback",
        "helpline",
        "toll free",
        "contact us",
        "call",
    ),
    "mfg_date_line": (
        "mfg",
        "mfd",
        "packed on",
        "manufacturing date",
        "date of manufacture",
    ),
    "expiry_or_best_before_line": (
        "best before",
        "use before",
        "expiry",
        "exp.",
        "exp date",
        "expiry date",
    ),
    "bis_cml_line": (
        "bis",
        "isi",
    ),
    "cin_line": (
        "cin",
        "c.i.n.",
    ),
    "gstin_line": (
        "gstin",
        "gst no",
        "gst #",
    ),
    "is_number_line": (
        "is",
        "isi",
    ),
}


@dataclass
class Candidate:
    """A value found near an anchor."""

    value: str
    score: float
    line_index: int
    raw: str
    anchor: str
    uncertain: bool = False


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def _anchor_line_score(line_text: str, anchors: Iterable[str]) -> tuple[float, str]:
    """Return (score, matched_anchor). 1.0 if any anchor prefixes the line."""
    norm = _normalize(line_text)
    best = 0.0
    best_anchor = ""
    for a in anchors:
        a_n = a.lower().strip(":").strip()
        if not a_n:
            continue
        if norm.startswith(a_n) or f": {a_n}" in norm or f":{a_n}" in norm:
            return 1.0, a
        if a_n in norm:
            best = max(best, 0.7)
            best_anchor = a_n
    return best, best_anchor


def _value_after_anchor(line_text: str, anchors: Iterable[str]) -> str | None:
    norm = line_text.strip()
    lower = norm.lower()
    for a in anchors:
        a_n = a.lower().strip(":").strip()
        idx = lower.find(a_n)
        if idx == -1:
            continue
        after = norm[idx + len(a_n):].lstrip(":").strip(" .,;")
        return after or None
    return None


def find_candidates(
    lines: list[ocr.Line],
    field: str,
    *,
    value_extractor=None,
    require_format: bool = True,
) -> list[Candidate]:
    """Return every plausible value for ``field`` across ``lines``."""
    anchors = ANCHOR_PATTERNS.get(field, ())
    candidates: list[Candidate] = []
    for i, line in enumerate(lines):
        if anchors:
            anchor_score, anchor_used = _anchor_line_score(line.text, anchors)
            if anchor_score == 0:
                continue
        else:
            anchor_score, anchor_used = 0.5, ""

        if anchors:
            value = _value_after_anchor(line.text, anchors) or ""
        else:
            value = line.text
        if not value:
            continue

        fmt_score = 1.0
        if value_extractor is not None:
            extracted = value_extractor(value)
            if not extracted:
                if require_format:
                    continue
                fmt_score = 0.3
            else:
                value = extracted

        position = i / max(len(lines), 1)
        position_score = max(0.0, 1.0 - position * 0.5)
        line_conf = line.conf
        score = (anchor_score * 0.4) + (line_conf * 0.4) + (position_score * 0.1) + (fmt_score * 0.1)
        candidates.append(
            Candidate(
                value=value,
                score=score,
                line_index=i,
                raw=line.text,
                anchor=anchor_used,
                uncertain=(score < UNCERTAIN_THRESHOLD),
            )
        )
    return candidates


def pick_best(candidates: list[Candidate]) -> Candidate | None:
    """Return the best candidate; mark uncertain when top two are close."""
    if not candidates:
        return None
    ranked = sorted(candidates, key=lambda c: c.score, reverse=True)
    best = ranked[0]
    if len(ranked) >= 2 and (ranked[0].score - ranked[1].score) < 0.1:
        best.uncertain = True
    return best


UNCERTAIN_THRESHOLD = 0.65
"""Below this score, the field is marked uncertain."""


# --------------------------------------------------------------------------- #
# Gemini fallback (Vision model)
# --------------------------------------------------------------------------- #

def gemini_fallback(
    image_bytes: bytes,
    *,
    api_key: str | None = None,
) -> dict[str, dict[str, Any]] | None:
    """Call Gemini Vision for the fields OCR didn't catch.

    Returns a ``fields`` dict on success (each value is a dict with at least
    ``value``) or ``None`` on any failure. ``source`` is set to ``"llm"``.

    Thin wrapper so the call can be monkey-patched in tests.
    """
    import os

    from backend.ocr.draft_ground_truth import PROMPT, _extract_json

    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        return None

    try:
        import google.generativeai as genai
    except ImportError:
        return None

    try:
        genai.configure(api_key=key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        resp = model.generate_content(
            [
                {"mime_type": "image/jpeg", "data": image_bytes},
                PROMPT,
            ],
            generation_config={"response_mime_type": "application/json"},
        )
        parsed = _extract_json(resp.text)
    except Exception:
        return None

    out: dict[str, dict[str, Any]] = {}
    product = (parsed or {}).get("product") or {}
    for key_name in (
        "mrp", "net_quantity", "customer_care", "mfg_date",
        "expiry_or_best_before", "bis_cml", "is_number",
    ):
        val = product.get(key_name)
        if val:
            out[key_name] = {
                "value": val,
                "confidence": 0.7,
                "uncertain": True,
                "source": "llm",
                "evidence": {"source": "gemini-2.0-flash"},
            }
    parties = (parsed or {}).get("parties") or []
    if parties:
        mfr = next(
            (p for p in parties if (p.get("role") or "").lower() == "manufacturer"),
            parties[0],
        )
        if mfr.get("name"):
            out["manufacturer_name"] = {"value": mfr["name"], "confidence": 0.7, "uncertain": True, "source": "llm"}
        if mfr.get("address"):
            out["manufacturer_address"] = {"value": mfr["address"], "confidence": 0.7, "uncertain": True, "source": "llm"}
        if mfr.get("cin"):
            out["cin"] = {"value": mfr["cin"], "confidence": 0.7, "uncertain": True, "source": "llm"}
        if mfr.get("gstin"):
            out["gstin"] = {"value": mfr["gstin"], "confidence": 0.7, "uncertain": True, "source": "llm"}
        if mfr.get("fssai"):
            out["fssai"] = {"value": mfr["fssai"], "confidence": 0.7, "uncertain": True, "source": "llm"}
    return out


# --------------------------------------------------------------------------- #
# Merging OCR + LLM
# --------------------------------------------------------------------------- #

def merge_ocr_and_llm(
    ocr_fields: dict[str, dict[str, Any]],
    llm_fields: dict[str, dict[str, Any]] | None,
) -> dict[str, dict[str, Any]]:
    """Combine OCR and LLM results.

    * Both have a value and they agree -> keep OCR, bump confidence, source="both", uncertain=False.
    * Same key but disagreement -> keep OCR, mark uncertain, source="ocr".
    * OCR empty but LLM has a value -> adopt the LLM value (source="llm").
    * LLM-only key -> adopted as-is.
    """
    if not llm_fields:
        return ocr_fields
    merged: dict[str, dict[str, Any]] = {}
    for k, ocr_f in ocr_fields.items():
        ocr_value = (ocr_f.get("value") or "").strip()
        llm_f = llm_fields.get(k)
        llm_value = (llm_f.get("value") or "").strip() if llm_f else ""
        if ocr_value and llm_value:
            same = ocr_value == llm_value
            merged[k] = {
                "value": ocr_value,
                "confidence": min(1.0, (ocr_f.get("confidence") or 0.5) + 0.2),
                "uncertain": not same,
                "source": "both" if same else "ocr",
                "evidence": ocr_f.get("evidence"),
            }
        elif ocr_value:
            merged[k] = dict(ocr_f)
        elif llm_value:
            merged[k] = dict(llm_f)
        else:
            merged[k] = dict(ocr_f)
    # Pick up LLM-only keys.
    for k, llm_f in llm_fields.items():
        if k not in merged:
            merged[k] = dict(llm_f)
    return merged


# --------------------------------------------------------------------------- #
# Top-level extract
# --------------------------------------------------------------------------- #

def _line_index(lines: list[ocr.Line], line: ocr.Line) -> int:
    for i, l in enumerate(lines):
        if l is line:
            return i
    return -1


def extract(
    lines: list[ocr.Line],
    *,
    image_bytes: bytes | None = None,
    api_key: str | None = None,
    trigger_llm_avg_conf: float = 0.60,
    fields: Iterable[str] = DEFAULT_FIELDS,
) -> dict[str, dict[str, Any]]:
    """Extract every field in ``fields`` from OCR lines.

    * Format-only fields use FORMAT_EXTRACTORS directly.
    * Anchor fields use find_candidates + pick_best.
    * If average OCR confidence is below ``trigger_llm_avg_conf`` AND
      ``image_bytes`` is provided, the Gemini Vision fallback runs and the
      results are merged via :func:`merge_ocr_and_llm`.
    """
    avg_conf = sum(line.conf for line in lines) / max(len(lines), 1)
    out: dict[str, dict[str, Any]] = {f: empty_field() for f in fields}

    for f in fields:
        extractor = FORMAT_EXTRACTORS.get(f)
        if extractor is not None:
            for line in lines:
                val = extractor(line.text)
                if val:
                    out[f] = {
                        "value": val,
                        "confidence": line.conf,
                        "uncertain": line.conf < UNCERTAIN_THRESHOLD,
                        "source": "ocr",
                        "evidence": {"line_index": _line_index(lines, line), "raw": line.text},
                    }
                    break
            continue
        cands = find_candidates(lines, f)
        best = pick_best(cands)
        if best is None:
            continue
        out[f] = {
            "value": best.value,
            "confidence": best.score,
            "uncertain": best.uncertain,
            "source": "ocr",
            "evidence": {"line_index": best.line_index, "raw": best.raw},
        }

    if image_bytes is not None and avg_conf < trigger_llm_avg_conf:
        llm = gemini_fallback(image_bytes, api_key=api_key)
        if llm:
            out = merge_ocr_and_llm(out, llm)

    return out