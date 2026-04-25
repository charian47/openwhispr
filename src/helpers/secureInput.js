const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/**
 * Returns true if macOS Secure Input is currently active (i.e., a password
 * field or secure app is focused). When Secure Input is active, CGEventPost
 * silently fails and we should skip injection.
 *
 * Uses `ioreg -l -w 0` with in-process grep (no shell interpolation).
 *
 * @returns {Promise<boolean>}
 */
async function isSecureInputActive() {
  try {
    const { stdout } = await execFileAsync("ioreg", ["-l", "-w", "0"]);
    return /SecureInput=1/.test(stdout);
  } catch {
    return false;
  }
}

module.exports = { isSecureInputActive };
