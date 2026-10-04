"""Unit tests for backend.ocr.ocr — pure helpers + end-to-end on a synthetic image."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO))

from backend.ocr import ocr  # noqa: E402

# Skip the end-to-end Tesseract tests if pytesseract / binary isn't available.
pytest.importorskip("pytesseract")


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #

def test_conf_to_fraction_normalises():
    assert ocr._conf_to_fraction("87") == pytest.approx(0.87)
    assert ocr._conf_to_fraction("100") == 1.0
    assert ocr._conf_to_fraction("0") == 0.0


def test_conf_to_fraction_handles_sentinel_and_garbage():
    assert ocr._conf_to_fraction("-1") == 0.0
    assert ocr._conf_to_fraction("") == 0.0
    assert ocr._conf_to_fraction("nope") == 0.0
    assert ocr._conf_to_fraction(None) == 0.0


def test_rebuild_lines_groups_by_block_par_line():
    raw = {
        "text": ["FOO", "", "BAR", "BAZ", "QUX"],
        "conf": ["90", "-1", "80", "85", "70"],
        "left": [10, 50, 70, 10, 70],
        "width": [40, 40, 40, 40, 40],
        "top": [10, 10, 10, 50, 50],
        "height": [20, 20, 20, 20, 20],
        "block_num": [1, 1, 1, 1, 1],
        "par_num": [1, 1, 1, 1, 1],
        "line_num": [1, 1, 1, 2, 2],
    }
    lines = ocr._rebuild_lines(raw)
    assert len(lines) == 2
    # Reading order: line 1 (top=10) before line 2 (top=50).
    assert lines[0].text == "FOO BAR"
    assert lines[1].text == "BAZ QUX"
    # Empty / conf=-1 words are dropped.
    assert all(w.text for line in lines for w in line.words)


def test_rebuild_lines_confidence_is_mean_per_line():
    raw = {
        "text": ["A", "B", "C"],
        "conf": ["100", "80", "60"],
        "left": [0, 50, 100],
        "width": [40, 40, 40],
        "top": [0, 0, 0],
        "height": [20, 20, 20],
        "block_num": [1, 1, 1],
        "par_num": [1, 1, 1],
        "line_num": [1, 1, 1],
    }
    lines = ocr._rebuild_lines(raw)
    assert len(lines) == 1
    assert lines[0].conf == pytest.approx((1.0 + 0.8 + 0.6) / 3)


# --------------------------------------------------------------------------- #
# End-to-end with a synthetic image
# --------------------------------------------------------------------------- #

@pytest.fixture
def simple_label(tmp_path: Path) -> Path:
    img = np.full((200, 600, 3), 255, dtype=np.uint8)
    cv2.putText(
        img, "HELLO", (50, 110), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 3, cv2.LINE_AA
    )
    cv2.putText(
        img, "WORLD", (50, 170), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 2, cv2.LINE_AA
    )
    p = tmp_path / "label.png"
    cv2.imwrite(str(p), img)
    return p


def test_run_against_synthetic_image(simple_label: Path):
    result = ocr.run(str(simple_label), psm=6, lang="eng")
    assert result.psm == 6
    assert result.avg_conf > 0.0
    text = "\n".join(line.text for line in result.lines)
    # At least one of the words should be readable — Tesseract is fuzzy on
    # plain synthetic fonts, so we just check it produced output.
    assert text.strip() != ""
    assert len(result.lines) >= 1


def test_run_picks_better_psm(simple_label: Path):
    # Without specifying psm, run() should pick one of {6, 11}.
    result = ocr.run(str(simple_label), lang="eng")
    assert result.psm in (6, 11)


def test_ocr_text_convenience(simple_label: Path):
    text = ocr.ocr_text(str(simple_label), psm=6, lang="eng")
    assert isinstance(text, str)
    assert len(text) > 0


def test_ocr_lines_convenience(simple_label: Path):
    lines = ocr.ocr_lines(str(simple_label), psm=6, lang="eng")
    assert isinstance(lines, list)
    assert all(hasattr(l, "text") and hasattr(l, "conf") for l in lines)


def test_configure_tesseract_sets_lang():
    ocr.configure_tesseract(lang="eng")
    assert ocr._LANG == "eng"
    # Reset to the default so other tests aren't affected.
    ocr.configure_tesseract(lang="eng+hin")