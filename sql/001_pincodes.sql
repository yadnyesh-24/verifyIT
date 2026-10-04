-- VerifyIT schema: India Post pincode directory.
--
-- Two tables:
--   * pincode_offices -- one row per post office, exactly as it appears in
--     data/raw/all_india_pincode_directory_2025.csv (plus a state_norm column
--     produced by app.normalize.normalize_state).
--   * pincodes -- one row per distinct pincode, rolled up to the most common
--     state / district and the centroid (mean of valid coordinates).
--
-- Both tables have RLS enabled. The backend connects with the Supabase service
-- role (which bypasses RLS), so no policies are needed for the import scripts.
-- When we later expose this data through PostgREST we'll add SELECT policies
-- for the ``anon`` role.

CREATE TABLE IF NOT EXISTS pincode_offices (
    id          BIGSERIAL PRIMARY KEY,
    officename  TEXT        NOT NULL,
    pincode     CHAR(6)     NOT NULL,
    officetype  TEXT,
    delivery    TEXT,
    district    TEXT,
    statename   TEXT,
    state_norm  TEXT,
    latitude    DOUBLE PRECISION,
    longitude   DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS pincode_offices_pincode_idx
    ON pincode_offices (pincode);

CREATE INDEX IF NOT EXISTS pincode_offices_state_norm_idx
    ON pincode_offices (state_norm);

CREATE TABLE IF NOT EXISTS pincodes (
    pincode      CHAR(6)        PRIMARY KEY,
    state_norm   TEXT,
    district     TEXT,
    lat          DOUBLE PRECISION,
    lon          DOUBLE PRECISION,
    office_count INTEGER        NOT NULL
);

CREATE INDEX IF NOT EXISTS pincodes_state_norm_idx
    ON pincodes (state_norm);

-- Row Level Security. The service role bypasses it; we'll add anon policies
-- later when the data is exposed via PostgREST.
ALTER TABLE pincode_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pincodes       ENABLE ROW LEVEL SECURITY;