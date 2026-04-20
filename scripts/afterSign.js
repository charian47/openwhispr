const fs = require("fs/promises");
const path = require("path");
const { execFileSync } = require("child_process");

function resolveSigningIdentity(context) {
  const identity =
    context.packager?.platformSpecificBuildOptions?.identity ||
    context.packager?.config?.mac?.identity ||
    process.env.CSC_NAME ||
    null;

  if (!identity) {
    return null;
  }

  if (identity.includes(":")) {
    return identity;
  }

  return `Developer ID Application: ${identity}`;
}

async function collectFiles(rootDir) {
  const files = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function isMachOBinary(filePath) {
  try {
    const description = execFileSync("file", ["-b", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return description.includes("Mach-O");
  } catch {
    return false;
  }
}

function codesign(targetPath, identity, entitlementsPath = null) {
  const args = ["--force", "--timestamp", "--options", "runtime", "--sign", identity];

  if (entitlementsPath) {
    args.push("--entitlements", entitlementsPath);
  }

  args.push(targetPath);
  execFileSync("codesign", args, { stdio: "inherit" });
}

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    return;
  }

  const identity = resolveSigningIdentity(context);
  if (!identity) {
    console.warn("afterSign: skipping macOS re-sign because no signing identity was resolved");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const resourcesPath = path.join(appPath, "Contents", "Resources");
  const entitlementsPath = path.join(__dirname, "..", "resources", "mac", "entitlements.mac.plist");

  const resourceFiles = await collectFiles(resourcesPath);
  const machOFiles = resourceFiles.filter(isMachOBinary);

  if (machOFiles.length > 0) {
    console.log(`afterSign: re-signing ${machOFiles.length} Mach-O files under Contents/Resources`);
  }

  for (const targetPath of machOFiles) {
    codesign(targetPath, identity);
  }

  console.log("afterSign: re-signing app bundle");
  codesign(appPath, identity, entitlementsPath);
};
