// Plan 2 VAD test: pure silence must NOT trigger a commit.
//
// Streams 5 seconds of pure silence into the sidecar and asserts:
//   - No `commit` events.
//   - VAD reports `silence` and never transitions to `speech`.
//   - Sidecar shuts down cleanly after `end`.
//
// This protects against the false-positive failure mode where the energy
// threshold drifts low enough that quiet noise is misread as speech.

const {
  SidecarHarness,
  silenceFrames,
  checkPrereqs,
} = require("./harness/sidecar-harness");

(async () => {
  checkPrereqs();
  const h = new SidecarHarness({ language: "en" }).start();
  await h.waitForReady();
  await h.waitForModelLoaded();
  console.log("[test] model loaded — streaming 5s silence");

  await h.streamFrames(silenceFrames(5000), 20);
  // Give the sidecar a moment in case any spurious commit was queued.
  await new Promise((r) => setTimeout(r, 1500));

  const commits = h.commits();
  if (commits.length !== 0) {
    throw new Error(
      `expected 0 commits for silence, got ${commits.length}: ${JSON.stringify(commits)}`
    );
  }

  // VAD should have stayed `silence` only. Initial state is silence, so we
  // expect at most ONE vad event with state=silence (or zero if the sidecar
  // doesn't emit until a transition).
  const vadEvents = h.events.filter((e) => e.type === "vad");
  for (const v of vadEvents) {
    if (v.state !== "silence") {
      throw new Error(`unexpected vad state during pure silence: ${JSON.stringify(v)}`);
    }
  }

  // No partials either — partials only fire while inSpeech.
  const partials = h.events.filter((e) => e.type === "partial");
  if (partials.length !== 0) {
    throw new Error(
      `expected 0 partial events during silence, got ${partials.length}`
    );
  }

  await h.stop();
  console.log(
    `[test] PASS — silence-only: 0 commits, ${vadEvents.length} vad events (all silence), 0 partials`
  );
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});
