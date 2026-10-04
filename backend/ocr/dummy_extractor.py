"""Empty-fields stub extractor.

Used by the evaluation harness before the real OCR pipeline exists. Every
field comes back as a ``ScanField`` with ``value=None`` so the harness can
exercise the per-image timing path and the scoring layer end-to-end.
"""

from __future__ import annotations

from typing import Any


def extract(image_path: str | bytes) -> dict[str, Any]:
    """Return an empty-fields ScanResponse.

    Accepts ``image_path`` (str or bytes) so the harness can pass the same
    signature the real extractor will use. The bytes form is ignored.
    """
    return {
        "scan_id": None,
        "status": "not_checked",
        "reason": "dummy extractor",
        "fields": {},
    }