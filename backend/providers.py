"""Provider integration layer for Verify It.

This module is the single place where registry providers (company/CIN via MCA or
Surepass, FSSAI, BIS) and the OCR pipeline will be integrated.

Real registry data, Surepass credentials and the OCR pipeline are not available
yet, and nothing here performs network I/O. Every registry check therefore
returns a neutral ``not_checked`` placeholder so the API contract stays stable
for the frontend. The only signals reported today are *deterministic,
registry-independent* ones - such as the FSSAI number format - which can be
checked without contacting any registry. No company, licence or verdict is ever
invented.

Replace the individual ``check_*`` functions with real integrations when
credentials and endpoints become available.
"""

from __future__ import annotations

import re
from typing import Any

# --- Status / verdict contract ----------------------------------------------

#: Status of a check whose registry is not connected.
STATUS_NOT_CHECKED = "not_checked"

#: Reason surfaced when a registry check has not been performed.
REGISTRY_PENDING_REASON = "Registry connection pending"

#: Reason surfaced when the OCR pipeline has not been wired up.
OCR_PENDING_REASON = "OCR pipeline not connected"

#: Verdict used while no check can be completed.
VERDICT_NOT_CHECKED = "not_checked"

#: Check identifiers - these must match the agreed JSON contract exactly.
CHECK_COMPANY = "company"
CHECK_LICENCE = "licence"
CHECK_LABEL_LAW = "label_law"

# --- FSSAI format ------------------------------------------------------------

# FSSAI licence numbers are exactly 14 ASCII digits. ``[0-9]`` matches only the
# ASCII digits 0-9, unlike ``str.isdigit()``/``str.isdecimal()`` which also
# accept Unicode digits (e.g. Arabic-Indic).
FSSAI_FORMAT_LENGTH = 14
_FSSAI_FORMAT_RE = re.compile(r"[0-9]{14}")

# --- Official verification portals (static links; user pastes the number) ----

FSSAI_PORTAL_URL = "https://foscos.fssai.gov.in/"
MCA_PORTAL_URL = "https://www.mca.gov.in/"
BIS_PORTAL_URL = "https://www.bis.gov.in/"


def is_valid_fssai_format(value: str) -> bool:
    """Return ``True`` only if ``value`` is exactly 14 ASCII digits.

    This checks the *format* of the number and nothing else: it never asserts
    that a licence exists or is valid in any registry.

    The value is evaluated exactly as supplied - no trimming is applied, so any
    surrounding whitespace or non-digit character makes it invalid.
    """
    return _FSSAI_FORMAT_RE.fullmatch(value) is not None


def pending_check(check_id: str) -> dict[str, Any]:
    """Return the placeholder for a check whose registry is not connected."""
    return {"id": check_id, "status": STATUS_NOT_CHECKED, "flags": []}


def _fssai_format_flag(fssai_number: str | None) -> dict[str, Any] | None:
    """Return a flag when an FSSAI number is present but badly formatted.

    ``None`` means "nothing to report": either no number was supplied, or it is
    a valid 14-digit format (a valid format is *not* a validity result).
    """
    if fssai_number is None or is_valid_fssai_format(fssai_number):
        return None
    return {
        "code": "FSSAI_FORMAT_INVALID",
        "severity": "medium",
        "en": "The FSSAI number is not 14 digits - it may be misread or misprinted.",
        "hi": "FSSAI नंबर 14 अंकों का नहीं है - यह गलत पढ़ा या गलत छपा हो सकता है।",
        "evidence": {"fssai": fssai_number},
    }


def check_company(
    *,
    manufacturer_name: str | None = None,
    manufacturer_address: str | None = None,
    cin: str | None = None,
) -> dict[str, Any]:
    """Company / CIN registry check.

    Placeholder: returns ``not_checked`` with no flags until the provider is
    connected. The parameters are accepted now to fix the future signature.
    """
    return pending_check(CHECK_COMPANY)


def check_licence(
    *,
    fssai_number: str | None = None,
    bis_number: str | None = None,
) -> dict[str, Any]:
    """Licence check covering FSSAI and BIS.

    The registry portion stays ``not_checked``. The deterministic FSSAI *format*
    check is reported: a number that is not exactly 14 ASCII digits adds a
    ``FSSAI_FORMAT_INVALID`` flag. A valid format produces no flag and is never
    presented as a verified licence.
    """
    check = pending_check(CHECK_LICENCE)
    flag = _fssai_format_flag(fssai_number)
    if flag is not None:
        check["flags"].append(flag)
        check["status"] = "warn"
    return check


def check_label_law(*, fields: dict[str, Any] | None = None) -> dict[str, Any]:
    """Legal Metrology label checks (Packaged Commodities Rules).

    Placeholder: owned by the OCR / label workstream; returns ``not_checked``
    until the rule engine is wired in.
    """
    return pending_check(CHECK_LABEL_LAW)


def build_official_links(
    *,
    fssai_number: str | None = None,
    bis_number: str | None = None,
    cin: str | None = None,
) -> list[dict[str, Any]]:
    """Build static official verification links for the numbers present.

    No network request is made. The frontend copies ``copy`` and opens ``url`` so
    the user can paste the number on the official portal and solve the captcha.
    """
    links: list[dict[str, Any]] = []
    if fssai_number:
        links.append(
            {"label": "Verify FSSAI licence", "url": FSSAI_PORTAL_URL, "copy": fssai_number}
        )
    if bis_number:
        links.append(
            {"label": "Verify BIS licence", "url": BIS_PORTAL_URL, "copy": bis_number}
        )
    if cin:
        links.append({"label": "Verify company on MCA", "url": MCA_PORTAL_URL, "copy": cin})
    return links


def build_verification(
    *,
    manufacturer_name: str | None = None,
    manufacturer_address: str | None = None,
    cin: str | None = None,
    fssai_number: str | None = None,
    bis_number: str | None = None,
    fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble the verify response: three checks plus score, verdict and links.

    ``scan_id``/``score``/``verdict`` stay empty/``not_checked`` until the checks
    can actually run; nothing is guessed.
    """
    return {
        "scan_id": None,
        "checks": [
            check_company(
                manufacturer_name=manufacturer_name,
                manufacturer_address=manufacturer_address,
                cin=cin,
            ),
            check_licence(fssai_number=fssai_number, bis_number=bis_number),
            check_label_law(fields=fields),
        ],
        "score": None,
        "verdict": VERDICT_NOT_CHECKED,
        "official_links": build_official_links(
            fssai_number=fssai_number, bis_number=bis_number, cin=cin
        ),
    }


def build_scan() -> dict[str, Any]:
    """Return the placeholder OCR result.

    No fields have been read yet, so none are guessed or invented: ``fields`` is
    empty and the status explains why.
    """
    return {
        "scan_id": None,
        "status": STATUS_NOT_CHECKED,
        "reason": OCR_PENDING_REASON,
        "fields": {},
    }
