const { spawn } = require("child_process");
const fs = require("fs");
const fsPromises = require("fs").promises;
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const PythonInstaller = require("./pythonInstaller");
const { runCommand, TIMEOUTS } = require("../utils/process");

class WhisperManager {
  constructor() {
    this.pythonCmd = null; // Cache Python executable path
    this.whisperInstalled = null; // Cache installation status
    this.isInitialized = false; // Track if startup init completed
    this.currentDownloadProcess = null; // Track current download process for cancellation
    this.pythonInstaller = new PythonInstaller();
  }

  getWhisperScriptPath() {
    // In production, the file is unpacked from ASAR
    if (process.env.NODE_ENV === "development") {
      return path.join(__dirname, "..", "..", "whisper_bridge.py");
    } else {
      // In production, use the unpacked path
      return path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "whisper_bridge.py"
      );
    }
  }

  async initializeAtStartup() {
    try {
      await this.findPythonExecutable();
      await this.checkWhisperInstallation();
      this.isInitialized = true;
    } catch (error) {
      console.error("Whisper not available at startup:", error.message);
      this.isInitialized = true;
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
      console.error("Local Whisper transcription error:", error);
      throw error;
    } finally {
      await this.cleanupTempFile(tempAudioPath);
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

    await fsPromises.writeFile(tempAudioPath, buffer);
    return tempAudioPath;
  }

  async runWhisperProcess(tempAudioPath, model, language) {
    const pythonCmd = await this.findPythonExecutable();
    const whisperScriptPath = this.getWhisperScriptPath();
    const args = [whisperScriptPath, tempAudioPath, "--model", model];
    if (language) {
      args.push("--language", language);
    }
    args.push("--output-format", "json");

    return new Promise(async (resolve, reject) => {
      // Get FFmpeg path with robust production/development handling
      let ffmpegPath;

      try {
        ffmpegPath = require("ffmpeg-static");
        
        // Add Windows .exe extension if missing
        if (process.platform === "win32" && !ffmpegPath.endsWith(".exe")) {
          ffmpegPath += ".exe";
        }

        // In production, handle ASAR unpacking more robustly
        if (process.env.NODE_ENV !== "development" && !fs.existsSync(ffmpegPath)) {
          const possiblePaths = [
            // Direct ASAR replacement
            ffmpegPath.replace("app.asar", "app.asar.unpacked"),
            // Alternative unpacked locations
            ffmpegPath.replace(/.*app\.asar/, path.join(__dirname, "..", "..", "app.asar.unpacked")),
            // Resources folder fallback
            path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
          ];

          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              ffmpegPath = possiblePath;
              break;
            }
          }
        }

        // Final validation of bundled FFmpeg
        if (!fs.existsSync(ffmpegPath)) {
          throw new Error(`Bundled FFmpeg not found at ${ffmpegPath}`);
        }
        
        // Validate it's actually executable
        try {
          fs.accessSync(ffmpegPath, fs.constants.X_OK);
        } catch (e) {
          throw new Error(`FFmpeg exists but is not executable: ${ffmpegPath}`);
        }

      } catch (e) {
        console.warn("Bundled FFmpeg not available:", e.message);
        
        // Try system FFmpeg with validation
        const systemFFmpeg = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
        try {
          await runCommand(systemFFmpeg, ["--version"], { timeout: TIMEOUTS.QUICK_CHECK });
          ffmpegPath = systemFFmpeg;
          console.log("Using system FFmpeg");
        } catch (systemError) {
          console.error("System FFmpeg also unavailable:", systemError.message);
          ffmpegPath = systemFFmpeg; // Last resort - let Python handle the error
        }
      }

      // Enhanced environment setup
      const enhancedEnv = {
        ...process.env,
        FFMPEG_PATH: ffmpegPath,
      };

      // Add ffmpeg directory to PATH if we have a valid path
      if (ffmpegPath) {
        const ffmpegDir = path.dirname(ffmpegPath);
        const currentPath = enhancedEnv.PATH || "";
        const pathSeparator = process.platform === "win32" ? ";" : ":";

        if (!currentPath.includes(ffmpegDir)) {
          enhancedEnv.PATH = `${ffmpegDir}${pathSeparator}${currentPath}`;
        }
      } else {
        console.warn("No valid FFmpeg path found, transcription may fail");
      }

      const whisperProcess = spawn(pythonCmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: enhancedEnv,
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
        const stderrText = data.toString();
        stderr += stderrText;

        if (
          stderrText.includes("ffmpeg") ||
          stderrText.includes("Error") ||
          stderrText.includes("failed")
        ) {
          console.error("Whisper error:", stderrText.trim());
        }
      });

      whisperProcess.on("close", (code) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeout);

        if (code === 0) {
          resolve(stdout);
        } else {
          // Better error message for FFmpeg issues
          let errorMessage = `Whisper transcription failed (code ${code}): ${stderr}`;

          if (
            stderr.includes("ffmpeg") ||
            stderr.includes("No such file or directory") ||
            stderr.includes("FFmpeg not found")
          ) {
            errorMessage +=
              "\n\nFFmpeg issue detected. Try restarting the app or reinstalling.";
          }

          reject(new Error(errorMessage));
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

  async cleanupTempFile(tempAudioPath) {
    try {
      await fsPromises.unlink(tempAudioPath);
    } catch (cleanupError) {
      console.warn("Could not clean up temp file:", cleanupError.message);
    }
  }

  async findPythonExecutable() {
    // Return cached result if available
    if (this.pythonCmd) {
      return this.pythonCmd;
    }

    const possiblePaths = [
      "python3.11",
      "python3",
      "python",
      "/usr/bin/python3.11",
      "/usr/bin/python3",
      "/usr/local/bin/python3.11",
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3.11",
      "/opt/homebrew/bin/python3",
      "/usr/bin/python",
      "/usr/local/bin/python",
    ];

    for (const pythonPath of possiblePaths) {
      try {
        const version = await this.getPythonVersion(pythonPath);
        if (this.isPythonVersionSupported(version)) {
          this.pythonCmd = pythonPath; // Cache the result
          return pythonPath;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error(
      "Python 3.x not found. Use installPython() to install it automatically."
    );
  }

  async installPython(progressCallback = null) {
    try {
      // Clear cached Python command since we're installing new one
      this.pythonCmd = null;
      
      const result = await this.pythonInstaller.installPython(progressCallback);
      
      // After installation, try to find Python again
      try {
        await this.findPythonExecutable();
        return result;
      } catch (findError) {
        throw new Error("Python installed but not found in PATH. Please restart the application.");
      }
      
    } catch (error) {
      console.error("Python installation failed:", error);
      throw error;
    }
  }

  async checkPythonInstallation() {
    return await this.pythonInstaller.isPythonInstalled();
  }

  async getPythonVersion(pythonPath) {
    return new Promise((resolve) => {
      const testProcess = spawn(pythonPath, ["--version"]);
      let output = "";
      
      testProcess.stdout.on("data", (data) => output += data);
      testProcess.stderr.on("data", (data) => output += data);
      
      testProcess.on("close", (code) => {
        if (code === 0) {
          const match = output.match(/Python (\d+)\.(\d+)/i);
          resolve(match ? { major: +match[1], minor: +match[2] } : null);
        } else {
          resolve(null);
        }
      });
      
      testProcess.on("error", () => resolve(null));
    });
  }

  isPythonVersionSupported(version) {
    // Accept any Python 3.x version
    return version && version.major === 3;
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

  async checkFFmpegAvailability() {
    try {
      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = this.getWhisperScriptPath();

      const result = await new Promise((resolve) => {
        const checkProcess = spawn(pythonCmd, [
          whisperScriptPath,
          "--mode",
          "check-ffmpeg",
        ]);

        let output = "";
        let stderr = "";

        checkProcess.stdout.on("data", (data) => {
          output += data.toString();
        });

        checkProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        checkProcess.on("close", (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(output);
              resolve(result);
            } catch (parseError) {
              resolve({
                available: false,
                error: "Failed to parse FFmpeg check result",
              });
            }
          } else {
            resolve({
              available: false,
              error: stderr || "FFmpeg check failed",
            });
          }
        });

        checkProcess.on("error", (error) => {
          resolve({ available: false, error: error.message });
        });
      });

      return result;
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  upgradePip(pythonCmd) {
    return runCommand(pythonCmd, ["-m", "pip", "install", "--upgrade", "pip"], { timeout: TIMEOUTS.PIP_UPGRADE });
  }

  // Removed - now using shared runCommand from utils/process.js

  async installWhisper() {
    const pythonCmd = await this.findPythonExecutable();
    
    // Upgrade pip first to avoid version issues
    console.log("Upgrading pip to latest version...");
    try {
      await this.upgradePip(pythonCmd);
      console.log("Pip upgraded successfully");
    } catch (error) {
      console.warn("First pip upgrade attempt failed:", error.message);
      
      // Try user install for pip upgrade
      try {
        console.log("Retrying pip upgrade with --user flag...");
        await runCommand(pythonCmd, ["-m", "pip", "install", "--user", "--upgrade", "pip"], { timeout: TIMEOUTS.PIP_UPGRADE });
        console.log("Pip upgraded successfully with --user flag");
      } catch (userError) {
        // If pip upgrade fails completely, try to detect if it's the TOML error
        if (error.message.includes("pyproject.toml") || error.message.includes("TomlError")) {
          // Try installing with legacy resolver as a workaround
          console.log("Pip upgrade failed due to TOML error, trying legacy resolver...");
          try {
            await runCommand(pythonCmd, ["-m", "pip", "install", "--use-deprecated=legacy-resolver", "--upgrade", "pip"], { timeout: TIMEOUTS.PIP_UPGRADE });
            console.log("Pip upgraded with legacy resolver");
          } catch (legacyError) {
            throw new Error("Failed to upgrade pip. Please manually run: python -m pip install --upgrade pip");
          }
        } else {
          console.warn("Pip upgrade failed completely, attempting to continue...");
        }
      }
    }
    
    // Try regular install, then user install if permission issues
    console.log("Installing OpenAI Whisper...");
    try {
      return await runCommand(pythonCmd, ["-m", "pip", "install", "-U", "openai-whisper"], { timeout: TIMEOUTS.DOWNLOAD });
    } catch (error) {
      if (error.message.includes("Permission denied") || error.message.includes("access is denied")) {
        console.log("Retrying with user installation...");
        return await runCommand(pythonCmd, ["-m", "pip", "install", "--user", "-U", "openai-whisper"], { timeout: TIMEOUTS.DOWNLOAD });
      }
      
      // If we still get TOML error after pip upgrade, try legacy resolver for whisper
      if (error.message.includes("pyproject.toml") || error.message.includes("TomlError")) {
        console.log("TOML error persists, trying legacy resolver for Whisper install...");
        try {
          return await runCommand(pythonCmd, ["-m", "pip", "install", "--use-deprecated=legacy-resolver", "-U", "openai-whisper"], { timeout: TIMEOUTS.DOWNLOAD });
        } catch (legacyError) {
          // Try user install with legacy resolver
          return await runCommand(pythonCmd, ["-m", "pip", "install", "--user", "--use-deprecated=legacy-resolver", "-U", "openai-whisper"], { timeout: TIMEOUTS.DOWNLOAD });
        }
      }
      
      // Enhanced error messages for common issues
      let message = error.message;
      if (message.includes("Microsoft Visual C++")) {
        message = "Microsoft Visual C++ build tools required. Install Visual Studio Build Tools.";
      } else if (message.includes("No matching distribution")) {
        message = "Python version incompatible. OpenAI Whisper requires Python 3.8-3.11.";
      }
      
      throw new Error(message);
    }
  }

  async downloadWhisperModel(modelName, progressCallback = null) {
    try {
      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = this.getWhisperScriptPath();

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
              resolve(result);
            } catch (parseError) {
              console.error("Failed to parse download result:", parseError);
              reject(
                new Error(
                  `Failed to parse download result: ${parseError.message}`
                )
              );
            }
          } else {
            // Handle cancellation cases (SIGTERM, SIGKILL, or null exit codes)
            if (code === 143 || code === 137 || code === null) {
              reject(new Error("Download interrupted by user"));
            } else {
              console.error("Model download failed with code:", code);
              reject(new Error(`Model download failed (exit code ${code})`));
            }
          }
        });

        downloadProcess.on("error", (error) => {
          this.currentDownloadProcess = null;
          console.error("Model download process error:", error);
          reject(new Error(`Model download process error: ${error.message}`));
        });

        const timeout = setTimeout(() => {
          downloadProcess.kill("SIGTERM");
          setTimeout(() => {
            if (!downloadProcess.killed) {
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
      console.error("Model download error:", error);
      throw error;
    }
  }

  async cancelDownload() {
    if (this.currentDownloadProcess) {
      try {
        this.currentDownloadProcess.kill("SIGTERM");
        setTimeout(() => {
          if (
            this.currentDownloadProcess &&
            !this.currentDownloadProcess.killed
          ) {
            this.currentDownloadProcess.kill("SIGKILL");
          }
        }, 3000);
        return { success: true, message: "Download cancelled" };
      } catch (error) {
        console.error("Error cancelling download:", error);
        return { success: false, error: error.message };
      }
    } else {
      return { success: false, error: "No active download to cancel" };
    }
  }

  async checkModelStatus(modelName) {
    try {
      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = this.getWhisperScriptPath();

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
              resolve(result);
            } catch (parseError) {
              console.error("Failed to parse model status:", parseError);
              reject(
                new Error(`Failed to parse model status: ${parseError.message}`)
              );
            }
          } else {
            console.error("Model status check failed with code:", code);
            reject(
              new Error(`Model status check failed (code ${code}): ${stderr}`)
            );
          }
        });

        checkProcess.on("error", (error) => {
          console.error("Model status check error:", error);
          reject(new Error(`Model status check error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error("Model status check error:", error);
      throw error;
    }
  }

  async listWhisperModels() {
    try {
      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = this.getWhisperScriptPath();

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
              resolve(result);
            } catch (parseError) {
              console.error("Failed to parse model list:", parseError);
              reject(
                new Error(`Failed to parse model list: ${parseError.message}`)
              );
            }
          } else {
            console.error("Model list failed with code:", code);
            reject(new Error(`Model list failed (code ${code}): ${stderr}`));
          }
        });

        listProcess.on("error", (error) => {
          console.error("Model list error:", error);
          reject(new Error(`Model list error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error("Model list error:", error);
      throw error;
    }
  }

  async deleteWhisperModel(modelName) {
    try {
      const pythonCmd = await this.findPythonExecutable();
      const whisperScriptPath = this.getWhisperScriptPath();

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
              resolve(result);
            } catch (parseError) {
              console.error("Failed to parse delete result:", parseError);
              reject(
                new Error(
                  `Failed to parse delete result: ${parseError.message}`
                )
              );
            }
          } else {
            console.error("Model delete failed with code:", code);
            reject(new Error(`Model delete failed (code ${code}): ${stderr}`));
          }
        });

        deleteProcess.on("error", (error) => {
          console.error("Model delete error:", error);
          reject(new Error(`Model delete error: ${error.message}`));
        });
      });
    } catch (error) {
      console.error("Model delete error:", error);
      throw error;
    }
  }
}

module.exports = WhisperManager;
