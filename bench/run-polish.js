#!/usr/bin/env node
// Polish-only bench harness. Sends each corpus entry to llama-server using
// the same prompt + parameters as the real app, with stream:true so we can
// measure actual TTFT (not just prefill).
//
// Mirrors:
//   - System prompt:   src/locales/en/prompts.json::cleanupPrompt
//   - HTTP shape:      src/helpers/llamaServer.js::inference()
//   - max_tokens=512, temperature=0.7, enable_thinking=false, reasoning_budget=0
//
// Prereqs:
//   1. App running (so llama-server is alive). The harness probes 8200–8220.
//   2. Corpus extracted: `node bench/extract-corpus.js`
//
// Usage:
//   node bench/run-polish.js                   # 5 runs per entry, drops first
//   node bench/run-polish.js --runs 3
//   node bench/run-polish.js --label qwen3.5-4b-baseline
//   node bench/run-polish.js --base-url http://127.0.0.1:8205
//   node bench/run-polish.js --limit 5         # smoke test on 5 entries

const fs = require("fs");
const path = require("path");
const http = require("http");

const CORPUS_PATH = path.join(__dirname, "corpus", "corpus.json");
const RESULTS_DIR = path.join(__dirname, "results");
const PROMPTS_PATH = path.join(__dirname, "..", "src", "locales", "en", "prompts.json");
const PORT_RANGE = [8200, 8220];

function parseArgs(argv) {
  const out = {
    runs: 5,
    warmup: 1,
    limit: null,
    baseUrl: null,
    label: "polish",
    maxTokens: 512,
    temperature: 0.7,
    agentName: "Assistant",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = parseInt(argv[++i], 10);
    else if (a === "--warmup") out.warmup = parseInt(argv[++i], 10);
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10);
    else if (a === "--base-url") out.baseUrl = argv[++i];
    else if (a === "--label") out.label = argv[++i];
    else if (a === "--max-tokens") out.maxTokens = parseInt(argv[++i], 10);
    else if (a === "--temperature") out.temperature = parseFloat(argv[++i]);
    else if (a === "--agent-name") out.agentName = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 22).join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function loadSystemPrompt(agentName) {
  const data = JSON.parse(fs.readFileSync(PROMPTS_PATH, "utf8"));
  return data.cleanupPrompt.replace(/\{\{agentName\}\}/g, agentName);
}

function probePort(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port, path: "/health", timeout: 250 },
      (res) => {
        // Any response (even 503 during model load) means something's there.
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function discoverBaseUrl() {
  for (let p = PORT_RANGE[0]; p <= PORT_RANGE[1]; p++) {
    const status = await probePort(p);
    if (status && status < 500) return `http://127.0.0.1:${p}`;
  }
  throw new Error(
    `No llama-server found in ports ${PORT_RANGE[0]}-${PORT_RANGE[1]}. ` +
      `Start the OpenWhispr app first, then re-run.`
  );
}

// One streaming chat-completion request. Resolves with timing measurements
// + the assembled text. TTFT is wall-clock to the first non-empty delta.
function streamingPolish({ baseUrl, systemPrompt, userText, maxTokens, temperature }) {
  const url = new URL("/v1/chat/completions", baseUrl);
  const payload = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: true,
    chat_template_kwargs: { enable_thinking: false },
    reasoning_budget: 0,
  };
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    let tFirstToken = null;
    let chunkCount = 0;
    let assembled = "";
    let buffer = "";
    let stopReason = null;
    let finishedClean = false;

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Accept: "text/event-stream",
        },
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          let errBody = "";
          res.on("data", (c) => (errBody += c));
          res.on("end", () =>
            reject(new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 200)}`))
          );
          return;
        }

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          buffer += chunk;
          // SSE frames are separated by \n\n; lines start with "data: "
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payloadStr = line.slice(5).trim();
              if (!payloadStr) continue;
              if (payloadStr === "[DONE]") {
                finishedClean = true;
                continue;
              }
              try {
                const obj = JSON.parse(payloadStr);
                const delta = obj.choices?.[0]?.delta?.content;
                if (delta) {
                  if (tFirstToken === null) tFirstToken = process.hrtime.bigint();
                  assembled += delta;
                  chunkCount++;
                }
                if (obj.choices?.[0]?.finish_reason) {
                  stopReason = obj.choices[0].finish_reason;
                }
              } catch {
                // skip malformed frame; llama-server occasionally emits
                // non-JSON keepalive comments
              }
            }
          }
        });
        res.on("end", () => {
          const tEnd = process.hrtime.bigint();
          const totalMs = Number(tEnd - t0) / 1e6;
          const ttftMs = tFirstToken === null ? null : Number(tFirstToken - t0) / 1e6;
          const decodeMs = tFirstToken === null ? null : Number(tEnd - tFirstToken) / 1e6;
          // chunkCount is a usable proxy for output tokens — llama-server
          // streams roughly one token per SSE frame.
          const tokensPerSec =
            decodeMs && decodeMs > 0 ? (chunkCount / decodeMs) * 1000 : null;
          resolve({
            ttftMs,
            totalMs,
            decodeMs,
            outputTokensApprox: chunkCount,
            outputCharCount: assembled.length,
            tokensPerSec,
            stopReason,
            finishedClean,
            output: assembled,
          });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timed out"));
    });
    req.write(body);
    req.end();
  });
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

function fmt(n, digits = 1) {
  return n === null || n === undefined ? "—" : Number(n).toFixed(digits);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(CORPUS_PATH)) {
    console.error(`[run-polish] missing corpus: ${CORPUS_PATH}`);
    console.error("[run-polish] run: node bench/extract-corpus.js");
    process.exit(1);
  }

  const corpus = JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
  const systemPrompt = loadSystemPrompt(args.agentName);
  const baseUrl = args.baseUrl || (await discoverBaseUrl());

  let entries = corpus.entries.slice();
  if (args.limit) entries = entries.slice(0, args.limit);

  console.log(`[run-polish] base_url=${baseUrl}`);
  console.log(
    `[run-polish] entries=${entries.length} runs=${args.runs} warmup=${args.warmup} ` +
      `(measured per entry: ${Math.max(0, args.runs - args.warmup)})`
  );
  console.log(`[run-polish] system_prompt_chars=${systemPrompt.length}`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(RESULTS_DIR, `${stamp}-${args.label}.jsonl`);
  const fd = fs.openSync(outFile, "w");

  // Header row — first line of the JSONL describes the run config.
  fs.writeSync(
    fd,
    JSON.stringify({
      kind: "header",
      timestamp: new Date().toISOString(),
      label: args.label,
      base_url: baseUrl,
      corpus_path: CORPUS_PATH,
      corpus_total: corpus.entries.length,
      corpus_used: entries.length,
      runs: args.runs,
      warmup: args.warmup,
      max_tokens: args.maxTokens,
      temperature: args.temperature,
      agent_name: args.agentName,
      system_prompt_chars: systemPrompt.length,
      hardware: {
        platform: process.platform,
        arch: process.arch,
        cpus: require("os").cpus()[0]?.model,
      },
    }) + "\n"
  );

  const allRecords = [];

  for (const [i, entry] of entries.entries()) {
    const measured = [];
    const errors = [];
    for (let r = 0; r < args.runs; r++) {
      try {
        const m = await streamingPolish({
          baseUrl,
          systemPrompt,
          userText: entry.raw_text,
          maxTokens: args.maxTokens,
          temperature: args.temperature,
        });
        const record = {
          kind: "run",
          entry_id: entry.id,
          bucket: entry.bucket,
          word_count: entry.word_count,
          run_index: r,
          warmup: r < args.warmup,
          ttft_ms: m.ttftMs,
          total_ms: m.totalMs,
          decode_ms: m.decodeMs,
          output_tokens_approx: m.outputTokensApprox,
          output_chars: m.outputCharCount,
          tokens_per_sec: m.tokensPerSec,
          stop_reason: m.stopReason,
          finished_clean: m.finishedClean,
          // Save output only on first measured run — full text on every run
          // would bloat the JSONL.
          output: r === args.warmup ? m.output : null,
        };
        fs.writeSync(fd, JSON.stringify(record) + "\n");
        if (r >= args.warmup) measured.push(m);
        allRecords.push(record);
      } catch (err) {
        const errRecord = {
          kind: "error",
          entry_id: entry.id,
          run_index: r,
          error: err.message,
        };
        fs.writeSync(fd, JSON.stringify(errRecord) + "\n");
        errors.push(err.message);
      }
    }

    const ttfts = measured.map((m) => m.ttftMs).filter((v) => v !== null);
    const totals = measured.map((m) => m.totalMs);
    const tps = measured.map((m) => m.tokensPerSec).filter((v) => v !== null);

    process.stdout.write(
      `  [${String(i + 1).padStart(3)}/${entries.length}] id=${String(entry.id).padStart(4)} ` +
        `${entry.bucket.padEnd(6)} wc=${String(entry.word_count).padStart(3)}  ` +
        `ttft=${fmt(median(ttfts), 0)}ms  total=${fmt(median(totals), 0)}ms  ` +
        `tok/s=${fmt(median(tps), 1)}` +
        (errors.length ? `  ERR=${errors.length}` : "") +
        "\n"
    );
  }

  fs.closeSync(fd);

  // Aggregate summary across all measured (post-warmup) runs.
  const measuredAll = allRecords.filter((r) => r.kind === "run" && !r.warmup);
  const buckets = ["short", "medium", "long"];
  const summary = { overall: bucketStats(measuredAll) };
  for (const b of buckets) {
    summary[b] = bucketStats(measuredAll.filter((r) => r.bucket === b));
  }

  console.log("\n[run-polish] summary (median / p95):");
  console.log("  bucket   n     ttft_ms          total_ms         tok/s");
  for (const b of ["overall", ...buckets]) {
    const s = summary[b];
    if (!s.n) continue;
    console.log(
      `  ${b.padEnd(8)} ${String(s.n).padStart(3)}   ` +
        `${fmt(s.ttft_p50, 0).padStart(5)} / ${fmt(s.ttft_p95, 0).padStart(5)}    ` +
        `${fmt(s.total_p50, 0).padStart(5)} / ${fmt(s.total_p95, 0).padStart(5)}    ` +
        `${fmt(s.tps_p50, 1).padStart(5)} / ${fmt(s.tps_p95, 1).padStart(5)}`
    );
  }
  console.log(`\n[run-polish] results → ${outFile}`);
}

function bucketStats(records) {
  const ttfts = records.map((r) => r.ttft_ms).filter((v) => v !== null && v !== undefined);
  const totals = records.map((r) => r.total_ms);
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

main().catch((err) => {
  console.error(`[run-polish] fatal: ${err.message}`);
  process.exit(1);
});
