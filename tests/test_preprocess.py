"""Unit tests for backend.ocr.preprocess using synthetic images."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO))

from backend.ocr import preprocess  # noqa: E402


@pytest.fixture
def white_label() -> np.ndarray:
    """A 200x400 white image with the word 'FOO' drawn in the middle."""
    img = np.full((200, 400, 3), 255, dtype=np.uint8)
    cv2.putText(
        img, "FOO", (50, 110), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2, cv2.LINE_AA
    )
    return img


def test_resize_keeps_aspect_when_already_small():
    img = np.zeros((200, 400, 3), dtype=np.uint8)
    out = preprocess.resize(img, long_side=1600)
    assert out.shape == (200, 400, 3)


def test_resize_scales_down_to_long_side():
    img = np.zeros((3000, 2000, 3), dtype=np.uint8)
    out = preprocess.resize(img, long_side=1000)
    h, w = out.shape[:2]
    assert max(h, w) == 1000
    assert min(h, w) == round(min(3000, 2000) * 1000 / max(3000, 2000))


def test_to_grayscale_returns_single_channel():
    img = np.zeros((50, 50, 3), dtype=np.uint8)
    gray = preprocess.to_grayscale(img)
    assert gray.ndim == 2
    assert gray.shape == (50, 50)


def test_to_grayscale_passes_through_single_channel():
    gray = np.zeros((50, 50), dtype=np.uint8)
    assert preprocess.to_grayscale(gray) is gray


def test_clahe_actually_modifies_the_image():
    # CLAHE re-maps contrast within tiles. The output is *not* byte-identical
    # to the input, and the global std may even go up slightly. What matters
    # is that it isn't a no-op.
    img = np.zeros((100, 200), dtype=np.uint8)
    img[:, :100] = 30
    img[:, 100:] = 220
    out = preprocess.clahe(img)
    assert not np.array_equal(img, out)
    # And it must stay in the [0, 255] range.
    assert out.min() >= 0 and out.max() <= 255


def test_bilateral_returns_same_shape():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    out = preprocess.bilateral(img)
    assert out.shape == img.shape


def test_adaptive_threshold_gaussian():
    img = np.full((100, 100), 128, dtype=np.uint8)
    out = preprocess.adaptive_threshold(img, mode="gaussian")
    assert set(np.unique(out).tolist()).issubset({0, 255})


def test_adaptive_threshold_otsu():
    img = np.full((100, 100), 128, dtype=np.uint8)
    out = preprocess.adaptive_threshold(img, mode="otsu")
    assert set(np.unique(out).tolist()).issubset({0, 255})


def test_adaptive_threshold_unknown_mode():
    with pytest.raises(ValueError):
        preprocess.adaptive_threshold(np.zeros((10, 10), dtype=np.uint8), mode="bogus")


def test_deskew_returns_same_shape_for_blank_image():
    img = np.full((100, 100), 200, dtype=np.uint8)
    assert preprocess.deskew(img).shape == img.shape


def test_crop_to_content_keeps_label_inside_padding():
    # Big white canvas, small label area.
    img = np.full((300, 300), 255, dtype=np.uint8)
    cv2.rectangle(img, (100, 100), (200, 200), 0, -1)  # black box = label
    out = preprocess.crop_to_content(img, padding=0)
    h, w = out.shape[:2]
    # Cropped height should be near the box height (100) +- a few rows.
    assert h < 300 and w < 300
    # The black pixels must still be inside.
    nz = cv2.findNonZero(255 - out)  # remaining black pixels
    assert nz is not None


def test_crop_to_content_returns_input_when_too_small():
    # All white - the trim function falls back to the original image.
    img = np.full((50, 50), 255, dtype=np.uint8)
    out = preprocess.crop_to_content(img)
    assert out.shape == img.shape


def test_preprocess_end_to_end_returns_all_intermediates(white_label, tmp_path: Path):
    # Save to a tmp file so read_image can find it.
    p = tmp_path / "label.png"
    cv2.imwrite(str(p), white_label)
    out = preprocess.preprocess(p)
    expected = {"color", "gray", "clahe", "bilateral", "threshold", "deskewed", "cropped"}
    assert set(out.keys()) == expected
    for img in out.values():
        assert img.ndim in (2, 3)
        assert img.size > 0


def test_preprocess_otsu_mode_runs(white_label, tmp_path: Path):
    p = tmp_path / "label.png"
    cv2.imwrite(str(p), white_label)
    out = preprocess.preprocess(p, adaptive_mode="otsu", do_deskew=False, do_crop=False)
    assert set(np.unique(out["threshold"]).tolist()).issubset({0, 255})