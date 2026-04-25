const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");
const EventEmitter = require("events");
const debugLogger = require("./debugLogger");

const SIDECAR_PATH = path.join(__dirname, "..", "..", "resources", "bin", "whisperkit-sidecar");

class WhisperKitSidecarManager extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.ready = false;
    this.modelPath = null;
    this.language = "auto";
    this.restartsRemaining = 1;
    // Set by stop() so the on-exit handler knows not to respawn.
    this._intentionalStop = false;
  }

  async start(modelPath, language = "auto") {
    if (this.proc) {
      debugLogger.log("[whisperkit] already running");
      return;
    }
    this.modelPath = modelPath;
    this.language = language;
    this._intentionalStop = false;
    this.restartsRemaining = 1;
    this._spawn();
    await this._awaitReady();
  }

  _spawn() {
    const args = ["--model", this.modelPath, "--language", this.language];
    debugLogger.log(`[whisperkit] spawn args=${JSON.stringify(args)}`);
    // spawn with argv array — no shell involved, no injection risk.
    this.proc = spawn(SIDECAR_PATH, args, { stdio: ["pipe", "pipe", "pipe"] });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => this._onLine(line));

    this.proc.stderr.on("data", (d) => {
      debugLogger.log(`[whisperkit stderr] ${d.toString().trim()}`);
    });

    this.proc.on("exit", (code, signal) => {
      debugLogger.warn(`[whisperkit] exited code=${code} signal=${signal}`);
      this.ready = false;
      this.proc = null;
      this.emit("exit", { code, signal });
      if (this._intentionalStop) {
        // Caller asked for shutdown — do not restart.
        return;
      }
      if (this.restartsRemaining > 0) {
        this.restartsRemaining -= 1;
        debugLogger.log("[whisperkit] restarting once");
        this._spawn();
      }
    });
  }

  _onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      debugLogger.warn(`[whisperkit] non-JSON line: ${line}`);
      return;
    }
    const map = {
      ready: () => { this.ready = true; this.emit("ready"); },
      model_loaded: () => this.emit("modelLoaded", msg),
      commit: () => this.emit("commit", msg),
      partial: () => this.emit("partial", msg),
      vad: () => this.emit("vad", msg),
      error: () => this.emit("sidecarError", msg),
    };
    (map[msg.type] || (() => {}))();
  }

  _awaitReady(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (this.ready) return resolve();
      const timer = setTimeout(
        () => reject(new Error("whisperkit sidecar failed to become ready in time")),
        timeoutMs
      );
      this.once("ready", () => { clearTimeout(timer); resolve(); });
    });
  }

  send(msg) {
    if (!this.proc || !this.proc.stdin.writable) return;
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  setLanguage(language) {
    this.language = language;
    this.send({ type: "config", language });
  }

  sendAudio(int16Buffer) {
    // int16Buffer is a Node Buffer of Int16LE samples at 16 kHz mono.
    this.send({ type: "audio", pcm: int16Buffer.toString("base64") });
  }

  stop() {
    if (!this.proc) return;
    this._intentionalStop = true;
    try { this.send({ type: "end" }); } catch {}
    setTimeout(() => { if (this.proc) this.proc.kill("SIGTERM"); }, 500);
    setTimeout(() => { if (this.proc) this.proc.kill("SIGKILL"); }, 2500);
  }
}

module.exports = WhisperKitSidecarManager;
