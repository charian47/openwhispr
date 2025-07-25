const path = require("path");

// Main dictation window configuration
const MAIN_WINDOW_CONFIG = {
  width: 100,
  height: 100,
  type: 'panel',
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
  visibleOnAllWorkspaces: true,
  hiddenInMissionControl: false,
};

// Control panel window configuration
const CONTROL_PANEL_CONFIG = {
  width: 1200,
  height: 800,
  webPreferences: {
    preload: path.join(__dirname, "..", "..", "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    sandbox: false,
    webSecurity: false,
    spellcheck: false,
    experimentalFeatures: false,
    allowRunningInsecureContent: false,
    enableWebSQL: false,
    enableBlinkFeatures: "",
    defaultEncoding: "UTF-8",
    disableHtmlFullscreenWindowResize: false,
    enableClipboardAccess: true,
    clipboard: true,
  },
  title: "OpenWispr Control Panel",
  resizable: true,
  show: false,
  titleBarStyle: "hiddenInset",
  trafficLightPosition: { x: 20, y: 20 },
  frame: false,
  transparent: false,
  backgroundColor: "#ffffff",
  minimizable: true,
  maximizable: true,
  closable: true,
  fullscreenable: true,
};

// Window positioning utilities
class WindowPositionUtil {
  static getMainWindowPosition(display) {
    const { width, height } = MAIN_WINDOW_CONFIG;
    const x = Math.max(
      0,
      display.bounds.x + display.workArea.width - width - 20
    );
    const y = Math.max(0, display.bounds.y + display.workArea.height);
    return { x, y, width, height };
  }

  static setupAlwaysOnTop(window) {
    if (process.platform === 'darwin') {
      window.setAlwaysOnTop(true, "screen-saver", 1);
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.setFullScreenable(false);
    } else {
      window.setAlwaysOnTop(true);
    }
  }
}

module.exports = {
  MAIN_WINDOW_CONFIG,
  CONTROL_PANEL_CONFIG,
  WindowPositionUtil,
};
