/**
 * LinuxKeyManager - Handles key up/down detection for Push-to-Talk on Linux
 *
 * Uses a native Linux keyboard hook to detect when specific keys are
 * pressed and released, enabling Push-to-Talk functionality.
 */

const { spawn } = require("child_process");
const path = require("path");
const EventEmitter = require("events");
const fs = require("fs");
const debugLogger = require("./debugLogger");

class LinuxKeyManager extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.isSupported = process.platform === "linux";
    this.hasReportedError = false;
    this.currentKey = null;
    this.isReady = false;
    this.watchdogTimer = null;
  }

  /**
   * Start listening for the specified key
   * @param {string} key - The key to listen for (e.g., "`", "F8", "F11", "CommandOrControl+F11")
   */
  start(key = "`") {
    if (!this.isSupported) {
      return;
    }

    // If already running with the same key, do nothing
    if (this.process && this.currentKey === key) {
      return;
    }

    // Stop any existing listener
    this.stop();

    const listenerPath = this.resolveListenerBinary();
    if (!listenerPath) {
      // Binary not found - this is OK, Push-to-Talk will use fallback mode
      this.emit("unavailable", new Error("Linux key listener binary not found"));
      return;
    }

    this.hasReportedError = false;
    this.isReady = false;
    this.currentKey = key;

    debugLogger.debug("[LinuxKeyManager] Starting key listener", {
      key,
      binaryPath: listenerPath,
    });

    try {
      this.process = spawn(listenerPath, [key], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      debugLogger.error("[LinuxKeyManager] Failed to spawn process", { error: error.message });
      this.reportError(error);
      return;
    }

    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => {
      chunk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (line === "READY") {
            debugLogger.debug("[LinuxKeyManager] Listener ready", { key });
            this.isReady = true;
            this.emit("ready");
          } else if (line === "NO_PERMISSION") {
            debugLogger.warn("[LinuxKeyManager] No permission to access input devices");
            this.emit("permission-denied");
          } else if (line === "KEY_DOWN") {
            debugLogger.debug("[LinuxKeyManager] KEY_DOWN detected", { key });
            if (this.watchdogTimer) {
              clearTimeout(this.watchdogTimer);
            }
            this.watchdogTimer = setTimeout(() => {
              debugLogger.warn("[LinuxKeyManager] Watchdog: no KEY_UP received within 30s, forcing release");
              this.emit("key-up", this.currentKey);
              this.watchdogTimer = null;
            }, 30000);
            this.emit("key-down", key);
          } else if (line === "KEY_UP") {
            debugLogger.debug("[LinuxKeyManager] KEY_UP detected", { key });
            if (this.watchdogTimer) {
              clearTimeout(this.watchdogTimer);
              this.watchdogTimer = null;
            }
            this.emit("key-up", key);
          } else {
            // Log unknown output at debug level (could be native binary's stderr info)
            debugLogger.debug("[LinuxKeyManager] Unknown output", { line });
          }
        });
    });

    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message.length > 0) {
        // Native binary logs to stderr for info messages, don't treat as error
        debugLogger.debug("[LinuxKeyManager] Native stderr", { message });
      }
    });

    const proc = this.process;

    proc.on("error", (error) => {
      if (this.process === proc) this.process = null;
      this.reportError(error);
    });

    proc.on("exit", (code, signal) => {
      if (this.process === proc) {
        this.process = null;
        this.isReady = false;
      }
      if (code !== 0) {
        this.reportError(
          new Error(
            `Linux key listener exited with code ${code ?? "null"} signal ${signal ?? "null"}`
          )
        );
      }
    });
  }

  /**
   * Stop the key listener
   */
  stop() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.process) {
      debugLogger.debug("[LinuxKeyManager] Stopping key listener");
      try {
        this.process.kill();
      } catch {
        // Ignore kill errors
      }
      this.process = null;
    }
    this.isReady = false;
    this.currentKey = null;
  }

  /**
   * Check if the listener is available and ready
   */
  isAvailable() {
    return this.resolveListenerBinary() !== null;
  }

  /**
   * Report an error (only once per session to avoid log spam)
   */
  reportError(error) {
    if (this.hasReportedError) {
      return;
    }
    this.hasReportedError = true;

    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore
      } finally {
        this.process = null;
      }
    }

    debugLogger.warn("[LinuxKeyManager] Error occurred", { error: error.message });
    this.emit("error", error);
  }

  /**
   * Find the listener binary in various possible locations
   */
  resolveListenerBinary() {
    const arch = process.arch;
    const binaryNameWithArch = `linux-key-listener-${arch}`;
    const binaryNameNoArch = "linux-key-listener";

    const candidates = new Set([
      path.join(__dirname, "..", "..", "resources", "bin", binaryNameWithArch),
      path.join(__dirname, "..", "..", "resources", binaryNameWithArch),
    ]);

    if (process.resourcesPath) {
      [
        path.join(process.resourcesPath, binaryNameWithArch),
        path.join(process.resourcesPath, "bin", binaryNameWithArch),
        path.join(process.resourcesPath, "resources", binaryNameWithArch),
        path.join(process.resourcesPath, "resources", "bin", binaryNameWithArch),
        path.join(process.resourcesPath, "app.asar.unpacked", "resources", binaryNameWithArch),
        path.join(process.resourcesPath, "app.asar.unpacked", "resources", "bin", binaryNameWithArch),
      ].forEach((candidate) => candidates.add(candidate));
    }

    // Fallback: same paths without arch suffix
    [
      path.join(__dirname, "..", "..", "resources", "bin", binaryNameNoArch),
      path.join(__dirname, "..", "..", "resources", binaryNameNoArch),
    ].forEach((candidate) => candidates.add(candidate));

    if (process.resourcesPath) {
      [
        path.join(process.resourcesPath, binaryNameNoArch),
        path.join(process.resourcesPath, "bin", binaryNameNoArch),
        path.join(process.resourcesPath, "resources", binaryNameNoArch),
        path.join(process.resourcesPath, "resources", "bin", binaryNameNoArch),
        path.join(process.resourcesPath, "app.asar.unpacked", "resources", binaryNameNoArch),
        path.join(process.resourcesPath, "app.asar.unpacked", "resources", "bin", binaryNameNoArch),
      ].forEach((candidate) => candidates.add(candidate));
    }

    const candidatePaths = [...candidates];

    for (const candidate of candidatePaths) {
      try {
        const stats = fs.statSync(candidate);
        if (stats.isFile()) {
          return candidate;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}

module.exports = LinuxKeyManager;
