"""Scoring helpers used by the OCR evaluation harness.

Pure functions only. The evaluation CLI in ``backend.ocr.evaluate`` composes
these into the final report.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

from backend.ocr.normalize import is_fuzzy_field, norm_field

# Fuzzy threshold from the brief: ≥ 0.85 means a match.
FUZZY_THRESHOLD = 0.85

# All numeric fields, including the team-wide verify-request names so the
# evaluation harness works against both the draft schema and Aditya's
# ``VerifyRequest`` schema.
NUMERIC_FIELDS = frozenset(
    {
        "fssai",
        "pincode",
        "customer_care",
        "cin",
        "gstin",
        "bis_cml",
        "is_number",
    }
)


@dataclass
class Prediction:
    """One OCR result for one image.

    ``fields`` maps field name -> ``{"value": str|None, "uncertain": bool, ...}``.
    """

    image: str
    fields: dict[str, dict[str, Any]]
    elapsed_ms: float
    difficulty: str = ""
    language: str = ""
    source: str = ""
    error: str | None = None


@dataclass
class FieldMetrics:
    field: str
    precision: float
    recall: float
    accuracy: float
    uncertain_share: float
    tp: int
    fp: int
    fn: int
    support: int
    avg_ms_per_image: float

    def as_row(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "accuracy": round(self.accuracy, 4),
            "uncertain_share": round(self.uncertain_share, 4),
            "tp": self.tp,
            "fp": self.fp,
            "fn": self.fn,
            "support": self.support,
            "avg_ms_per_image": round(self.avg_ms_per_image, 1),
        }


def fuzzy_ratio(a: str, b: str) -> float:
    """Return the SequenceMatcher ratio in [0, 1]."""
    return SequenceMatcher(None, a, b).ratio()


def values_match(pred: str, truth: str, field: str) -> bool:
    """Return ``True`` if ``pred`` matches ``truth`` after normalisation."""
    p = norm_field(pred, field)
    t = norm_field(truth, field)
    if not t:
        return False
    if p == t:
        return True
    if is_fuzzy_field(field):
        return fuzzy_ratio(p, t) >= FUZZY_THRESHOLD
    return False


def per_field_metrics_tuples(
    triples: dict[str, list[tuple[str, str, bool, str]]],
    avg_ms_per_image: float = 0.0,
) -> dict[str, FieldMetrics]:
    """Compute per-field metrics from ``(pred, truth, uncertain, support_key)`` lists.

    Empty truth values count as "not printed" — neither hit nor miss.
    """
    out: dict[str, FieldMetrics] = {}
    for field, items in triples.items():
        tp = fp = fn = exact = support = 0
        mistakes = mistakes_marked_uncertain = 0
        for pred, truth, uncertain, _key in items:
            t_norm = norm_field(truth, field)
            if not t_norm:
                continue
            support += 1
            p_norm = norm_field(pred, field)
            if values_match(pred, truth, field):
                tp += 1
                if p_norm == t_norm:
                    exact += 1
            else:
                fn += 1
                mistakes += 1
                if uncertain:
                    mistakes_marked_uncertain += 1
                if p_norm:
                    fp += 1
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        accuracy = exact / support if support else 0.0
        uncertain_share = (
            mistakes_marked_uncertain / mistakes if mistakes else 0.0
        )
        out[field] = FieldMetrics(
            field=field,
            precision=precision,
            recall=recall,
            accuracy=accuracy,
            uncertain_share=uncertain_share,
            tp=tp,
            fp=fp,
            fn=fn,
            support=support,
            avg_ms_per_image=avg_ms_per_image,
        )
    return out


def stratify(
    predictions: list[Prediction],
    ground_truth: dict[str, dict[str, str]],
    field: str,
    key: str,
) -> list[tuple[str, list[tuple[str, str, bool, str]]]]:
    """Group triples by ``key`` ∈ {'difficulty','language','source','all'}."""
    groups: dict[str, list[tuple[str, str, bool, str]]] = {}
    for pred in predictions:
        truth = ground_truth.get(pred.image, {}).get(field, "")
        p_val = pred.fields.get(field, {}).get("value", "") or ""
        uncertain = bool(pred.fields.get(field, {}).get("uncertain", False))
        if key == "difficulty":
            bucket = pred.difficulty or "unknown"
        elif key == "language":
            bucket = pred.language or "unknown"
        elif key == "source":
            bucket = pred.source or "unknown"
        elif key == "all":
            bucket = "all"
        else:  # pragma: no cover - defensive
            raise ValueError(f"unknown stratification key: {key}")
        groups.setdefault(bucket, []).append((p_val, truth, uncertain, pred.image))
    return list(groups.items())


def format_table(metrics: dict[str, FieldMetrics]) -> str:
    """Return a human-readable table from a metrics dict."""
    if not metrics:
        return "(no metrics)"
    headers = (
        "field",
        "prec",
        "recall",
        "acc",
        "uncertain",
        "tp",
        "fp",
        "fn",
        "support",
        "ms/img",
    )
    rows = [headers]
    for f, m in metrics.items():
        rows.append(
            (
                f,
                f"{m.precision:.3f}",
                f"{m.recall:.3f}",
                f"{m.accuracy:.3f}",
                f"{m.uncertain_share:.3f}",
                str(m.tp),
                str(m.fp),
                str(m.fn),
                str(m.support),
                f"{m.avg_ms_per_image:.1f}",
            )
        )
    widths = [max(len(r[i]) for r in rows) for i in range(len(headers))]
    lines = []
    for i, row in enumerate(rows):
        lines.append(
            "  ".join(cell.ljust(widths[j]) for j, cell in enumerate(row)).rstrip()
        )
        if i == 0:
            lines.append("  ".join("-" * w for w in widths))
    return "\n".join(lines)


def write_csv(metrics: dict[str, FieldMetrics], path: Path) -> None:
    """Write the metrics dict as CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        if not metrics:
            f.write("")
            return
        writer = csv.DictWriter(
            f, fieldnames=list(next(iter(metrics.values())).as_row().keys())
        )
        writer.writeheader()
        for m in metrics.values():
            writer.writerow(m.as_row())