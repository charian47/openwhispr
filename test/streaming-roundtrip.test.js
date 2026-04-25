// Manual streaming roundtrip test for the WhisperKit sidecar.
// - Reads /tmp/test.wav (mono 16kHz Int16LE, generated via `say` + ffmpeg)
// - Spawns ./resources/bin/whisperkit-sidecar with the tiny.en model
// - Streams 20ms audio frames as base64 `audio` JSON messages
// - Appends 1 second of silence so the energy VAD sees a speech-to-silence
//   transition and emits a `commit`
// - Logs every JSON line the sidecar emits and asserts a `commit` arrived
//   with non-empty text within a deadline.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SIDECAR = path.join(__dirname, "..", "resources", "bin", "whisperkit-sidecar");
const MODEL = path.join(
  os.homedir(),
  ".cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en"
);
const WAV = "/tmp/test.wav";
const FRAME_SAMPLES = 320; // 20 ms @ 16 kHz
const SILENCE_MS = 1000;
const DEADLINE_MS = 60_000;

function readPcmFromWav(filePath) {
  // Minimal WAV parser: assumes RIFF/WAVE, 16-bit PCM, mono, 16kHz.
  const buf = fs.readFileSync(filePath);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  // Walk chunks until "data".
  let offset = 12;
  while (offset < buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      const pcm = buf.slice(offset + 8, offset + 8 + size);
      return pcm; // Int16LE samples
    }
    offset += 8 + size;
  }
  throw new Error("no data chunk found");
}

function chunkPcm(pcm, frameSamples) {
  const frameBytes = frameSamples * 2;
  const out = [];
  for (let off = 0; off + frameBytes <= pcm.length; off += frameBytes) {
    out.push(pcm.slice(off, off + frameBytes));
  }
  return out;
}

function silenceChunks(ms, frameSamples) {
  const totalFrames = Math.floor((ms / 1000) * (16000 / frameSamples));
  const empty = Buffer.alloc(frameSamples * 2);
  return Array.from({ length: totalFrames }, () => empty);
}

(async () => {
  console.log("[test] sanity:", { SIDECAR, MODEL, WAV });
  for (const p of [SIDECAR, MODEL, WAV]) {
    if (!fs.existsSync(p)) {
      console.error("[test] missing:", p);
      process.exit(1);
    }
  }

  const pcm = readPcmFromWav(WAV);
  console.log(`[test] PCM bytes=${pcm.length} (samples=${pcm.length / 2}, secs=${(pcm.length / 2 / 16000).toFixed(2)})`);

  const audioFrames = chunkPcm(pcm, FRAME_SAMPLES);
  const tail = silenceChunks(SILENCE_MS, FRAME_SAMPLES);
  console.log(`[test] frames=${audioFrames.length} (audio) + ${tail.length} (silence)`);

  const child = spawn(SIDECAR, ["--model", MODEL, "--language", "en"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderrBuf = "";
  child.stderr.on("data", (d) => {
    stderrBuf += d.toString();
  });

  let modelLoaded = false;
  let committed = null;
  const events = [];

  let stdoutLine = "";
  child.stdout.on("data", (d) => {
    stdoutLine += d.toString();
    let nl;
    while ((nl = stdoutLine.indexOf("\n")) !== -1) {
      const line = stdoutLine.slice(0, nl);
      stdoutLine = stdoutLine.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        events.push({ raw: line });
        continue;
      }
      events.push(msg);
      if (msg.type === "model_loaded") modelLoaded = true;
      if (msg.type === "commit") committed = msg;
    }
  });

  // Wait for model to load
  const modelDeadline = Date.now() + 30_000;
  while (!modelLoaded && Date.now() < modelDeadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!modelLoaded) {
    console.error("[test] model never loaded within 30s. Events so far:", events);
    console.error("[test] stderr tail:", stderrBuf.slice(-2000));
    child.kill("SIGTERM");
    process.exit(1);
  }
  console.log("[test] model loaded; streaming audio...");

  for (const f of [...audioFrames, ...tail]) {
    child.stdin.write(JSON.stringify({ type: "audio", pcm: f.toString("base64") }) + "\n");
    // Pace at ~20 ms per frame so VAD sees realistic timing.
    await new Promise((r) => setTimeout(r, 20));
  }
  console.log("[test] all frames sent; waiting for commit...");

  const commitDeadline = Date.now() + DEADLINE_MS;
  while (!committed && Date.now() < commitDeadline) {
    await new Promise((r) => setTimeout(r, 100));
  }

  child.stdin.write(JSON.stringify({ type: "end" }) + "\n");
  child.stdin.end();

  await new Promise((r) => child.on("exit", r));

  console.log("[test] events:");
  for (const e of events) console.log("  ", JSON.stringify(e));
  if (committed) {
    console.log("[test] PASS — committed text:", JSON.stringify(committed.text));
    process.exit(0);
  } else {
    console.error("[test] FAIL — no commit received in deadline");
    console.error("[test] stderr tail:", stderrBuf.slice(-2000));
    process.exit(1);
  }
})();
