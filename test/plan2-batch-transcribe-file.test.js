// Plan 2 batch path test: the `transcribe_file` message must still work.
//
// This protects Phase 2's batch transcription path from regressions as
// streaming work in Phase 3+ accretes around it.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { SidecarHarness, checkPrereqs } = require("./harness/sidecar-harness");

const WAV = "/tmp/openwhispr-test-fox.wav";

function ensureFixtureWav() {
  if (fs.existsSync(WAV)) return;
  const aiff = "/tmp/openwhispr-test-fox.aiff";
  execFileSync("say", [
    "the quick brown fox jumps over the lazy dog",
    "-o",
    aiff,
  ]);
  const FFMPEG = path.join(__dirname, "..", "node_modules", "ffmpeg-static", "ffmpeg");
  execFileSync(FFMPEG, ["-y", "-i", aiff, "-ac", "1", "-ar", "16000", WAV], {
    stdio: "ignore",
  });
}

(async () => {
  checkPrereqs();
  ensureFixtureWav();

  const h = new SidecarHarness({ language: "en" }).start();
  await h.waitForReady();
  await h.waitForModelLoaded();
  console.log("[test] model loaded");

  h.send({ type: "transcribe_file", path: WAV });
  const done = await h.waitForType("transcribe_file_done", { timeoutMs: 60_000 });
  console.log(`[test] got transcribe_file_done: ${JSON.stringify(done.text)}`);

  if (done.path !== WAV) {
    throw new Error(`echoed path mismatch: ${done.path} vs ${WAV}`);
  }
  if (!/the quick brown fox jumps over the lazy dog/i.test(done.text)) {
    throw new Error(`unexpected transcription text: ${JSON.stringify(done.text)}`);
  }

  await h.stop();
  console.log("[test] PASS — batch transcribe_file path intact");
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});
