#!/usr/bin/env node
// Pairs the most-recent N transcriptions in your dev DB with the authored
// intent labels in bench/intents.json. Output: bench/corpus/labeled-corpus.json
// (gitignored — contains your raw_text + polish output).
//
// Workflow:
//   1. node bench/bind-intents.js --capture-baseline
//        Records the current max(id) in the DB. Run this BEFORE you start
//        dictating the 20 intents.
//   2. Dictate intents 1..20 in order through the OpenWhispr app.
//   3. node bench/bind-intents.js
//        Pairs the rows with id > baseline (in order) to the 20 intents.
//
// Or, if you already dictated everything:
//   node bench/bind-intents.js --last 20
//
// Or pick up rows from a specific id forward:
//   node bench/bind-intents.js --start-id 42
//
// If the DB has more rows than intents (or vice versa), the script bails
// and tells you what it saw — re-dictate or pass --start-id to recover.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const INTENTS_PATH = path.join(__dirname, "intents.json");
const OUT_PATH = path.join(__dirname, "corpus", "labeled-corpus.json");
const BASELINE_PATH = path.join(__dirname, "corpus", ".baseline-id");

function parseArgs(argv) {
  const out = { prod: false, db: null, captureBaseline: false, startId: null, last: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prod") out.prod = true;
    else if (a === "--db") out.db = argv[++i];
    else if (a === "--capture-baseline") out.captureBaseline = true;
    else if (a === "--start-id") out.startId = parseInt(argv[++i], 10);
    else if (a === "--last") out.last = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 21).join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function defaultDbPath(prod) {
  const productName = prod ? "OpenWhispr" : "OpenWhispr-development";
  const fileName = prod ? "transcriptions.db" : "transcriptions-dev.db";
  return path.join(os.homedir(), "Library", "Application Support", productName, fileName);
}

function querySqlite(dbPath, sql) {
  const stdout = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const trimmed = stdout.trim();
  return trimmed ? JSON.parse(trimmed) : [];
}

function maxIdInDb(dbPath) {
  const rows = querySqlite(dbPath, "SELECT MAX(id) AS max_id FROM transcriptions");
  return rows[0]?.max_id ?? 0;
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return parseInt(fs.readFileSync(BASELINE_PATH, "utf8").trim(), 10);
}

function writeBaseline(id) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, String(id));
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db || defaultDbPath(args.prod);

  if (!fs.existsSync(dbPath)) {
    console.error(`[bind-intents] DB not found: ${dbPath}`);
    process.exit(1);
  }

  if (args.captureBaseline) {
    const id = maxIdInDb(dbPath);
    writeBaseline(id);
    console.log(`[bind-intents] baseline captured: id > ${id} (saved to ${BASELINE_PATH})`);
    console.log(`[bind-intents] now dictate the 20 intents in order, then re-run without --capture-baseline`);
    return;
  }

  const intentsDoc = JSON.parse(fs.readFileSync(INTENTS_PATH, "utf8"));
  const intents = intentsDoc.intents;

  // Decide which DB rows to pair. Priority: --start-id > saved baseline > --last
  let rows;
  let strategy;
  if (args.startId !== null && !Number.isNaN(args.startId)) {
    strategy = `id > ${args.startId} (--start-id)`;
    rows = querySqlite(
      dbPath,
      `SELECT id, raw_text, text, created_at, provider, model
       FROM transcriptions
       WHERE id > ${args.startId}
         AND status = 'completed'
         AND raw_text IS NOT NULL AND TRIM(raw_text) != ''
       ORDER BY id ASC`
    );
  } else if (readBaseline() !== null) {
    const baseline = readBaseline();
    strategy = `id > ${baseline} (saved baseline)`;
    rows = querySqlite(
      dbPath,
      `SELECT id, raw_text, text, created_at, provider, model
       FROM transcriptions
       WHERE id > ${baseline}
         AND status = 'completed'
         AND raw_text IS NOT NULL AND TRIM(raw_text) != ''
       ORDER BY id ASC`
    );
  } else if (args.last !== null && !Number.isNaN(args.last)) {
    strategy = `last ${args.last} rows (--last)`;
    rows = querySqlite(
      dbPath,
      `SELECT id, raw_text, text, created_at, provider, model
       FROM transcriptions
       WHERE status = 'completed'
         AND raw_text IS NOT NULL AND TRIM(raw_text) != ''
       ORDER BY id DESC
       LIMIT ${args.last}`
    ).reverse();
  } else {
    console.error("[bind-intents] no strategy chosen.");
    console.error("  pick one:");
    console.error("    --capture-baseline    (run BEFORE dictating)");
    console.error("    (after dictating, run with no flags — uses saved baseline)");
    console.error(`    --last ${intents.length}              (take last N rows)`);
    console.error("    --start-id <id>       (rows with id > <id>)");
    process.exit(1);
  }

  console.log(`[bind-intents] strategy: ${strategy}`);
  console.log(`[bind-intents] intents: ${intents.length}, db rows: ${rows.length}`);

  if (rows.length !== intents.length) {
    console.error(
      `[bind-intents] MISMATCH: ${rows.length} db rows but ${intents.length} intents.\n` +
        `  - too few: dictate the missing intents and re-run\n` +
        `  - too many: pass --start-id to skip earlier rows, or delete rows from DB\n` +
        `  - found ids: ${rows.map((r) => r.id).join(", ") || "(none)"}`
    );
    process.exit(1);
  }

  const labeled = intents.map((intent, i) => {
    const row = rows[i];
    return {
      intent_id: intent.id,
      bucket: intent.bucket,
      category: intent.category,
      addresses_agent: intent.addresses_agent || false,
      has_numbers: intent.has_numbers || false,
      has_dates: intent.has_dates || false,
      has_technical_terms: intent.has_technical_terms || false,
      has_proper_nouns: intent.has_proper_nouns || false,
      intent: intent.intent,
      raw_text: row.raw_text,
      polished_text: row.text,
      db_id: row.id,
      created_at: row.created_at,
      provider: row.provider,
      model: row.model,
    };
  });

  const doc = {
    version: 1,
    bound_at: new Date().toISOString(),
    source_db: dbPath,
    strategy,
    count: labeled.length,
    entries: labeled,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2));

  console.log(`[bind-intents] wrote ${labeled.length} labeled entries → ${OUT_PATH}`);
  console.log(`[bind-intents] preview:`);
  for (const e of labeled.slice(0, 3)) {
    console.log(
      `  intent #${e.intent_id} (${e.bucket}, ${e.category}, db_id=${e.db_id})\n` +
        `    intent : ${e.intent.slice(0, 80)}${e.intent.length > 80 ? "…" : ""}\n` +
        `    raw    : ${(e.raw_text || "").slice(0, 80)}${(e.raw_text || "").length > 80 ? "…" : ""}\n` +
        `    polish : ${(e.polished_text || "").slice(0, 80)}${(e.polished_text || "").length > 80 ? "…" : ""}`
    );
  }
  if (labeled.length > 3) console.log(`  … and ${labeled.length - 3} more`);

  // Clear baseline so the next bind cycle starts fresh.
  if (fs.existsSync(BASELINE_PATH)) fs.unlinkSync(BASELINE_PATH);
}

main();
