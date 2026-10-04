"""Unit tests for the provider placeholder layer (``backend.providers``).

Pure-function tests: no server, no network.
"""

import pytest

from backend import providers


@pytest.mark.parametrize(
    "value",
    ["12345678901234", "10012022000123", "00000000000000"],
)
def test_valid_fssai_format(value: str) -> None:
    """Exactly 14 ASCII digits is a valid format."""
    assert providers.is_valid_fssai_format(value) is True


@pytest.mark.parametrize(
    "value",
    [
        "",  # empty
        "123",  # too short
        "1234567890123",  # 13 digits
        "123456789012345",  # 15 digits
        "1234567890123a",  # 13 digits + letter
        "1234 5678 9012",  # spaces inside
        " 12345678901234",  # leading space (no trimming)
        "12345678901234 ",  # trailing space (no trimming)
        "\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u0660\u0661\u0662\u0663\u0664",  # Arabic-Indic
        "\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18\uff19\uff10\uff11\uff12\uff13\uff14",  # fullwidth
    ],
)
def test_invalid_fssai_format(value: str) -> None:
    """Anything not exactly 14 ASCII digits is invalid (Unicode digits rejected)."""
    assert providers.is_valid_fssai_format(value) is False


def test_company_and_label_checks_stay_not_checked() -> None:
    for check in (providers.check_company(), providers.check_label_law()):
        assert check["status"] == providers.STATUS_NOT_CHECKED
        assert check["flags"] == []
    assert providers.check_company()["id"] == providers.CHECK_COMPANY
    assert providers.check_label_law()["id"] == providers.CHECK_LABEL_LAW


def test_licence_check_missing_number_has_no_flags() -> None:
    check = providers.check_licence()
    assert check["id"] == providers.CHECK_LICENCE
    assert check["status"] == providers.STATUS_NOT_CHECKED
    assert check["flags"] == []


def test_licence_check_valid_format_has_no_flags() -> None:
    """A valid format is not a validity result - no flag, still not_checked."""
    check = providers.check_licence(fssai_number="10012022000123")
    assert check["status"] == providers.STATUS_NOT_CHECKED
    assert check["flags"] == []


def test_licence_check_invalid_format_flags_a_warning() -> None:
    check = providers.check_licence(fssai_number="123")
    assert check["status"] == "warn"
    assert len(check["flags"]) == 1
    flag = check["flags"][0]
    assert flag["code"] == "FSSAI_FORMAT_INVALID"
    assert flag["severity"] == "medium"
    assert flag["en"] and flag["hi"]  # both languages present
    assert flag["evidence"] == {"fssai": "123"}


def test_build_official_links_empty() -> None:
    assert providers.build_official_links() == []


def test_build_official_links_for_present_numbers() -> None:
    links = providers.build_official_links(
        fssai_number="10012022000123",
        bis_number="CM/L-1234567890",
        cin="U15100MH2009PTC123456",
    )
    assert [link["label"] for link in links] == [
        "Verify FSSAI licence",
        "Verify BIS licence",
        "Verify company on MCA",
    ]
    assert all(link["url"].startswith("https://") for link in links)
    assert links[0]["copy"] == "10012022000123"


def test_build_verification_contract() -> None:
    result = providers.build_verification()
    assert set(result) == {
        "scan_id",
        "checks",
        "score",
        "checks_ran",
        "verdict",
        "official_links",
    }
    assert [c["id"] for c in result["checks"]] == [
        providers.CHECK_COMPANY,
        providers.CHECK_LICENCE,
        providers.CHECK_LABEL_LAW,
    ]
    assert all(c["status"] == providers.STATUS_NOT_CHECKED for c in result["checks"])
    assert result["scan_id"] is None
    assert result["score"] is None
    assert result["checks_ran"] == 0
    assert result["verdict"] == providers.VERDICT_NOT_CHECKED
    assert result["official_links"] == []


# --- Trust score -------------------------------------------------------------


def _check(check_id: str, status: str, *severities: str) -> dict:
    """Build a bare check dict for the scoring tests (no registry involved)."""
    return {
        "id": check_id,
        "status": status,
        "flags": [{"severity": s} for s in severities],
    }


def test_credit_of_an_unchecked_check_is_none() -> None:
    assert providers.check_credit(providers.pending_check(providers.CHECK_COMPANY)) is None


def test_no_score_without_a_single_ran_check() -> None:
    """Unchecked checks must not be scored at all - and never as a zero."""
    checks = [providers.pending_check(cid) for cid in providers.CHECK_WEIGHTS]
    assert providers.score_checks(checks) is None
    assert providers.score_checks([]) is None
    assert providers.count_checks_ran(checks) == 0


def test_a_passing_check_scores_full_marks() -> None:
    checks = [_check(providers.CHECK_COMPANY, providers.STATUS_PASS)]
    assert providers.score_checks(checks) == 100
    assert providers.verdict_for_checks(checks, 100) == providers.VERDICT_LOW_RISK


def test_unchecked_checks_do_not_drag_the_score_down() -> None:
    """A registry we have not connected is not evidence against the label."""
    ran = [_check(providers.CHECK_COMPANY, providers.STATUS_PASS)]
    mixed = ran + [providers.pending_check(providers.CHECK_LICENCE)]
    assert providers.score_checks(mixed) == providers.score_checks(ran) == 100
    assert providers.count_checks_ran(mixed) == 1


def test_warn_credit_uses_the_worst_flag() -> None:
    check = _check(providers.CHECK_LICENCE, providers.STATUS_WARN, "low", "high")
    assert providers.check_credit(check) == providers.WARN_CREDIT["high"]


def test_warn_without_flags_is_credited_as_medium() -> None:
    assert (
        providers.check_credit(_check(providers.CHECK_LICENCE, providers.STATUS_WARN))
        == providers.WARN_CREDIT["medium"]
    )


def test_unknown_severity_falls_back_to_medium_credit() -> None:
    check = _check(providers.CHECK_LICENCE, providers.STATUS_WARN, "catastrophic")
    assert providers.check_credit(check) == providers.WARN_CREDIT["medium"]


def test_fail_earns_nothing() -> None:
    checks = [_check(providers.CHECK_COMPANY, providers.STATUS_FAIL)]
    assert providers.score_checks(checks) == 0


@pytest.mark.parametrize(
    ("score", "verdict"),
    [
        (100, "low_risk"),
        (75, "low_risk"),
        (74, "medium_risk"),
        (40, "medium_risk"),
        (39, "high_risk"),
        (0, "high_risk"),
    ],
)
def test_verdict_bands(score: int, verdict: str) -> None:
    assert providers.verdict_for_checks([], score) == verdict


def test_verdict_without_a_score_stays_not_checked() -> None:
    assert providers.verdict_for_checks([], None) == providers.VERDICT_NOT_CHECKED


def test_verdict_is_never_softer_than_the_worst_flag() -> None:
    """A high-severity finding must not be played down by a healthy score."""
    checks = [
        _check(providers.CHECK_COMPANY, providers.STATUS_WARN, "high"),
        _check(providers.CHECK_LICENCE, providers.STATUS_PASS),
        _check(providers.CHECK_LABEL_LAW, providers.STATUS_PASS),
    ]
    score = providers.score_checks(checks)
    assert score == 60  # the company check's 40 points are lost entirely
    assert providers.verdict_for_checks(checks, score) == providers.VERDICT_HIGH_RISK


def test_build_verification_scores_the_fssai_format_check() -> None:
    """The one signal that exists today also moves the score."""
    result = providers.build_verification(fssai_number="123")
    assert result["checks_ran"] == 1
    assert result["score"] == 50  # the 35-point licence check keeps half of it
    assert result["verdict"] == providers.VERDICT_MEDIUM_RISK


def test_build_verification_keeps_a_valid_fssai_format_unscored() -> None:
    """A valid format is not a validity result: nothing ran, so nothing is scored."""
    result = providers.build_verification(fssai_number="10012022000123")
    assert result["checks_ran"] == 0
    assert result["score"] is None
    assert result["verdict"] == providers.VERDICT_NOT_CHECKED


def test_build_scan_placeholder() -> None:
    result = providers.build_scan()
    assert result["status"] == providers.STATUS_NOT_CHECKED
    assert result["reason"] == providers.OCR_PENDING_REASON
    assert result["fields"] == {}
    assert result["scan_id"] is None
