-- Verify It - company registry schema.
--
-- Stores a local snapshot of the MCA "Company Master Data" register so the
-- `company` check can be answered offline (no external network calls).
--
-- Idempotent: safe to re-run. Apply with either
--   psql "postgresql://127.0.0.1:5432/verifyit" -f sql/001_companies.sql
-- or
--   ./.venv/bin/python scripts/import_mca.py --file <export.csv>   (applies it)
--
-- The importer is `scripts/import_mca.py`; see MCA_SETUP.md.

-- Fuzzy name matching needs trigram similarity (also used by the GIN index).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS companies (
    -- CIN is the statutory 21-character company identifier -> natural key.
    cin                  text PRIMARY KEY,
    name                 text NOT NULL,
    -- Upper-cased, punctuation- and legal-suffix-stripped name. Keeping the
    -- normalised form in its own column lets the trigram index work directly
    -- (an index on an expression would have to match the expression exactly).
    name_normalized      text NOT NULL,
    status               text,
    company_class        text,
    company_category     text,
    company_sub_category text,
    roc                  text,
    registration_number  text,
    date_of_registration date,
    state                text,
    district             text,
    pincode              text,
    email                text,
    address              text,
    -- Provenance: which export the row came from and which snapshot date it
    -- represents. Never drop these - a registry claim must stay traceable.
    source               text        NOT NULL DEFAULT 'mca_company_master_data',
    source_date          date,
    imported_at          timestamptz NOT NULL DEFAULT now()
);

-- Trigram index on the normalised name: powers `name_normalized % :needle`
-- (the operator used by backend/mca.py) without a sequential scan.
CREATE INDEX IF NOT EXISTS companies_name_normalized_trgm_idx
    ON companies USING gin (name_normalized gin_trgm_ops);

-- Exact-CIN lookup path and simple reporting.
CREATE INDEX IF NOT EXISTS companies_name_lower_idx ON companies (lower(name));
CREATE INDEX IF NOT EXISTS companies_status_idx ON companies (status);
