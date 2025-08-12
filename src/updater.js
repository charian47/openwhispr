const { autoUpdater } = require("electron-updater");
const { ipcMain } = require("electron");

class UpdateManager {
  constructor() {
    this.mainWindow = null;
    this.controlPanelWindow = null;
    this.updateAvailable = false;
    this.updateDownloaded = false;

    this.setupAutoUpdater();
    this.setupIPCHandlers();
  }

  setWindows(mainWindow, controlPanelWindow) {
    this.mainWindow = mainWindow;
    this.controlPanelWindow = controlPanelWindow;
  }

  setupAutoUpdater() {
    // Only configure auto-updater in production
    if (process.env.NODE_ENV === "development") {
      // Auto-updater disabled in development mode
      return;
    }

    // Configure auto-updater for GitHub releases
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "HeroTools",
      repo: "open-whispr",
      private: false,
    });

    autoUpdater.logger = null;

    // Set up event handlers
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    autoUpdater.on("checking-for-update", () => {});

    autoUpdater.on("update-available", (info) => {
      this.updateAvailable = true;

      this.notifyRenderers("update-available", info);
    });

    autoUpdater.on("update-not-available", (info) => {
      this.updateAvailable = false;

      this.notifyRenderers("update-not-available", info);
    });

    autoUpdater.on("error", (err) => {
      console.error("❌ Auto-updater error:", err);
      this.updateAvailable = false;
      this.updateDownloaded = false;

      this.notifyRenderers("update-error", err);
    });

    autoUpdater.on("download-progress", (progressObj) => {
      this.notifyRenderers("update-download-progress", progressObj);
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.updateDownloaded = true;

      this.notifyRenderers("update-downloaded", info);
    });
  }

  notifyRenderers(channel, data) {
    if (this.mainWindow && this.mainWindow.webContents) {
      this.mainWindow.webContents.send(channel, data);
    }
    if (this.controlPanelWindow && this.controlPanelWindow.webContents) {
      this.controlPanelWindow.webContents.send(channel, data);
    }
  }

  setupIPCHandlers() {
    // Check for updates manually
    ipcMain.handle("check-for-updates", async () => {
      try {
        if (process.env.NODE_ENV === "development") {
          return {
            updateAvailable: false,
            message: "Update checks are disabled in development mode",
          };
        }

        const result = await autoUpdater.checkForUpdates();

        if (result && result.updateInfo) {
          console.log("📋 Update check result:", result.updateInfo);
          return {
            updateAvailable: true,
            version: result.updateInfo.version,
            releaseDate: result.updateInfo.releaseDate,
            files: result.updateInfo.files,
            releaseNotes: result.updateInfo.releaseNotes,
          };
        } else {
          return {
            updateAvailable: false,
            message: "You are running the latest version",
          };
        }
      } catch (error) {
        console.error("❌ Update check error:", error);
        throw error;
      }
    });

    // Download update
    ipcMain.handle("download-update", async () => {
      try {
        if (process.env.NODE_ENV === "development") {
          return {
            success: false,
            message: "Update downloads are disabled in development mode",
          };
        }

        await autoUpdater.downloadUpdate();

        return { success: true, message: "Update download started" };
      } catch (error) {
        console.error("❌ Update download error:", error);
        throw error;
      }
    });

    // Install update
    ipcMain.handle("install-update", async () => {
      try {
        if (process.env.NODE_ENV === "development") {
          console.log("⚠️ Update installation skipped in development mode");
          return {
            success: false,
            message: "Update installation is disabled in development mode",
          };
        }

        if (!this.updateDownloaded) {
          console.error("❌ No update downloaded to install");
          return {
            success: false,
            message: "No update available to install",
          };
        }

        console.log("🔄 Installing update and restarting...");

        // Use setImmediate to ensure the response is sent before quitting
        setImmediate(() => {
          autoUpdater.quitAndInstall();
        });

        return { success: true, message: "Update installation started" };
      } catch (error) {
        console.error("❌ Update installation error:", error);
        throw error;
      }
    });

    ipcMain.handle("get-app-version", async () => {
      try {
        const { app } = require("electron");
        const version = app.getVersion();
        return { version };
      } catch (error) {
        console.error("❌ Error getting app version:", error);
        throw error;
      }
    });

    ipcMain.handle("get-update-status", async () => {
      try {
        return {
          updateAvailable: this.updateAvailable,
          updateDownloaded: this.updateDownloaded,
          isDevelopment: process.env.NODE_ENV === "development",
        };
      } catch (error) {
        console.error("❌ Error getting update status:", error);
        throw error;
      }
    });
  }

  // Method to check for updates on startup
  checkForUpdatesOnStartup() {
    if (process.env.NODE_ENV !== "development") {
      // Wait a bit for the app to fully initialize
      setTimeout(() => {
        console.log("🔄 Checking for updates on startup...");
        autoUpdater.checkForUpdatesAndNotify();
      }, 5000);
    }
  }
}

module.exports = UpdateManager;
