#!/usr/bin/env node
// Pulls raw + reference-polished transcripts from the local SQLite DB
// and writes them to bench/corpus/corpus.json for the polish bench.
//
// Why shell out to sqlite3(1) instead of better-sqlite3: better-sqlite3 in
// node_modules is rebuilt against Electron's Node ABI by electron-rebuild.
// Running it from plain `node` fails with NODE_MODULE_VERSION mismatch.
// macOS ships sqlite3 in /usr/bin, so this avoids the rebuild dance.
//
// Usage:
//   node bench/extract-corpus.js                # dev DB → bench/corpus/corpus.json
//   node bench/extract-corpus.js --prod         # production DB
//   node bench/extract-corpus.js --db <path>    # explicit DB path
//   node bench/extract-corpus.js --out <path>   # explicit output path
//   node bench/extract-corpus.js --limit 100    # cap rows

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function parseArgs(argv) {
  const out = { prod: false, db: null, out: null, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prod") out.prod = true;
    else if (a === "--db") out.db = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 13).join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function defaultDbPath(prod) {
  // Mirrors database.js: userData = ~/Library/Application Support/<productName>
  // productName comes from package.json. Dev mode uses transcriptions-dev.db.
  const productName = prod ? "OpenWhispr" : "OpenWhispr-development";
  const fileName = prod ? "transcriptions.db" : "transcriptions-dev.db";
  return path.join(os.homedir(), "Library", "Application Support", productName, fileName);
}

function bucketFor(wordCount) {
  if (wordCount < 10) return "short";
  if (wordCount < 50) return "medium";
  return "long";
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function querySqlite(dbPath, sql) {
  // sqlite3 -json outputs a JSON array (or empty string on no rows)
  const stdout = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed);
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db || defaultDbPath(args.prod);
  const outPath =
    args.out || path.join(__dirname, "corpus", "corpus.json");

  if (!fs.existsSync(dbPath)) {
    console.error(`[extract-corpus] DB not found: ${dbPath}`);
    console.error("[extract-corpus] hint: run the app once to create it, or pass --db <path>");
    process.exit(1);
  }

  // Pull all completed rows with non-empty raw_text. We keep rows where
  // raw_text === text too — they represent "polish was a no-op" and are
  // valid bench inputs (we still measure latency on them).
  const limitClause = args.limit ? `LIMIT ${args.limit}` : "";
  const sql = `
    SELECT id, raw_text, text, created_at, provider, model
    FROM transcriptions
    WHERE status = 'completed'
      AND raw_text IS NOT NULL
      AND TRIM(raw_text) != ''
    ORDER BY id DESC
    ${limitClause}
  `;
  const rows = querySqlite(dbPath, sql);

  const entries = rows.map((r) => {
    const raw = r.raw_text;
    const wc = wordCount(raw);
    return {
      id: r.id,
      bucket: bucketFor(wc),
      word_count: wc,
      raw_char_count: raw.length,
      raw_text: raw,
      reference_polish: r.text || null,
      polish_changed: r.text !== r.raw_text,
      created_at: r.created_at,
      provider: r.provider,
      model: r.model,
    };
  });

  const stats = {
    total: entries.length,
    short: entries.filter((e) => e.bucket === "short").length,
    medium: entries.filter((e) => e.bucket === "medium").length,
    long: entries.filter((e) => e.bucket === "long").length,
    polish_changed: entries.filter((e) => e.polish_changed).length,
  };

  const corpus = {
    extracted_at: new Date().toISOString(),
    source_db: dbPath,
    stats,
    entries,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(corpus, null, 2));

  console.log(`[extract-corpus] wrote ${entries.length} entries → ${outPath}`);
  console.log(
    `[extract-corpus] buckets: short=${stats.short} medium=${stats.medium} long=${stats.long} ` +
      `(polish-changed=${stats.polish_changed}/${stats.total})`
  );

  if (entries.length < 20) {
    console.warn(
      `[extract-corpus] WARNING: only ${entries.length} entries — bench results will be noisy. ` +
        `Dictate more and re-run for a stronger corpus.`
    );
  }
}

main();
