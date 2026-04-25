// Shared test harness for the WhisperKit sidecar.
//
// Spawns the binary, parses newline-delimited JSON, and exposes async
// helpers for the assertion patterns every Plan 2 test needs.
//
// Conventions:
// - All `wait*` methods take a `timeoutMs` and reject (not resolve) on timeout.
// - All assert helpers throw on failure with a message that includes the
//   tail of the captured event stream and stderr — so test failure logs
//   are self-explanatory without re-running with --verbose.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const REPO = path.join(__dirname, "..", "..");
const SIDECAR = path.join(REPO, "resources", "bin", "whisperkit-sidecar");
const MODEL = path.join(
  os.homedir(),
  ".cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en"
);

const FRAME_SAMPLES = 320; // 20 ms @ 16 kHz mono Int16
const FRAME_BYTES = FRAME_SAMPLES * 2;

function checkPrereqs() {
  if (!fs.existsSync(SIDECAR)) {
    throw new Error(
      `Sidecar binary not found at ${SIDECAR}. Run: npm run compile:whisperkit`
    );
  }
  if (!fs.existsSync(MODEL)) {
    throw new Error(
      `Test model not found at ${MODEL}. Run the model-download step from Phase 2 task 2.1.`
    );
  }
}

function readPcmFromWav(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`not a RIFF/WAVE file: ${filePath}`);
  }
  let offset = 12;
  while (offset < buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") return buf.slice(offset + 8, offset + 8 + size);
    offset += 8 + size;
  }
  throw new Error(`no data chunk in ${filePath}`);
}

function chunkPcm(pcm) {
  const out = [];
  for (let off = 0; off + FRAME_BYTES <= pcm.length; off += FRAME_BYTES) {
    out.push(pcm.slice(off, off + FRAME_BYTES));
  }
  return out;
}

function silenceFrames(ms) {
  const frames = Math.floor((ms / 1000) * (16000 / FRAME_SAMPLES));
  const empty = Buffer.alloc(FRAME_BYTES);
  return Array.from({ length: frames }, () => empty);
}

class SidecarHarness {
  constructor({ language = "en", model = MODEL } = {}) {
    this.language = language;
    this.model = model;
    this.proc = null;
    this.events = [];
    this.stderrBuf = "";
    this._stdoutLineBuf = "";
    this._waiters = []; // { predicate, deadline, resolve, reject }
  }

  start() {
    if (this.proc) throw new Error("already started");
    this.proc = spawn(SIDECAR, ["--model", this.model, "--language", this.language], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout.on("data", (d) => this._onStdout(d));
    this.proc.stderr.on("data", (d) => {
      this.stderrBuf += d.toString();
    });
    this.proc.on("exit", (code, signal) => {
      this.events.push({ _meta: "exit", code, signal });
      // Reject any outstanding waiters.
      for (const w of this._waiters) {
        w.reject(new Error(`sidecar exited (code=${code}, signal=${signal}) before predicate matched`));
      }
      this._waiters = [];
    });
    return this;
  }

  _onStdout(data) {
    this._stdoutLineBuf += data.toString();
    let nl;
    while ((nl = this._stdoutLineBuf.indexOf("\n")) !== -1) {
      const line = this._stdoutLineBuf.slice(0, nl);
      this._stdoutLineBuf = this._stdoutLineBuf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        msg = { _meta: "non-json", raw: line };
      }
      this.events.push(msg);
      this._checkWaiters();
    }
  }

  _checkWaiters() {
    const remaining = [];
    for (const w of this._waiters) {
      if (w.predicate(this.events[this.events.length - 1], this.events)) {
        clearTimeout(w.timer);
        w.resolve(this.events[this.events.length - 1]);
      } else {
        remaining.push(w);
      }
    }
    this._waiters = remaining;
  }

  waitFor(predicate, { timeoutMs = 30_000, label = "event" } = {}) {
    return new Promise((resolve, reject) => {
      // Check the existing event log first.
      for (const e of this.events) {
        if (predicate(e, this.events)) return resolve(e);
      }
      const timer = setTimeout(() => {
        this._waiters = this._waiters.filter((w) => w.timer !== timer);
        reject(
          new Error(
            `timeout waiting for ${label} after ${timeoutMs} ms. Events:\n${this._dump()}`
          )
        );
      }, timeoutMs);
      this._waiters.push({ predicate, resolve, reject, timer });
    });
  }

  waitForType(type, opts = {}) {
    return this.waitFor((e) => e.type === type, { ...opts, label: `event type=${type}` });
  }

  waitForReady(timeoutMs = 5_000) {
    return this.waitForType("ready", { timeoutMs });
  }

  waitForModelLoaded(timeoutMs = 30_000) {
    return this.waitForType("model_loaded", { timeoutMs });
  }

  send(msg) {
    if (!this.proc || !this.proc.stdin.writable) {
      throw new Error("sidecar stdin not writable");
    }
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  sendAudio(buf) {
    this.send({ type: "audio", pcm: buf.toString("base64") });
  }

  async streamFrames(frames, paceMs = 20) {
    for (const f of frames) {
      this.sendAudio(f);
      if (paceMs > 0) await new Promise((r) => setTimeout(r, paceMs));
    }
  }

  sendConfig(language) {
    this.send({ type: "config", language });
  }

  async stop({ graceful = true, timeoutMs = 5_000 } = {}) {
    if (!this.proc) return;
    if (graceful) {
      try {
        this.send({ type: "end" });
      } catch {}
    }
    const exited = new Promise((resolve) => this.proc.on("exit", resolve));
    const timer = setTimeout(() => {
      try {
        this.proc.kill("SIGTERM");
      } catch {}
    }, timeoutMs);
    await exited;
    clearTimeout(timer);
  }

  // Returns a string with all events (one JSON line each) plus stderr tail.
  _dump() {
    const eventLines = this.events.map((e) => "  " + JSON.stringify(e)).join("\n");
    const tail = this.stderrBuf.length > 1500
      ? "...\n" + this.stderrBuf.slice(-1500)
      : this.stderrBuf;
    return `${eventLines}\nstderr:\n${tail}`;
  }

  // ------- Assertions -------

  assertEventsInOrder(typesInOrder) {
    let cursor = 0;
    for (const e of this.events) {
      if (e.type === typesInOrder[cursor]) cursor++;
      if (cursor === typesInOrder.length) return;
    }
    throw new Error(
      `expected events in order ${JSON.stringify(typesInOrder)} but got:\n${this._dump()}`
    );
  }

  countEvents(type) {
    return this.events.filter((e) => e.type === type).length;
  }

  commits() {
    return this.events.filter((e) => e.type === "commit");
  }
}

module.exports = {
  SidecarHarness,
  readPcmFromWav,
  chunkPcm,
  silenceFrames,
  checkPrereqs,
  SIDECAR,
  MODEL,
  FRAME_SAMPLES,
  FRAME_BYTES,
};
