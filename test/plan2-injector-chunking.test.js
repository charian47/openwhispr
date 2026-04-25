// plan2-injector-chunking.test.js
// Tests the grapheme-safe UTF-16 chunking logic in streamingInjector.js.
// Does NOT spawn the binary — pure JS only.

"use strict";

const assert = require("assert");
const path = require("path");
const { chunkText } = require(path.join(__dirname, "..", "src", "helpers", "streamingInjector"));

const MAX_UNITS = 18;

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

// ── Case 1: Empty string → 0 chunks ──────────────────────────────────────────
test("empty string → 0 chunks", () => {
  const chunks = chunkText("");
  assert.strictEqual(chunks.length, 0, `expected 0 chunks, got ${chunks.length}`);
});

// ── Case 2: Short ASCII ("hello") → 1 chunk, exact match ────────────────────
test('short ASCII "hello" → 1 chunk, exact match', () => {
  const chunks = chunkText("hello");
  assert.strictEqual(chunks.length, 1, `expected 1 chunk, got ${chunks.length}`);
  assert.strictEqual(chunks[0], "hello");
});

// ── Case 3: 50 'a's → multiple chunks, each ≤ 18 UTF-16 units, concat = input
test("50 'a's → multiple chunks ≤ 18 units each, concat reproduces input", () => {
  const input = "a".repeat(50);
  const chunks = chunkText(input);
  assert.ok(chunks.length > 1, `expected multiple chunks, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(
      chunk.length <= MAX_UNITS,
      `chunk "${chunk}" has ${chunk.length} UTF-16 units, exceeds limit of ${MAX_UNITS}`
    );
  }
  const rejoined = chunks.join("");
  assert.strictEqual(rejoined, input, "concatenated chunks do not reproduce original input");
});

// ── Case 4: Family emoji → fits in one chunk, not split mid-grapheme ─────────
// 👨‍👩‍👧‍👦 = U+1F468 ZWJ U+1F469 ZWJ U+1F467 ZWJ U+1F466
// Each emoji in the family is a surrogate pair (2 UTF-16 units), ZWJ is 1 unit.
// Total: 4*2 + 3*1 = 11 UTF-16 units — fits within MAX_UNITS=18.
test("family emoji 👨‍👩‍👧‍👦 (11 UTF-16 units) → 1 chunk, not split", () => {
  const emoji = "👨‍👩‍👧‍👦";
  // Verify our assumption about the length
  assert.strictEqual(emoji.length, 11, `emoji.length should be 11, got ${emoji.length}`);
  const chunks = chunkText(emoji);
  assert.strictEqual(chunks.length, 1, `expected 1 chunk for family emoji, got ${chunks.length}`);
  assert.strictEqual(chunks[0], emoji, "chunk does not match original emoji");
});

// ── Case 5: Mixed text + emoji, grapheme clusters preserved across chunks ────
// "hi 👨‍👩‍👧‍👦 there" — emoji is 11 UTF-16 units. If placed near a chunk boundary
// it must stay whole. The full string is 3+1+11+1+5 = 21 UTF-16 units, so it
// must span 2 chunks. The emoji (11 units) must appear intact in a single chunk.
test("mixed text + family emoji → grapheme clusters preserved across chunks", () => {
  const input = "hi 👨‍👩‍👧‍👦 there";
  const chunks = chunkText(input);
  // Every chunk must be ≤ MAX_UNITS
  for (const chunk of chunks) {
    assert.ok(
      chunk.length <= MAX_UNITS,
      `chunk "${chunk}" has ${chunk.length} UTF-16 units, exceeds ${MAX_UNITS}`
    );
  }
  // The emoji must appear intact — not split across two chunks
  const emojiStr = "👨‍👩‍👧‍👦";
  const emojiFoundInOneChunk = chunks.some((c) => c.includes(emojiStr));
  assert.ok(emojiFoundInOneChunk, "family emoji is split across chunks");
  // Concat must reproduce input
  assert.strictEqual(chunks.join(""), input, "concatenated chunks do not reproduce input");
});

// ── Case 6: Combining mark → not split between base char and combining mark ──
// "e\u{0301}" is 'e' + combining acute accent = é (decomposed form).
// It is 1 grapheme cluster, 2 UTF-16 units — must stay together.
test("combining mark e+U+0301 → not split between base char and mark", () => {
  const eWithMark = "é"; // e + combining acute accent
  // This is a single grapheme cluster
  assert.strictEqual(eWithMark.length, 2, `length should be 2 UTF-16 units, got ${eWithMark.length}`);
  // Build a string that puts the combining sequence near a chunk boundary:
  // 17 ASCII chars + "é" (2 units) = boundary is at 17/18.
  const input = "a".repeat(17) + eWithMark;
  const chunks = chunkText(input);
  // The combining cluster must NOT be split — no chunk should contain only the
  // acute without its base, and no chunk should contain 'e' alone if the next
  // chunk starts with the combining accent.
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    // Chunk should not end with bare 'e' when the following chunk exists and
    // would start with the combining mark
    if (i < chunks.length - 1) {
      const nextChunkFirstUnit = chunks[i + 1][0];
      assert.ok(
        !(c.endsWith("e") && nextChunkFirstUnit === "́"),
        `combining mark was split from its base 'e' between chunk ${i} and ${i + 1}`
      );
    }
    // Chunk must be ≤ MAX_UNITS
    assert.ok(c.length <= MAX_UNITS, `chunk "${c}" exceeds ${MAX_UNITS} UTF-16 units`);
  }
  // Concat must reproduce input
  assert.strictEqual(chunks.join(""), input, "concatenated chunks do not reproduce input");
});

// ── Case 7: Pass-through correctness on a 200-char mixed string ──────────────
test("200-char mixed string: chunking+joining reproduces exact input", () => {
  // Build a string with ASCII, Latin extended, and emoji spread throughout.
  const parts = [
    "The quick brown fox jumps",         // 25 ASCII
    " über ",                             // 7 (with multi-byte chars)
    "👨‍👩‍👧‍👦",                               // 11 UTF-16 units (family emoji)
    " lazy dogs. ",                       // 13
    "Ñoño ",                             // 6
    "café ",                             // 5 (precomposed)
    "résumé ",                           // 7
    "🎉🎊🎈",                           // 3 emoji, each 2 units = 6 total
    " end.",                             // 5
  ];
  // Pad to ~200 chars
  let input = parts.join("");
  while (input.length < 200) {
    input += " padding";
  }
  input = input.slice(0, 200);

  const chunks = chunkText(input);
  const rejoined = chunks.join("");
  assert.strictEqual(rejoined, input, "chunking+joining a 200-char mixed string does not reproduce input");

  // All chunks must be within limit
  for (const chunk of chunks) {
    assert.ok(
      chunk.length <= MAX_UNITS,
      `chunk of ${chunk.length} UTF-16 units exceeds limit of ${MAX_UNITS}`
    );
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nChunker test results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
