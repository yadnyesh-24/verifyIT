import csv, os, re, sys, time
import psycopg
from dotenv import load_dotenv

load_dotenv("backend/.env")
path, table = sys.argv[1], sys.argv[2]

with open(path, encoding="utf-8", errors="replace", newline="") as f:
    header = next(csv.reader(f))

cols, seen = [], set()
for i, h in enumerate(header):
    c = re.sub(r"\W+", "_", h.strip().lower()).strip("_") or f"col{i}"
    while c in seen:
        c += "_x"
    seen.add(c)
    cols.append(c)

t = time.time()
with psycopg.connect(os.environ["DATABASE_URL"], sslmode="require") as conn:
    conn.execute("set statement_timeout = 0")
    conn.execute(f'drop table if exists "{table}"')
    cols_def = ", ".join(f'"{c}" text' for c in cols)
    conn.execute(f'create table "{table}" ({cols_def})')
    with conn.cursor().copy(f'copy "{table}" from stdin with (format csv, header true)') as cp, \
            open(path, encoding="utf-8", errors="replace", newline="") as f:
        while chunk := f.read(1 << 20):
            cp.write(chunk)
    n = conn.execute(f'select count(*) from "{table}"').fetchone()[0]

print(f"{table}: {n} rows, columns: {cols}, {time.time() - t:.0f}s")