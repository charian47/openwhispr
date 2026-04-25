const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const WILDCARD = "*";

/**
 * Decide whether to use paste-mode or keystroke-mode for the focused app.
 *
 * @param {string|null} frontmostBundleId — e.g. "com.tinyspeck.slackmacgap"
 * @param {string[]} pasteModeApps — bundle IDs (or "*" for any)
 * @returns {"paste"|"keystroke"}
 */
function routeInjection(frontmostBundleId, pasteModeApps) {
  if (!frontmostBundleId) return "keystroke";
  if (!Array.isArray(pasteModeApps) || pasteModeApps.length === 0) return "keystroke";
  if (pasteModeApps.includes(WILDCARD)) return "paste";
  return pasteModeApps.includes(frontmostBundleId) ? "paste" : "keystroke";
}

/**
 * Returns the bundle identifier of the frontmost macOS application.
 * Returns null if detection fails.
 *
 * @returns {Promise<string|null>}
 */
async function getFrontmostBundleId() {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to get bundle identifier of (first process whose frontmost is true)',
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Injects text into the focused app via clipboard + Cmd+V paste.
 * Saves and restores the previous clipboard contents by default.
 *
 * @param {string} text — text to inject
 * @param {object} opts
 * @param {boolean} [opts.restoreClipboard=true] — restore clipboard after paste
 * @param {object} [opts.clipboard] — clipboard interface { readText, writeText }; defaults to Electron clipboard
 * @param {boolean} [opts._skipPaste=false] — skip the actual osascript invocation (for unit tests)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function pasteChunk(text, { restoreClipboard = true, clipboard, _skipPaste = false } = {}) {
  const cb = clipboard || require("electron").clipboard;
  const previous = cb.readText();
  cb.writeText(text);

  // Small delay so the OS commits the clipboard write before the paste.
  await new Promise((r) => setTimeout(r, 30));

  if (!_skipPaste) {
    try {
      await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to keystroke "v" using command down',
      ]);
    } catch (err) {
      if (restoreClipboard) cb.writeText(previous);
      return { success: false, error: err.message };
    }
  }

  if (restoreClipboard) {
    // Wait for the paste to consume the clipboard before restoring.
    await new Promise((r) => setTimeout(r, 150));
    cb.writeText(previous);
  }

  return { success: true };
}

module.exports = { routeInjection, getFrontmostBundleId, pasteChunk };
