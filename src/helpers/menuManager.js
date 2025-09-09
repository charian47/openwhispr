const { Menu } = require("electron");

class MenuManager {
  static setupMainMenu() {
    if (process.platform === "darwin") {
      const template = [
        {
          label: "OpenWhispr",
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "quit", label: "Quit OpenWhispr" },
          ],
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }
  }

  static setupControlPanelMenu(controlPanelWindow) {
    const template = [
      {
        label: "File",
        submenu: [{ role: "close", label: "Close Window" }],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo", label: "Undo" },
          { role: "redo", label: "Redo" },
          { type: "separator" },
          { role: "cut", label: "Cut" },
          { role: "copy", label: "Copy" },
          { role: "paste", label: "Paste" },
          { role: "pasteAndMatchStyle", label: "Paste and Match Style" },
          { type: "separator" },
          { role: "selectall", label: "Select All" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload", label: "Reload" },
          { role: "forceReload", label: "Force Reload" },
          { role: "toggleDevTools", label: "Toggle Developer Tools" },
          { type: "separator" },
          { role: "resetZoom", label: "Actual Size" },
          { role: "zoomIn", label: "Zoom In" },
          { role: "zoomOut", label: "Zoom Out" },
          { type: "separator" },
          { role: "togglefullscreen", label: "Toggle Full Screen" },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    controlPanelWindow.setMenu(menu);

    // Also set as application menu on macOS for clipboard access
    if (process.platform === "darwin") {
      Menu.setApplicationMenu(menu);
    }
  }
}

module.exports = MenuManager;
