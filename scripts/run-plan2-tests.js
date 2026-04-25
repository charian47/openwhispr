// Plan 2 regression suite runner.
//
// Discovers every `test/*.test.js` whose name starts with `plan2-` (or ends
// with the word "streaming"/"injector"/"sidecar") and runs them sequentially.
// A non-zero exit from any test fails the whole run.
//
// Add new tests by dropping a `*.test.js` file in `test/` matching the pattern.
// Tests are plain Node scripts that:
//   - exit 0 on pass, non-zero on fail
//   - print whatever they want to stdout/stderr
// No test framework dependency. Keep it simple.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const TEST_DIR = path.join(__dirname, "..", "test");
// Allow-list of Plan 2 tests. Edit as new tests are added.
const PATTERNS = [
  /^streaming-roundtrip\.test\.js$/,
  /^plan2-.*\.test\.js$/,
];

function discover() {
  if (!fs.existsSync(TEST_DIR)) return [];
  return fs
    .readdirSync(TEST_DIR)
    .filter((f) => PATTERNS.some((re) => re.test(f)))
    .sort();
}

function runOne(name) {
  return new Promise((resolve) => {
    const start = Date.now();
    console.log(`\n=== ${name} ===`);
    const child = spawn(process.execPath, [path.join(TEST_DIR, name)], {
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      const ms = Date.now() - start;
      const status = code === 0 ? "PASS" : "FAIL";
      console.log(`--- ${name}: ${status} (${ms} ms, exit=${code}) ---`);
      resolve({ name, code, ms });
    });
  });
}

(async () => {
  const tests = discover();
  if (tests.length === 0) {
    console.log("No Plan 2 tests found.");
    process.exit(0);
  }
  console.log(`Plan 2 regression suite: ${tests.length} test(s)`);
  const results = [];
  for (const t of tests) {
    results.push(await runOne(t));
  }
  console.log("\n=== Summary ===");
  for (const r of results) {
    console.log(`  ${r.code === 0 ? "PASS" : "FAIL"}  ${r.name}  (${r.ms} ms)`);
  }
  const failed = results.filter((r) => r.code !== 0);
  if (failed.length > 0) {
    console.log(`\n${failed.length} test(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll Plan 2 tests passed.");
  process.exit(0);
})();
