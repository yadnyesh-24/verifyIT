"""OCR evaluation harness.

Loads ground truth and images, calls a pluggable extractor on each, scores
the predictions, and writes a per-config CSV + a clean console table.

Run from the repository root::

    python -m backend.ocr.evaluate --extractor backend.ocr.dummy_extractor --config dummy
    python -m backend.ocr.evaluate --compare backend.ocr.dummy_extractor backend.ocr.dummy_extractor
"""

from __future__ import annotations

import argparse
import csv
import importlib
import sys
import time
from pathlib import Path

# Allow ``python backend/ocr/evaluate.py`` from the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))

from backend.ocr.scoring import (  # noqa: E402
    FieldMetrics,
    Prediction,
    format_table,
    per_field_metrics_tuples,
    stratify,
    write_csv,
)

DEFAULT_FIELDS = [
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
    "address",
]

DEFAULT_GT = _REPO_ROOT / "data" / "test_labels" / "ground_truth.csv"
DEFAULT_RESULTS = _REPO_ROOT / "data" / "test_labels" / "results"


def load_ground_truth(path: Path) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    """Return ``({image: {field: value}}, {image: {difficulty, language, source}})``.

    Rows whose image file does not exist are skipped with a warning.
    """
    by_image: dict[str, dict[str, str]] = {}
    meta: dict[str, dict[str, str]] = {}
    if not path.exists():
        return by_image, meta
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            image = (row.get("image") or "").strip()
            if not image:
                continue
            img_path = _REPO_ROOT / "data" / "test_labels" / image
            if not img_path.exists():
                print(f"[warn] ground_truth row skipped (missing file): {image}")
                continue
            by_image[image] = {
                k: (v or "").strip()
                for k, v in row.items()
                if k not in ("image", "checked")
            }
            meta[image] = {
                "difficulty": (row.get("difficulty") or "").strip(),
                "language": (row.get("language") or "").strip(),
                "source": (row.get("source") or "").strip(),
            }
    return by_image, meta


def load_extractor(module_path: str):
    """Import an extractor module and return its ``extract`` callable."""
    mod = importlib.import_module(module_path)
    if not hasattr(mod, "extract"):
        raise SystemExit(f"module {module_path!r} has no extract() function")
    return mod.extract


def _pred_fields_from(result: dict | None) -> dict[str, dict]:
    pred_fields = (result or {}).get("fields", {}) or {}
    return {
        k: {
            "value": (v or {}).get("value"),
            "uncertain": bool((v or {}).get("uncertain", False)),
        }
        for k, v in pred_fields.items()
    }


def run(
    extractor_path: str,
    config: str,
    ground_truth_path: Path,
    fields: list[str],
) -> tuple[dict[str, FieldMetrics], list[Prediction], float]:
    """Run the extractor on every image and return metrics + predictions."""
    gt, meta = load_ground_truth(ground_truth_path)
    extract = load_extractor(extractor_path)

    predictions: list[Prediction] = []
    for image in gt:
        full_path = ground_truth_path.parent / image
        t0 = time.perf_counter()
        try:
            result = extract(str(full_path))
            elapsed_ms = (time.perf_counter() - t0) * 1000
            pred_fields = _pred_fields_from(result)
        except Exception as exc:  # pragma: no cover - defensive
            elapsed_ms = (time.perf_counter() - t0) * 1000
            pred_fields = {}
            predictions.append(
                Prediction(
                    image=image,
                    fields={},
                    elapsed_ms=elapsed_ms,
                    difficulty=meta.get(image, {}).get("difficulty", ""),
                    language=meta.get(image, {}).get("language", ""),
                    source=meta.get(image, {}).get("source", ""),
                    error=str(exc),
                )
            )
            continue
        predictions.append(
            Prediction(
                image=image,
                fields=pred_fields,
                elapsed_ms=elapsed_ms,
                difficulty=meta.get(image, {}).get("difficulty", ""),
                language=meta.get(image, {}).get("language", ""),
                source=meta.get(image, {}).get("source", ""),
            )
        )

    triples: dict[str, list[tuple[str, str, bool, str]]] = {}
    for f in fields:
        triples[f] = [
            (
                (p.fields.get(f) or {}).get("value") or "",
                gt.get(p.image, {}).get(f, ""),
                bool((p.fields.get(f) or {}).get("uncertain", False)),
                p.image,
            )
            for p in predictions
        ]

    avg_ms = (
        sum(p.elapsed_ms for p in predictions) / len(predictions)
        if predictions
        else 0.0
    )
    metrics = per_field_metrics_tuples(triples, avg_ms_per_image=avg_ms)
    return metrics, predictions, avg_ms


def _print_section(title: str, body: str) -> None:
    print(f"\n=== {title} ===")
    print(body)


def _format_stratified(
    extractor: str,
    gt_path: Path,
    fields: list[str],
    key: str,
    predictions: list[Prediction],
    gt: dict[str, dict[str, str]],
) -> str:
    lines: list[str] = []
    for field in fields:
        groups = stratify(predictions, gt, field, key)
        if not groups:
            continue
        for bucket, items in sorted(groups):
            triples = {field: items}
            m = per_field_metrics_tuples(triples)
            fm = m.get(field)
            if fm is None or fm.support == 0:
                continue
            lines.append(
                f"  {key}={bucket:<10}  {field:<22}  prec={fm.precision:.3f}  acc={fm.accuracy:.3f}  n={fm.support}"
            )
    return "\n".join(lines) if lines else "(no data)"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--extractor", required=True, help="module path, e.g. backend.ocr.dummy_extractor")
    parser.add_argument("--config", default="default", help="config name used in the output CSV filename")
    parser.add_argument("--ground-truth", type=Path, default=DEFAULT_GT)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument(
        "--fields",
        nargs="+",
        default=DEFAULT_FIELDS,
        help="fields to score (default: the full set)",
    )
    parser.add_argument(
        "--compare",
        nargs="+",
        metavar="EXTRACTOR",
        help="run several extractors and print side-by-side",
    )
    args = parser.parse_args(argv)

    if args.compare:
        rows = []
        for ext in args.compare:
            metrics, _, avg_ms = run(ext, ext, args.ground_truth, args.fields)
            _print_section(f"{ext}  (avg {avg_ms:.1f} ms/img)", format_table(metrics))
            rows.append((ext, metrics, avg_ms))
        print("\n=== side-by-side (precision / accuracy / ms-per-image) ===")
        print(f"{'extractor':<40} {'field':<22} {'prec':>6} {'acc':>6} {'ms':>8}")
        for ext, metrics, avg_ms in rows:
            for f, m in metrics.items():
                print(
                    f"{ext:<40} {f:<22} {m.precision:>6.3f} {m.accuracy:>6.3f} {avg_ms:>8.1f}"
                )
        return 0

    metrics, predictions, avg_ms = run(
        args.extractor, args.config, args.ground_truth, args.fields
    )
    out_csv = args.results_dir / f"{args.config}_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.csv"
    write_csv(metrics, out_csv)
    gt, _ = load_ground_truth(args.ground_truth)
    _print_section(
        f"{args.extractor}  config={args.config}  avg={avg_ms:.1f} ms/img",
        format_table(metrics),
    )
    _print_section(
        "per difficulty",
        _format_stratified(args.extractor, args.ground_truth, args.fields, "difficulty", predictions, gt),
    )
    _print_section(
        "per language",
        _format_stratified(args.extractor, args.ground_truth, args.fields, "language", predictions, gt),
    )
    print(f"\n[ok] wrote {out_csv}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())