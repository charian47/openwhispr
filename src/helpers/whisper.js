const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

class WhisperManager {
  constructor() {
    this.pythonCmd = null; // Cache Python executable path
    this.whisperInstalled = null; // Cache installation status
    this.isInitialized = false; // Track if startup init completed
    this.currentDownloadProcess = null; // Track current download process for cancellation
  }

  async initializeAtStartup() {
    try {
      // Initialize Python path and Whisper installation status
      await this.findPythonExecutable();
      await this.checkWhisperInstallation();
      this.isInitialized = true;
      console.log("✅ Whisper manager initialized at startup");
    } catch (error) {
      console.log("⚠️ Whisper not available at startup:", error.message);
      this.isInitialized = true; // Mark as initialized even if Whisper isn't available
    }
  }

  async transcribeLocalWhisper(audioBlob, options = {}) {
    const tempAudioPath = await this.createTempAudioFile(audioBlob);
    const model = options.model || "base";
    const language = options.language || null;

    try {
      const result = await this.runWhisperProcess(
        tempAudioPath,
        model,
        language
      );
      return this.parseWhisperResult(result);
    } catch (error) {
      console.error("❌ Local Whisper transcription error:", error);
      throw error;
    } finally {
      this.cleanupTempFile(tempAudioPath);
    }
  }

  async createTempAudioFile(audioBlob) {
    const tempDir = os.tmpdir();
    const filename = `whisper_audio_${crypto.randomUUID()}.wav`;
    const tempAudioPath = path.join(tempDir, filename);

    let buffer;
    if (audioBlob instanceof ArrayBuffer) {
      buffer = Buffer.from(audioBlob);
    } else if (audioBlob instanceof Uint8Array) {
      buffer = Buffer.from(audioBlob);
    } else if (typeof audioBlob === "string") {
      buffer = Buffer.from(audioBlob, "base64");
    } else if (audioBlob && audioBlob.buffer) {
      buffer = Buffer.from(audioBlob.buffer);
    } else {
      throw new Error(`Unsupported audio data type: ${typeof audioBlob}`);
    }

    fs.writeFileSync(tempAudioPath, buffer);
    return tempAudioPath;
  }

  async runWhisperProcess(tempAudioPath, model, language) {
    const pythonCmd = await this.findPythonExecutable();
    const whisperScriptPath = path.join(
      __dirname,
      "..",
      "..",
      "whisper_bridge.py"
    );
    const args = [whisperScriptPath, tempAudioPath, "--model", model];
    if (language) {
      args.push("--language", language);
    }
    args.push("--output-format", "json");

    return new Promise((resolve, reject) => {
      const whisperProcess = spawn(pythonCmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let isResolved = false;

      // Set timeout for longer recordings
      const timeout = setTimeout(() => {
        if (!isResolved) {
          whisperProcess.kill("SIGTERM");
          reject(new Error("Whisper transcription timed out (60 seconds)"));
        }
      }, 60000);

      whisperProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      whisperProcess.stderr.on("data", (data) => {
        stderr += data.toString();
        // Reduce logging verbosity
        if (
          data.toString().includes("Error") ||
          data.toString().includes("failed")
        ) {
          console.log("Whisper log:", data.toString());
        }
      });

      whisperProcess.on("close", (code) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeout);

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(`Whisper transcription failed (code ${code}): ${stderr}`)
          );
        }
      });

      whisperProcess.on("error", (error) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeout);
        reject(new Error(`Whisper process error: ${error.message}`));
      });
    });
  }

  parseWhisperResult(stdout) {
    try {
      // Clean stdout by removing any non-JSON content
      const lines = stdout.split("\n").filter((line) => line.trim());
      let jsonLine = "";

      // Find the line that looks like JSON (starts with { and ends with })
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          jsonLine = trimmed;
          break;
        }
      }

      if (!jsonLine) {
        throw new Error("No JSON output found in Whisper response");
      }

      const result = JSON.parse(jsonLine);
      if (!result.text || result.text.trim().length === 0) {
        return { success: false, message: "No audio detected" };
      }
      return { success: true, text: result.text.trim() };
    } catch (parseError) {
      console.error("Raw stdout:", stdout);
      throw new Error(`Failed to parse Whisper output: ${parseError.message}`);
    }
  }

  cleanupTempFile(tempAudioPath) {
    try {
      fs.unlinkSync(tempAudioPath);
    } catch (cleanupError) {
      console.warn("⚠️ Could not clean up temp file:", cleanupError.message);
    }
  }

  async findPythonExecutable() {
    // Return cached result if available
    if (this.pythonCmd) {
      return this.pythonCmd;
    }

    const possiblePaths = [
      "python3",
      "python",
      "/usr/bin/python3",
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3",
      "/usr/bin/python",
      "/usr/local/bin/python",
    ];

    for (const pythonPath of possiblePaths) {
      try {
        const result = await new Promise((resolve, reject) => {
          const testProcess = spawn(pythonPath, ["--version"]);
          testProcess.on("close", (code) => {
            resolve(code === 0);
          });
          testProcess.on("error", () => {
            resolve(false);
          });
        });

        if (result) {
          this.pythonCmd = pythonPath; // Cache the result
          return pythonPath;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error(
      "Python executable not found. Please ensure Python 3 is installed."
    );
  }

  async checkWhisperInstallation() {
    // Return cached result if available
    if (this.whisperInstalled !== null) {
      return this.whisperInstalled;
    }

    try {
      const pythonCmd = await this.findPythonExecutable();

      const result = await new Promise((resolve) => {
        const checkProcess = spawn(pythonCmd, [
          "-c",
          'import whisper; print("OK")',
        ]);

        let output = "";
        checkProcess.stdout.on("data", (data) => {
          output += data.toString();
        });

        checkProcess.on("close", (code) => {
          if (code === 0 && output.includes("OK")) {
            resolve({ installed: true, working: true });
          } else {
            resolve({ installed: false, working: false });
          }
        });

        checkProcess.on("error", (error) => {
          resolve({ installed: false, working: false, error: error.message });
        });
      });

      this.whisperInstalled = result; // Cache the result
      return result;
    } catch (error) {
      const errorResult = {
        installed: false,
        working: false,
        error: error.message,
      };
      this.whisperInstalled = errorResult;
      return errorResult;
    }
  }

  async installWhisper() {
    try {
      console.log("🔧 Starting automatic Whisper installation...");

      const pythonCmd = await this.findPythonExecutable();
      console.log("🐍 Using Python:", pythonCmd);

      const args = ["-m", "pip", "install", "-U", "openai-whisper"];

      console.log(
        "📦 Running installation command:",
        pythonCmd,
        args.join(" ")
      );

      return new Promise((resolve, reject) => {
        const installProcess = spawn(pythonCmd, args);

        let stdout = "";
        let stderr = "";

        installProcess.stdout.on("data", (data) => {
          const output = data.toString();
          stdout += output;
          console.log("Install output:", output);
        });

        installProcess.stderr.on("data", (data) => {
          const output = data.toString();
          stderr += output;
          console.log("Install stderr:", output);
        });

        installProcess.on("close", (code) => {
          if (code === 0) {
            console.log("✅ Whisper installation completed successfully");
            resolve({
              success: true,
              message: "Whisper installed successfully!",
              output: stdout,
            });
          } else {
            console.error("❌ Whisper installation failed with code:", code);
            console.error("Installation stderr:", stderr);
            reject(
              new Error(`Whisper installation failed (code ${code}): ${stderr}`)
            );
          }
        });

        installProcess.on("error", (error) => {
          console.error("❌ Whisper installation process error:", error);
          reject(
            new Error(`Whisper installation process error: ${error.message}`)
          );
        });

        setTimeout(() => {
          installProcess.kill("SIGTERM");
          reject(new Error("Whisper installation timed out (10 minutes)"));
        }, 600000);
      });
    } catch (error) {
      console.error("❌ Whisper installation error:", error);
      throw error;
    }
  }

  async downloadWhisperModel(modelName, progressCallback = null) {
    try {
      console.log(`📥 Starting download of Whisper model: ${modelName}`);

      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = path.join(
        __dirname,
        "..",
        "..",
        "whisper_bridge.py"
      );

      const args = [
        whisperScriptPath,
        "--mode",
        "download",
        "--model",
        modelName,
      ];

      return new Promise((resolve, reject) => {
        const downloadProcess = spawn(pythonCmd, args);
        this.currentDownloadProcess = downloadProcess; // Store for potential cancellation

        let stdout = "";
        let stderr = "";

        downloadProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        downloadProcess.stderr.on("data", (data) => {
          const output = data.toString();
          stderr += output;

          // Parse progress updates from stderr
          const lines = output.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("PROGRESS:")) {
              try {
                const progressData = JSON.parse(trimmed.substring(9));
                if (progressCallback) {
                  progressCallback({
                    type: "progress",
                    model: modelName,
                    ...progressData,
                  });
                }
              } catch (parseError) {
                // Ignore parsing errors for progress data
              }
            }
          }
        });

        downloadProcess.on("close", (code) => {
          this.currentDownloadProcess = null; // Clear process reference

          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              console.log(`✅ Model ${modelName} download completed`);
              resolve(result);
            } catch (parseError) {
              console.error("❌ Failed to parse download result:", parseError);
              reject(
                new Error(
                  `Failed to parse download result: ${parseError.message}`
                )
              );
            }
          } else {
            // Check if this was a cancellation (SIGTERM = 143, SIGKILL = 137)
            if (code === 143 || code === 137) {
              console.log(`🛑 Model ${modelName} download cancelled`);
              reject(new Error("Download interrupted by user"));
            } else {
              console.error("❌ Model download failed with code:", code);
              reject(
                new Error(`Model download failed (code ${code}): ${stderr}`)
              );
            }
          }
        });

        downloadProcess.on("error", (error) => {
          this.currentDownloadProcess = null; // Clear process reference
          console.error("❌ Model download process error:", error);
          reject(new Error(`Model download process error: ${error.message}`));
        });

        const timeout = setTimeout(() => {
          console.warn(
            "⚠️ Model download timed out, attempting graceful shutdown..."
          );
          downloadProcess.kill("SIGTERM");

          setTimeout(() => {
            if (!downloadProcess.killed) {
              console.warn("⚠️ Force killing download process...");
              downloadProcess.kill("SIGKILL");
            }
          }, 5000);

          reject(new Error("Model download timed out (20 minutes)"));
        }, 1200000);

        downloadProcess.on("close", () => {
          clearTimeout(timeout);
        });
      });
    } catch (error) {
      console.error("❌ Model download error:", error);
      throw error;
    }
  }

  async cancelDownload() {
    if (this.currentDownloadProcess) {
      try {
        console.log("🛑 Cancelling current download...");
        this.currentDownloadProcess.kill("SIGTERM");

        // Force kill after 3 seconds if still running
        setTimeout(() => {
          if (
            this.currentDownloadProcess &&
            !this.currentDownloadProcess.killed
          ) {
            console.log("🛑 Force killing download process...");
            this.currentDownloadProcess.kill("SIGKILL");
          }
        }, 3000);

        return { success: true, message: "Download cancelled" };
      } catch (error) {
        console.error("❌ Error cancelling download:", error);
        return { success: false, error: error.message };
      }
    } else {
      return { success: false, error: "No active download to cancel" };
    }
  }

  async checkModelStatus(modelName) {
    try {
      console.log(`🔍 Checking status of Whisper model: ${modelName}`);

      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = path.join(
        __dirname,
        "..",
        "..",
        "whisper_bridge.py"
      );

      const args = [whisperScriptPath, "--mode", "check", "--model", modelName];

      return new Promise((resolve, reject) => {
        const checkProcess = spawn(pythonCmd, args);

        let stdout = "";
        let stderr = "";

        checkProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        checkProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        checkProcess.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              console.log(`📊 Model ${modelName} status:`, result);
              resolve(result);
            } catch (parseError) {
              console.error("❌ Failed to parse model status:", parseError);
              reject(
                new Error(`Failed to parse model status: ${parseError.message}`)
              );
            }
          } else {
            console.error("❌ Model status check failed with code:", code);
            reject(
              new Error(`Model status check failed (code ${code}): ${stderr}`)
            );
          }
        });

        checkProcess.on("error", (error) => {
          console.error("❌ Model status check error:", error);
          reject(new Error(`Model status check error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error("❌ Model status check error:", error);
      throw error;
    }
  }

  async listWhisperModels() {
    try {
      console.log("📋 Listing all Whisper models...");

      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = path.join(
        __dirname,
        "..",
        "..",
        "whisper_bridge.py"
      );

      const args = [whisperScriptPath, "--mode", "list"];

      return new Promise((resolve, reject) => {
        const listProcess = spawn(pythonCmd, args);

        let stdout = "";
        let stderr = "";

        listProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        listProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        listProcess.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              console.log("📋 Model list retrieved:", result);
              resolve(result);
            } catch (parseError) {
              console.error("❌ Failed to parse model list:", parseError);
              reject(
                new Error(`Failed to parse model list: ${parseError.message}`)
              );
            }
          } else {
            console.error("❌ Model list failed with code:", code);
            reject(new Error(`Model list failed (code ${code}): ${stderr}`));
          }
        });

        listProcess.on("error", (error) => {
          console.error("❌ Model list error:", error);
          reject(new Error(`Model list error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error("❌ Model list error:", error);
      throw error;
    }
  }

  async deleteWhisperModel(modelName) {
    try {
      console.log(`🗑️ Deleting Whisper model: ${modelName}`);

      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = path.join(
        __dirname,
        "..",
        "..",
        "whisper_bridge.py"
      );

      const args = [
        whisperScriptPath,
        "--mode",
        "delete",
        "--model",
        modelName,
      ];

      return new Promise((resolve, reject) => {
        const deleteProcess = spawn(pythonCmd, args);

        let stdout = "";
        let stderr = "";

        deleteProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        deleteProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        deleteProcess.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              console.log(`🗑️ Model ${modelName} delete result:`, result);
              resolve(result);
            } catch (parseError) {
              console.error("❌ Failed to parse delete result:", parseError);
              reject(
                new Error(
                  `Failed to parse delete result: ${parseError.message}`
                )
              );
            }
          } else {
            console.error("❌ Model delete failed with code:", code);
            reject(new Error(`Model delete failed (code ${code}): ${stderr}`));
          }
        });

        deleteProcess.on("error", (error) => {
          console.error("❌ Model delete error:", error);
          reject(new Error(`Model delete error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error("❌ Model delete error:", error);
      throw error;
    }
  }
}

module.exports = WhisperManager;
