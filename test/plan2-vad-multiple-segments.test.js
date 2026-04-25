// Plan 2 VAD test: two distinct utterances must produce two distinct commits.
//
// Stitches together: speech1 + 1s silence + speech2 + 1s silence,
// asserts the sidecar emits exactly TWO commit events with strictly
// increasing segmentIds and matching text.

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

const FOX_WAV = "/tmp/openwhispr-test-fox.wav";
const HELLO_WAV = "/tmp/openwhispr-test-hello.wav";

function ensureWav(text, dest) {
  if (fs.existsSync(dest)) return;
  const aiff = dest.replace(/\.wav$/, ".aiff");
  execFileSync("say", [text, "-o", aiff]);
  const FFMPEG = path.join(__dirname, "..", "node_modules", "ffmpeg-static", "ffmpeg");
  execFileSync(FFMPEG, ["-y", "-i", aiff, "-ac", "1", "-ar", "16000", dest], {
    stdio: "ignore",
  });
}

(async () => {
  checkPrereqs();
  ensureWav("the quick brown fox jumps over the lazy dog", FOX_WAV);
  ensureWav("hello world testing one two three", HELLO_WAV);

  const h = new SidecarHarness({ language: "en" }).start();
  await h.waitForReady();
  await h.waitForModelLoaded();
  console.log("[test] model loaded");

  // Segment 1
  const fox = chunkPcm(readPcmFromWav(FOX_WAV));
  await h.streamFrames(fox, 20);
  await h.streamFrames(silenceFrames(1000), 20);
  console.log("[test] segment 1 streamed; waiting for first commit...");
  const c1 = await h.waitForType("commit", { timeoutMs: 60_000 });
  console.log(`[test] commit 1: segmentId=${c1.segmentId} text=${JSON.stringify(c1.text)}`);

  // Segment 2
  const hello = chunkPcm(readPcmFromWav(HELLO_WAV));
  await h.streamFrames(hello, 20);
  await h.streamFrames(silenceFrames(1000), 20);
  console.log("[test] segment 2 streamed; waiting for second commit...");
  const c2 = await h.waitFor(
    () => h.countEvents("commit") >= 2,
    { timeoutMs: 90_000, label: "second commit" }
  );
  console.log(`[test] commit 2: segmentId=${c2.segmentId} text=${JSON.stringify(c2.text)}`);

  // Strict assertions.
  const commits = h.commits();
  if (commits.length !== 2) {
    throw new Error(`expected 2 commits, got ${commits.length}: ${JSON.stringify(commits)}`);
  }
  if (!(commits[0].segmentId < commits[1].segmentId)) {
    throw new Error(
      `expected strictly increasing segmentIds, got ${commits[0].segmentId}, ${commits[1].segmentId}`
    );
  }
  if (!/fox/i.test(commits[0].text)) {
    throw new Error(`first commit missing "fox": ${JSON.stringify(commits[0].text)}`);
  }
  if (!/hello world|hello\s|world/i.test(commits[1].text)) {
    throw new Error(`second commit missing "hello world": ${JSON.stringify(commits[1].text)}`);
  }

  await h.stop();
  console.log("[test] PASS — two distinct segments transcribed independently");
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});
