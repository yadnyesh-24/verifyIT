"""Provider integration layer for Verify It.

This module is the single place where registry providers (company/CIN via MCA or
Surepass, FSSAI, BIS) and the OCR pipeline will be integrated.

**No network I/O happens anywhere here.** The one register that can answer today
is the company/CIN check, and it reads a *local* PostgreSQL snapshot of the MCA
Company Master Data export that the team imports itself (see ``MCA_SETUP.md``);
when that snapshot is absent or has no confident match, the check stays
``not_checked``. FSSAI/BIS, Surepass and the OCR pipeline are not connected, so
their checks remain neutral ``not_checked`` placeholders - which keeps the API
contract stable for the frontend.

The only other signals reported today are *deterministic, registry-independent*
ones, such as the FSSAI number format, which can be checked without contacting
any registry. No company, licence or verdict is ever invented.

The trust score is **derived, never invented**: it is computed from the checks
that actually ran (and is ``null`` when none did), normalised by their weights,
and it always travels with ``checks_ran`` so that a partial score is visible as
partial rather than read as a whole-label verdict.

Replace the individual ``check_*`` functions with real integrations when
credentials and endpoints become available.
"""

from __future__ import annotations

import re
from typing import Any, Sequence

from backend import mca

# --- Status / verdict contract ----------------------------------------------

#: Status of a check whose registry is not connected.
STATUS_NOT_CHECKED = "not_checked"

#: Status of a check that ran and found nothing to report.
STATUS_PASS = "pass"

#: Status of a check that ran and found something the user must look at.
STATUS_WARN = "warn"

#: Status of a check that ran and disproved the claim. Reserved: no check emits
#: it today, because absent evidence (a lagging snapshot, a misread label) never
#: proves that a label is wrong.
STATUS_FAIL = "fail"

#: Reason surfaced when a registry check has not been performed.
REGISTRY_PENDING_REASON = "Registry connection pending"

#: Reason surfaced when the OCR pipeline has not been wired up.
OCR_PENDING_REASON = "OCR pipeline not connected"

#: Verdict used while no check can be completed.
VERDICT_NOT_CHECKED = "not_checked"

#: Verdicts for a scored result, from calm to serious.
VERDICT_LOW_RISK = "low_risk"
VERDICT_MEDIUM_RISK = "medium_risk"
VERDICT_HIGH_RISK = "high_risk"

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


# --- Trust score -------------------------------------------------------------

#: Weight each check carries in the trust score. The three weights add up to 100,
#: so a label that passes every check it was possible to run scores 100.
CHECK_WEIGHTS: dict[str, int] = {
    CHECK_COMPANY: 40,
    CHECK_LICENCE: 35,
    CHECK_LABEL_LAW: 25,
}

#: Fraction of its weight a ``warn`` check keeps, decided by its *worst* flag.
WARN_CREDIT: dict[str, float] = {"high": 0.0, "medium": 0.5, "low": 0.8}

#: Lowest score that still counts as ``low_risk`` / ``medium_risk``.
LOW_RISK_MIN_SCORE = 75
MEDIUM_RISK_MIN_SCORE = 40

#: The verdict floor a flag of each severity contributes.
SEVERITY_VERDICTS: dict[str, str] = {
    "high": VERDICT_HIGH_RISK,
    "medium": VERDICT_MEDIUM_RISK,
    "low": VERDICT_LOW_RISK,
}

_VERDICT_RANK: dict[str, int] = {
    VERDICT_NOT_CHECKED: 0,
    VERDICT_LOW_RISK: 1,
    VERDICT_MEDIUM_RISK: 2,
    VERDICT_HIGH_RISK: 3,
}


def check_credit(check: dict[str, Any]) -> float | None:
    """Return the fraction of its weight that a single check earned.

    ``None`` means the check never ran (``not_checked``). Such a check is left
    out of the score entirely instead of being counted as a zero, because "we
    could not check this" is not the same statement as "this failed".

    ``pass`` earns the whole weight, ``fail`` earns none, and a ``warn`` earns
    the credit of its *worst* flag - so a single high-severity finding takes that
    check's entire weight away.
    """
    status = check["status"]
    if status == STATUS_NOT_CHECKED:
        return None
    if status == STATUS_PASS:
        return 1.0
    if status == STATUS_FAIL:
        return 0.0
    credits = [
        WARN_CREDIT.get(flag.get("severity"), WARN_CREDIT["medium"])
        for flag in check.get("flags") or []
    ]
    return min(credits) if credits else WARN_CREDIT["medium"]


def count_checks_ran(checks: Sequence[dict[str, Any]]) -> int:
    """Return how many checks produced a result (``not_checked`` excluded)."""
    return sum(1 for check in checks if check["status"] != STATUS_NOT_CHECKED)


def score_checks(checks: Sequence[dict[str, Any]]) -> int | None:
    """Return the trust score 0-100, or ``None`` when no check could run.

    Only the checks that actually ran are counted, and the result is normalised
    by *their* combined weight. The score therefore always means "of what we were
    able to check": a registry we have not connected never silently drags the
    number down. It must always travel with ``count_checks_ran``, so that a
    partial score is visible as partial rather than read as a whole-label verdict.
    """
    earned = 0.0
    ran_weight = 0
    for check in checks:
        credit = check_credit(check)
        if credit is None:
            continue
        weight = CHECK_WEIGHTS.get(check["id"], 0)
        ran_weight += weight
        earned += weight * credit
    if ran_weight == 0:
        return None
    return round(earned / ran_weight * 100)


def verdict_for_checks(checks: Sequence[dict[str, Any]], score: int | None) -> str:
    """Return the verdict for a scored set of checks.

    The verdict is the *more serious* of the score's band and the worst flag
    severity found, so a high-severity finding is never played down by an
    otherwise clean score. With no score there is no verdict to give: the result
    stays ``not_checked``, which is a pending state and never a failure.
    """
    if score is None:
        return VERDICT_NOT_CHECKED
    verdict = _verdict_for_score(score)
    for check in checks:
        for flag in check.get("flags") or []:
            from_flag = SEVERITY_VERDICTS.get(flag.get("severity"))
            if from_flag and _VERDICT_RANK[from_flag] > _VERDICT_RANK[verdict]:
                verdict = from_flag
    return verdict


def _verdict_for_score(score: int) -> str:
    """Band a numeric score into a verdict."""
    if score >= LOW_RISK_MIN_SCORE:
        return VERDICT_LOW_RISK
    if score >= MEDIUM_RISK_MIN_SCORE:
        return VERDICT_MEDIUM_RISK
    return VERDICT_HIGH_RISK


# --- Company / CIN (local MCA Company Master Data snapshot) -------------------

#: MCA ``company_status`` values that mean the company is live. The MCA *Company
#: Master Data* bulk export writes the four-character code (``ACTV``) where the
#: MCA portal spells it out (``Active``); both mean the same thing, so both are
#: accepted. A status that is present but missing from this set (Strike Off,
#: Amalgamated, Under Liquidation, ...) is reported as a warning instead of
#: silently passing.
MCA_ACTIVE_STATUSES = frozenset({"ACTIVE", "ACTV"})


def _is_active_status(status: str) -> bool:
    """Return ``True`` when an MCA company status means the company is active."""
    return status.strip().upper() in MCA_ACTIVE_STATUSES


def _mca_not_active_flag(match: dict[str, Any]) -> dict[str, Any]:
    """High-severity flag: the CIN exists but the MCA status is not Active."""
    status = match.get("status") or "unknown"
    return {
        "code": "MCA_COMPANY_NOT_ACTIVE",
        "severity": "high",
        "en": (
            f"MCA records show this company as '{status}', not Active - treat the "
            "maker's claim on this label with caution."
        ),
        "hi": (
            f"MCA रिकॉर्ड में यह कंपनी '{status}' दर्ज है, Active नहीं - लेबल पर दिए "
            "निर्माता के दावे को सावधानी से लें।"
        ),
        "evidence": {
            "cin": match.get("cin"),
            "name": match.get("name"),
            "status": status,
            "matched_on": "cin",
        },
    }


def _mca_name_only_flag(match: dict[str, Any]) -> dict[str, Any]:
    """Low-severity flag: the maker name matched the register by name only."""
    return {
        "code": "MCA_NAME_ONLY_MATCH",
        "severity": "low",
        "en": (
            "The manufacturer name was found in the MCA register by name only - "
            "confirm the CIN to be sure it is the same company."
        ),
        "hi": (
            "निर्माता का नाम MCA रजिस्टर में केवल नाम के आधार पर मिला है - एक ही कंपनी "
            "होने की पुष्टि के लिए CIN जाँचें।"
        ),
        "evidence": {
            "manufacturer": match.get("name"),
            "cin": match.get("cin"),
            "status": match.get("status"),
            "similarity": match.get("similarity"),
            "matched_on": "name",
        },
    }


def check_company(
    *,
    manufacturer_name: str | None = None,
    manufacturer_address: str | None = None,
    cin: str | None = None,
) -> dict[str, Any]:
    """Company / CIN check against the local MCA registry snapshot.

    The register is a locally imported snapshot of the MCA *Company Master Data*
    export (``sql/001_companies.sql`` + ``scripts/import_mca.py``, see
    ``MCA_SETUP.md``). No network request is made, and no record is ever invented.

    Outcomes - deliberately conservative, following the same discipline as the
    FSSAI check ("a valid format is not a valid licence"):

    * **CIN found in the register** -> ``pass``. A CIN is a unique statutory
      identifier, so this is a real register record. If the recorded status is
      present but not Active (Strike Off, Under Liquidation, ...) the check is
      downgraded to ``warn`` with a high-severity ``MCA_COMPANY_NOT_ACTIVE`` flag.
    * **Name matched fuzzily only** -> ``warn`` with a low-severity
      ``MCA_NAME_ONLY_MATCH`` flag: a name is not unique, so the user must confirm
      the CIN before trusting it.
    * **No confident match, or no snapshot available** -> ``not_checked``. A miss
      is never reported as a failure: the snapshot is a fixed export and may lag,
      so absence proves nothing.

    ``manufacturer_address`` is accepted for a future disambiguation step and is
    not used for matching yet.
    """
    check = pending_check(CHECK_COMPANY)

    match = mca.match_company(name=manufacturer_name, cin=cin)
    if match is None:
        return check

    if match["matched_on"] == "cin":
        status = match.get("status")
        if status and not _is_active_status(status):
            check["status"] = STATUS_WARN
            check["flags"].append(_mca_not_active_flag(match))
        else:
            check["status"] = STATUS_PASS
        return check

    check["status"] = STATUS_WARN
    check["flags"].append(_mca_name_only_flag(match))
    return check


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
        check["status"] = STATUS_WARN
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

    The score is derived from the checks that actually ran (see
    ``score_checks``), and it is ``null`` - with a ``not_checked`` verdict - when
    none of them could run, which is the situation with no registry and no
    readable label. ``checks_ran`` reports how many checks fed the number, so a
    partial score is never mistaken for a whole-label verdict. Nothing is
    guessed: ``scan_id`` stays ``null`` until the OCR pipeline supplies one.
    """
    checks = [
        check_company(
            manufacturer_name=manufacturer_name,
            manufacturer_address=manufacturer_address,
            cin=cin,
        ),
        check_licence(fssai_number=fssai_number, bis_number=bis_number),
        check_label_law(fields=fields),
    ]
    score = score_checks(checks)
    return {
        "scan_id": None,
        "checks": checks,
        "score": score,
        "checks_ran": count_checks_ran(checks),
        "verdict": verdict_for_checks(checks, score),
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
