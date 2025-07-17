const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

class WhisperManager {
  constructor() {
    // Initialize whisper manager
  }

  async transcribeLocalWhisper(audioBlob, options = {}) {
    try {
      console.log("🎤 Starting local Whisper transcription...");

      const tempDir = os.tmpdir();
      const filename = `whisper_audio_${crypto.randomUUID()}.wav`;
      const tempAudioPath = path.join(tempDir, filename);

      console.log("💾 Writing audio to temp file:", tempAudioPath);

      // Handle different audio data formats
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

      const model = options.model || "base";
      const language = options.language || null;

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

      console.log("🔧 Running Whisper command:", pythonCmd, args.join(" "));

      return new Promise((resolve, reject) => {
        const whisperProcess = spawn(pythonCmd, args);

        let stdout = "";
        let stderr = "";

        whisperProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        whisperProcess.stderr.on("data", (data) => {
          stderr += data.toString();
          console.log("Whisper log:", data.toString());
        });

        whisperProcess.on("close", (code) => {
          // Clean up temp file
          try {
            fs.unlinkSync(tempAudioPath);
            console.log("🗑️ Cleaned up temp audio file");
          } catch (cleanupError) {
            console.warn(
              "⚠️ Could not clean up temp file:",
              cleanupError.message
            );
          }

          if (code === 0) {
            try {
              const result = JSON.parse(stdout);

              // Check if the transcription is empty or just whitespace
              if (!result.text || result.text.trim().length === 0) {
                console.log(
                  "🛑 No meaningful audio content detected (empty transcription)"
                );
                resolve({ success: false, message: "No audio detected" });
                return;
              }

              console.log(
                "✅ Whisper transcription successful:",
                result.text?.substring(0, 50) + "..."
              );
              resolve(result);
            } catch (parseError) {
              console.error("❌ Failed to parse Whisper output:", parseError);
              reject(
                new Error(
                  `Failed to parse Whisper output: ${parseError.message}`
                )
              );
            }
          } else {
            if (stderr.includes("no audio") || stderr.includes("empty")) {
              console.log("🛑 No audio content detected");
              resolve({ success: false, message: "No audio detected" });
            } else {
              console.error("❌ Whisper process failed with code:", code);
              console.error("Stderr:", stderr);
              reject(
                new Error(
                  `Whisper transcription failed (code ${code}): ${stderr}`
                )
              );
            }
          }
        });

        whisperProcess.on("error", (error) => {
          try {
            fs.unlinkSync(tempAudioPath);
          } catch (cleanupError) {
            console.warn(
              "⚠️ Could not clean up temp file:",
              cleanupError.message
            );
          }

          console.error("❌ Whisper process error:", error);
          reject(new Error(`Whisper process error: ${error.message}`));
        });

        setTimeout(() => {
          whisperProcess.kill("SIGTERM");
          try {
            fs.unlinkSync(tempAudioPath);
          } catch (cleanupError) {
            console.warn(
              "⚠️ Could not clean up temp file:",
              cleanupError.message
            );
          }
          reject(new Error("Whisper transcription timed out (30 seconds)"));
        }, 30000);
      });
    } catch (error) {
      console.error("❌ Local Whisper transcription error:", error);
      throw error;
    }
  }

  async findPythonExecutable() {
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
          console.log("🐍 Found Python at:", pythonPath);
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
    try {
      const pythonCmd = await this.findPythonExecutable();

      return new Promise((resolve) => {
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
            console.log("✅ Whisper is installed and working");
            resolve({ installed: true, working: true });
          } else {
            console.log("❌ Whisper is not properly installed");
            resolve({ installed: false, working: false });
          }
        });

        checkProcess.on("error", (error) => {
          console.log("❌ Error checking Whisper:", error.message);
          resolve({ installed: false, working: false, error: error.message });
        });
      });
    } catch (error) {
      console.log("❌ Error finding Python:", error.message);
      return { installed: false, working: false, error: error.message };
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

  async downloadWhisperModel(modelName) {
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

      console.log(
        "🔧 Running model download command:",
        pythonCmd,
        args.join(" ")
      );

      return new Promise((resolve, reject) => {
        const downloadProcess = spawn(pythonCmd, args);

        let stdout = "";
        let stderr = "";

        downloadProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        downloadProcess.stderr.on("data", (data) => {
          const output = data.toString();
          stderr += output;
          console.log("Model download log:", output);
        });

        downloadProcess.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              console.log(`✅ Model ${modelName} download completed:`, result);
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
            console.error("❌ Model download failed with code:", code);
            console.error("Stderr:", stderr);
            reject(
              new Error(`Model download failed (code ${code}): ${stderr}`)
            );
          }
        });

        downloadProcess.on("error", (error) => {
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
