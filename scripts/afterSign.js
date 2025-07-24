const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

exports.default = async function(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const entitlementsPath = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');
  
  console.log('Starting custom signing process...');
  
  // List of binaries that need to be signed with hardened runtime
  const binariesToSign = [
    // ffmpeg-static binary
    'Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg',
    // Electron Framework libraries
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib',
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib',
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib',
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
    // Squirrel ShipIt
    'Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt'
  ];
  
  // Sign each binary with hardened runtime and timestamp
  for (const binaryPath of binariesToSign) {
    const fullPath = path.join(appPath, binaryPath);
    
    try {
      // Check if file exists
      await fs.access(fullPath);
      
      console.log(`Signing: ${binaryPath}`);
      
      // Sign with hardened runtime, timestamp, and entitlements
      const signCommand = `codesign --force --deep --timestamp --options runtime --entitlements "${entitlementsPath}" --sign "Developer ID Application: HeroTools Inc. (9R85XFMH59)" "${fullPath}"`;
      
      await execAsync(signCommand);
      console.log(`✓ Signed: ${binaryPath}`);
    } catch (error) {
      console.warn(`Warning: Could not sign ${binaryPath}:`, error.message);
    }
  }
  
  // Finally, sign the entire app bundle again to ensure consistency
  console.log('Re-signing entire app bundle...');
  const appSignCommand = `codesign --force --deep --timestamp --options runtime --entitlements "${entitlementsPath}" --sign "Developer ID Application: HeroTools Inc. (9R85XFMH59)" "${appPath}"`;
  
  await execAsync(appSignCommand);
  console.log('✓ App bundle signed successfully');
  
  // Run the notarization script
  const notarizeScript = require('./notarize');
  return notarizeScript.default(context);
};