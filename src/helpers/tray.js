const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");
const fs = require("fs");

class TrayManager {
  constructor() {
    this.tray = null;
    this.mainWindow = null;
    this.controlPanelWindow = null;
  }

  setWindows(mainWindow, controlPanelWindow) {
    this.mainWindow = mainWindow;
    this.controlPanelWindow = controlPanelWindow;
  }

  setCreateControlPanelCallback(callback) {
    this.createControlPanelCallback = callback;
  }

  async createTray() {
    if (process.platform !== "darwin") return;

    try {
      const trayIcon = await this.loadTrayIcon();
      if (!trayIcon || trayIcon.isEmpty()) {
        console.error("Failed to load tray icon");
        return;
      }

      trayIcon.setTemplateImage(true);
      this.tray = new Tray(trayIcon);

      this.tray.setIgnoreDoubleClickEvents(true);
      this.setupTrayMenu();
      this.setupTrayEventHandlers();
    } catch (error) {
      console.error("Error creating tray icon:", error.message);
    }
  }

  async loadTrayIcon() {
    if (process.env.NODE_ENV === "development") {
      const iconPath = path.join(
        __dirname,
        "..",
        "..",
        "assets",
        "iconTemplate@3x.png"
      );
      if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
      } else {
        console.error("Tray icon not found at:", iconPath);
        return this.createFallbackIcon();
      }
    } else {
      const possiblePaths = [
        path.join(process.resourcesPath, "assets", "iconTemplate@3x.png"),
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "assets",
          "iconTemplate@3x.png"
        ),
        path.join(__dirname, "..", "..", "assets", "iconTemplate@3x.png"),
        path.join(
          process.resourcesPath,
          "app",
          "assets",
          "iconTemplate@3x.png"
        ),
        path.join(app.getPath("exe"), "..", "Resources", "assets", "iconTemplate@3x.png"),
        path.join(app.getAppPath(), "assets", "iconTemplate@3x.png"),
      ];
      
      for (const testPath of possiblePaths) {
        try {
          if (fs.existsSync(testPath)) {
            return nativeImage.createFromPath(testPath);
          }
        } catch (e) {
          console.log("❌ Error checking path:", testPath, e.message);
        }
      }

      console.error("Could not find tray icon in any expected location");
      console.log("Tried paths:", possiblePaths);

      return this.createFallbackIcon();
    }
  }

  createFallbackIcon() {
    try {
      // Create a simple 16x16 PNG icon programmatically
      const { createCanvas } = require("canvas");
      const canvas = createCanvas(16, 16);
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(8, 8, 6, 0, 2 * Math.PI);
      ctx.fill();

      const buffer = canvas.toBuffer("image/png");
      const fallbackIcon = nativeImage.createFromBuffer(buffer);
      console.log("✅ Created fallback tray icon");
      return fallbackIcon;
    } catch (fallbackError) {
      console.warn("Canvas not available, creating minimal fallback icon");
      // Create a minimal 16x16 black square PNG as fallback
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x91, 0x68, 0x36, 0x00, 0x00, 0x00,
        0x0c, 0x49, 0x44, 0x41, 0x54, 0x28, 0x53, 0x63, 0x08, 0x05, 0x00, 0x00,
        0x02, 0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const fallbackIcon = nativeImage.createFromBuffer(pngData);
      console.log("✅ Created minimal fallback tray icon");
      return fallbackIcon;
    }
  }

  setupTrayMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Dictation Panel",
        click: () => {
          if (!this.mainWindow.isVisible()) {
            this.mainWindow.show();
          }
          this.mainWindow.focus();
        },
      },
      {
        label: "Open Control Panel",
        click: async () => {
          try {
            // Check if control panel window exists and is valid
            if (
              this.controlPanelWindow &&
              !this.controlPanelWindow.isDestroyed()
            ) {
              if (!this.controlPanelWindow.isVisible()) {
                this.controlPanelWindow.show();
              }
              this.controlPanelWindow.focus();
            } else if (this.createControlPanelCallback) {
              // Clear stale reference if window was destroyed
              if (
                this.controlPanelWindow &&
                this.controlPanelWindow.isDestroyed()
              ) {
                this.controlPanelWindow = null;
              }

              await this.createControlPanelCallback();

              // After creation, focus the window if it exists
              if (
                this.controlPanelWindow &&
                !this.controlPanelWindow.isDestroyed()
              ) {
                this.controlPanelWindow.focus();
              }
            } else {
              console.error("No control panel callback available");
            }
          } catch (error) {
            console.error("Failed to open control panel:", error);
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit OpenWhispr",
        click: () => {
          console.log("Quitting app via tray menu");
          app.quit();
        },
      },
    ]);

    this.tray.setToolTip("OpenWhispr - Voice Dictation");
    this.tray.setContextMenu(contextMenu);
  }

  setupTrayEventHandlers() {
    this.tray.on("click", () => {
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.focus();
    });

    this.tray.on("destroyed", () => {
      console.log("Tray icon destroyed");
      this.tray = null;
    });
  }
}

module.exports = TrayManager;
