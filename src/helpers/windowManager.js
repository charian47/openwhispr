const { screen, BrowserWindow } = require("electron");
const HotkeyManager = require("./hotkeyManager");
const DragManager = require("./dragManager");
const MenuManager = require("./menuManager");
const DevServerManager = require("./devServerManager");
const {
  MAIN_WINDOW_CONFIG,
  CONTROL_PANEL_CONFIG,
  WindowPositionUtil,
} = require("./windowConfig");

class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.controlPanelWindow = null;
    this.tray = null;
    this.hotkeyManager = new HotkeyManager();
    this.dragManager = new DragManager();
  }

  async createMainWindow() {
    console.log("🔄 Creating main window...");
    const display = screen.getPrimaryDisplay();
    const position = WindowPositionUtil.getMainWindowPosition(display);

    console.log("📐 Window dimensions:", position);

    this.mainWindow = new BrowserWindow({
      ...MAIN_WINDOW_CONFIG,
      ...position,
    });

    console.log("📱 Loading main window content...");
    await this.loadMainWindow();
    console.log("⌨️ Setting up shortcuts...");
    await this.initializeHotkey();
    console.log("🖱️ Setting up drag manager...");
    this.dragManager.setTargetWindow(this.mainWindow);
    console.log("🍎 Setting up menu...");
    MenuManager.setupMainMenu();
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
            const isReady = await DevServerManager.waitForDevServer();
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
    WindowPositionUtil.setupAlwaysOnTop(this.mainWindow);
    this.mainWindow.on("show", () => {
      WindowPositionUtil.setupAlwaysOnTop(this.mainWindow);
    });
  }

  async loadMainWindow() {
    const appUrl = DevServerManager.getAppUrl(false);
    if (process.env.NODE_ENV === "development") {
      const isReady = await DevServerManager.waitForDevServer();
      if (!isReady) {
        console.error("Dev server not ready, loading anyway...");
      }
    }
    this.mainWindow.loadURL(appUrl);
  }

  async initializeHotkey() {
    const callback = () => {
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.webContents.send("toggle-dictation");
    };

    await this.hotkeyManager.initializeHotkey(this.mainWindow, callback);
  }

  async updateHotkey(hotkey) {
    const callback = () => {
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.webContents.send("toggle-dictation");
    };

    return await this.hotkeyManager.updateHotkey(hotkey, callback);
  }

  async startWindowDrag() {
    return await this.dragManager.startWindowDrag();
  }

  async stopWindowDrag() {
    return await this.dragManager.stopWindowDrag();
  }

  async createControlPanelWindow() {
    console.log("🔄 Creating control panel window...");
    if (this.controlPanelWindow && !this.controlPanelWindow.isDestroyed()) {
      console.log("📋 Control panel already exists, focusing...");
      if (!this.controlPanelWindow.isVisible()) {
        this.controlPanelWindow.show();
      }
      this.controlPanelWindow.focus();
      return;
    }

    this.controlPanelWindow = new BrowserWindow(CONTROL_PANEL_CONFIG);

    console.log("📱 Loading control panel content...");
    await this.loadControlPanel();

    // Set up menu for control panel to ensure text input works
    MenuManager.setupControlPanelMenu(this.controlPanelWindow);

    // Show and focus the window after content is loaded
    this.controlPanelWindow.show();
    this.controlPanelWindow.focus();

    this.controlPanelWindow.on("closed", () => {
      console.log("📋 Control panel window closed");
      this.controlPanelWindow = null;
    });

    console.log("✅ Control panel window created successfully");
  }

  async loadControlPanel() {
    const appUrl = DevServerManager.getAppUrl(true);
    if (process.env.NODE_ENV === "development") {
      const isReady = await DevServerManager.waitForDevServer();
      if (!isReady) {
        console.error(
          "Dev server not ready for control panel, loading anyway..."
        );
      }
    }
    this.controlPanelWindow.loadURL(appUrl);
  }

  showDictationPanel() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
      }
      this.mainWindow.focus();
    }
  }
}

module.exports = WindowManager;
