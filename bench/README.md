# Bench — polish-pipeline measurement

Personal/local. Tracks latency + throughput of the local LLM polish step so
we can decide whether MLX, smaller models, or other optimizations are worth
the effort. Everything in `corpus/` and `results/` is gitignored.

## What we measure (KPIs)

| Metric | Why it matters |
|---|---|
| `ttft_ms` | First-token latency. What the user feels first. |
| `total_ms` | Stop-of-stream → last token. Headline polish wall-clock. |
| `decode_ms` | total − ttft. Pure decode time. |
| `tokens_per_sec` | Decode throughput. The number that moves with model size + backend. |
| `output_tokens_approx` | Streamed-chunk count. Used for tok/s. |
| `stop_reason` | `stop` is good; `length` means truncation (raise `--max-tokens`). |

Stats are reported per length bucket (`short` <10 words, `medium` 10–49,
`long` 50+) and overall, as median + p95 across post-warmup runs.

## Two corpora

The bench supports two input corpora — pick the one that matches what you're trying to measure.

| Corpus | Contains | Used for |
|---|---|---|
| `bench/corpus/corpus.json` | `raw_text` + `polished_text` from your past dictations | Latency-only bench. Quick. No labeling needed. |
| `bench/corpus/labeled-corpus.json` | Same as above, plus an authored `intent` (what you *meant*) per entry | Latency *and* quality. Polish output is scored against intent. |

The labeled corpus is the gold standard. The unlabeled one is for fast iteration when you don't care about quality regressions yet.

## Workflow A — unlabeled (latency only)

```bash
# 1. Extract corpus from your dictation history (private, gitignored).
npm run bench:extract

# 2. Make sure the OpenWhispr app is running (so llama-server is alive).
#    The harness probes ports 8200–8220 to find it.

# 3. Run the bench. 5 runs per entry, first one dropped as warmup.
npm run bench:polish -- --label qwen3.5-4b-baseline

# 4. Print a markdown summary of the latest run.
npm run bench:analyze

# 5. After making a change, re-bench and diff against the baseline.
node bench/run-polish.js --label qwen3.5-1.5b
node bench/analyze.js bench/results/<base>.jsonl bench/results/<cand>.jsonl
```

## Workflow B — labeled (latency + quality)

The labels live in `bench/intents.json` (tracked, version-controlled). Each
entry is a `intent` you'll dictate naturally — speak the meaning in your own
words, don't read the script verbatim. The polish output is then scored
against the original intent.

```bash
# 1. Capture the current max DB id (so the binder knows which rows are new).
npm run bench:bind -- --capture-baseline

# 2. Open bench/intents.json. Dictate each one IN ORDER through the
#    OpenWhispr app. Speak naturally — fillers, restarts, casual phrasing
#    are fine. The intent is what you mean, not what you read.

# 3. Pair the new DB rows with the labels. Writes labeled-corpus.json.
npm run bench:bind

# (If you mess up the order or want to redo, you can also use:
#    node bench/bind-intents.js --last 20
#    node bench/bind-intents.js --start-id <id>)
```

After binding, `bench/corpus/labeled-corpus.json` has 20 entries with
`{intent, raw_text, polished_text, …}`. The next planned step is a
quality scorer that compares `polished_text` against `intent` —
not yet built.

## Running against a different model / backend

The harness talks to whatever `llama-server` is listening on the discovered
port. To compare models or quantizations, swap the model in the OpenWhispr
control panel (or restart `llama-server` manually) before each run, then
label the run accordingly:

```bash
node bench/run-polish.js --label qwen3.5-4b-q4
# swap model
node bench/run-polish.js --label qwen3.5-1.5b-q4
node bench/analyze.js bench/results/<a>.jsonl bench/results/<b>.jsonl
```

For an MLX comparison, point `--base-url` at an `mlx_lm.server` instance
(also OpenAI-compatible):

```bash
node bench/run-polish.js --base-url http://127.0.0.1:8080 --label mlx-qwen3.5-4b
```

## Files

- `extract-corpus.js` — pulls `raw_text` + reference polish from the
  app's SQLite DB. Buckets entries by word count.
- `run-polish.js` — for each entry, sends the same chat-completion shape
  the app uses (system prompt = `cleanupPrompt`, `enable_thinking: false`,
  `reasoning_budget: 0`, `max_tokens: 512`). Streaming, so TTFT is real.
- `analyze.js` — single-file summary or two-file diff, in markdown.
- `corpus/corpus.json` — gitignored.
- `results/*.jsonl` — gitignored. One JSON record per run + a header line.

## Caveats

- **Output tokens are approximate** — derived from the count of SSE delta
  chunks, not from the model's `usage` block. llama-server typically streams
  one token per chunk, but byte-level fallback splits can inflate the count
  on rare characters. Treat tok/s as comparative, not absolute.
- **Network/IPC overhead is included** in `ttft_ms` and `total_ms` because
  it's what the user actually waits through. If you want the model-only
  number, look at `decode_ms / output_tokens_approx`.
- **No quality scoring yet** — the corpus has a `reference_polish` per
  entry (what the previous polish run produced). Eyeball the `output` field
  on the first measured run of each entry to spot regressions. A formal
  scorer is deferred until we know it's worth building.
- **Cold-start is not measured.** First run is warmup. To measure cold
  start, restart `llama-server` between runs and use `--warmup 0`.
