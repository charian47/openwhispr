// Phase 4 test: WhisperKitSidecarManager API roundtrip.
//
// Exercises the Node-side sidecar manager rather than spawning the binary
// directly. Uses the same WAV fixture and PCM helpers as streaming-roundtrip.test.js.
//
// Asserts:
//   - Manager reaches `ready` and emits `modelLoaded`.
//   - Streaming audio via sendAudio() produces a `commit` matching the phrase.
//   - Events arrive in order: ready → modelLoaded → vad → commit.
//   - stop() causes the process to exit cleanly (code === 0).
//
// Overall timeout: 180 s (generous to allow model load + transcription).
// Commit wait timeout: 90 s.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const WhisperKitSidecarManager = require("../src/helpers/whisperKitSidecarManager");
const {
  readPcmFromWav,
  chunkPcm,
  silenceFrames,
  checkPrereqs,
} = require("./harness/sidecar-harness");

const MODEL_PATH = path.join(
  os.homedir(),
  ".cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en"
);

const WAV = "/tmp/openwhispr-test-fox.wav";
const EXPECTED_TEXT_REGEX = /the quick brown fox jumps over the lazy dog/i;

// Kill the whole process if we exceed 180 s (safety net on top of per-step timeouts).
const OVERALL_DEADLINE = setTimeout(() => {
  console.error("[test] FAIL: overall 180 s deadline exceeded");
  process.exit(1);
}, 180_000);
OVERALL_DEADLINE.unref(); // Don't keep the event loop alive after normal exit.

function ensureFixtureWav() {
  if (fs.existsSync(WAV)) return;
  console.log(`[setup] creating ${WAV}`);
  const aiff = "/tmp/openwhispr-test-fox.aiff";
  execFileSync("say", [
    "the quick brown fox jumps over the lazy dog",
    "-o",
    aiff,
  ]);
  const FFMPEG = path.join(__dirname, "..", "node_modules", "ffmpeg-static", "ffmpeg");
  if (!fs.existsSync(FFMPEG)) {
    throw new Error(
      `ffmpeg-static not installed at ${FFMPEG}. Run npm install.`
    );
  }
  execFileSync(FFMPEG, ["-y", "-i", aiff, "-ac", "1", "-ar", "16000", WAV], {
    stdio: "inherit",
  });
}

(async () => {
  // Prerequisite checks (verifies sidecar binary and model exist).
  checkPrereqs();
  ensureFixtureWav();

  const pcm = readPcmFromWav(WAV);
  const audioFrames = chunkPcm(pcm);
  const tail = silenceFrames(1000); // 1 s silence to trigger VAD hangover
  console.log(
    `[test] audio: ${(pcm.length / 2 / 16000).toFixed(2)}s, frames: ${audioFrames.length} + ${tail.length} silence`
  );

  const mgr = new WhisperKitSidecarManager();

  // Collect events in order for assertion.
  const eventLog = []; // Array of event type strings
  const commitEvents = [];

  mgr.on("ready", () => {
    console.log("[test] event: ready");
    eventLog.push("ready");
  });
  mgr.on("modelLoaded", (msg) => {
    console.log("[test] event: modelLoaded", msg);
    eventLog.push("modelLoaded");
  });
  mgr.on("vad", (msg) => {
    console.log("[test] event: vad", msg);
    eventLog.push("vad");
  });
  mgr.on("partial", (msg) => {
    eventLog.push("partial");
  });
  mgr.on("commit", (msg) => {
    console.log("[test] event: commit", msg);
    eventLog.push("commit");
    commitEvents.push(msg);
  });
  mgr.on("sidecarError", (msg) => {
    console.error("[test] sidecar error:", msg);
  });

  // --- start() should resolve when `ready` arrives ---
  console.log("[test] calling start()");
  await mgr.start(MODEL_PATH, "en");
  console.log("[test] start() resolved (sidecar ready)");

  // --- Wait for modelLoaded ---
  await new Promise((resolve, reject) => {
    if (eventLog.includes("modelLoaded")) return resolve();
    const timer = setTimeout(
      () => reject(new Error("timeout waiting for modelLoaded (30 s)")),
      30_000
    );
    mgr.once("modelLoaded", () => { clearTimeout(timer); resolve(); });
  });
  console.log("[test] model loaded");

  // --- Stream audio + silence ---
  const allFrames = [...audioFrames, ...tail];
  const t0 = Date.now();
  for (const frame of allFrames) {
    mgr.sendAudio(frame);
    // Pace at 20 ms per frame (real-time)
    await new Promise((r) => setTimeout(r, 20));
  }

  // --- Wait for commit (90 s timeout) ---
  const commit = await new Promise((resolve, reject) => {
    if (commitEvents.length > 0) return resolve(commitEvents[0]);
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for commit after 90 s. Events so far: ${eventLog.join(", ")}`)),
      90_000
    );
    mgr.on("commit", (msg) => { clearTimeout(timer); resolve(msg); });
  });

  const tCommit = Date.now() - t0;
  console.log(`[test] commit received in ${tCommit} ms: ${JSON.stringify(commit)}`);

  // --- Assertions on commit ---
  if (typeof commit.text !== "string") {
    throw new Error(`commit.text not a string: ${JSON.stringify(commit)}`);
  }
  if (!EXPECTED_TEXT_REGEX.test(commit.text)) {
    throw new Error(
      `commit text "${commit.text}" did not match ${EXPECTED_TEXT_REGEX}`
    );
  }

  // --- Event order: ready → modelLoaded → vad → commit ---
  function assertOrder(types) {
    let cursor = 0;
    for (const e of eventLog) {
      if (e === types[cursor]) cursor++;
      if (cursor === types.length) return;
    }
    throw new Error(
      `expected events in order ${JSON.stringify(types)} but got: [${eventLog.join(", ")}]`
    );
  }
  assertOrder(["ready", "modelLoaded", "vad", "commit"]);
  console.log("[test] event order assertion passed");

  // --- stop() and wait for exit ---
  const exitEvent = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout waiting for exit after stop() (10 s)")),
      10_000
    );
    mgr.once("exit", (ev) => { clearTimeout(timer); resolve(ev); });
    mgr.stop();
  });

  console.log(`[test] exit event: ${JSON.stringify(exitEvent)}`);

  // The sidecar should exit cleanly (code 0) when sent {type:"end"}.
  if (exitEvent.code !== 0) {
    throw new Error(`expected exit code 0 but got code=${exitEvent.code} signal=${exitEvent.signal}`);
  }

  clearTimeout(OVERALL_DEADLINE);
  console.log("[test] PASS");
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});
