// plan2-paste-routing.test.js
// Tests routeInjection (pure routing function) and the clipboard-save/restore
// cycle in pasteChunk (using a fake clipboard to avoid Electron dependency).

"use strict";

const assert = require("assert");
const path = require("path");
const { routeInjection, pasteChunk } = require(path.join(
  __dirname,
  "..",
  "src",
  "helpers",
  "pasteFallback"
));

let passed = 0;
let failed = 0;

function test(label, fn) {
  const result = fn();
  // Support both sync and async test functions.
  if (result && typeof result.then === "function") {
    return result.then(
      () => {
        console.log(`  PASS  ${label}`);
        passed++;
      },
      (err) => {
        console.log(`  FAIL  ${label}`);
        console.log(`        ${err.message}`);
        failed++;
      }
    );
  }
  try {
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

// ── Group A: routeInjection — pure routing logic ──────────────────────────────

function syncTest(label, fn) {
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

console.log("\nGroup A — routeInjection");

// Case 1: bundle ID in list → "paste"
syncTest('bundle in list → "paste"', () => {
  const result = routeInjection("com.tinyspeck.slackmacgap", [
    "com.tinyspeck.slackmacgap",
    "com.microsoft.VSCode",
  ]);
  assert.strictEqual(result, "paste", `expected "paste", got "${result}"`);
});

// Case 2: bundle ID not in list → "keystroke"
syncTest('bundle not in list → "keystroke"', () => {
  const result = routeInjection("com.apple.Notes", ["com.tinyspeck.slackmacgap"]);
  assert.strictEqual(result, "keystroke", `expected "keystroke", got "${result}"`);
});

// Case 3: null bundle ID → "keystroke" (can't detect frontmost app)
syncTest('null bundle ID → "keystroke"', () => {
  const result = routeInjection(null, ["com.tinyspeck.slackmacgap"]);
  assert.strictEqual(result, "keystroke", `expected "keystroke", got "${result}"`);
});

// Case 4: empty list → "keystroke"
syncTest('empty list → "keystroke"', () => {
  const result = routeInjection("com.apple.Notes", []);
  assert.strictEqual(result, "keystroke", `expected "keystroke", got "${result}"`);
});

// Case 5: wildcard "*" in list → "paste" for any non-null bundle
syncTest('wildcard "*" in list → "paste" for any non-null bundle', () => {
  const result = routeInjection("com.anything.foo", ["*"]);
  assert.strictEqual(result, "paste", `expected "paste", got "${result}"`);
});

// ── Group B: pasteChunk with fake clipboard ───────────────────────────────────

console.log("\nGroup B — pasteChunk clipboard save/restore");

function makeFakeClipboard(initial = "") {
  let value = initial;
  return {
    readText: () => value,
    writeText: (s) => {
      value = s;
    },
    getValue: () => value,
  };
}

async function runAsyncTests() {
  // Case 6: clipboard is restored after paste (restoreClipboard=true, default)
  await test("clipboard restored after paste (_skipPaste=true, restoreClipboard=true)", async () => {
    const fakeClipboard = makeFakeClipboard("original content");
    const result = await pasteChunk("dictated text", {
      clipboard: fakeClipboard,
      _skipPaste: true,
      restoreClipboard: true,
    });
    assert.ok(result.success, `pasteChunk should succeed, got: ${JSON.stringify(result)}`);
    assert.strictEqual(
      fakeClipboard.getValue(),
      "original content",
      `clipboard should be restored to "original content", got "${fakeClipboard.getValue()}"`
    );
  });

  // Case 7: clipboard NOT restored when restoreClipboard=false
  await test("clipboard not restored when restoreClipboard=false", async () => {
    const fakeClipboard = makeFakeClipboard("original content");
    const result = await pasteChunk("dictated text", {
      clipboard: fakeClipboard,
      _skipPaste: true,
      restoreClipboard: false,
    });
    assert.ok(result.success, `pasteChunk should succeed, got: ${JSON.stringify(result)}`);
    assert.strictEqual(
      fakeClipboard.getValue(),
      "dictated text",
      `clipboard should contain "dictated text" (not restored), got "${fakeClipboard.getValue()}"`
    );
  });

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\nPaste routing test results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAsyncTests().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
