"""Image preprocessing for the OCR pipeline.

The pipeline mirrors the brief:

    resize -> grayscale -> CLAHE -> bilateral filter -> adaptive threshold -> deskew -> (optional crop)

Every function is small, pure-ish, and tested with synthetic images so the
real-label validation is just a sanity check, not a mystery.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Union

import cv2
import numpy as np

# Type alias for "anything I can read as an image".
ImageLike = Union[str, Path, np.ndarray]


# --------------------------------------------------------------------------- #
# IO helpers
# --------------------------------------------------------------------------- #

def read_image(source: ImageLike) -> np.ndarray:
    """Read an image from disk or pass through a numpy array.

    Raises ``FileNotFoundError`` for missing files (BGR channels preserved).
    """
    if isinstance(source, np.ndarray):
        return source
    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"image not found: {path}")
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"cv2 could not read image: {path}")
    return img


# --------------------------------------------------------------------------- #
# Geometry
# --------------------------------------------------------------------------- #

def resize(image: np.ndarray, *, long_side: int = 1600) -> np.ndarray:
    """Scale so the longer side is at most ``long_side`` pixels.

    1600 is a sweet spot for Tesseract on Indian label photos — large enough
    to keep small text readable, small enough that OCR finishes in ~1.5 s on
    a laptop CPU.
    """
    h, w = image.shape[:2]
    longest = max(h, w)
    if longest <= long_side:
        return image
    scale = long_side / longest
    new_size = (int(round(w * scale)), int(round(h * scale)))
    return cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)


def to_grayscale(image: np.ndarray) -> np.ndarray:
    """Convert BGR -> single-channel grayscale."""
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


# --------------------------------------------------------------------------- #
# Contrast + denoising
# --------------------------------------------------------------------------- #

def clahe(
    gray: np.ndarray,
    *,
    clip_limit: float = 2.0,
    tile_grid: tuple[int, int] = (8, 8),
) -> np.ndarray:
    """Apply CLAHE to flatten uneven lighting."""
    clahe_op = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid)
    return clahe_op.apply(gray)


def bilateral(
    image: np.ndarray,
    *,
    diameter: int = 9,
    sigma_color: float = 75.0,
    sigma_space: float = 75.0,
) -> np.ndarray:
    """Edge-preserving denoise. Works on BGR or grayscale."""
    return cv2.bilateralFilter(image, diameter, sigma_color, sigma_space)


# --------------------------------------------------------------------------- #
# Thresholding
# --------------------------------------------------------------------------- #

def adaptive_threshold(
    gray: np.ndarray,
    *,
    block_size: int = 31,
    c: int = 15,
    mode: str = "gaussian",
) -> np.ndarray:
    """Adaptive thresholding for uneven lighting.

    Modes:
      * ``"gaussian"`` (default) - the brief's primary path; good for Indian
        labels which often have shadows across them.
      * ``"otsu"`` - the alternative path used by ``evaluate.py --compare``;
        works better on even, flat scans.
    """
    if mode == "gaussian":
        return cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, c
        )
    if mode == "otsu":
        _, out = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return out
    raise ValueError(f"unknown adaptive mode: {mode!r} (expected 'gaussian' or 'otsu')")


# --------------------------------------------------------------------------- #
# Geometry correction
# --------------------------------------------------------------------------- #

def deskew(gray: np.ndarray, *, max_angle: float = 15.0) -> np.ndarray:
    """Rotate so the dominant text line is horizontal.

    Estimates the skew angle via the Hough line transform and rotates by the
    negated angle. Replicates the border so the binarised image doesn't get a
    black frame after rotation.
    """
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=math.pi / 360,
        threshold=80,
        minLineLength=gray.shape[1] // 4,
        maxLineGap=20,
    )
    if lines is None or len(lines) == 0:
        return gray
    angles = []
    for x1, y1, x2, y2 in lines.reshape(-1, 4):
        if x2 == x1:
            continue
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        if -max_angle <= a <= max_angle:
            angles.append(a)
    if not angles:
        return gray
    angle = float(np.median(angles))
    if abs(angle) < 0.2:  # below 0.2°: don't bother
        return gray
    h, w = gray.shape[:2]
    centre = (w / 2.0, h / 2.0)
    M = cv2.getRotationMatrix2D(centre, angle, 1.0)
    return cv2.warpAffine(
        gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


# --------------------------------------------------------------------------- #
# Optional cropping
# --------------------------------------------------------------------------- #

def crop_to_content(
    image: np.ndarray,
    *,
    padding: int = 8,
    min_area_ratio: float = 0.1,
) -> np.ndarray:
    """Trim uniform background to the bounding box of the label.

    Otsu-binarises, then trims any leading / trailing rows and columns whose
    variance is near zero. ``min_area_ratio`` is the minimum fraction of the
    remaining axis that must be "active" before the trim stops — keeps the
    function from eating the label if its background is uneven.
    """
    if image.ndim == 3:
        gray = to_grayscale(image)
    else:
        gray = image
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    row_active = (binary.std(axis=1) > 5).astype(np.uint8)
    col_active = (binary.std(axis=0) > 5).astype(np.uint8)

    def _trim_axis(active: np.ndarray) -> tuple[int, int]:
        n = len(active)
        lo, hi = 0, n
        while lo < n and active[lo] == 0:
            if active[lo:].sum() / max(n - lo, 1) < min_area_ratio:
                break
            lo += 1
        while hi > lo and active[hi - 1] == 0:
            if active[:hi - 1].sum() / max(hi - 1, 1) < min_area_ratio:
                break
            hi -= 1
        return max(0, lo - padding), min(n, hi + padding)

    y0, y1 = _trim_axis(row_active)
    x0, x1 = _trim_axis(col_active)
    if y1 - y0 < 32 or x1 - x0 < 32:
        return image  # too small to be a useful crop
    return image[y0:y1, x0:x1]


# --------------------------------------------------------------------------- #
# All-in-one pipeline
# --------------------------------------------------------------------------- #

def preprocess(
    source: ImageLike,
    *,
    long_side: int = 1600,
    adaptive_mode: str = "gaussian",
    do_deskew: bool = True,
    do_crop: bool = True,
) -> dict[str, np.ndarray]:
    """Run the full preprocessing pipeline and return every intermediate."""
    color = resize(read_image(source), long_side=long_side)
    gray = to_grayscale(color)
    eq = clahe(gray)
    denoised = bilateral(eq)
    thr = adaptive_threshold(denoised, mode=adaptive_mode)
    deskewed = deskew(thr) if do_deskew else thr
    final = crop_to_content(deskewed) if do_crop else deskewed
    return {
        "color": color,
        "gray": gray,
        "clahe": eq,
        "bilateral": denoised,
        "threshold": thr,
        "deskewed": deskewed,
        "cropped": final,
    }


if __name__ == "__main__":  # pragma: no cover
    import argparse

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("image", help="input image path")
    p.add_argument("--out", required=True, help="output dir for intermediates")
    p.add_argument("--mode", default="gaussian", choices=["gaussian", "otsu"])
    p.add_argument("--no-deskew", action="store_true")
    p.add_argument("--no-crop", action="store_true")
    args = p.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, img in preprocess(
        args.image, adaptive_mode=args.mode, do_deskew=not args.no_deskew, do_crop=not args.no_crop
    ).items():
        path = out / f"{name}.png"
        cv2.imwrite(str(path), img)
        print(path)