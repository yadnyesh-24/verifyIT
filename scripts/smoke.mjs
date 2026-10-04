/**
 * End-to-end smoke test: drive the real backend *through the frontend's
 * rewrites* and check every response against the contract.
 *
 * Requests go to `http://localhost:3000/api/...`, not to the backend directly,
 * so this also proves the rewrite table, the port wiring and the multipart
 * field name - the three things that break silently when either side moves.
 *
 * The schemas are imported from `frontend/lib/contract.ts`, the exact module
 * the app validates with (Node strips the types natively). A second copy of
 * the schema here could drift from the app's copy and still report a pass,
 * which would make this script worse than useless.
 *
 * Usage: `npm run smoke` with `npm run dev:all` already running.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  HealthSchema,
  ScanResponseSchema,
  VerifyResponseSchema,
} from "../frontend/lib/contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SAMPLES = path.join(repoRoot, "samples");
const LABELS = path.join(repoRoot, "data", "test_labels", "real");

/** @type {{name: string, status: "PASS"|"FAIL"|"SKIP", detail: string}[]} */
const rows = [];

function record(name, status, detail = "") {
  rows.push({ name, status, detail });
}

/** Parse with a zod schema and turn a failure into a one-line reason. */
function check(name, schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    record(name, "PASS");
    return result.data;
  }
  const first = result.error.issues[0];
  record(name, "FAIL", `${first.path.join(".") || "(root)"}: ${first.message}`);
  return null;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function run() {
  // --- health -------------------------------------------------------------
  try {
    const data = await fetch(`${BASE}/api/health/db`).then((r) => r.json());
    check("GET /api/health/db", HealthSchema, data);
  } catch (err) {
    record("GET /api/health/db", "FAIL", err.message);
    console.error(
      `\nCould not reach ${BASE}. Start both servers first:\n  npm run dev:all\n`,
    );
    return;
  }

  // --- verify, one row per request fixture --------------------------------
  const fixtures = (await readdir(SAMPLES))
    .filter((f) => f.startsWith("verify_request_") && f.endsWith(".json"))
    .sort();

  for (const fixture of fixtures) {
    const body = JSON.parse(await readFile(path.join(SAMPLES, fixture), "utf8"));
    const name = `POST /api/verify  ${fixture}`;
    try {
      const data = await postJson(`${BASE}/api/verify`, body);
      const parsed = check(name, VerifyResponseSchema, data);
      if (parsed) assertVerifyInvariants(fixture, body, parsed);
    } catch (err) {
      record(name, "FAIL", err.message);
    }
  }

  // --- scan ---------------------------------------------------------------
  const image = existsSync(LABELS)
    ? (await readdir(LABELS)).find((f) => /\.(jpe?g|png|webp)$/i.test(f))
    : undefined;

  if (!image) {
    record("POST /api/scan", "SKIP", `no image in data/test_labels/real/`);
  } else {
    const name = `POST /api/scan  ${image}`;
    try {
      const bytes = await readFile(path.join(LABELS, image));
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "image/jpeg" }), image);
      const res = await fetch(`${BASE}/api/scan`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      check(name, ScanResponseSchema, await res.json());
    } catch (err) {
      record(name, "FAIL", err.message);
    }
  }
}

/**
 * Contract promises that a schema alone cannot express.
 *
 * These are the rules the UI is built on, so a backend that broke one of them
 * would render a misleading screen while still parsing cleanly.
 */
function assertVerifyInvariants(fixture, request, response) {
  const problems = [];

  if (response.checks.length !== 3) {
    problems.push(`expected 3 checks, got ${response.checks.length}`);
  }
  const ids = response.checks.map((c) => c.id).join(",");
  if (ids !== "company,licence,label_law") {
    problems.push(`check order was "${ids}"`);
  }
  // score and checks_ran must agree: a number always comes from at least one check.
  if (response.score === null && response.checks_ran !== 0) {
    problems.push("score is null but checks_ran > 0");
  }
  if (response.score !== null && response.checks_ran === 0) {
    problems.push("score is set but no check ran");
  }
  if (response.score === null && response.verdict !== "not_checked") {
    problems.push(`score is null but verdict is "${response.verdict}"`);
  }
  // scan_id is echoed, never minted, by /api/verify.
  const sent = request.scan_id ?? null;
  if (response.scan_id !== sent) {
    problems.push(`scan_id ${JSON.stringify(response.scan_id)} != sent ${JSON.stringify(sent)}`);
  }

  record(
    `  invariants  ${fixture}`,
    problems.length ? "FAIL" : "PASS",
    problems.join("; "),
  );
}

function printTable() {
  const width = Math.max(...rows.map((r) => r.name.length), 10);
  const bar = "-".repeat(width + 30);
  console.log(`\nSmoke test against ${BASE}\n${bar}`);
  for (const row of rows) {
    const mark = row.status === "PASS" ? "ok  " : row.status === "SKIP" ? "skip" : "FAIL";
    console.log(
      `${mark}  ${row.name.padEnd(width)}  ${row.detail}`.trimEnd(),
    );
  }
  console.log(bar);

  const failed = rows.filter((r) => r.status === "FAIL").length;
  const skipped = rows.filter((r) => r.status === "SKIP").length;
  const passed = rows.filter((r) => r.status === "PASS").length;
  console.log(`${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  return failed;
}

await run();
process.exit(printTable() > 0 ? 1 : 0);
