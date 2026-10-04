# MCA registry snapshot — setup

The `company` check answers from a **PostgreSQL snapshot** of the MCA
*Company Master Data* register — your own local database by default, or one shared
by the whole team (see [section 1b](#1b-shared-snapshot-supabase---optional)).
Nothing is fetched at request time and no registry API is ever called: you import
a government export once and the API reads it from the database.

Without a snapshot the check stays `not_checked` (never a failure), so the
backend works fine before you import anything.

## 1. PostgreSQL

```bash
brew install postgresql@16        # already installed on this machine
brew services start postgresql@16
createdb verifyit                 # skip if it already exists
psql verifyit -c 'create extension if not exists pg_trgm'   # done by the schema
```

`backend/db.py` connects to `postgresql://127.0.0.1:5432/verifyit` by default
(current OS user, no password). Point it elsewhere with `DATABASE_URL`:

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
```

## 1b. Shared snapshot (Supabase) - optional

The whole team can read **one** imported snapshot instead of every person
downloading and importing a ~1.5M-row export. `backend/db.py` already reads
`DATABASE_URL`, so this is configuration, not a code change.

Create the project (region **`ap-south-1`** is closest to India), then open the
**SQL Editor** and run the contents of [`sql/001_companies.sql`](sql/001_companies.sql)
once. That enables `pg_trgm` and creates `companies` plus its three indexes.

```bash
# Supabase -> Connect -> "Session pooler". NOT the direct connection.
export SB='postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'

psql "$SB" -c '\dt'                       # sanity: can we reach it?

# import (the schema is already applied above)
./.venv/bin/python scripts/import_mca.py \
    --file data/mca/company_master_data.csv \
    --source-date 2026-03-31 \
    --database-url "$SB" --no-create-schema

# Confirm the snapshot is usable before blaming the API
./.venv/bin/python scripts/check_registry.py --database-url "$SB"
```

Then point the API at it, on **every** machine:

```bash
export DATABASE_URL="$SB"          # or put it in .env (git-ignored, auto-loaded)
./.venv/bin/uvicorn backend.main:app --reload --port 8001
```

### Gotchas that will otherwise cost you an hour

| Symptom | Cause |
| ------- | ----- |
| `could not connect` / timeout | `db.<ref>.supabase.co` is **IPv6-only**. Use the pooler host above. |
| `Tenant or user not found` | The pooler username must be `postgres.<project-ref>`, and the host's region must match the project's region. |
| `prepared statement ... does not exist`, TEMP tables vanish | You are on the transaction pooler (port **6543**). Use session mode, port **5432**. |
| Rows are there but the check stays `not_checked` | `name_normalized` is empty - the CSV was uploaded through a dashboard instead of `scripts/import_mca.py`. Re-import. |
| Everything `not_checked` one morning | A **Free** plan project pauses after 7 days of low activity. Dashboard -> **Resume project**. |
| The password has `@`, `#`, `/`, `:`, `?` | Percent-encode it. `sunil24@IITK` becomes `sunil24%40IITK`, otherwise the URL is mis-parsed. |
| A live company is reported as not Active | The MCA bulk export stores the four-character `company_status` **code** (`ACTV`, not `Active`). `MCA_ACTIVE_STATUSES` in `backend/providers.py` accepts both; add any new code there rather than guessing a label. |
| `sql/001_companies.sql` seems to have run but the table is missing | Supabase enables `pg_trgm` by default, so that line alone proves nothing. Confirm with `select to_regclass('companies')` or `scripts/check_registry.py`. |
| Name-only lookups take several seconds | `pg_trgm`'s default similarity threshold (0.30) makes the `%` scan hand the executor ~131k candidates and ~55k heap pages to recheck. `backend/db.py` applies `pg_trgm.similarity_threshold = 0.55` on every connection, which drops it to ~3k candidates: ~0.13s instead of ~7s on the full snapshot. |

> **Free-plan storage.** Supabase Free gives a project **500 MB**, and a full MCA
> export is roughly **450 MB of CSV plus the table and its trigram index**. Check
> `select pg_size_pretty(pg_database_size(current_database()))` before importing
> all ~2M rows; importing locally has no such ceiling.

> **Do not upload the CSV through the Supabase table editor.** It infers column
> types (a pincode of `001100` becomes `1100`) and leaves `name_normalized`
> blank, so the fuzzy name match silently returns nothing and the trigram index
> is never created. `scripts/import_mca.py` builds all of that; the dashboard
> does not.

## 2. Get the data

Either export works — the importer is **header-driven** and maps the column names
itself (`CIN`, `Company Name`, `Company Status`, `Date of Registration`,
`Registered State`, ... ; case and punctuation are ignored). The MCA *bulk*
download spells several of them out in full
(`corporate_identification_number`, `company_name`, `registrar_of_companies`,
`email_addr`, `registered_office_address`); those aliases resolve too. Run a
`--dry-run` first — its "N mapped, M unmapped" line tells you immediately whether
the export was understood.

- **data.gov.in** — <https://data.gov.in/catalog/company-master-data>
  (search "Company Master Data", download the CSV resource).
- **MCA monthly bulk** — the MCA *Company Master Data* download, a ZIP with a
  CSV inside.

```bash
mkdir -p data/mca            # git-ignored
ls data/mca/
```

## 3. Inspect, then import

```bash
# 1. Look at the header and count rows - never touches the database.
./.venv/bin/python scripts/import_mca.py \
    --file data/mca/company_master_data.csv --dry-run

# 2. Import it (applies sql/001_companies.sql first, then upserts on CIN).
./.venv/bin/python scripts/import_mca.py \
    --file data/mca/company_master_data.csv --source-date 2026-03-31

# The monthly ZIP works directly too:
./.venv/bin/python scripts/import_mca.py --file data/mca/MCA_Company_Master.zip
```

| Flag | Effect |
| ---- | ------ |
| `--dry-run` | Parse and report only; never opens the database |
| `--limit N` | Import only the first N rows (smoke test) |
| `--truncate` | Delete existing rows first (full replace) |
| `--source-date YYYY-MM-DD` | Snapshot date stored on every row (default: today) |
| `--no-create-schema` | Skip `sql/001_companies.sql` |
| `--database-url URL` | One-off `DATABASE_URL` override |

Re-importing a newer export **upserts on CIN**, so the snapshot can be refreshed
without dropping everything or re-downloading the schema.

## 4. Verify

```bash
psql verifyit -c "select count(*) as companies, max(source_date) from companies"

# A CIN that is in your snapshot returns "pass":
curl -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{"cin":"U17120GJ1993PLC019067"}'

# A name that only fuzzy-matches returns "warn" (name-only signal):
curl -X POST http://127.0.0.1:8001/api/verify \
  -H 'Content-Type: application/json' -d '{"manufacturer":"Adani Enterprises Ltd"}'
```

## Bridge: a small real subset (when the full download is slow or blocked)

You do **not** need all ~1.5M rows to demo. The importer is header-driven, so a
20-row file and the 2 GB export use the *same* command.

`data/mca/company_master_data_TEMPLATE.csv` already has the header the importer
expects:

```
CIN,Company Name,Company Status,Company Class,Company Category,Date of Registration,Registered State,ROC,Pin Code,Email
```

1. Look up the companies you will actually put on a label — free, no login — on
   the MCA Corporate Data Management portal:
   <https://www.mcacdm.nic.in/company-master-details> (search by name or CIN).
2. Paste the **real** values into that CSV (fewer columns is fine; `CIN` and
   `Company Name` are the only required ones).
3. Import it:

```bash
./.venv/bin/python scripts/import_mca.py \
    --file data/mca/company_master_data_TEMPLATE.csv \
    --source-date 2026-03-31 --truncate

# check it landed
psql verifyit -c "select cin, name, status from companies"
```

Then swap in the full export later — the command does not change.

> **Never type a value you did not read from a register.** The whole point of this
> check is that the data is real; a hand-typed guess is worse than no data. The
> importer will happily import a small true subset, and it will never invent a row.

## What the snapshot does *not* do

- It never makes an HTTP call — the API only knows what you imported.
- It never reports `fail`. A company missing from the snapshot proves nothing
  (the export lags and some entities are absent), so a miss stays `not_checked`.
- It never invents a row. The importer skips rows without a CIN or a name and
  stores unparseable dates as `NULL`.

Schema: [`sql/001_companies.sql`](sql/001_companies.sql) ·
matcher: [`backend/mca.py`](backend/mca.py) ·
policy: `check_company` in [`backend/providers.py`](backend/providers.py).
