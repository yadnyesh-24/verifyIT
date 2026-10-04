"""Draft ground-truth rows for the OCR test set with Gemini Vision.

This script is a **time-saver**, not the extractor. Its output is *never*
used for evaluation until a human checks it (sets ``checked=y`` in the
draft CSV) and runs ``--finalize``.

The product-level fields go to ``ground_truth_draft.csv``; the per-party
blocks (manufacturer, marketer, packer, importer, ...) go to
``ground_truth_parties_draft.csv``. See ``data/test_labels/README.md`` for
the schemas.

Run from the repository root::

    python -m backend.ocr.draft_ground_truth
    python -m backend.ocr.draft_ground_truth --dry-run
    python -m backend.ocr.draft_ground_truth --force
    python -m backend.ocr.draft_ground_truth --finalize
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))

# --------------------------------------------------------------------------- #
# Constants — schemas (frozen per the brief)
# --------------------------------------------------------------------------- #

PRODUCT_COLUMNS = [
    "image",
    "difficulty",
    "language",
    "mrp",
    "net_quantity",
    "customer_care",
    "mfg_date",
    "expiry_or_best_before",
    "bis_cml",
    "is_number",
    "checked",
]

PARTIES_COLUMNS = [
    "image",
    "role",
    "unit_code",
    "name",
    "address",
    "pincode",
    "fssai",
    "cin",
    "gstin",
    "checked",
]

PRODUCT_DRAFT = _REPO_ROOT / "data" / "test_labels" / "ground_truth_draft.csv"
PARTIES_DRAFT = _REPO_ROOT / "data" / "test_labels" / "ground_truth_parties_draft.csv"
PRODUCT_FINAL = _REPO_ROOT / "data" / "test_labels" / "ground_truth.csv"
PARTIES_FINAL = _REPO_ROOT / "data" / "test_labels" / "ground_truth_parties.csv"
CACHE_DIR = _REPO_ROOT / "data" / "test_labels" / "cache"

ROLES = {"manufacturer", "marketer", "packer", "importer", "unassigned"}

PROMPT = """You are transcribing a printed Indian product label.

Transcribe EXACTLY what is printed. Do not guess or correct OCR-like errors.
If a field is not printed, return null. Return JSON only, no prose.

Schema:
{
  "product": {
    "mrp": string|null,
    "net_quantity": string|null,
    "customer_care": string|string[]|null,
    "mfg_date": string|null,
    "expiry_or_best_before": string|null,
    "bis_cml": string|null,
    "is_number": string|null
  },
  "parties": [
    {
      "role": "manufacturer"|"marketer"|"packer"|"importer"|"unassigned",
      "unit_code": string|null,
      "name": string|null,
      "address": string|null,
      "pincode": string|null,
      "fssai": string|null,
      "cin": string|null,
      "gstin": string|null
    }
  ]
}"""

DEFAULT_MODEL = "gemini-2.0-flash"


# --------------------------------------------------------------------------- #
# Formatting helpers — pure
# --------------------------------------------------------------------------- #

_MRP_DIGITS = re.compile(r"\d+(?:\.\d+)?")
_NON_DIGIT = re.compile(r"[^0-9]")
_DIGIT_FIXES = str.maketrans({"O": "0", "o": "0", "I": "1", "l": "1", "S": "5", "B": "8"})


def _digits_only(value) -> str:
    if value is None:
        return ""
    return _NON_DIGIT.sub("", str(value).translate(_DIGIT_FIXES))


def _format_mrp(value) -> str:
    if value is None:
        return ""
    s = str(value).translate(_DIGIT_FIXES)
    m = _MRP_DIGITS.search(s)
    if not m:
        return ""
    num = m.group(0)
    if "." not in num:
        return f"{num}.00"
    whole, _, frac = num.partition(".")
    frac = (frac + "00")[:2]
    return f"{whole}.{frac}"


def _format_customer_care(value) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        parts = [_digits_only(v) for v in value]
    else:
        parts = [_digits_only(p) for p in str(value).split("|")]
    return " | ".join(p for p in parts if p)


def _format_product_row(image: str, product: dict) -> dict[str, str]:
    return {
        "image": image,
        "difficulty": "",
        "language": "",
        "mrp": _format_mrp(product.get("mrp")),
        "net_quantity": "" if product.get("net_quantity") is None else str(product.get("net_quantity")),
        "customer_care": _format_customer_care(product.get("customer_care")),
        "mfg_date": "" if product.get("mfg_date") is None else str(product.get("mfg_date")),
        "expiry_or_best_before": "" if product.get("expiry_or_best_before") is None else str(product.get("expiry_or_best_before")),
        "bis_cml": "" if product.get("bis_cml") is None else str(product.get("bis_cml")),
        "is_number": "" if product.get("is_number") is None else str(product.get("is_number")),
        "checked": "",
    }


def _format_party_row(image: str, party: dict) -> dict[str, str]:
    role = (party.get("role") or "unassigned").lower().strip()
    if role not in ROLES:
        role = "unassigned"
    return {
        "image": image,
        "role": role,
        "unit_code": "" if party.get("unit_code") is None else str(party.get("unit_code")),
        "name": "" if party.get("name") is None else str(party.get("name")),
        "address": "" if party.get("address") is None else str(party.get("address")),
        "pincode": _digits_only(party.get("pincode")),
        "fssai": _digits_only(party.get("fssai")),
        "cin": "" if party.get("cin") is None else str(party.get("cin")),
        "gstin": "" if party.get("gstin") is None else str(party.get("gstin")),
        "checked": "",
    }


# --------------------------------------------------------------------------- #
# Image discovery & IO helpers
# --------------------------------------------------------------------------- #

def _safe_cache_key(image_rel: str) -> str:
    return image_rel.replace("/", "__").replace(":", "_")


def _cache_path(image_rel: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{_safe_cache_key(image_rel)}.json"


def _discover_images(test_labels_dir: Path) -> list[str]:
    """Return image paths relative to ``test_labels_dir`` (subdirs real/ and fake/)."""
    images: list[str] = []
    for sub in ("real", "fake"):
        d = test_labels_dir / sub
        if not d.exists():
            continue
        for ext in ("*.jpg", "*.jpeg", "*.png"):
            for f in sorted(d.glob(ext)):
                if f.name.startswith("_"):
                    continue
                rel = f.relative_to(test_labels_dir).as_posix()
                images.append(rel)
    return images


def _load_existing_draft_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _load_dotenv() -> None:
    """Tiny .env loader so we don't pull in ``python-dotenv`` just for this."""
    env = _REPO_ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k.strip(), v)


# --------------------------------------------------------------------------- #
# Gemini client
# --------------------------------------------------------------------------- #

def _extract_json(text: str) -> dict:
    """Find the first JSON object in a possibly-fenced response."""
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fence:
        candidate = fence.group(1)
    else:
        first = text.find("{")
        last = text.rfind("}")
        candidate = text[first:last + 1] if first != -1 and last != -1 else text
    return json.loads(candidate)


def _gemini_client():
    """Return ``(callable(prompt, image_bytes, model) -> dict, default_model)``."""
    _load_dotenv()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit(
            "GEMINI_API_KEY missing — copy .env.example to .env and fill it in"
        )
    try:
        # New SDK (preferred when available)
        from google import genai  # type: ignore  # noqa: F401
        from google.genai import types  # type: ignore

        client = genai.Client(api_key=key)

        def _call(prompt: str, image_bytes: bytes, model: str):
            resp = client.models.generate_content(
                model=model,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            return resp.parsed if hasattr(resp, "parsed") else _extract_json(resp.text)

        return _call, DEFAULT_MODEL
    except ImportError:
        # Deprecated SDK (team standard in requirements.txt)
        import google.generativeai as genai  # type: ignore

        genai.configure(api_key=key)
        model_obj = genai.GenerativeModel(DEFAULT_MODEL)

        def _call(prompt: str, image_bytes: bytes, model: str):
            img = {"mime_type": "image/jpeg", "data": image_bytes}
            resp = model_obj.generate_content(
                [img, prompt],
                generation_config={"response_mime_type": "application/json"},
            )
            return _extract_json(resp.text)

        return _call, DEFAULT_MODEL


# --------------------------------------------------------------------------- #
# Drafting
# --------------------------------------------------------------------------- #

def _draft_one(
    image_rel: str,
    test_labels_dir: Path,
    call_gemini,
    model: str,
    use_cache: bool,
) -> tuple[dict, list[dict]] | None:
    """Return (product_row, party_rows) for one image, or None on failure."""
    cache_file = _cache_path(image_rel)
    parsed = None
    if use_cache and cache_file.exists():
        try:
            parsed = json.loads(cache_file.read_text(encoding="utf-8"))["parsed"]
        except Exception:
            parsed = None
    if parsed is None:
        full = test_labels_dir / image_rel
        try:
            image_bytes = full.read_bytes()
        except Exception as exc:
            print(f"[err] {image_rel}: cannot read ({exc})")
            return None
        try:
            parsed = call_gemini(PROMPT, image_bytes, model)
        except Exception as exc:
            print(f"[err] {image_rel}: {exc}")
            return None
        cache_file.write_text(
            json.dumps(
                {"image": image_rel, "model": model, "ts": int(time.time()), "parsed": parsed},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    product = (parsed or {}).get("product") or {}
    parties = (parsed or {}).get("parties") or []
    return _format_product_row(image_rel, product), [
        _format_party_row(image_rel, p) for p in parties
    ]


def _merge_draft(
    existing: list[dict],
    new: list[dict],
    key_cols: list[str],
) -> list[dict]:
    """Replace rows in ``existing`` keyed by ``key_cols`` with rows from ``new``."""

    def key(row: dict) -> tuple:
        return tuple(row.get(c, "") for c in key_cols)

    by_key = {key(r): r for r in existing}
    for r in new:
        by_key[key(r)] = r
    return list(by_key.values())


def _write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_NONNUMERIC)
        writer.writeheader()
        for r in rows:
            writer.writerow({c: r.get(c, "") for c in columns})


# --------------------------------------------------------------------------- #
# --finalize
# --------------------------------------------------------------------------- #

def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _checked(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        if (r.get("checked") or "").strip().lower() == "y":
            r2 = dict(r)
            r2.pop("checked", None)
            out.append(r2)
    return out


def _existing_columns(path: Path) -> list[str]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(next(csv.reader(f)))


def _finalize(
    product_draft: Path,
    parties_draft: Path,
    product_final: Path,
    parties_final: Path,
) -> int:
    existing_prod = _read_csv(product_final)
    prod_cols = _existing_columns(product_final) or PRODUCT_COLUMNS.copy()
    if "checked" in prod_cols:
        prod_cols.remove("checked")
    new_prod = _checked(_read_csv(product_draft))
    known_prod = set(PRODUCT_COLUMNS)
    for r in new_prod:
        for c in r:
            if c not in known_prod:
                print(
                    f"[warn] product draft has unknown column {c!r} "
                    f"(first seen in {r.get('image')})"
                )
    by_image: dict[str, dict] = {}
    for r in existing_prod:
        by_image[r.get("image", "")] = r
    for r in new_prod:
        by_image[r.get("image", "")] = r
    final_prod = [by_image[k] for k in by_image if k]
    for r in final_prod:
        for c in prod_cols:
            r.setdefault(c, "")
    _write_csv(product_final, prod_cols, final_prod)

    existing_parties = _read_csv(parties_final)
    parties_cols = _existing_columns(parties_final) or PARTIES_COLUMNS.copy()
    if "checked" in parties_cols:
        parties_cols.remove("checked")
    new_parties = _checked(_read_csv(parties_draft))
    known_parties = set(PARTIES_COLUMNS)
    for r in new_parties:
        for c in r:
            if c not in known_parties:
                print(
                    f"[warn] parties draft has unknown column {c!r} "
                    f"(first seen in {r.get('image')})"
                )
    by_pk: dict[tuple, dict] = {}
    for r in existing_parties:
        by_pk[(r.get("image", ""), r.get("role", ""), r.get("unit_code", ""))] = r
    for r in new_parties:
        by_pk[(r.get("image", ""), r.get("role", ""), r.get("unit_code", ""))] = r
    final_parties = list(by_pk.values())
    for r in final_parties:
        for c in parties_cols:
            r.setdefault(c, "")
    _write_csv(parties_final, parties_cols, final_parties)

    prod_rows = _read_csv(product_draft)
    part_rows = _read_csv(parties_draft)
    prod_unchecked = sum(
        1 for r in prod_rows if (r.get("checked") or "").strip().lower() != "y"
    )
    part_unchecked = sum(
        1 for r in part_rows if (r.get("checked") or "").strip().lower() != "y"
    )
    print(
        f"[ok] wrote {len(final_prod)} rows to {product_final.name} "
        f"({prod_unchecked} unchecked rows still pending)"
    )
    print(
        f"[ok] wrote {len(final_parties)} rows to {parties_final.name} "
        f"({part_unchecked} unchecked rows still pending)"
    )
    return 0 if (prod_unchecked == 0 and part_unchecked == 0) else 1


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--images-dir", type=Path, default=_REPO_ROOT / "data" / "test_labels"
    )
    parser.add_argument(
        "--force", action="store_true", help="re-draft even if a row already exists"
    )
    parser.add_argument(
        "--no-cache", action="store_true", help="ignore the on-disk cache"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="show what would happen, no API calls"
    )
    parser.add_argument(
        "--finalize",
        action="store_true",
        help="copy checked=y rows into the final CSVs",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args(argv)

    test_labels = args.images_dir

    if args.finalize:
        return _finalize(PRODUCT_DRAFT, PARTIES_DRAFT, PRODUCT_FINAL, PARTIES_FINAL)

    images = _discover_images(test_labels)
    if not images:
        print(
            f"[warn] no images found under {test_labels}/real or {test_labels}/fake"
        )
        return 1

    if args.dry_run:
        existing_prod = {r["image"] for r in _load_existing_draft_rows(PRODUCT_DRAFT)}
        existing_parties = {
            (r["image"], r["role"], r["unit_code"])
            for r in _load_existing_draft_rows(PARTIES_DRAFT)
        }
        todo = [i for i in images if args.force or i not in existing_prod]
        print(
            f"[dry-run] would draft {len(todo)} product rows + N parties each "
            f"from {len(images)} images"
        )
        print(f"[dry-run] product rows already drafted: {len(existing_prod)}")
        print(f"[dry-run] parties rows already drafted: {len(existing_parties)}")
        for img in todo[:10]:
            print(f"  - {img}")
        return 0

    call_gemini, default_model = _gemini_client()
    model = args.model or default_model

    existing_prod = _load_existing_draft_rows(PRODUCT_DRAFT)
    existing_parties = _load_existing_draft_rows(PARTIES_DRAFT)
    images_to_process = (
        images
        if args.force
        else [i for i in images if i not in {r["image"] for r in existing_prod}]
    )
    print(
        f"[info] drafting {len(images_to_process)} product rows "
        f"(already drafted: {len(existing_prod)})"
    )

    new_prod: list[dict] = []
    new_parties: list[dict] = []
    for image in images_to_process:
        result = _draft_one(
            image, test_labels, call_gemini, model, use_cache=not args.no_cache
        )
        if result is None:
            continue
        prod_row, party_rows = result
        new_prod.append(prod_row)
        new_parties.extend(party_rows)

    merged_prod = _merge_draft(existing_prod, new_prod, ["image"])
    merged_parties = _merge_draft(
        existing_parties, new_parties, ["image", "role", "unit_code"]
    )
    for r in merged_prod:
        r.setdefault("difficulty", "")
        r.setdefault("language", "")
        r.setdefault("checked", "")
    for r in merged_parties:
        r.setdefault("checked", "")
    _write_csv(PRODUCT_DRAFT, PRODUCT_COLUMNS, merged_prod)
    _write_csv(PARTIES_DRAFT, PARTIES_COLUMNS, merged_parties)
    print(
        f"[ok] wrote {PRODUCT_DRAFT} ({len(merged_prod)} product rows, "
        f"{len(new_prod)} new)"
    )
    print(
        f"[ok] wrote {PARTIES_DRAFT} ({len(merged_parties)} party rows, "
        f"{len(new_parties)} new)"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())