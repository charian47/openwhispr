// Regression test: calling mgr.stop() must NOT trigger the auto-restart-once
// logic. The restart path is for unexpected crashes, not intentional shutdowns.
//
// Failure mode this protects against: every time the user toggles streaming
// off, the manager unnecessarily respawns the sidecar (40+ MB process,
// model reload latency, log noise).

const path = require("path");
const fs = require("fs");
const os = require("os");
const WhisperKitSidecarManager = require("../src/helpers/whisperKitSidecarManager");
const { checkPrereqs } = require("./harness/sidecar-harness");

const MODEL = path.join(
  os.homedir(),
  ".cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en"
);

(async () => {
  checkPrereqs();
  const mgr = new WhisperKitSidecarManager();

  let readyCount = 0;
  let exitCount = 0;
  mgr.on("ready", () => {
    readyCount++;
  });
  mgr.on("exit", () => {
    exitCount++;
  });

  await mgr.start(MODEL, "en");
  await new Promise((resolve) => mgr.once("modelLoaded", resolve));
  console.log(`[test] sidecar up (readyCount=${readyCount})`);

  if (readyCount !== 1) {
    throw new Error(`expected 1 ready event after start, got ${readyCount}`);
  }

  // Intentional shutdown.
  mgr.stop();

  // Wait for the exit event to fire.
  await new Promise((resolve) => mgr.once("exit", resolve));
  console.log(`[test] sidecar exited (exitCount=${exitCount})`);

  // Now wait long enough that any spurious restart would have spawned a
  // new process and emitted a fresh `ready`. 3 seconds is generous —
  // sidecar spawn + ready emission is typically <500 ms.
  await new Promise((r) => setTimeout(r, 3000));

  if (readyCount !== 1) {
    throw new Error(
      `expected exactly 1 ready event total (intentional stop should not restart), got ${readyCount}`
    );
  }
  if (exitCount !== 1) {
    throw new Error(
      `expected exactly 1 exit event after intentional stop, got ${exitCount}`
    );
  }
  if (mgr.proc !== null) {
    throw new Error(
      `expected manager.proc to be null after intentional stop, got ${typeof mgr.proc}`
    );
  }

  console.log("[test] PASS — intentional stop does not trigger restart");
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});
