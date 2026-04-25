const { execFile } = require("child_process");
const path = require("path");

const BIN = path.join(__dirname, "..", "..", "resources", "bin", "text-injector");
const MAX_UNITS = 18;

/**
 * Split `text` into chunks of ≤ MAX_UNITS UTF-16 code units, respecting grapheme
 * cluster boundaries so we never bisect a multi-codepoint character.
 *
 * @param {string} text
 * @returns {string[]}
 */
function chunkText(text) {
  if (!text) return [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const chunks = [];
  let current = "";
  let currentUnits = 0;
  for (const { segment } of segmenter.segment(text)) {
    const segUnits = segment.length; // String#length counts UTF-16 code units
    // If a single grapheme is itself wider than MAX_UNITS we can't split it —
    // emit it as its own chunk (rare; e.g. ZWJ-heavy emoji). The downstream
    // CGEvent API truncates such inputs at 20, so this is best-effort.
    if (segUnits > MAX_UNITS) {
      if (current.length > 0) {
        chunks.push(current);
        current = "";
        currentUnits = 0;
      }
      chunks.push(segment);
      continue;
    }
    if (currentUnits + segUnits > MAX_UNITS) {
      chunks.push(current);
      current = "";
      currentUnits = 0;
    }
    current += segment;
    currentUnits += segUnits;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Inject text into the currently focused app using the native text-injector binary.
 *
 * @param {string} text
 * @returns {Promise<{success: boolean, stdout?: string, error?: string, stderr?: string}>}
 */
function injectText(text) {
  return new Promise((resolve) => {
    const child = execFile(BIN, [], (err, stdout, stderr) => {
      if (err) resolve({ success: false, error: err.message, stderr });
      else resolve({ success: true, stdout });
    });
    child.stdin.write(JSON.stringify({ text }) + "\n");
    child.stdin.end();
  });
}

module.exports = { chunkText, injectText };
