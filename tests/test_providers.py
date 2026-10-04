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
    assert set(result) == {"scan_id", "checks", "score", "verdict", "official_links"}
    assert [c["id"] for c in result["checks"]] == [
        providers.CHECK_COMPANY,
        providers.CHECK_LICENCE,
        providers.CHECK_LABEL_LAW,
    ]
    assert all(c["status"] == providers.STATUS_NOT_CHECKED for c in result["checks"])
    assert result["scan_id"] is None
    assert result["score"] is None
    assert result["verdict"] == providers.VERDICT_NOT_CHECKED
    assert result["official_links"] == []


def test_build_scan_placeholder() -> None:
    result = providers.build_scan()
    assert result["status"] == providers.STATUS_NOT_CHECKED
    assert result["reason"] == providers.OCR_PENDING_REASON
    assert result["fields"] == {}
    assert result["scan_id"] is None
