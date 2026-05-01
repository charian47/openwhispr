#!/usr/bin/env node
// Reads JSONL result files written by run-polish.js and prints a markdown
// summary. Two modes:
//   1) one file       → summary table (per-bucket + overall, median + p95)
//   2) two files      → diff table showing each metric and its delta %
//
// Usage:
//   node bench/analyze.js bench/results/<file>.jsonl
//   node bench/analyze.js bench/results/<base>.jsonl bench/results/<candidate>.jsonl
//   node bench/analyze.js --latest                # auto-pick newest result
//   node bench/analyze.js --latest --compare <prev>.jsonl

const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "results");

function loadJsonl(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const records = lines.map((l) => JSON.parse(l));
  const header = records.find((r) => r.kind === "header");
  const runs = records.filter((r) => r.kind === "run" && !r.warmup);
  const errors = records.filter((r) => r.kind === "error");
  return { file, header, runs, errors };
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function bucketStats(records) {
  const ttfts = records.map((r) => r.ttft_ms).filter((v) => v !== null && v !== undefined);
  const totals = records.map((r) => r.total_ms).filter((v) => v !== null && v !== undefined);
  const tps = records.map((r) => r.tokens_per_sec).filter((v) => v !== null && v !== undefined);
  return {
    n: records.length,
    ttft_p50: median(ttfts),
    ttft_p95: percentile(ttfts, 95),
    total_p50: median(totals),
    total_p95: percentile(totals, 95),
    tps_p50: median(tps),
    tps_p95: percentile(tps, 95),
  };
}

function fmt(n, digits = 1) {
  return n === null || n === undefined ? "—" : Number(n).toFixed(digits);
}

function buildBuckets(runs) {
  const buckets = ["short", "medium", "long"];
  const out = { overall: bucketStats(runs) };
  for (const b of buckets) out[b] = bucketStats(runs.filter((r) => r.bucket === b));
  return out;
}

function printSummary({ file, header, runs, errors }) {
  console.log(`# Polish bench — ${header?.label || "unlabeled"}\n`);
  console.log(`**File**: \`${file}\``);
  console.log(`**Run at**: ${header?.timestamp || "unknown"}`);
  console.log(`**Hardware**: ${header?.hardware?.cpus || "unknown"}`);
  console.log(
    `**Corpus**: ${header?.corpus_used}/${header?.corpus_total} entries × ` +
      `${header?.runs} runs (warmup ${header?.warmup})`
  );
  console.log(
    `**Settings**: max_tokens=${header?.max_tokens}, temperature=${header?.temperature}, ` +
      `agent=${header?.agent_name}\n`
  );

  if (errors.length) {
    console.log(`**Errors**: ${errors.length} run(s) failed\n`);
  }

  const buckets = buildBuckets(runs);
  console.log("| bucket  |   n | ttft p50 / p95 (ms) | total p50 / p95 (ms) | tok/s p50 / p95 |");
  console.log("|---------|----:|---------------------:|---------------------:|-----------------:|");
  for (const b of ["overall", "short", "medium", "long"]) {
    const s = buckets[b];
    if (!s.n) continue;
    console.log(
      `| ${b.padEnd(7)} | ${String(s.n).padStart(3)} | ` +
        `${fmt(s.ttft_p50, 0)} / ${fmt(s.ttft_p95, 0)} | ` +
        `${fmt(s.total_p50, 0)} / ${fmt(s.total_p95, 0)} | ` +
        `${fmt(s.tps_p50, 1)} / ${fmt(s.tps_p95, 1)} |`
    );
  }
}

function delta(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (a === 0) return null;
  return ((b - a) / a) * 100;
}

function fmtDelta(d, lowerIsBetter) {
  if (d === null) return "—";
  const sign = d > 0 ? "+" : "";
  const arrow = (lowerIsBetter ? d < 0 : d > 0) ? "↓" : "↑"; // intent indicator
  // Actually: just show signed % and let the reader decide. Cleaner.
  return `${sign}${d.toFixed(1)}%`;
}

function printDiff(baseRun, candRun) {
  const a = buildBuckets(baseRun.runs);
  const b = buildBuckets(candRun.runs);

  console.log(`# Polish bench diff\n`);
  console.log(`**Baseline**: \`${baseRun.file}\` (${baseRun.header?.label})`);
  console.log(`**Candidate**: \`${candRun.file}\` (${candRun.header?.label})\n`);
  console.log(`Lower is better for ttft/total. Higher is better for tok/s.\n`);

  console.log(
    "| bucket  |   n | ttft p50 Δ% | ttft p95 Δ% | total p50 Δ% | total p95 Δ% | tok/s p50 Δ% | tok/s p95 Δ% |"
  );
  console.log(
    "|---------|----:|------------:|------------:|-------------:|-------------:|-------------:|-------------:|"
  );

  for (const bucket of ["overall", "short", "medium", "long"]) {
    const sa = a[bucket];
    const sb = b[bucket];
    if (!sa.n || !sb.n) continue;
    const dTtft50 = delta(sa.ttft_p50, sb.ttft_p50);
    const dTtft95 = delta(sa.ttft_p95, sb.ttft_p95);
    const dTotal50 = delta(sa.total_p50, sb.total_p50);
    const dTotal95 = delta(sa.total_p95, sb.total_p95);
    const dTps50 = delta(sa.tps_p50, sb.tps_p50);
    const dTps95 = delta(sa.tps_p95, sb.tps_p95);
    console.log(
      `| ${bucket.padEnd(7)} | ${String(sb.n).padStart(3)} | ` +
        `${fmtDelta(dTtft50, true)} | ${fmtDelta(dTtft95, true)} | ` +
        `${fmtDelta(dTotal50, true)} | ${fmtDelta(dTotal95, true)} | ` +
        `${fmtDelta(dTps50, false)} | ${fmtDelta(dTps95, false)} |`
    );
  }

  console.log(`\n## Absolute values\n`);
  printSummary(baseRun);
  console.log("\n");
  printSummary(candRun);
}

function findLatest() {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const files = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(RESULTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(RESULTS_DIR, files[0].f) : null;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 12).join("\n"));
    process.exit(argv.length === 0 ? 1 : 0);
  }

  let files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--latest") {
      const f = findLatest();
      if (!f) {
        console.error("[analyze] no result files in bench/results/");
        process.exit(1);
      }
      files.push(f);
    } else if (a === "--compare") {
      files.push(argv[++i]);
    } else if (!a.startsWith("--")) {
      files.push(a);
    }
  }

  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`[analyze] file not found: ${f}`);
      process.exit(1);
    }
  }

  if (files.length === 1) {
    printSummary(loadJsonl(files[0]));
  } else if (files.length === 2) {
    printDiff(loadJsonl(files[0]), loadJsonl(files[1]));
  } else {
    console.error("[analyze] pass 1 file (summary) or 2 files (diff)");
    process.exit(1);
  }
}

main();
