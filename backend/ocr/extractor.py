"""Glue between the OCR pipeline and the backend's ``build_scan``.

Pipeline: ``preprocess`` -> ``ocr.run`` -> ``fields.extract`` ->
``_to_api_fields`` (rename to the API's flat field set). The response
matches the frozen ``ScanResponse`` from ``backend.main``.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any, Union

import cv2
import numpy as np

from backend.ocr import fields, ocr, preprocess

API_FIELDS = (
    "manufacturer",
    "address",
    "pincode",
    "fssai",
    "bis_licence",
    "mrp",
    "net_qty",
    "mfg_date",
    "expiry",
    "customer_care",
    "cin",
    "gstin",
    "product_name",
)

SCAN_ID_PREFIX = "scan_"

INTERNAL_TO_API = {
    "manufacturer_name": "manufacturer",
    "manufacturer_address": "address",
    "marketed_by_name": None,
    "marketed_by_address": None,
    "pincode": "pincode",
    "fssai": "fssai",
    "bis_cml": "bis_licence",
    "is_number": None,
    "mrp": "mrp",
    "net_quantity": "net_qty",
    "mfg_date": "mfg_date",
    "expiry_or_best_before": "expiry",
    "customer_care": "customer_care",
    "cin": "cin",
    "gstin": "gstin",
    "product_name": "product_name",
}

API_TO_INTERNAL = {
    "manufacturer": "manufacturer_name",
    "address": "manufacturer_address",
    "pincode": "pincode",
    "fssai": "fssai",
    "bis_licence": "bis_cml",
    "mrp": "mrp",
    "net_qty": "net_quantity",
    "mfg_date": "mfg_date",
    "expiry": "expiry_or_best_before",
    "customer_care": "customer_care",
    "cin": "cin",
    "gstin": "gstin",
    "product_name": "product_name",
}


def _empty_api_field() -> dict[str, Any]:
    return {
        "value": None,
        "confidence": None,
        "uncertain": False,
        "source": None,
    }


def _to_api_fields(scan_fields: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {f: _empty_api_field() for f in API_FIELDS}
    for internal_key, scan_field in scan_fields.items():
        api_key = INTERNAL_TO_API.get(internal_key)
        if api_key is None:
            continue
        if scan_field.get("value") is None and not scan_field.get("uncertain"):
            continue
        out[api_key] = {
            "value": scan_field.get("value"),
            "confidence": scan_field.get("confidence"),
            "uncertain": bool(scan_field.get("uncertain", False)),
            "source": scan_field.get("source"),
        }
    return out


def _to_internal_fields(api_fields: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for api_key, value in api_fields.items():
        if api_key == "scan_id":
            continue
        internal_key = API_TO_INTERNAL.get(api_key)
        if internal_key is None:
            continue
        if isinstance(value, str) and value:
            out[internal_key] = {
                "value": value,
                "confidence": 1.0,
                "uncertain": False,
                "source": "user",
            }
    return out


def new_scan_id() -> str:
    return f"{SCAN_ID_PREFIX}{uuid.uuid4().hex}"


def _read_bytes(source: Union[str, bytes, Path]) -> bytes:
    if isinstance(source, (bytes, bytearray, memoryview)):
        return bytes(source)
    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"label image not found: {path}")
    return path.read_bytes()


def _to_array(image: Union[str, bytes, Path, np.ndarray]) -> np.ndarray:
    """Convert the input into a BGR numpy array for the OCR pipeline."""
    if isinstance(image, np.ndarray):
        return image
    if isinstance(image, (str, Path)):
        arr = preprocess.read_image(image)
        return arr
    # bytes path: write to a temp file and read it. (PIL / cv2 both
    # accept file-like objects, but pytesseract's PIL.Image.open is the
    # easiest path; a temp file keeps the API surface uniform.)
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as tmp:
        tmp.write(bytes(image))
        tmp_path = Path(tmp.name)
    try:
        return preprocess.read_image(tmp_path)
    finally:
        try:
            tmp_path.unlink()
        except OSError:  # pragma: no cover - best effort
            pass


def extract(
    image: Union[str, bytes, Path, np.ndarray],
    *,
    scan_id: str | None = None,
    adaptive_mode: str = "gaussian",
    psm: int | None = None,
    lang: str = "eng+hin",
) -> dict[str, Any]:
    """Run the full OCR pipeline on one image and return a ``ScanResponse``."""
    sid = scan_id or new_scan_id()
    empty = {f: _empty_api_field() for f in API_FIELDS}
    try:
        bgr = _to_array(image)
    except FileNotFoundError as exc:
        return {
            "scan_id": sid,
            "status": "not_checked",
            "reason": f"label image not found: {exc.filename}",
            "fields": empty,
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "scan_id": sid,
            "status": "not_checked",
            "reason": f"could not read image: {exc}",
            "fields": empty,
        }

    try:
        pipeline = preprocess.preprocess(
            bgr, adaptive_mode=adaptive_mode, do_deskew=True, do_crop=True
        )
        binarised = pipeline["cropped"]

        ocr.configure_tesseract(lang=lang)
        result = ocr.run(binarised, psm=psm, lang=lang)

        # Find the image bytes for the optional Gemini fallback.
        if isinstance(image, (bytes, bytearray, memoryview)):
            image_bytes = bytes(image)
        elif isinstance(image, (str, Path)):
            image_bytes = Path(image).read_bytes()
        else:
            # ndarray: re-encode to JPEG for the LLM call.
            ok, buf = cv2.imencode(".jpg", image)
            image_bytes = buf.tobytes() if ok else b""

        api_key = os.environ.get("GEMINI_API_KEY")
        scan_fields = fields.extract(
            result.lines,
            image_bytes=image_bytes,
            api_key=api_key,
            trigger_llm_avg_conf=0.60,
        )
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "scan_id": sid,
            "status": "not_checked",
            "reason": f"OCR pipeline failed: {exc.__class__.__name__}: {exc}",
            "fields": empty,
        }

    api_fields = _to_api_fields(scan_fields)
    has_value = any(f["value"] for f in api_fields.values())
    return {
        "scan_id": sid,
        "status": "checked" if has_value else "not_checked",
        "reason": None if has_value else "no fields extracted",
        "fields": api_fields,
    }


if __name__ == "__main__":  # pragma: no cover
    import argparse
    import json

    # Make sure the Tesseract binary is on PATH for the subprocess even when
    # the parent shell hasn't set it (Windows installer puts it in
    # ``C:\Program Files\Tesseract-OCR`` which isn't on PATH by default).
    ocr.configure_tesseract()

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("image")
    p.add_argument("--psm", type=int, default=None)
    p.add_argument("--mode", default="gaussian", choices=["gaussian", "otsu"])
    args = p.parse_args()

    result = extract(args.image, adaptive_mode=args.mode, psm=args.psm)
    summary = {
        "scan_id": result["scan_id"],
        "status": result["status"],
        "reason": result["reason"],
        "fields_found": [k for k, v in result["fields"].items() if v["value"]],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))