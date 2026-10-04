# VerifyIT

A label scanner that checks every claim printed on a product against India's official records (MCA, FSSAI, BIS, Legal Metrology) and returns a **0–100 Trust Score** in seconds.

> Round 1 submission — Cline AI Builders Hackathon · PClub IIT Kanpur.

## Team
- Yadnyesh Muratkar
- Sunil Jakhar
- Aditya Raunak

## What this repo contains (Sunil's slice)
The **"Read"** track (label photo → structured fields) and the **"Label-law"** check (Legal Metrology, 8 rules), plus the shared test set and accuracy numbers.

## Layout
```
VerifyIT/
├─ docs/label_rules.md            # Rule 6 of the LM (Packaged Commodities) Rules, 2011 → 8 rules
├─ data/
│  ├─ test_labels/{real,fake}/    # git-ignored; captured by anyone on the team
│  ├─ reference/                  # e.g. FSSAI state-code table
│  └─ ground_truth.csv            # expected answers for every photo
└─ src/
   ├─ preprocess.py               # resize → gray → CLAHE → bilateral → adaptive thresh → deskew
   ├─ ocr.py                      # pytesseract image_to_data, eng+hin, PSM 6 vs 11
   ├─ fields.py                   # format extractors + anchors + candidate scoring + Gemini fallback
   ├─ label_law.py                # R1..R8 → CheckResult
   ├─ evaluate.py                 # runs every photo vs ground_truth.csv
   └─ tests/                      # pytest for each rule
```

## Setup
```powershell
# 1. Tesseract (with eng + hin) — install via winget (see README in scripts/)
winget install --id UB-Mannheim.TesseractOCR

# 2. Python virtual env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. Copy env template and add your Gemini key
copy .env.example .env
# then edit .env

# 4. Verify Tesseract languages
tesseract --list-langs   # must show: eng, hin
```

## Running the Read pipeline
```python
from src.fields import extract
fields = extract(["path/to/label.jpg"])   # one or two photos (front/back)
```

## Running the Label-law check
```python
from src.label_law import label_law_check
result = label_law_check(fields)
```

## Evaluation
```bash
python -m src.evaluate            # writes accuracy summary + per-field report
pytest -q                          # rule tests
```

## Done means
- A real photo returns all 12+ fields with confidence + uncertain flags in <3s (<5s with the Gemini fallback).
- No crash on a blurry / empty / non-label image — returns empty fields with a clear error.
- 8 label-law rules, each with a pytest test and Hindi + English message.
- `evaluate.py` produces: **≥90% fakes caught, ≤10% false alarms**.
- Each rule in `label_law.py` is traceable to the Legal Metrology text in `docs/label_rules.md`.

## License
Internal hackathon project.