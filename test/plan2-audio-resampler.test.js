// plan2-audio-resampler.test.js
// Tests the StreamingPCM16kResampler extracted from RESAMPLER_SOURCE.
// Runs in plain Node — no AudioWorklet globals needed.

const assert = require("assert");
const path = require("path");

(async () => {
  // The helper is an ESM (.mjs) module — load via dynamic import. Node 24
  // supports this from a CommonJS test script.
  const helperUrl = "file://" + path.join(__dirname, "..", "src", "helpers", "streamingAudioCapture.mjs");
  const { RESAMPLER_SOURCE } = await import(helperUrl);

// Load the class from the exact same source string the worklet uses.
// This validates that the exported source is self-contained and correct.
// eslint-disable-next-line no-new-func
const StreamingPCM16kResampler = new Function(RESAMPLER_SOURCE + "; return StreamingPCM16kResampler;")();

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Frame boundary correctness — every emitted frame is exactly 320
// Int16 samples (640 bytes).
// ---------------------------------------------------------------------------
test("every emitted frame is exactly 320 Int16 samples (640 bytes)", () => {
  const frames = [];
  const resampler = new StreamingPCM16kResampler({
    inputRate: 48000,
    frameSamples: 320,
    onFrame: (buf) => frames.push(buf),
  });

  // Feed 1 second of audio at 48 kHz in 128-sample chunks (AudioWorklet block size).
  const totalInputSamples = 48000;
  const chunkSize = 128;
  for (let i = 0; i < totalInputSamples; i += chunkSize) {
    const len = Math.min(chunkSize, totalInputSamples - i);
    resampler.process(new Float32Array(len)); // silence is fine for frame-boundary test
  }

  assert.ok(frames.length > 0, "Expected at least one frame");
  for (let i = 0; i < frames.length; i++) {
    assert.strictEqual(
      frames[i].byteLength,
      640,
      `Frame ${i} has byteLength ${frames[i].byteLength}, expected 640`
    );
  }
});

// ---------------------------------------------------------------------------
// Test 2: Total output sample count at downsample — 1 second at 48→16 kHz
// should produce ~16000 output samples (50 frames * 320 samples = 16000).
// Allow ±2 frames slack.
// ---------------------------------------------------------------------------
test("total output sample count ~= 16000 for 1s at 48kHz input", () => {
  const frames = [];
  const resampler = new StreamingPCM16kResampler({
    inputRate: 48000,
    frameSamples: 320,
    onFrame: (buf) => frames.push(buf),
  });

  const totalInputSamples = 48000;
  const chunkSize = 1024;
  for (let i = 0; i < totalInputSamples; i += chunkSize) {
    const len = Math.min(chunkSize, totalInputSamples - i);
    resampler.process(new Float32Array(len));
  }

  const totalOutputSamples = frames.length * 320;
  // Expected: exactly 50 frames (16000 samples). Allow ±2 frames (±640 samples).
  assert.ok(
    Math.abs(totalOutputSamples - 16000) <= 640,
    `Expected ~16000 output samples (±640), got ${totalOutputSamples} (${frames.length} frames)`
  );
});

// ---------------------------------------------------------------------------
// Test 3: Period preservation — 1 kHz sine at 48 kHz input, downsampled to
// 16 kHz, should still contain a 1 kHz signal. Verify by zero-crossing count
// in ~1 second of output. Expected: ~2000 zero-crossings (1000 Hz × 2 per cycle).
// Allow ±50 slack.
// ---------------------------------------------------------------------------
test("1kHz sine preserved through 48kHz→16kHz downsampling (zero-crossing count)", () => {
  const allInt16 = [];
  const resampler = new StreamingPCM16kResampler({
    inputRate: 48000,
    frameSamples: 320,
    onFrame: (buf) => {
      const view = new Int16Array(buf);
      for (let j = 0; j < view.length; j++) allInt16.push(view[j]);
    },
  });

  // Build 1 second of 1 kHz sine wave at 48 kHz.
  const totalSamples = 48000;
  const chunkSize = 1024;
  let sampleIndex = 0;
  for (let i = 0; i < totalSamples; i += chunkSize) {
    const len = Math.min(chunkSize, totalSamples - i);
    const chunk = new Float32Array(len);
    for (let j = 0; j < len; j++) {
      chunk[j] = Math.sin((2 * Math.PI * 1000 * (sampleIndex + j)) / 48000);
    }
    sampleIndex += len;
    resampler.process(chunk);
  }

  // Count zero-crossings (sign changes) in the output.
  let zeroCrossings = 0;
  for (let i = 1; i < allInt16.length; i++) {
    if ((allInt16[i - 1] >= 0 && allInt16[i] < 0) || (allInt16[i - 1] < 0 && allInt16[i] >= 0)) {
      zeroCrossings++;
    }
  }

  // 1 kHz sine at 16 kHz for 1 second → ~2000 zero-crossings.
  assert.ok(
    Math.abs(zeroCrossings - 2000) <= 50,
    `Expected ~2000 zero-crossings for 1kHz sine, got ${zeroCrossings}`
  );
});

// ---------------------------------------------------------------------------
// Test 4: Pass-through at equal rates (inputRate === 16000).
// Input samples should map 1:1 to output samples.
// ---------------------------------------------------------------------------
test("pass-through at equal rates: 320 samples → 1 frame, 32000 samples → 100 frames", () => {
  const frames1 = [];
  const r1 = new StreamingPCM16kResampler({
    inputRate: 16000,
    frameSamples: 320,
    onFrame: (buf) => frames1.push(buf),
  });
  // Feed exactly 320 samples — should produce exactly 1 frame.
  r1.process(new Float32Array(320));
  assert.strictEqual(frames1.length, 1, `Expected 1 frame for 320 samples, got ${frames1.length}`);

  const frames2 = [];
  const r2 = new StreamingPCM16kResampler({
    inputRate: 16000,
    frameSamples: 320,
    onFrame: (buf) => frames2.push(buf),
  });
  // Feed exactly 32000 samples — should produce exactly 100 frames.
  r2.process(new Float32Array(32000));
  assert.strictEqual(frames2.length, 100, `Expected 100 frames for 32000 samples, got ${frames2.length}`);
});

// ---------------------------------------------------------------------------
// Test 5: Amplitude clipping — values > 1.0 clamp to 0x7FFF (32767),
// values < -1.0 clamp to -0x8000 (-32768).
// ---------------------------------------------------------------------------
test("amplitude clipping: > 1.0 → 32767, < -1.0 → -32768", () => {
  // Use inputRate = 16000 so phase accumulator triggers on every sample (ratio = 1).
  // Feed a full frame of clipping values so we can check the output.
  const frames = [];
  const resampler = new StreamingPCM16kResampler({
    inputRate: 16000,
    frameSamples: 320,
    onFrame: (buf) => frames.push(buf),
  });

  // Build a 320-sample block: first 160 = +2.0 (positive clip), next 160 = -2.0 (negative clip).
  const clip = new Float32Array(320);
  for (let i = 0; i < 160; i++) clip[i] = 2.0;
  for (let i = 160; i < 320; i++) clip[i] = -2.0;
  resampler.process(clip);

  assert.strictEqual(frames.length, 1, `Expected 1 frame from 320 samples at 16kHz, got ${frames.length}`);
  const view = new Int16Array(frames[0]);
  assert.strictEqual(view[0], 32767, `First sample: expected 32767, got ${view[0]}`);
  assert.strictEqual(view[160], -32768, `Sample 160: expected -32768, got ${view[160]}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
  console.log(`\n=== plan2-audio-resampler.test.js: ${failed === 0 ? "PASS" : "FAIL"} (${passed}/${passed + failed}) ===`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error("[test] FAIL:", err.message);
  process.exit(1);
});
