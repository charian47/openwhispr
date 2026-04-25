const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");
const EventEmitter = require("events");
const debugLogger = require("./debugLogger");

const BIN_PATH = path.join(__dirname, "..", "..", "resources", "bin", "right-option-tap");

/**
 * RightOptionTapManager
 *
 * Spawns the native `right-option-tap` binary and bridges its stdout events
 * to the Electron main process via EventEmitter.
 *
 * Events emitted:
 *   "ready"             — binary is running and the CGEventTap is installed
 *   "toggle"            — user performed a valid right-Option double-tap
 *   "permissionMissing" — binary exited because Accessibility permission is absent
 *   "exit"              — binary exited for any reason: { code }
 */
class RightOptionTapManager extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
  }

  start() {
    if (this.proc) return;
    this.proc = spawn(BIN_PATH, [], { stdio: ["ignore", "pipe", "pipe"] });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === "ready") this.emit("ready");
        else if (msg.type === "toggle") this.emit("toggle");
      } catch {
        // Ignore malformed lines
      }
    });

    this.proc.stderr.on("data", (d) => {
      const text = d.toString().trim();
      debugLogger.warn(`[right-option-tap] ${text}`);
      if (text.includes("Accessibility permission required")) {
        this.emit("permissionMissing");
      }
    });

    this.proc.on("exit", (code) => {
      debugLogger.warn(`[right-option-tap] exited code=${code}`);
      this.proc = null;
      this.emit("exit", { code });
    });
  }

  stop() {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
  }
}

module.exports = RightOptionTapManager;
