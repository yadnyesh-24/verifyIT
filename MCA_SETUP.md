# MCA registry snapshot — setup

The `company` check answers from a **local PostgreSQL snapshot** of the MCA
*Company Master Data* register. Nothing is fetched at request time and no
external network call is ever made: you import a government export once and the
API reads it locally.

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

## 2. Get the data

Either export works — the importer is **header-driven** and maps the column names
itself (`CIN`, `Company Name`, `Company Status`, `Date of Registration`,
`Registered State`, ... ; case and punctuation are ignored):

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
