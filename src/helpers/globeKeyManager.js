const { spawn } = require("child_process");
const path = require("path");
const EventEmitter = require("events");
const fs = require("fs");

class GlobeKeyManager extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.isSupported = process.platform === "darwin";
  }

  start() {
    if (!this.isSupported || this.process) {
      return;
    }

    const scriptPath = this.resolveScriptPath();
    if (!scriptPath) {
      console.error("GlobeKeyManager: Swift listener script not found");
      return;
    }

    this.process = spawn("swift", [scriptPath]);

    this.process.stdout.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => {
      chunk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (line === "FN_DOWN") {
            this.emit("globe-down");
          } else if (line === "FN_UP") {
            this.emit("globe-up");
          }
        });
    });

    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (data) => {
      console.error("GlobeKeyManager error:", data.trim());
    });

    this.process.on("exit", (code, signal) => {
      this.process = null;
      if (code !== 0) {
        console.error(
          `GlobeKeyManager exited with code ${code ?? "null"} signal ${signal ?? "null"}`
        );
      }
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  resolveScriptPath() {
    const candidatePaths = [
      path.join(__dirname, "..", "..", "resources", "macos-globe-listener.swift"),
      path.join(process.resourcesPath, "macos-globe-listener.swift"),
      path.join(process.resourcesPath, "app.asar.unpacked", "resources", "macos-globe-listener.swift"),
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}

module.exports = GlobeKeyManager;
