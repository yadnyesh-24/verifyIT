# Label-law rules — Rule 6 of the Legal Metrology (Packaged Commodities) Rules, 2011

This document is the source of truth for every rule in
``backend/ocr/label_law.py``. The eight rules here are the label-law check
the Verify It API runs on every confirmed label (the third of the three
checks, in order: ``company``, ``licence``, ``label_law``).

The frozen contract (see ``API_CONTRACT.md`` and ``.clinerules``):

* A flag is ``{code, severity, en, hi, evidence}`` — ``severity`` is
  ``high | medium | low``.
* A field is flagged ``fail`` when a Legal Metrology requirement is missing
  on a label that clearly contains other declarations (i.e. it's been
  printed, just not properly).
* A field is flagged ``warn`` when it's present but malformed (e.g. MRP
  without taxes).
* The check returns ``not_checked`` when the input is empty.

## Rule 6 — declarations required on every pre-packaged commodity

The Legal Metrology (Packaged Commodities) Rules, 2011, Rule 6, require
every package to bear, **legibly and indelibly**, the following
declarations:

1. The name and address of the manufacturer / packer / importer.
2. The name and address of the manufacturer where the package is packed
   by a person other than the manufacturer (Rule 6(1)(b)).
3. The net quantity in terms of standard units (g, kg, ml, l, …).
4. The retail sale price (MRP) of the package, **inclusive of all taxes**.
5. The month and year of manufacture or packing, and the month and year
   of expiry / best-before for goods that perish.
6. The customer-care address (phone, email, or postal address).
7. The country of origin for imported goods.

The eight rules in ``label_law.py`` are derived from this list. Severity is
chosen per the team's convention (high when a missing declaration is
likely to deceive a shopper, medium when it is incomplete, low when it is
advisory).

## The eight rules

| Rule | What it checks | Severity on fail | Code |
|------|---------------|------------------|------|
| **R1 maker name** | manufacturer / packer / importer name is present | high | ``MAKER_NAME_MISSING`` |
| **R2 address & pincode** | a multi-line address with a 6-digit pincode is present | medium | ``ADDRESS_MISSING`` |
| **R3 net quantity** | a value with a standard unit (g, kg, ml, l, mg, oz, lb, N, pcs) | medium | ``NET_QUANTITY_MISSING`` |
| **R4 MRP inclusive of taxes** | a value preceded by Rs/INR/₹ and a price, with two decimal places | medium | ``MRP_MISSING`` or ``MRP_NOT_TAX_INCLUSIVE`` |
| **R5 mfg / pack date** | a month+year or a ``Mfg`` / ``Mfd`` anchor | low | ``MFG_DATE_MISSING`` |
| **R6 customer care** | a phone / email / postal contact | low | ``CUSTOMER_CARE_MISSING`` |
| **R7 not expired** | expiry / best-before date is in the future | low | ``EXPIRED`` |
| **R8 product name** | a non-empty name printed on the front of the pack | high | ``PRODUCT_NAME_MISSING`` |

## Edge cases the rules must NOT trip on

* **Imported goods** — Rule 6(3)(c) waives the name/address for imported
  packages as long as the importer's details are present. R1 / R2 only
  require *some* party (manufacturer / marketer / importer).
* **Non-perishable goods** — R7 is skipped when neither ``expiry_date`` nor
  ``best_before`` is on the label (matches the rules' "as applicable"
  wording).
* **Empty input** — when the user hasn't filled anything in, the check
  returns ``not_checked`` rather than ``fail``. The frontend renders that
  as "Verification pending".

## Severity table

| Severity | Meaning |
|----------|---------|
| ``high`` | A required declaration is missing — shopper is materially misled. |
| ``medium`` | A required declaration is incomplete or malformed. |
| ``low`` | An advisory declaration is missing or a soft deadline passed. |

## Cross-references

* ``API_CONTRACT.md`` — frozen request/response shape; field codes list.
* ``.clinerules`` — non-negotiable correctness rules (no invented
  registries, no false positives for missing status, etc.).
* ``backend/providers.py`` — ``check_label_law(fields)`` is the entry
  point; the schema above is what it returns.