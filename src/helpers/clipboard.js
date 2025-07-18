const { clipboard } = require("electron");
const { spawn } = require("child_process");

class ClipboardManager {
  constructor() {
    // Initialize clipboard manager
  }

  // Safe logging method to prevent EPIPE errors
  safeLog(...args) {
    try {
      console.log(...args);
    } catch (error) {
      // Silently ignore EPIPE errors in logging
      if (error.code !== "EPIPE") {
        // Only log non-EPIPE errors to stderr
        process.stderr.write(`Log error: ${error.message}\n`);
      }
    }
  }

  async pasteText(text) {
    try {
      // Save original clipboard content first
      const originalClipboard = clipboard.readText();
      this.safeLog(
        "💾 Saved original clipboard content:",
        originalClipboard.substring(0, 50) + "..."
      );

      // Copy text to clipboard first - this always works
      clipboard.writeText(text);
      this.safeLog(
        "📋 Text copied to clipboard:",
        text.substring(0, 50) + "..."
      );

      if (process.platform === "darwin") {
        // Check accessibility permissions first
        this.safeLog(
          "🔍 Checking accessibility permissions for paste operation..."
        );
        const hasPermissions = await this.checkAccessibilityPermissions();

        if (!hasPermissions) {
          this.safeLog(
            "⚠️ No accessibility permissions - text copied to clipboard only"
          );
          const errorMsg =
            "Accessibility permissions required for automatic pasting. Text has been copied to clipboard - please paste manually with Cmd+V.";
          throw new Error(errorMsg);
        }

        this.safeLog("✅ Permissions granted, attempting to paste...");
        return await this.pasteMacOS(originalClipboard);
      } else if (process.platform === "win32") {
        return await this.pasteWindows(originalClipboard);
      } else {
        return await this.pasteLinux(originalClipboard);
      }
    } catch (error) {
      console.error("❌ Paste error:", error);
      throw error;
    }
  }

  async pasteMacOS(originalClipboard) {
    console.log("🍎 Attempting macOS paste...");
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const pasteProcess = spawn("osascript", [
          "-e",
          'tell application "System Events" to keystroke "v" using command down',
        ]);

        let errorOutput = "";
        let hasTimedOut = false;

        pasteProcess.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        pasteProcess.on("close", (code) => {
          if (hasTimedOut) return;

          // Clear timeout first
          clearTimeout(timeoutId);

          // Clean up the process reference
          pasteProcess.removeAllListeners();

          if (code === 0) {
            this.safeLog("✅ Text pasted successfully via Cmd+V simulation");
            setTimeout(() => {
              clipboard.writeText(originalClipboard);
              this.safeLog("🔄 Original clipboard content restored");
            }, 100);
            resolve();
          } else {
            console.error("❌ Failed to paste text, code:", code);
            console.error("Error output:", errorOutput);
            const errorMsg = `Paste failed (code ${code}). Text is copied to clipboard - please paste manually with Cmd+V.`;
            reject(new Error(errorMsg));
          }
        });

        pasteProcess.on("error", (error) => {
          if (hasTimedOut) return;
          clearTimeout(timeoutId);
          pasteProcess.removeAllListeners();
          console.error("❌ Error running paste command:", error);
          const errorMsg = `Paste command failed: ${error.message}. Text is copied to clipboard - please paste manually with Cmd+V.`;
          reject(new Error(errorMsg));
        });

        const timeoutId = setTimeout(() => {
          hasTimedOut = true;
          pasteProcess.kill("SIGKILL");
          pasteProcess.removeAllListeners();
          console.error("⏰ Paste operation timed out");
          const errorMsg =
            "Paste operation timed out. Text is copied to clipboard - please paste manually with Cmd+V.";
          reject(new Error(errorMsg));
        }, 3000);
      }, 100);
    });
  }

  async pasteWindows(originalClipboard) {
    console.log("🪟 Simulating Ctrl+V on Windows");
    return new Promise((resolve, reject) => {
      const pasteProcess = spawn("powershell", [
        "-Command",
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
      ]);

      pasteProcess.on("close", (code) => {
        if (code === 0) {
          console.log("✅ Text pasted successfully on Windows");
          setTimeout(() => {
            clipboard.writeText(originalClipboard);
            console.log("🔄 Original clipboard content restored");
          }, 100);
          resolve();
        } else {
          console.error("❌ Failed to paste on Windows, code:", code);
          reject(
            new Error(
              `Windows paste failed with code ${code}. Text is copied to clipboard.`
            )
          );
        }
      });

      pasteProcess.on("error", (error) => {
        console.error("❌ Windows paste error:", error);
        reject(
          new Error(
            `Windows paste failed: ${error.message}. Text is copied to clipboard.`
          )
        );
      });
    });
  }

  async pasteLinux(originalClipboard) {
    console.log("🐧 Simulating Ctrl+V on Linux");
    return new Promise((resolve, reject) => {
      const pasteProcess = spawn("xdotool", ["key", "ctrl+v"]);

      pasteProcess.on("close", (code) => {
        if (code === 0) {
          console.log("✅ Text pasted successfully on Linux");
          setTimeout(() => {
            clipboard.writeText(originalClipboard);
            console.log("🔄 Original clipboard content restored");
          }, 100);
          resolve();
        } else {
          console.error("❌ Failed to paste on Linux, code:", code);
          reject(
            new Error(
              `Linux paste failed with code ${code}. Text is copied to clipboard.`
            )
          );
        }
      });

      pasteProcess.on("error", (error) => {
        console.error("❌ Linux paste error:", error);
        reject(
          new Error(
            `Linux paste failed: ${error.message}. Text is copied to clipboard.`
          )
        );
      });
    });
  }

  async checkAccessibilityPermissions() {
    if (process.platform !== "darwin") return true;

    return new Promise((resolve) => {
      console.log("🔍 Checking accessibility permissions...");

      const testProcess = spawn("osascript", [
        "-e",
        'tell application "System Events" to get name of first process',
      ]);

      let testOutput = "";
      let testError = "";

      testProcess.stdout.on("data", (data) => {
        testOutput += data.toString();
      });

      testProcess.stderr.on("data", (data) => {
        testError += data.toString();
      });

      testProcess.on("close", (code) => {
        console.log("Initial accessibility test - Code:", code);
        console.log("Test output:", testOutput);
        console.log("Test error:", testError);

        if (code === 0) {
          console.log("✅ Accessibility permissions: GRANTED");
          resolve(true);
        } else {
          console.log("❌ Accessibility permissions: DENIED");
          this.showAccessibilityDialog(testError);
          resolve(false);
        }
      });

      testProcess.on("error", (error) => {
        console.error("Error checking accessibility permissions:", error);
        console.log("Fallback: Assuming permissions are needed");
        resolve(false);
      });
    });
  }

  showAccessibilityDialog(testError) {
    const isStuckPermission =
      testError.includes("not allowed assistive access") ||
      testError.includes("(-1719)") ||
      testError.includes("(-25006)");

    let dialogMessage;
    if (isStuckPermission) {
      dialogMessage = `🔒 OpenWispr needs Accessibility permissions, but it looks like you may have OLD PERMISSIONS from a previous version.

❗ COMMON ISSUE: If you've rebuilt/reinstalled OpenWispr, the old permissions may be "stuck" and preventing new ones.

🔧 To fix this:
1. Open System Settings → Privacy & Security → Accessibility
2. Look for ANY old "OpenWispr" entries and REMOVE them (click the - button)
3. Also remove any entries that say "Electron" or have unclear names
4. Click the + button and manually add the NEW OpenWispr app
5. Make sure the checkbox is enabled
6. Restart OpenWispr

⚠️ This is especially common during development when rebuilding the app.

📝 Without this permission, text will only copy to clipboard (no automatic pasting).

Would you like to open System Settings now?`;
    } else {
      dialogMessage = `🔒 OpenWispr needs Accessibility permissions to paste text into other applications.

📋 Current status: Clipboard copy works, but pasting (Cmd+V simulation) fails.

🔧 To fix this:
1. Open System Settings (or System Preferences on older macOS)
2. Go to Privacy & Security → Accessibility
3. Click the lock icon and enter your password
4. Add OpenWispr to the list and check the box
5. Restart OpenWispr

⚠️ Without this permission, dictated text will only be copied to clipboard but won't paste automatically.

💡 In production builds, this permission is required for full functionality.

Would you like to open System Settings now?`;
    }

    const permissionDialog = spawn("osascript", [
      "-e",
      `display dialog "${dialogMessage}" buttons {"Cancel", "Open System Settings"} default button "Open System Settings"`,
    ]);

    permissionDialog.on("close", (dialogCode) => {
      if (dialogCode === 0) {
        this.openSystemSettings();
      }
    });

    permissionDialog.on("error", (error) => {
      console.error("Error showing permission dialog:", error);
      console.log(
        "Fallback: User needs to manually grant accessibility permissions"
      );
      console.log(
        "💡 TIP: If this is a rebuilt app, remove old OpenWispr entries from Accessibility settings first"
      );
    });
  }

  openSystemSettings() {
    const settingsCommands = [
      [
        "open",
        [
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ],
      ],
      ["open", ["-b", "com.apple.systempreferences"]],
      ["open", ["/System/Library/PreferencePanes/Security.prefPane"]],
    ];

    let commandIndex = 0;
    const tryNextCommand = () => {
      if (commandIndex < settingsCommands.length) {
        const [cmd, args] = settingsCommands[commandIndex];
        const settingsProcess = spawn(cmd, args);

        settingsProcess.on("error", (error) => {
          console.log(`Settings command ${commandIndex + 1} failed:`, error);
          commandIndex++;
          tryNextCommand();
        });

        settingsProcess.on("close", (settingsCode) => {
          if (settingsCode !== 0) {
            console.log(
              `Settings command ${commandIndex + 1} failed with code:`,
              settingsCode
            );
            commandIndex++;
            tryNextCommand();
          } else {
            console.log(
              `✅ Opened System Settings with command ${commandIndex + 1}`
            );
          }
        });
      } else {
        console.log(
          "❌ All settings commands failed, user will need to open manually"
        );
        spawn("open", ["-a", "System Preferences"]).on("error", () => {
          spawn("open", ["-a", "System Settings"]).on("error", () => {
            console.log("Could not open settings app");
          });
        });
      }
    };

    tryNextCommand();
  }

  async readClipboard() {
    try {
      const text = clipboard.readText();
      console.log("📋 Clipboard read:", text ? "Text found" : "Empty");
      return text;
    } catch (error) {
      console.error("❌ Error reading clipboard:", error);
      throw error;
    }
  }

  async writeClipboard(text) {
    try {
      clipboard.writeText(text);
      console.log(
        "📋 Text written to clipboard:",
        text.substring(0, 50) + "..."
      );
      return { success: true };
    } catch (error) {
      console.error("❌ Error writing to clipboard:", error);
      throw error;
    }
  }
}

module.exports = ClipboardManager;
