const {
  screen,
  BrowserWindow,
  globalShortcut,
  Menu,
  Tray,
} = require("electron");
const path = require("path");

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.controlPanelWindow = null;
    this.tray = null;
  }

  async createMainWindow() {
    console.log("🔄 Creating main window...");
    const display = screen.getPrimaryDisplay();
    const width = 100;
    const height = 100;
    // Position window in bottom-right corner, but ensure it's visible
    const x = Math.max(
      0,
      display.bounds.x + display.workArea.width - width - 20
    );
    const y = Math.max(
      0,
      display.bounds.y + display.workArea.height - height - 20
    );

    console.log("📐 Window dimensions:", { width, height, x, y });

    this.mainWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      webPreferences: {
        preload: path.join(__dirname, "..", "..", "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        sandbox: true,
      },
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      transparent: true,
      show: true,
      skipTaskbar: false,
      focusable: true,
    });

    console.log("📱 Loading main window content...");
    await this.loadMainWindow();
    console.log("⌨️ Setting up shortcuts...");
    this.setupShortcuts();
    console.log("🍎 Setting up menu...");
    this.setupMenu();
    console.log("✅ Main window created successfully");

    this.mainWindow.webContents.on(
      "did-fail-load",
      async (event, errorCode, errorDescription, validatedURL) => {
        console.error(
          "Failed to load main window:",
          errorCode,
          errorDescription,
          validatedURL
        );
        if (
          process.env.NODE_ENV === "development" &&
          validatedURL.includes("localhost:5174")
        ) {
          console.log("Retrying connection to dev server in 2 seconds...");
          setTimeout(async () => {
            const isReady = await this.waitForDevServer();
            if (isReady) {
              console.log("Dev server ready, reloading...");
              this.mainWindow.reload();
            }
          }, 2000);
        }
      }
    );

    this.mainWindow.webContents.on("did-finish-load", () => {
      console.log("📱 Main window content loaded");
      setTimeout(() => {
        if (!this.mainWindow.isVisible()) {
          console.log("⚠️ Window not visible, forcing show...");
          this.mainWindow.show();
          this.mainWindow.focus();
        } else {
          console.log("✅ Main window is visible");
        }
      }, 1000);
    });

    this.mainWindow.on("show", () => {
      console.log("🎯 Main window shown");
    });

    this.mainWindow.on("focus", () => {
      console.log("🎯 Main window focused");
    });

    // Ensure window is always on top, even above fullscreen apps
    this.mainWindow.setAlwaysOnTop(true, "screen-saver");
    this.mainWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
    this.mainWindow.on("show", () => {
      this.mainWindow.setAlwaysOnTop(true, "screen-saver");
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
    });
  }

  async loadMainWindow() {
    const appUrl = this.getAppUrl(false);
    if (process.env.NODE_ENV === "development") {
      const isReady = await this.waitForDevServer();
      if (!isReady) {
        console.error("Dev server not ready, loading anyway...");
      }
    }
    this.mainWindow.loadURL(appUrl);
  }

  setupShortcuts() {
    globalShortcut.unregisterAll();
    globalShortcut.register("`", () => {
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.webContents.send("toggle-dictation");
    });
  }

  setupMenu() {
    if (process.platform === "darwin") {
      const template = [
        {
          label: "OpenWispr",
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "quit", label: "Quit OpenWispr" },
          ],
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }
  }

  async createControlPanelWindow() {
    console.log("🔄 Creating control panel window...");
    if (this.controlPanelWindow) {
      console.log("📋 Control panel already exists, focusing...");
      this.controlPanelWindow.focus();
      return;
    }
    this.controlPanelWindow = new BrowserWindow({
      width: 800,
      height: 700,
      webPreferences: {
        preload: path.join(__dirname, "..", "..", "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        sandbox: false,
        webSecurity: false,
      },
      title: "OpenWispr Control Panel",
      resizable: true,
      show: true,
      titleBarStyle: "hiddenInset",
      frame: false,
      transparent: false,
      backgroundColor: "#ffffff",
      minimizable: true,
      maximizable: true,
      closable: true,
      fullscreenable: true,
    });
    console.log("📱 Loading control panel content...");
    await this.loadControlPanel();
    this.controlPanelWindow.on("closed", () => {
      console.log("📋 Control panel window closed");
      this.controlPanelWindow = null;
    });
    console.log("✅ Control panel window created successfully");
  }

  async loadControlPanel() {
    const appUrl = this.getAppUrl(true);
    if (process.env.NODE_ENV === "development") {
      const isReady = await this.waitForDevServer();
      if (!isReady) {
        console.error(
          "Dev server not ready for control panel, loading anyway..."
        );
      }
    }
    this.controlPanelWindow.loadURL(appUrl);
  }

  async waitForDevServer(
    url = "http://localhost:5174/",
    maxAttempts = 30,
    delay = 1000
  ) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const http = require("http");
        const urlObj = new URL(url);

        const result = await new Promise((resolve) => {
          const req = http.get(
            {
              hostname: urlObj.hostname,
              port: urlObj.port || 80,
              path: urlObj.pathname,
              timeout: 2000,
            },
            (res) => {
              resolve(res.statusCode >= 200 && res.statusCode < 400);
            }
          );

          req.on("error", () => resolve(false));
          req.on("timeout", () => {
            req.destroy();
            resolve(false);
          });
        });

        if (result) {
          console.log(`Dev server ready after ${i + 1} attempts`);
          return true;
        }
      } catch (error) {
        console.log(
          `Waiting for dev server... attempt ${i + 1}/${maxAttempts}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    console.error("Dev server failed to start within timeout");
    return false;
  }

  getAppUrl(isControlPanel = false) {
    if (process.env.NODE_ENV === "development") {
      return isControlPanel
        ? "http://localhost:5174/?panel=true"
        : "http://localhost:5174/";
    } else {
      const htmlPath = path.join(
        __dirname,
        "..",
        "..",
        "src",
        "dist",
        "index.html"
      );
      const url = isControlPanel
        ? `file://${htmlPath}?panel=true`
        : `file://${htmlPath}`;
      return url;
    }
  }
}

module.exports = WindowManager;
