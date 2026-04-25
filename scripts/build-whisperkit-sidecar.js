const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SIDECAR_DIR = path.join(__dirname, "..", "native", "whisperkit-sidecar");
const OUTPUT_DIR = path.join(__dirname, "..", "resources", "bin");
const OUTPUT_BIN = path.join(OUTPUT_DIR, "whisperkit-sidecar");

function main() {
  if (process.platform !== "darwin") {
    console.error("whisperkit-sidecar only builds on macOS");
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  execFileSync(
    "swift",
    ["build", "-c", "release", "--arch", "arm64", "--arch", "x86_64"],
    { cwd: SIDECAR_DIR, stdio: "inherit" }
  );
  const built = path.join(SIDECAR_DIR, ".build", "apple", "Products", "Release", "whisperkit-sidecar");
  if (!fs.existsSync(built)) {
    console.error(`Expected binary at ${built} — not found`);
    process.exit(1);
  }
  fs.copyFileSync(built, OUTPUT_BIN);
  fs.chmodSync(OUTPUT_BIN, 0o755);
  console.log(`[whisperkit-sidecar] -> ${OUTPUT_BIN}`);
}

main();
