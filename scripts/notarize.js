const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip if signing is disabled
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('Skipping notarization (signing disabled)');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log('Starting notarization...');
  
  try {
    // Use API key if available (CI/CD), otherwise use keychain (local)
    const useApiKey = process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER;
    
    await notarize({
      tool: 'notarytool',
      appPath,
      ...(useApiKey ? {
        // CI/CD with API key
        teamId: process.env.APPLE_TEAM_ID,
        appleApiKey: process.env.APPLE_API_KEY_PATH,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      } : {
        // Local with keychain profile
        keychainProfile: 'openwispr-profile',
      }),
      staple: true
    });
    
    console.log('✓ Notarization successful');
  } catch (error) {
    console.error('Notarization failed:', error);
    // Fail in CI, warn in local builds
    if (process.env.CI) throw error;
    console.warn('Continuing without notarization');
  }
};