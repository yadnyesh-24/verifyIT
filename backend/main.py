"""Verify It backend API.

FastAPI application for the "Verify It" hackathon project.

Registry providers (company/CIN, FSSAI, BIS), Surepass and the OCR pipeline are
not connected yet: real registry data and credentials are unavailable, and no
external registry API is called. Every check therefore returns a neutral
``not_checked`` placeholder (see ``backend.providers``) so the response contract
stays stable for the frontend while providers are integrated later.
"""

from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from backend import providers

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

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
    reason: str = providers.OCR_PENDING_REASON
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


@app.post("/api/scan", response_model=ScanResponse)
async def scan(file: UploadFile | None = File(default=None)) -> ScanResponse:
    """Read a label photo and return the extracted fields.

    Placeholder: the OCR pipeline is owned by another workstream and is not
    connected yet, so no fields are returned (and none are guessed). The uploaded
    file is accepted and intentionally not stored.
    """
    return ScanResponse(**providers.build_scan())


@app.post("/api/verify", response_model=VerifyResponse)
def verify(payload: VerifyRequest | None = None) -> VerifyResponse:
    """Run the three checks over the supplied (confirmed) field values.

    The body is optional and every field inside it is optional. Until the
    providers are connected each check is ``not_checked``; the only
    deterministic signal today is the FSSAI *format* check.
    """
    payload = payload or VerifyRequest()
    result = providers.build_verification(
        manufacturer_name=payload.manufacturer,
        manufacturer_address=payload.address,
        cin=payload.cin,
        fssai_number=payload.fssai,
        bis_number=payload.bis_licence,
    )
    return VerifyResponse(**result)
