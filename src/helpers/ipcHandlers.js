const { ipcMain, app, shell } = require("electron");
const AppUtils = require("../utils");

class IPCHandlers {
  constructor(managers) {
    this.environmentManager = managers.environmentManager;
    this.databaseManager = managers.databaseManager;
    this.clipboardManager = managers.clipboardManager;
    this.whisperManager = managers.whisperManager;
    this.windowManager = managers.windowManager;
    this.setupHandlers();
  }

  setupHandlers() {
    // Window control handlers
    ipcMain.handle("window-minimize", () => {
      if (this.windowManager.controlPanelWindow) {
        this.windowManager.controlPanelWindow.minimize();
      }
    });

    ipcMain.handle("window-maximize", () => {
      if (this.windowManager.controlPanelWindow) {
        if (this.windowManager.controlPanelWindow.isMaximized()) {
          this.windowManager.controlPanelWindow.unmaximize();
        } else {
          this.windowManager.controlPanelWindow.maximize();
        }
      }
    });

    ipcMain.handle("window-close", () => {
      if (this.windowManager.controlPanelWindow) {
        this.windowManager.controlPanelWindow.close();
      }
    });

    ipcMain.handle("window-is-maximized", () => {
      if (this.windowManager.controlPanelWindow) {
        return this.windowManager.controlPanelWindow.isMaximized();
      }
      return false;
    });

    ipcMain.handle("hide-window", () => {
      if (process.platform === "darwin") {
        this.windowManager.mainWindow.minimize();
        if (app.dock) app.dock.show();
      } else {
        this.windowManager.mainWindow.hide();
      }
    });

    ipcMain.handle("show-dictation-panel", () => {
      this.windowManager.showDictationPanel();
    });

    // Environment handlers
    ipcMain.handle("get-openai-key", async (event) => {
      return this.environmentManager.getOpenAIKey();
    });

    ipcMain.handle("save-openai-key", async (event, key) => {
      return this.environmentManager.saveOpenAIKey(key);
    });

    ipcMain.handle("create-production-env-file", async (event, apiKey) => {
      return this.environmentManager.createProductionEnvFile(apiKey);
    });

    ipcMain.handle("save-settings", async (event, settings) => {
      try {
        // Save settings to environment and localStorage
        if (settings.apiKey) {
          await this.environmentManager.saveOpenAIKey(settings.apiKey);
        }
        return { success: true };
      } catch (error) {
        console.error("Failed to save settings:", error);
        return { success: false, error: error.message };
      }
    });

    // Database handlers
    ipcMain.handle("db-save-transcription", async (event, text) => {
      return this.databaseManager.saveTranscription(text);
    });

    ipcMain.handle("db-get-transcriptions", async (event, limit = 50) => {
      return this.databaseManager.getTranscriptions(limit);
    });

    ipcMain.handle("db-clear-transcriptions", async (event) => {
      return this.databaseManager.clearTranscriptions();
    });

    ipcMain.handle("db-delete-transcription", async (event, id) => {
      return this.databaseManager.deleteTranscription(id);
    });

    // Clipboard handlers
    ipcMain.handle("paste-text", async (event, text) => {
      return this.clipboardManager.pasteText(text);
    });

    ipcMain.handle("read-clipboard", async (event) => {
      return this.clipboardManager.readClipboard();
    });

    ipcMain.handle("write-clipboard", async (event, text) => {
      return this.clipboardManager.writeClipboard(text);
    });

    // Whisper handlers
    ipcMain.handle(
      "transcribe-local-whisper",
      async (event, audioBlob, options = {}) => {
        try {
          const result = await this.whisperManager.transcribeLocalWhisper(
            audioBlob,
            options
          );

          // Check if no audio was detected and send appropriate event
          if (!result.success && result.message === "No audio detected") {
            event.sender.send("no-audio-detected");
          }

          return result;
        } catch (error) {
          console.error("❌ Local Whisper transcription error:", error);
          throw error;
        }
      }
    );

    ipcMain.handle("check-whisper-installation", async (event) => {
      return this.whisperManager.checkWhisperInstallation();
    });

    ipcMain.handle("check-python-installation", async (event) => {
      return this.whisperManager.checkPythonInstallation();
    });

    ipcMain.handle("install-python", async (event) => {
      try {
        const result = await this.whisperManager.installPython((progress) => {
          event.sender.send("python-install-progress", {
            type: "progress",
            stage: progress.stage,
            percentage: progress.percentage,
          });
        });
        return result;
      } catch (error) {
        console.error("❌ Python installation error:", error);
        throw error;
      }
    });

    ipcMain.handle("install-whisper", async (event) => {
      try {
        // Set up progress forwarding for installation
        const originalConsoleLog = console.log;
        console.log = (...args) => {
          const message = args.join(" ");
          if (
            message.includes("Installing") ||
            message.includes("Downloading") ||
            message.includes("Collecting")
          ) {
            event.sender.send("whisper-install-progress", {
              type: "progress",
              message: message,
            });
          }
          originalConsoleLog(...args);
        };

        const result = await this.whisperManager.installWhisper();

        // Restore original console.log
        console.log = originalConsoleLog;

        return result;
      } catch (error) {
        console.error("❌ Whisper installation error:", error);
        throw error;
      }
    });

    ipcMain.handle("download-whisper-model", async (event, modelName) => {
      try {
        const result = await this.whisperManager.downloadWhisperModel(
          modelName,
          (progressData) => {
            // Forward progress updates to the renderer
            event.sender.send("whisper-download-progress", progressData);
          }
        );

        // Send completion event
        event.sender.send("whisper-download-progress", {
          type: "complete",
          model: modelName,
          result: result,
        });

        return result;
      } catch (error) {
        console.error("❌ Model download error:", error);

        // Send error event
        event.sender.send("whisper-download-progress", {
          type: "error",
          model: modelName,
          error: error.message,
        });

        throw error;
      }
    });

    ipcMain.handle("check-model-status", async (event, modelName) => {
      return this.whisperManager.checkModelStatus(modelName);
    });

    ipcMain.handle("list-whisper-models", async (event) => {
      return this.whisperManager.listWhisperModels();
    });

    ipcMain.handle("delete-whisper-model", async (event, modelName) => {
      return this.whisperManager.deleteWhisperModel(modelName);
    });

    ipcMain.handle("cancel-whisper-download", async (event) => {
      return this.whisperManager.cancelDownload();
    });

    ipcMain.handle("check-ffmpeg-availability", async (event) => {
      return this.whisperManager.checkFFmpegAvailability();
    });

    // Utility handlers
    ipcMain.handle("cleanup-app", async (event) => {
      try {
        AppUtils.cleanup(this.windowManager.mainWindow);
        return { success: true, message: "Cleanup completed successfully" };
      } catch (error) {
        console.error("❌ Cleanup error:", error);
        throw error;
      }
    });

    ipcMain.handle("update-hotkey", async (event, hotkey) => {
      return await this.windowManager.updateHotkey(hotkey);
    });

    ipcMain.handle("start-window-drag", async (event) => {
      return await this.windowManager.startWindowDrag();
    });

    ipcMain.handle("stop-window-drag", async (event) => {
      return await this.windowManager.stopWindowDrag();
    });

    // External link handler
    ipcMain.handle("open-external", async (event, url) => {
      try {
        await shell.openExternal(url);
        return { success: true };
      } catch (error) {
        console.error("❌ Failed to open external URL:", error);
        return { success: false, error: error.message };
      }
    });
  }
}

module.exports = IPCHandlers;
