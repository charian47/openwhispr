const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log('Notarizing using keychain profile: openwispr-profile');
  console.log('Submitting app for notarization...');
  
  try {
    const result = await notarize({
      tool: 'notarytool',
      appPath,
      keychainProfile: 'openwispr-profile'
    });
    console.log('✓ Notarization completed successfully');
    return result;
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};