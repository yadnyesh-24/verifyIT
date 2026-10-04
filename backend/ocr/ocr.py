"""OCR pipeline - pytesseract wrapper with PSM 6 vs 11 selection and line rebuild.

Two Tesseract page-segmentation modes:

  PSM 6  (Assume a single uniform block of text.)
  PSM 11 (Sparse text. Find as much text as possible, no particular order.)

PSM 6 wins on well-aligned labels. PSM 11 wins on cluttered photos where
text is scattered, ingredients lists beside marketing copy, etc. The brief
asks us to keep the better of the two; this module returns a single
:class:`OcrResult` with per-word data.

Line rebuild groups words into lines by (block, par, line) ids and computes
an average confidence per line — the building block for field extraction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Union

import numpy as np

# --------------------------------------------------------------------------- #
# Tesseract setup
# --------------------------------------------------------------------------- #

def configure_tesseract(
    *,
    cmd: str | None = None,
    tessdata_prefix: str | None = None,
    lang: str = "eng+hin",
) -> None:
    """Point pytesseract at the Tesseract binary (Windows-friendly).

    Respects ``TESSERACT_CMD`` and ``TESSDATA_PREFIX`` from the environment by
    default, so the team's ``.env`` setup Just Works.

    On Windows, the UB-Mannheim installer drops ``tesseract.exe`` in
    ``C:\\Program Files\\Tesseract-OCR`` which is *not* on the default
    ``PATH``. pytesseract shells out to that binary, so we also prepend the
    install directory to ``PATH`` if the file exists and isn't already there.
    """
    import os
    import pytesseract
    from pathlib import Path

    if cmd is None:
        cmd = os.environ.get("TESSERACT_CMD")
    if tessdata_prefix is None:
        tessdata_prefix = os.environ.get("TESSDATA_PREFIX")
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
        # Make sure the binary's directory is on PATH for the subprocess
        # pytesseract invokes; otherwise the shell can't resolve "tesseract".
        tdir = str(Path(cmd).parent)
        cur = os.environ.get("PATH", "")
        if tdir.lower() not in cur.lower().split(os.pathsep):
            os.environ["PATH"] = tdir + os.pathsep + cur
    if tessdata_prefix:
        os.environ["TESSDATA_PREFIX"] = tessdata_prefix
    # If neither was supplied and the default install path exists, use it.
    elif cmd is None:
        default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if Path(default).exists():
            pytesseract.pytesseract.tesseract_cmd = default
            tdir = str(Path(default).parent)
            cur = os.environ.get("PATH", "")
            if tdir.lower() not in cur.lower().split(os.pathsep):
                os.environ["PATH"] = tdir + os.pathsep + cur
    global _LANG
    _LANG = lang


_LANG = "eng+hin"


# --------------------------------------------------------------------------- #
# Data classes
# --------------------------------------------------------------------------- #

@dataclass
class Word:
    text: str
    conf: float  # 0..1
    bbox: tuple[int, int, int, int]  # x, y, w, h in pixels
    block: int
    par: int
    line: int


@dataclass
class Line:
    text: str
    conf: float
    bbox: tuple[int, int, int, int]
    words: list[Word] = field(default_factory=list)


@dataclass
class OcrResult:
    """The full output of one OCR pass over an image."""

    raw: dict[str, list[Any]]
    psm: int
    lines: list[Line]
    avg_conf: float

    def as_words(self) -> list[dict[str, Any]]:
        return [
            {"text": w.text, "conf": w.conf, "bbox": w.bbox}
            for line in self.lines
            for w in line.words
        ]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _conf_to_fraction(conf_str: str) -> float:
    """Tesseract returns confidences as -1 (none) or 0..100. Normalise to 0..1."""
    try:
        v = float(conf_str)
    except (TypeError, ValueError):
        return 0.0
    if v < 0:
        return 0.0
    return min(1.0, v / 100.0)


def _image_to_data(image, lang: str, psm: int) -> dict[str, list[Any]]:
    """Run ``pytesseract.image_to_data`` on a path or a numpy array."""
    import pytesseract

    config = f"--psm {psm}"
    if isinstance(image, (str, Path)):
        return pytesseract.image_to_data(
            str(image), lang=lang, config=config, output_type=pytesseract.Output.DICT
        )
    return pytesseract.image_to_data(
        np.asarray(image), lang=lang, config=config, output_type=pytesseract.Output.DICT
    )


def _rebuild_lines(raw: dict[str, list[Any]]) -> list[Line]:
    """Group Tesseract's per-word output into lines.

    Words are grouped by ``(block_num, par_num, line_num)``. A word is kept
    only when ``text.strip()`` is non-empty and conf != -1 (Tesseract's "no
    confidence" sentinel). Line text is joined with single spaces; line conf
    is the mean of its words' confidences.
    """
    n = len(raw.get("text", []))
    grouped: dict[tuple[int, int, int], list[int]] = {}
    for i in range(n):
        text = raw["text"][i]
        if not text or not text.strip():
            continue
        if str(raw.get("conf", ["0"])[i]) in {"-1", ""}:
            continue
        key = (int(raw["block_num"][i]), int(raw["par_num"][i]), int(raw["line_num"][i]))
        grouped.setdefault(key, []).append(i)

    lines: list[Line] = []
    for key in sorted(
        grouped.keys(),
        key=lambda k: (raw["top"][grouped[k][0]], raw["left"][grouped[k][0]]),
    ):
        idxs = sorted(grouped[key], key=lambda i: (raw["top"][i], raw["left"][i]))
        words: list[Word] = []
        for i in idxs:
            words.append(
                Word(
                    text=raw["text"][i],
                    conf=_conf_to_fraction(raw["conf"][i]),
                    bbox=(int(raw["left"][i]), int(raw["top"][i]),
                          int(raw["width"][i]), int(raw["height"][i])),
                    block=key[0],
                    par=key[1],
                    line=key[2],
                )
            )
        text = " ".join(w.text for w in words)
        conf = sum(w.conf for w in words) / max(len(words), 1)
        x = min(w.bbox[0] for w in words)
        y = min(w.bbox[1] for w in words)
        x_max = max(w.bbox[0] + w.bbox[2] for w in words)
        y_max = max(w.bbox[1] + w.bbox[3] for w in words)
        lines.append(Line(text=text, conf=conf, bbox=(x, y, x_max - x, y_max - y), words=words))
    return lines


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def run(
    image: Union[str, np.ndarray],
    *,
    psm: int | None = None,
    lang: str | None = None,
) -> OcrResult:
    """Run Tesseract on the image and rebuild the lines.

    If ``psm`` is ``None`` the call is made with both PSM 6 and PSM 11; the
    result with the higher average confidence wins.
    """
    use_lang = lang or _LANG
    if psm is not None:
        results = [(_run_psm(image, psm, use_lang), psm)]
    else:
        a = _run_psm(image, 6, use_lang)
        b = _run_psm(image, 11, use_lang)
        results = [(a, 6), (b, 11)]
    results.sort(key=lambda r: r[0].avg_conf, reverse=True)
    return results[0][0]


def _run_psm(image, psm: int, lang: str) -> OcrResult:
    raw = _image_to_data(image, lang, psm)
    lines = _rebuild_lines(raw)
    avg_conf = sum(line.conf for line in lines) / max(len(lines), 1)
    return OcrResult(raw=raw, psm=psm, lines=lines, avg_conf=avg_conf)


def ocr_lines(
    image: Union[str, np.ndarray],
    *,
    psm: int | None = None,
    lang: str | None = None,
) -> list[Line]:
    """Convenience: just return the lines (no raw Tesseract payload)."""
    return run(image, psm=psm, lang=lang).lines


def ocr_text(
    image: Union[str, np.ndarray],
    *,
    psm: int | None = None,
    lang: str | None = None,
) -> str:
    """Convenience: just return the joined text."""
    return "\n".join(line.text for line in run(image, psm=psm, lang=lang).lines)


if __name__ == "__main__":  # pragma: no cover
    import argparse

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("image")
    parser.add_argument("--psm", type=int, default=None)
    parser.add_argument("--lang", default="eng+hin")
    args = parser.parse_args()
    configure_tesseract(lang=args.lang)
    result = run(args.image, psm=args.psm)
    print(f"psm={result.psm}  avg_conf={result.avg_conf:.3f}  lines={len(result.lines)}")
    for line in result.lines:
        print(f"  conf={line.conf:.2f}  {line.text}")