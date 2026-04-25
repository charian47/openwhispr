const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "native", "text-injector");
const OUT_DIR = path.join(__dirname, "..", "resources", "bin");
const OUT_BIN = path.join(OUT_DIR, "text-injector");

if (process.platform !== "darwin") {
  console.error("text-injector only builds on macOS");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
execFileSync(
  "swift",
  ["build", "-c", "release", "--arch", "arm64", "--arch", "x86_64"],
  { cwd: DIR, stdio: "inherit" }
);
const built = path.join(DIR, ".build", "apple", "Products", "Release", "text-injector");
fs.copyFileSync(built, OUT_BIN);
fs.chmodSync(OUT_BIN, 0o755);
console.log("[text-injector] ->", OUT_BIN);
