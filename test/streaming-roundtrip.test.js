// Phase 3 smoke test: end-to-end streaming roundtrip.
// Asserts:
//   - Sidecar reaches `ready` quickly.
//   - Model loads within 30 s.
//   - Streaming PCM through `audio` messages produces VAD transitions and
//     a `commit` whose text matches the expected phrase.
//   - The full event sequence appears in the right order.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  SidecarHarness,
  readPcmFromWav,
  chunkPcm,
  silenceFrames,
  checkPrereqs,
} = require("./harness/sidecar-harness");

const WAV = "/tmp/openwhispr-test-fox.wav";
const EXPECTED_TEXT_REGEX = /the quick brown fox jumps over the lazy dog/i;

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
  checkPrereqs();
  ensureFixtureWav();

  const pcm = readPcmFromWav(WAV);
  const audioFrames = chunkPcm(pcm);
  const tail = silenceFrames(1000); // 1 s silence to trigger VAD hangover
  console.log(
    `[test] audio: ${(pcm.length / 2 / 16000).toFixed(2)}s, frames: ${audioFrames.length} + ${tail.length} silence`
  );

  const h = new SidecarHarness({ language: "en" }).start();

  await h.waitForReady();
  await h.waitForModelLoaded();
  console.log("[test] model loaded");

  const t0 = Date.now();
  await h.streamFrames([...audioFrames, ...tail], 20);
  const commit = await h.waitForType("commit", { timeoutMs: 60_000 });
  const tCommit = Date.now() - t0;
  console.log(`[test] commit received in ${tCommit} ms`);

  // Strict assertions.
  if (typeof commit.text !== "string") {
    throw new Error(`commit.text not a string: ${JSON.stringify(commit)}`);
  }
  if (!EXPECTED_TEXT_REGEX.test(commit.text)) {
    throw new Error(
      `commit text "${commit.text}" did not match ${EXPECTED_TEXT_REGEX}`
    );
  }
  if (commit.segmentId !== 1) {
    throw new Error(`expected segmentId=1, got ${commit.segmentId}`);
  }
  // Verify event ordering: ready -> model_loaded -> vad -> partial -> vad -> commit
  h.assertEventsInOrder(["ready", "model_loaded", "vad", "partial", "vad", "commit"]);

  // Verify exactly ONE commit so far.
  if (h.countEvents("commit") !== 1) {
    throw new Error(
      `expected exactly one commit, got ${h.countEvents("commit")}`
    );
  }

  await h.stop();
  console.log(`[test] PASS — text=${JSON.stringify(commit.text)}`);
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});
