"""Verify It backend API.

FastAPI application for the "Verify It" hackathon project.

What can actually run today: the ``company`` check against a locally imported MCA
*Company Master Data* snapshot, and the deterministic FSSAI *format* check. The
FSSAI/BIS registries (Surepass), and the OCR pipeline are not connected - no
external registry API is called and no credentials exist for one - so those
checks return a neutral ``not_checked`` placeholder (see ``backend.providers``)
and the response contract stays stable for the frontend.

Nothing is invented anywhere: a check that cannot run is ``not_checked``, the
trust score is derived only from the checks that did run (and is ``null`` when
none did), and every claim carries the evidence behind it.
"""

from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from backend import db, providers

# Load `.env` (git-ignored) when it exists so DATABASE_URL, GEMINI_API_KEY, ...
# can be set once per machine instead of exported by hand. Real environment
# variables always win - `load_dotenv` does not override them - and the app runs
# fine with no `.env` at all.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - python-dotenv is a declared dependency
    pass

APP_NAME = "Verify It"

# Frontend origins allowed to call this API during local development.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

#: Private-network origins allowed in addition to ``ALLOWED_ORIGINS``, so the dev
#: server can be opened from a phone on the same Wi-Fi without hard-coding an IP
#: that changes with every network. Only the RFC 1918 ranges match - a public host
#: still has to be added to ``ALLOWED_ORIGINS`` by hand, and ``*`` is never opened.
LAN_ORIGIN_REGEX = (
    r"http://(?:"
    r"192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r")(?::\d+)?"
)

#: Confirmed label fields forwarded to the label-law checker, in the order the
#: review screen collects them. ``scan_id`` is deliberately absent: it identifies
#: the *scan session*, not the label, so it is never a check input.
LABEL_FIELD_NAMES = (
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

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=LAN_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Schemas ---------------------------------------------------------------


class ScanField(BaseModel):
    """A single field read from a label."""

    value: str | None = Field(default=None, description="Field value, or null if not found.")
    confidence: float | None = Field(
        default=None, ge=0.0, le=1.0, description="Reader confidence (0-1)."
    )
    uncertain: bool = Field(
        default=False, description="True when the reader is unsure and the user should check it."
    )
    source: str | None = Field(default=None, description="'ocr', 'llm' or 'both'.")


class ScanResponse(BaseModel):
    """Result of POST /api/scan (OCR field extraction)."""

    scan_id: str | None = None
    status: str = providers.STATUS_NOT_CHECKED
    # null once the OCR pipeline actually read fields: there is nothing left to
    # explain. A reason is only carried when the scan could not produce values.
    reason: str | None = providers.OCR_PENDING_REASON
    fields: dict[str, ScanField] = Field(default_factory=dict)


class VerifyRequest(BaseModel):
    """Confirmed field values sent from the review screen. Every field optional."""

    scan_id: str | None = None
    manufacturer: str | None = Field(default=None, description="Manufacturer / maker name.")
    address: str | None = Field(default=None, description="Manufacturer address.")
    pincode: str | None = Field(default=None, description="Pincode printed on the label.")
    fssai: str | None = Field(
        default=None, description="FSSAI licence number. Its format is checked."
    )
    bis_licence: str | None = Field(default=None, description="BIS / ISI licence number.")
    mrp: str | None = Field(default=None, description="Maximum retail price.")
    net_qty: str | None = Field(default=None, description="Net quantity.")
    mfg_date: str | None = Field(default=None, description="Manufacture / packing date.")
    expiry: str | None = Field(default=None, description="Expiry / best-before date.")
    customer_care: str | None = Field(default=None, description="Customer-care phone or email.")
    cin: str | None = Field(default=None, description="Company Identification Number (CIN).")
    gstin: str | None = Field(default=None, description="GSTIN, if printed.")
    product_name: str | None = Field(default=None, description="Product name.")


class Flag(BaseModel):
    """A single issue raised by a check, in English and Hindi."""

    code: str
    severity: str = Field(description="'high', 'medium' or 'low'.")
    en: str
    hi: str
    evidence: dict[str, Any] | None = None


class Check(BaseModel):
    """One verification check ('company', 'licence' or 'label_law')."""

    id: str
    status: str = Field(description="'pass', 'warn', 'fail' or 'not_checked'.")
    flags: list[Flag] = Field(default_factory=list)


class OfficialLink(BaseModel):
    """A one-tap link to an official verification portal.

    The JSON key is ``copy`` (matching the agreed contract) while the Python
    attribute is ``copy_text`` so it does not shadow ``BaseModel.copy``.
    """

    model_config = ConfigDict(populate_by_name=True)

    label: str
    url: str
    copy_text: str = Field(
        alias="copy",
        description="The number to copy onto the official portal.",
    )


class VerifyResponse(BaseModel):
    """Result of POST /api/verify.

    ``score`` is computed from the checks that actually ran, and is ``null`` when
    none of them could run. ``checks_ran`` says how many checks fed that number,
    so a partial score is never mistaken for a whole-label verdict.
    """

    scan_id: str | None = None
    checks: list[Check]
    score: int | None = Field(default=None, description="Trust score 0-100, or null.")
    checks_ran: int = Field(
        default=0, description="How many of the three checks produced a result."
    )
    verdict: str = Field(description="'low_risk', 'medium_risk', 'high_risk' or 'not_checked'.")
    official_links: list[OfficialLink] = Field(default_factory=list)


# --- Routes ----------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, str]:
    """Return a simple liveness payload for client and uptime checks."""
    return {"status": "ok", "app": APP_NAME}


@app.get("/health")
def health_with_db() -> dict[str, Any]:
    """Return liveness plus whether the registry database answers.

    Separate from ``/api/health`` on purpose. That route is a *frozen* contract -
    ``tests/test_samples.py`` and ``tests/test_api.py`` compare it byte for byte -
    and it answers one question: is the process up. This route answers the extra
    question the frontend needs to pick live or demo data: is the registry behind
    it reachable too.

    ``db`` is a fact, never a guess: ``db.is_available`` runs ``SELECT 1`` behind a
    two-second connect timeout and returns ``False`` rather than raising, so an
    unreachable database degrades this route instead of breaking it. ``status``
    stays ``"ok"`` either way - the API itself is still serving honest
    ``not_checked`` results with no database.
    """
    return {"status": "ok", "db": db.is_available()}


@app.post("/api/scan", response_model=ScanResponse)
async def scan(file: UploadFile | None = File(default=None)) -> ScanResponse:
    """Read a label photo and return the extracted fields for one scan session.

    With a file: the OCR pipeline (preprocess → Tesseract → field extract)
    runs and returns the detected fields. Without one: the legacy
    ``not_checked`` placeholder is returned, with a real ``scan_id`` for the
    review screen to send back. The uploaded file is accepted and
    intentionally not stored.
    """
    if file is None or not file.filename:
        return ScanResponse(**providers.build_scan())
    file_bytes = await file.read()
    return ScanResponse(**providers.build_scan(file_bytes=file_bytes))


@app.post("/api/verify", response_model=VerifyResponse)
def verify(payload: VerifyRequest | None = None) -> VerifyResponse:
    """Run the three checks over the supplied (confirmed) field values.

    The body is optional and every field inside it is optional.

    Every confirmed label field is forwarded to the label-law checker, including
    the ones left empty, because "the label does not print this" is a different -
    and checkable - fact from "the user did not fill it in". ``scan_id`` is echoed
    back unchanged so the review screen can correlate the scan and the verify.

    The deterministic signals today are the FSSAI *format* check and the ``company``
    check when an MCA snapshot has been imported.
    """
    payload = payload or VerifyRequest()
    fields = {name: getattr(payload, name) for name in LABEL_FIELD_NAMES}
    result = providers.build_verification(
        scan_id=payload.scan_id,
        manufacturer_name=payload.manufacturer,
        manufacturer_address=payload.address,
        cin=payload.cin,
        fssai_number=payload.fssai,
        bis_number=payload.bis_licence,
        fields=fields,
    )
    return VerifyResponse(**result)
