const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, shell, screen, Menu, Tray } = require("electron")
const path = require("path")
const { spawn } = require("child_process")
const Database = require('better-sqlite3')
const fs = require('fs')
const os = require('os')

// Load .env file with better error handling and production support
function loadEnvironmentVariables() {
  // In production, try multiple locations for .env file
  const possibleEnvPaths = [
    // Development path
    path.join(__dirname, '.env'),
    // Production packaged app paths
    path.join(process.resourcesPath, '.env'),
    path.join(process.resourcesPath, 'app.asar.unpacked', '.env'),
    path.join(app.getPath('userData'), '.env'), // User data directory
    // Legacy paths
    path.join(process.resourcesPath, 'app', '.env'),
  ];

  let envLoaded = false;
  
  for (const envPath of possibleEnvPaths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(envPath)) {
        const result = require('dotenv').config({ path: envPath });
        if (!result.error) {
          envLoaded = true;
          break;
        }
      }
    } catch (error) {
      // Continue to next path
    }
  }
}

// Load environment variables
loadEnvironmentVariables();

let mainWindow
let tray = null
let controlPanelWindow = null

// Function to check if dev server is ready
async function waitForDevServer(url, maxAttempts = 30, delay = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`Dev server ready after ${i + 1} attempts`);
        return true;
      }
    } catch (error) {
      console.log(`Waiting for dev server... attempt ${i + 1}/${maxAttempts}`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  console.error('Dev server failed to start within timeout');
  return false;
}

function getAppUrl(isControlPanel = false) {
  if (process.env.NODE_ENV === 'development') {
    // Vite dev server
    return isControlPanel 
      ? 'http://localhost:5174/?panel=true'
      : 'http://localhost:5174/';
  } else {
    // Production build - files are in asar package
    // __dirname in packaged app points to the root of app.asar
    const htmlPath = path.join(__dirname, 'src', 'dist', 'index.html');
    
    // Production build paths
    
    return isControlPanel
      ? `file://${htmlPath}?panel=true`
      : `file://${htmlPath}`;
  }
}

async function createWindow() {
  // Always show window by default
  const display = screen.getPrimaryDisplay();
  const width = 100;  // Increased width to accommodate tooltips and scaling
  const height = 100; // Increased height to accommodate tooltips and scaling
  const x = display.bounds.x + display.workArea.width - width;
  const y = display.bounds.y + display.workArea.height;
  
  // Window positioning calculated for bottom-right corner
  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
    },
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    transparent: true,
    show: true, // Always show
  })
  

  // Load URL with retry logic for development
  const loadMainWindow = async () => {
    const appUrl = getAppUrl(false);
    if (process.env.NODE_ENV === 'development') {
      const isReady = await waitForDevServer('http://localhost:5174/');
      if (!isReady) {
        console.error('Dev server not ready, loading anyway...');
      }
    }
    
    mainWindow.loadURL(appUrl);
  };
  
  loadMainWindow();
  
  // Add error handling for failed loads with retry
  mainWindow.webContents.on('did-fail-load', async (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load main window:', errorCode, errorDescription, validatedURL);
    
    if (process.env.NODE_ENV === 'development' && validatedURL.includes('localhost:5174')) {
      console.log('Retrying connection to dev server in 2 seconds...');
      setTimeout(async () => {
        const isReady = await waitForDevServer('http://localhost:5174/');
        if (isReady) {
          console.log('Dev server ready, reloading...');
          mainWindow.reload();
        }
      }, 2000);
    }
  });

  // Ensure window is visible after load
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      if (!mainWindow.isVisible()) {
        console.log('Window not visible, forcing show...');
        mainWindow.show();
        mainWindow.focus();
      }
    }, 1000);
  });

  // Remove all previous shortcuts
  globalShortcut.unregisterAll();

  // Register global shortcut for backtick (`) key to toggle dictation
  globalShortcut.register('`', () => {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.webContents.send('toggle-dictation');
  });

  // Ensure window is always on top, even above fullscreen apps
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.on('show', () => {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  });

  // Add a working Quit menu item for macOS
  if (process.platform === 'darwin') {
    const template = [
      {
        label: 'OpenWispr',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'quit', label: 'Quit OpenWispr' }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
}

async function createControlPanelWindow() {
  if (controlPanelWindow) {
    controlPanelWindow.focus();
    return;
  }
  controlPanelWindow = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: false, // Disable sandbox for control panel to allow clipboard access
      webSecurity: false, // Disable web security for clipboard access
    },
    title: 'OpenWispr Control Panel',
    resizable: true,
    show: true,
    // Native macOS traffic lights with custom title bar
    titleBarStyle: 'hiddenInset',
    frame: false,
    transparent: false,
    backgroundColor: '#ffffff',
    // Window behavior
    minimizable: true,
    maximizable: true,
    closable: true,
    fullscreenable: true,
  });
  
  // Load control panel with same retry logic
  const loadControlPanel = async () => {
    const appUrl = getAppUrl(true);
    // Loading control panel
    
    if (process.env.NODE_ENV === 'development') {
      const isReady = await waitForDevServer('http://localhost:5174/');
      if (!isReady) {
        console.error('Dev server not ready for control panel, loading anyway...');
      }
    }
    
    controlPanelWindow.loadURL(appUrl);
  };
  
  loadControlPanel();
  
  controlPanelWindow.on('closed', () => {
    controlPanelWindow = null;
  });
}

// Database setup
let db = null;

function cleanup() {
  console.log('Starting cleanup process...');
  // Database file deletion
  try {
    const dbPath = path.join(app.getPath('userData'), process.env.NODE_ENV === 'development' ? 'transcriptions-dev.db' : 'transcriptions.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('✅ Database file deleted:', dbPath);
    }
  } catch (error) {
    console.error('❌ Error deleting database file:', error);
  }

  // Local storage clearing
  mainWindow.webContents.executeJavaScript('localStorage.clear()').then(() => {
    console.log('✅ Local storage cleared');
  }).catch(error => {
    console.error('❌ Error clearing local storage:', error);
  });

  // Local Whisper model deletion
  try {
    const modelCacheDir = path.join(os.homedir(), '.cache', 'whisper');
    if (fs.existsSync(modelCacheDir)) {
      fs.rmSync(modelCacheDir, { recursive: true, force: true });
      console.log('✅ Local Whisper models deleted:', modelCacheDir);
    }
  } catch (error) {
    console.error('❌ Error deleting Whisper models:', error);
  }

  // Permissions instruction
  console.log('ℹ️ Please manually remove accessibility and microphone permissions via System Preferences if needed.');

  // Env file deletion
  try {
    const envPath = path.join(app.getPath('userData'), '.env');
    if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
      console.log('✅ .env file deleted:', envPath);
    }
  } catch (error) {
    console.error('❌ Error deleting .env file:', error);
  }

  console.log('Cleanup process completed.');
}

function initDatabase() {
  try {
    console.log('🔄 Starting database initialization...');
    
    // Use different database files for development vs production
    const dbFileName = process.env.NODE_ENV === 'development' 
      ? 'transcriptions-dev.db' 
      : 'transcriptions.db';
    
    const dbPath = path.join(app.getPath('userData'), dbFileName);
    console.log('📁 Database path:', dbPath);
    
    // Database initialization
    console.log('🔧 Creating database connection...');
    db = new Database(dbPath);
    console.log('✅ Database connection created');
    
    // Create transcriptions table if it doesn't exist
    console.log('📋 Creating transcriptions table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Transcriptions table created/verified');
    
    // Get count of existing transcriptions
    console.log('📊 Counting existing transcriptions...');
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM transcriptions');
    const { count } = countStmt.get();
    
    console.log(`✅ Database initialized successfully (${count} existing transcriptions)`);
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

app.whenReady().then(async () => {
  
  // Initialize database
  try {
await new Promise((resolve, reject) => {
      try {
        initDatabase();
        resolve();
      } catch (error) {
        reject('Failed to initialize database: ' + error);
      }
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
  
  // In development, add a small delay to let Vite start properly
  if (process.env.NODE_ENV === 'development') {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  try {
    await createWindow();
  } catch (error) {
    console.error('Error creating main window:', error);
  }
  
  // Auto-open control panel when app starts
  try {
    await createControlPanelWindow();
  } catch (error) {
    console.error('Error creating control panel window:', error);
  }

  // Create tray icon on macOS
  if (process.platform === 'darwin') {
    try {
      // For Electron apps, use nativeImage to load from resources properly
      const { nativeImage } = require('electron');
      let trayIcon;
      
      if (process.env.NODE_ENV === 'development') {
        // Development mode - load from assets folder
        const iconPath = path.join(__dirname, 'assets', 'iconTemplate@3x.png');
        trayIcon = nativeImage.createFromPath(iconPath);
             } else {
         // Production mode - try different locations for the icon
         const possiblePaths = [
           // First try extraResources (most likely for packaged app)
           path.join(process.resourcesPath, 'assets', 'iconTemplate@3x.png'),
           // Then try asar.unpacked
           path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'iconTemplate@3x.png'),
           // Then try within app bundle
           path.join(__dirname, 'assets', 'iconTemplate@3x.png'),
           // Legacy path
           path.join(process.resourcesPath, 'app', 'assets', 'iconTemplate@3x.png')
         ];
        
        let iconPath = null;
        for (const testPath of possiblePaths) {
          try {
            if (require('fs').existsSync(testPath)) {
              iconPath = testPath;
              break;
            }
          } catch (e) {
            // Ignore and try next path
          }
        }
        
        if (iconPath) {
          trayIcon = nativeImage.createFromPath(iconPath);
        } else {
          console.error('Could not find tray icon in any expected location');
          console.log('Tried paths:', possiblePaths);
          
          // Create a fallback tray icon if the file isn't found
          try {
            // Create a simple fallback icon programmatically
            const { nativeImage } = require('electron');
            const canvas = require('canvas');
            const canvasInstance = canvas.createCanvas(16, 16);
            const ctx = canvasInstance.getContext('2d');
            
            // Draw a simple circle as fallback
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(8, 8, 6, 0, 2 * Math.PI);
            ctx.fill();
            
            const buffer = canvasInstance.toBuffer('image/png');
            trayIcon = nativeImage.createFromBuffer(buffer);
            console.log('✅ Created fallback tray icon');
          } catch (fallbackError) {
            console.error('Failed to create fallback tray icon:', fallbackError);
            return; // Exit early if fallback also fails
          }
        }
      }
      
      // Check if the image loaded successfully
      if (trayIcon.isEmpty()) {
        console.error('Tray icon is empty - failed to load');
        return;
      }
      
      // Ensure it's marked as a template image for macOS
      trayIcon.setTemplateImage(true);
      
      tray = new Tray(trayIcon);
      
      // Prevent tray from being garbage collected
      tray.setIgnoreDoubleClickEvents(true);
      
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Dictation Panel', click: () => { 
          if (!mainWindow.isVisible()) {
            mainWindow.show();
          }
          mainWindow.focus();
        }},
        { label: 'Open Control Panel', click: () => { createControlPanelWindow(); } },
        { type: 'separator' },
        { label: 'Quit OpenWispr', click: () => { 
          console.log('Quitting app via tray menu');
          app.quit(); 
        }}
      ]);
      
      tray.setToolTip('OpenWispr - Voice Dictation');
      tray.setContextMenu(contextMenu);
      
      tray.on('click', () => {
        // Always ensure the dictation panel is visible and focused
        if (!mainWindow.isVisible()) {
          mainWindow.show();
        }
        mainWindow.focus();
      });
      
      // Handle tray destruction to prevent crashes
      tray.on('destroyed', () => {
        console.log('Tray icon destroyed');
        tray = null;
      });
      
      console.log('✅ Tray icon created successfully');
    } catch (error) {
      console.error('Error creating tray icon:', error);
    }
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on("will-quit", () => {
  globalShortcut.unregisterAll()
})

// Function to check and request accessibility permissions on macOS
async function checkAccessibilityPermissions() {
  if (process.platform !== 'darwin') return true;
  
  return new Promise((resolve) => {
    const { spawn } = require("child_process");
    
    console.log('🔍 Checking accessibility permissions...');
    
    // First, let's check if we can perform a simple accessibility action
    const testProcess = spawn("osascript", [
      "-e", 
      'tell application "System Events" to get name of first process'
    ]);
    
    let testOutput = '';
    let testError = '';
    
    testProcess.stdout.on('data', (data) => {
      testOutput += data.toString();
    });
    
    testProcess.stderr.on('data', (data) => {
      testError += data.toString();
    });
    
    testProcess.on('close', (code) => {
      console.log('Initial accessibility test - Code:', code);
      console.log('Test output:', testOutput);
      console.log('Test error:', testError);
      
      if (code === 0) {
        console.log('✅ Accessibility permissions: GRANTED');
        resolve(true);
      } else {
        // Permission denied - but let's check if this might be a "stuck permission" issue
        console.log('❌ Accessibility permissions: DENIED');
        
        // Check if the error suggests we need to reset permissions
        const isStuckPermission = testError.includes('not allowed assistive access') || 
                                 testError.includes('(-1719)') ||
                                 testError.includes('(-25006)');
        
        let dialogMessage;
        if (isStuckPermission) {
          dialogMessage = `🔒 OpenWispr needs Accessibility permissions, but it looks like you may have OLD PERMISSIONS from a previous version.

❗ COMMON ISSUE: If you've rebuilt/reinstalled OpenWispr, the old permissions may be "stuck" and preventing new ones.

🔧 To fix this:
1. Open System Settings → Privacy  Security → Accessibility
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
2. Go to Privacy  Security → Accessibility
3. Click the lock icon and enter your password
4. Add OpenWispr to the list and check the box
5. Restart OpenWispr

⚠️ Without this permission, dictated text will only be copied to clipboard but won't paste automatically.

💡 In production builds, this permission is required for full functionality.

Would you like to open System Settings now?`;
        }
        
        const permissionDialog = spawn("osascript", [
          "-e",
          `display dialog "${dialogMessage}" buttons {"Cancel", "Open System Settings"} default button "Open System Settings"`
        ]);
        
        permissionDialog.on('close', (dialogCode) => {
          if (dialogCode === 0) {
            // User clicked "Open System Settings" - try modern path first, then legacy
            const settingsCommands = [
              ["open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"]],
              ["open", ["-b", "com.apple.systempreferences"]],
              ["open", ["/System/Library/PreferencePanes/Security.prefPane"]]
            ];
            
            let commandIndex = 0;
            const tryNextCommand = () => {
              if (commandIndex < settingsCommands.length) {
                const [cmd, args] = settingsCommands[commandIndex];
                const settingsProcess = spawn(cmd, args);
                
                settingsProcess.on('error', (error) => {
                  console.log(`Settings command ${commandIndex + 1} failed:`, error);
                  commandIndex++;
                  tryNextCommand();
                });
                
                settingsProcess.on('close', (settingsCode) => {
                  if (settingsCode !== 0) {
                    console.log(`Settings command ${commandIndex + 1} failed with code:`, settingsCode);
                    commandIndex++;
                    tryNextCommand();
                  } else {
                    console.log(`✅ Opened System Settings with command ${commandIndex + 1}`);
                  }
                });
              } else {
                console.log('❌ All settings commands failed, user will need to open manually');
                // Try one more fallback - just open System Settings/Preferences
                spawn("open", ["-a", "System Preferences"]).on('error', () => {
                  spawn("open", ["-a", "System Settings"]).on('error', () => {
                    console.log('Could not open settings app');
                  });
                });
              }
            };
            
            tryNextCommand();
          }
          resolve(false);
        });
        
        permissionDialog.on('error', (error) => {
          console.error('Error showing permission dialog:', error);
          console.log('Fallback: User needs to manually grant accessibility permissions');
          console.log('💡 TIP: If this is a rebuilt app, remove old OpenWispr entries from Accessibility settings first');
          resolve(false);
        });
      }
    });
    
    testProcess.on('error', (error) => {
      console.error('Error checking accessibility permissions:', error);
      console.log('Fallback: Assuming permissions are needed');
      resolve(false);
    });
  });
}

// Window control IPC handlers
ipcMain.handle('window-minimize', () => {
  if (controlPanelWindow) {
    controlPanelWindow.minimize();
  }
});

ipcMain.handle('window-maximize', () => {
  if (controlPanelWindow) {
    if (controlPanelWindow.isMaximized()) {
      controlPanelWindow.unmaximize();
    } else {
      controlPanelWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (controlPanelWindow) {
    controlPanelWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  if (controlPanelWindow) {
    return controlPanelWindow.isMaximized();
  }
  return false;
});

// IPC handlers
ipcMain.handle("paste-text", async (event, text) => {
  try {
    // Save original clipboard content first
    const originalClipboard = clipboard.readText();
    console.log('💾 Saved original clipboard content:', originalClipboard.substring(0, 50) + '...');
    
    // Copy text to clipboard first - this always works
    clipboard.writeText(text);
    console.log('📋 Text copied to clipboard:', text.substring(0, 50) + '...');

    if (process.platform === "darwin") {
      // Check accessibility permissions first
      console.log('🔍 Checking accessibility permissions for paste operation...');
      const hasPermissions = await checkAccessibilityPermissions();
      
      if (!hasPermissions) {
        console.log('⚠️ No accessibility permissions - text copied to clipboard only');
        const errorMsg = 'Accessibility permissions required for automatic pasting. Text has been copied to clipboard - please paste manually with Cmd+V.';
        throw new Error(errorMsg);
      }
      
      console.log('✅ Permissions granted, attempting to paste...');
      
      // Use AppleScript to paste with better error handling and timeout
      const { spawn } = require("child_process");
      return new Promise((resolve, reject) => {
        // Add a small delay to ensure clipboard is ready
        setTimeout(() => {
          const pasteProcess = spawn("osascript", [
            "-e", 
            'tell application "System Events" to keystroke "v" using command down'
          ]);
          
          let errorOutput = '';
          let hasTimedOut = false;
          
          pasteProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
          
          pasteProcess.on('close', (code) => {
            if (hasTimedOut) return; // Ignore if already timed out
            
            if (code === 0) {
              console.log('✅ Text pasted successfully via Cmd+V simulation');
              // Restore original clipboard content
              setTimeout(() => {
                clipboard.writeText(originalClipboard);
                console.log('🔄 Original clipboard content restored');
              }, 100); // Small delay to ensure paste is complete
              resolve();
            } else {
              console.error('❌ Failed to paste text, code:', code);
              console.error('Error output:', errorOutput);
              const errorMsg = `Paste failed (code ${code}). Text is copied to clipboard - please paste manually with Cmd+V.`;
              reject(new Error(errorMsg));
            }
          });
          
          pasteProcess.on('error', (error) => {
            if (hasTimedOut) return; // Ignore if already timed out
            
            console.error('❌ Error running paste command:', error);
            const errorMsg = `Paste command failed: ${error.message}. Text is copied to clipboard - please paste manually with Cmd+V.`;
            reject(new Error(errorMsg));
          });
          
          // Add timeout with cleanup
          const timeoutId = setTimeout(() => {
            hasTimedOut = true;
            pasteProcess.kill('SIGKILL');
            console.error('⏰ Paste operation timed out');
            const errorMsg = 'Paste operation timed out. Text is copied to clipboard - please paste manually with Cmd+V.';
            reject(new Error(errorMsg));
          }, 3000); // Reduced timeout for better UX
          
          // Clear timeout if process completes normally
          pasteProcess.on('close', () => {
            clearTimeout(timeoutId);
          });
          
        }, 100); // Small delay to ensure clipboard is ready
      });
      
    } else if (process.platform === "win32") {
      console.log("Simulating Ctrl+V on Windows");
      return new Promise((resolve, reject) => {
        const pasteProcess = spawn("powershell", [
          "-Command",
          'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
        ]);
        
        pasteProcess.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Text pasted successfully on Windows');
            // Restore original clipboard content
            setTimeout(() => {
              clipboard.writeText(originalClipboard);
              console.log('🔄 Original clipboard content restored');
            }, 100);
            resolve();
          } else {
            console.error('❌ Failed to paste on Windows, code:', code);
            reject(new Error(`Windows paste failed with code ${code}. Text is copied to clipboard.`));
          }
        });
        
        pasteProcess.on('error', (error) => {
          console.error('❌ Windows paste error:', error);
          reject(new Error(`Windows paste failed: ${error.message}. Text is copied to clipboard.`));
        });
      });
    } else {
      // Linux
      console.log("Simulating Ctrl+V on Linux");
      return new Promise((resolve, reject) => {
        const pasteProcess = spawn("xdotool", ["key", "ctrl+v"]);
        
        pasteProcess.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Text pasted successfully on Linux');
            // Restore original clipboard content
            setTimeout(() => {
              clipboard.writeText(originalClipboard);
              console.log('🔄 Original clipboard content restored');
            }, 100);
            resolve();
          } else {
            console.error('❌ Failed to paste on Linux, code:', code);
            reject(new Error(`Linux paste failed with code ${code}. Text is copied to clipboard.`));
          }
        });
        
        pasteProcess.on('error', (error) => {
          console.error('❌ Linux paste error:', error);
          reject(new Error(`Linux paste failed: ${error.message}. Text is copied to clipboard.`));
        });
      });
    }
  } catch (error) {
    console.error('❌ Paste error:', error);
    throw error;
  }
})

ipcMain.handle("hide-window", () => {
  if (process.platform === "darwin") {
    mainWindow.minimize();
    if (app.dock) app.dock.show();
  } else {
    mainWindow.hide();
  }
})

// Database IPC handlers
ipcMain.handle('db-save-transcription', async (event, text) => {
  try {
    if (!db) {
      throw new Error('Database not initialized');
    }
    const stmt = db.prepare('INSERT INTO transcriptions (text) VALUES (?)');
    const result = stmt.run(text);
    
    const truncatedText = text.length > 50 ? text.substring(0, 50) + '...' : text;
    console.log(`📝 Transcription saved to ${process.env.NODE_ENV || 'production'} DB:`, { 
      id: result.lastInsertRowid, 
      text: truncatedText,
      length: text.length 
    });
    
    return { id: result.lastInsertRowid, success: true };
  } catch (error) {
    console.error('❌ Error saving transcription:', error);
    throw error;
  }
});

ipcMain.handle('db-get-transcriptions', async (event, limit = 50) => {
  try {
    if (!db) {
      throw new Error('Database not initialized');
    }
    const stmt = db.prepare('SELECT * FROM transcriptions ORDER BY timestamp DESC LIMIT ?');
    const transcriptions = stmt.all(limit);
    console.log(`📚 Retrieved ${transcriptions.length} transcriptions from ${process.env.NODE_ENV || 'production'} DB (limit: ${limit})`);
    return transcriptions;
  } catch (error) {
    console.error('❌ Error getting transcriptions:', error);
    throw error;
  }
});

ipcMain.handle('db-clear-transcriptions', async (event) => {
  try {
    if (!db) {
      throw new Error('Database not initialized');
    }
    const stmt = db.prepare('DELETE FROM transcriptions');
    const result = stmt.run();
    console.log(`🗑️ Cleared ${result.changes} transcriptions from ${process.env.NODE_ENV || 'production'} DB`);
    return { cleared: result.changes, success: true };
  } catch (error) {
    console.error('❌ Error clearing transcriptions:', error);
    throw error;
  }
});

ipcMain.handle('db-delete-transcription', async (event, id) => {
  try {
    if (!db) {
      throw new Error('Database not initialized');
    }
    const stmt = db.prepare('DELETE FROM transcriptions WHERE id = ?');
    const result = stmt.run(id);
    console.log(`🗑️ Deleted transcription ${id}, affected rows: ${result.changes}`);
    return { success: result.changes > 0 };
  } catch (error) {
    console.error('❌ Error deleting transcription:', error);
    throw error;
  }
});

// Environment variable handlers
ipcMain.handle('get-openai-key', async (event) => {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('🔑 OpenAI API Key requested:', apiKey ? 'Present' : 'Missing');
  return apiKey || '';
});

ipcMain.handle('save-openai-key', async (event, key) => {
  try {
    // Update the environment variable in memory for immediate use
    process.env.OPENAI_API_KEY = key;
    console.log('🔑 OpenAI API Key updated in memory');
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving OpenAI API key:', error);
    throw error;
  }
});

// Clipboard handler for better paste support
ipcMain.handle('read-clipboard', async (event) => {
  try {
    const text = clipboard.readText();
    console.log('📋 Clipboard read:', text ? 'Text found' : 'Empty');
    return text;
  } catch (error) {
    console.error('❌ Error reading clipboard:', error);
    throw error;
  }
});

// Production .env file creation handler
ipcMain.handle('create-production-env-file', async (event, apiKey) => {
  try {
    const fs = require('fs');
    const envPath = path.join(app.getPath('userData'), '.env');
    
    const envContent = `# OpenWispr Environment Variables
# This file was created automatically for production use
OPENAI_API_KEY=${apiKey}
`;
    
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Production .env file created at:', envPath);
    
    // Reload environment variables
    require('dotenv').config({ path: envPath });
    console.log('🔄 Environment variables reloaded from production .env file');
    
    return { success: true, path: envPath };
  } catch (error) {
    console.error('❌ Error creating production .env file:', error);
    throw error;
  }
});

// Local Whisper transcription handler
ipcMain.handle('transcribe-local-whisper', async (event, audioBlob, options = {}) => {
  try {
    console.log('🎤 Starting local Whisper transcription...');
    
    // Create temporary file for audio
    const fs = require('fs');
    const os = require('os');
    const crypto = require('crypto');
    
    const tempDir = os.tmpdir();
    const filename = `whisper_audio_${crypto.randomUUID()}.wav`;
    const tempAudioPath = path.join(tempDir, filename);
    
    // Convert Blob to Buffer and write to temp file
    console.log('💾 Writing audio to temp file:', tempAudioPath);
    
    // Handle different audio data formats
    let buffer;
    if (audioBlob instanceof ArrayBuffer) {
      buffer = Buffer.from(audioBlob);
    } else if (audioBlob instanceof Uint8Array) {
      buffer = Buffer.from(audioBlob);
    } else if (typeof audioBlob === 'string') {
      // Base64 encoded audio data
      buffer = Buffer.from(audioBlob, 'base64');
    } else if (audioBlob && audioBlob.buffer) {
      // TypedArray with buffer property
      buffer = Buffer.from(audioBlob.buffer);
    } else {
      throw new Error(`Unsupported audio data type: ${typeof audioBlob}`);
    }
    
    fs.writeFileSync(tempAudioPath, buffer);
    
    // Prepare Whisper command
    const model = options.model || 'base';
    const language = options.language || null;
    
    // Find Python executable
    const pythonCmd = await findPythonExecutable();
    const whisperScriptPath = path.join(__dirname, 'whisper_bridge.py');
    
    const args = [whisperScriptPath, tempAudioPath, '--model', model];
    if (language) {
      args.push('--language', language);
    }
    args.push('--output-format', 'json');
    
    console.log('🔧 Running Whisper command:', pythonCmd, args.join(' '));
    
    // Execute Whisper transcription
    return new Promise((resolve, reject) => {
      const whisperProcess = spawn(pythonCmd, args);
      
      let stdout = '';
      let stderr = '';
      
      whisperProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      whisperProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log('Whisper log:', data.toString());
      });
      
      whisperProcess.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempAudioPath);
          console.log('🗑️ Cleaned up temp audio file');
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up temp file:', cleanupError.message);
        }
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            
            // Check if the transcription is empty or just whitespace
            if (!result.text || result.text.trim().length === 0) {
              console.log('🛑 No meaningful audio content detected (empty transcription)');
              event.sender.send('no-audio-detected');
              resolve({ success: false, message: 'No audio detected' });
              return;
            }
            
            console.log('✅ Whisper transcription successful:', result.text?.substring(0, 50) + '...');
            resolve(result);
          } catch (parseError) {
            console.error('❌ Failed to parse Whisper output:', parseError);
            reject(new Error(`Failed to parse Whisper output: ${parseError.message}`));
          }
        } else {
          if (stderr.includes('no audio') || stderr.includes('empty')) {
            console.log('🛑 No audio content detected');
            event.sender.send('no-audio-detected'); // Could trigger a tooltip in the UI
            resolve({ success: false, message: 'No audio detected' });
          } else {
            console.error('❌ Whisper process failed with code:', code);
            console.error('Stderr:', stderr);
            reject(new Error(`Whisper transcription failed (code ${code}): ${stderr}`));
          }
        }
      });
      
      whisperProcess.on('error', (error) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up temp file:', cleanupError.message);
        }
        
        console.error('❌ Whisper process error:', error);
        reject(new Error(`Whisper process error: ${error.message}`));
      });
      
      // Add timeout (30 seconds for transcription)
      setTimeout(() => {
        whisperProcess.kill('SIGTERM');
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up temp file:', cleanupError.message);
        }
        reject(new Error('Whisper transcription timed out (30 seconds)'));
      }, 30000);
    });
    
  } catch (error) {
    console.error('❌ Local Whisper transcription error:', error);
    throw error;
  }
});

// Helper function to find Python executable
async function findPythonExecutable() {
  const possiblePaths = [
    'python3',
    'python',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/bin/python',
    '/usr/local/bin/python'
  ];
  
  for (const pythonPath of possiblePaths) {
    try {
      const result = await new Promise((resolve, reject) => {
        const testProcess = spawn(pythonPath, ['--version']);
        testProcess.on('close', (code) => {
          resolve(code === 0);
        });
        testProcess.on('error', () => {
          resolve(false);
        });
      });
      
      if (result) {
        console.log('🐍 Found Python at:', pythonPath);
        return pythonPath;
      }
    } catch (error) {
      continue;
    }
  }
  
  throw new Error('Python executable not found. Please ensure Python 3 is installed.');
}

// Check Whisper installation
ipcMain.handle('check-whisper-installation', async (event) => {
  try {
    const pythonCmd = await findPythonExecutable();
    
    return new Promise((resolve) => {
      const checkProcess = spawn(pythonCmd, ['-c', 'import whisper; print("OK")']);
      
      let output = '';
      checkProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      checkProcess.on('close', (code) => {
        if (code === 0 && output.includes('OK')) {
          console.log('✅ Whisper is installed and working');
          resolve({ installed: true, working: true });
        } else {
          console.log('❌ Whisper is not properly installed');
          resolve({ installed: false, working: false });
        }
      });
      
      checkProcess.on('error', (error) => {
        console.log('❌ Error checking Whisper:', error.message);
        resolve({ installed: false, working: false, error: error.message });
      });
    });
    
  } catch (error) {
    console.log('❌ Error finding Python:', error.message);
    return { installed: false, working: false, error: error.message };
  }
});

// Install Whisper automatically
ipcMain.handle('install-whisper', async (event) => {
  try {
    console.log('🔧 Starting automatic Whisper installation...');
    
    const pythonCmd = await findPythonExecutable();
    console.log('🐍 Using Python:', pythonCmd);
    
    // Install Whisper using pip
    const args = ['-m', 'pip', 'install', '-U', 'openai-whisper'];
    
    console.log('📦 Running installation command:', pythonCmd, args.join(' '));
    
    return new Promise((resolve, reject) => {
      const installProcess = spawn(pythonCmd, args);
      
      let stdout = '';
      let stderr = '';
      
      installProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log('Install output:', output);
        
        // Send progress updates to the renderer
        if (output.includes('Downloading') || output.includes('Installing')) {
          // Extract package name if possible
          const match = output.match(/(\w+[-\w]*)/);
          const packageName = match ? match[1] : 'package';
          event.sender.send('whisper-install-progress', {
            type: 'progress',
            message: `Installing ${packageName}...`,
            output: output.trim()
          });
        }
      });
      
      installProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.log('Install stderr:', output);
        
        // Send progress updates for stderr too (pip sometimes uses stderr for progress)
        if (output.includes('Downloading') || output.includes('Installing') || output.includes('Collecting')) {
          event.sender.send('whisper-install-progress', {
            type: 'progress',
            message: output.trim()
          });
        }
      });
      
      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Whisper installation completed successfully');
          resolve({ 
            success: true, 
            message: 'Whisper installed successfully!',
            output: stdout 
          });
        } else {
          console.error('❌ Whisper installation failed with code:', code);
          console.error('Installation stderr:', stderr);
          reject(new Error(`Whisper installation failed (code ${code}): ${stderr}`));
        }
      });
      
      installProcess.on('error', (error) => {
        console.error('❌ Whisper installation process error:', error);
        reject(new Error(`Whisper installation process error: ${error.message}`));
      });
      
      // 10 minute timeout for installation
      setTimeout(() => {
        installProcess.kill('SIGTERM');
        reject(new Error('Whisper installation timed out (10 minutes)'));
      }, 600000);
    });
    
  } catch (error) {
    console.error('❌ Whisper installation error:', error);
    throw error;
  }
});

// Download Whisper model
ipcMain.handle('download-whisper-model', async (event, modelName) => {
  try {
    console.log(`📥 Starting download of Whisper model: ${modelName}`);
    
    const pythonCmd = await findPythonExecutable();
    const whisperScriptPath = path.join(__dirname, 'whisper_bridge.py');
    
    const args = [whisperScriptPath, '--mode', 'download', '--model', modelName];
    
    console.log('🔧 Running model download command:', pythonCmd, args.join(' '));
    
    return new Promise((resolve, reject) => {
      const downloadProcess = spawn(pythonCmd, args);
      
      let stdout = '';
      let stderr = '';
      
      downloadProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      downloadProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.log('Model download log:', output);
        
        // Parse progress messages
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('PROGRESS:')) {
            try {
              const progressData = JSON.parse(line.substring(9)); // Remove 'PROGRESS:' prefix
              console.log('📊 Download progress:', progressData);
              
              // Forward progress to renderer
              event.sender.send('whisper-download-progress', {
                type: 'progress',
                model: modelName,
                ...progressData
              });
            } catch (parseError) {
              console.error('Failed to parse progress data:', parseError);
            }
          }
        }
      });
      
      downloadProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            console.log(`✅ Model ${modelName} download completed:`, result);
            
            // Send final completion event
            event.sender.send('whisper-download-progress', {
              type: 'complete',
              model: modelName,
              result: result
            });
            
            resolve(result);
          } catch (parseError) {
            console.error('❌ Failed to parse download result:', parseError);
            reject(new Error(`Failed to parse download result: ${parseError.message}`));
          }
        } else {
          console.error('❌ Model download failed with code:', code);
          console.error('Stderr:', stderr);
          
          // Send error event
          event.sender.send('whisper-download-progress', {
            type: 'error',
            model: modelName,
            error: `Model download failed (code ${code}): ${stderr}`
          });
          
          reject(new Error(`Model download failed (code ${code}): ${stderr}`));
        }
      });
      
      downloadProcess.on('error', (error) => {
        console.error('❌ Model download process error:', error);
        
        // Send error event
        event.sender.send('whisper-download-progress', {
          type: 'error',
          model: modelName,
          error: `Model download process error: ${error.message}`
        });
        
        reject(new Error(`Model download process error: ${error.message}`));
      });
      
      // Add longer timeout for model downloads (10 minutes)
      setTimeout(() => {
        downloadProcess.kill('SIGTERM');
        reject(new Error('Model download timed out (10 minutes)'));
      }, 600000);
    });
    
  } catch (error) {
    console.error('❌ Model download error:', error);
    throw error;
  }
});

// Check model status
ipcMain.handle('check-model-status', async (event, modelName) => {
  try {
    console.log(`🔍 Checking status of Whisper model: ${modelName}`);
    
    const pythonCmd = await findPythonExecutable();
    const whisperScriptPath = path.join(__dirname, 'whisper_bridge.py');
    
    const args = [whisperScriptPath, '--mode', 'check', '--model', modelName];
    
    return new Promise((resolve, reject) => {
      const checkProcess = spawn(pythonCmd, args);
      
      let stdout = '';
      let stderr = '';
      
      checkProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      checkProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      checkProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            console.log(`📊 Model ${modelName} status:`, result);
            resolve(result);
          } catch (parseError) {
            console.error('❌ Failed to parse model status:', parseError);
            reject(new Error(`Failed to parse model status: ${parseError.message}`));
          }
        } else {
          console.error('❌ Model status check failed with code:', code);
          reject(new Error(`Model status check failed (code ${code}): ${stderr}`));
        }
      });
      
      checkProcess.on('error', (error) => {
        console.error('❌ Model status check error:', error);
        reject(new Error(`Model status check error: ${error.message}`));
      });
    });
    
  } catch (error) {
    console.error('❌ Model status check error:', error);
    throw error;
  }
});

// List all models and their status
ipcMain.handle('list-whisper-models', async (event) => {
  try {
    console.log('📋 Listing all Whisper models...');
    
    const pythonCmd = await findPythonExecutable();
    const whisperScriptPath = path.join(__dirname, 'whisper_bridge.py');
    
    const args = [whisperScriptPath, '--mode', 'list'];
    
    return new Promise((resolve, reject) => {
      const listProcess = spawn(pythonCmd, args);
      
      let stdout = '';
      let stderr = '';
      
      listProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      listProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      listProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            console.log('📋 Model list retrieved:', result);
            resolve(result);
          } catch (parseError) {
            console.error('❌ Failed to parse model list:', parseError);
            reject(new Error(`Failed to parse model list: ${parseError.message}`));
          }
        } else {
          console.error('❌ Model list failed with code:', code);
          reject(new Error(`Model list failed (code ${code}): ${stderr}`));
        }
      });
      
      listProcess.on('error', (error) => {
        console.error('❌ Model list error:', error);
        reject(new Error(`Model list error: ${error.message}`));
      });
    });
    
  } catch (error) {
    console.error('❌ Model list error:', error);
    throw error;
  }
});

// Delete Whisper model
ipcMain.handle('delete-whisper-model', async (event, modelName) => {
  try {
    console.log(`🗑️ Deleting Whisper model: ${modelName}`);
    
    const pythonCmd = await findPythonExecutable();
    const whisperScriptPath = path.join(__dirname, 'whisper_bridge.py');
    
    const args = [whisperScriptPath, '--mode', 'delete', '--model', modelName];
    
    return new Promise((resolve, reject) => {
      const deleteProcess = spawn(pythonCmd, args);
      
      let stdout = '';
      let stderr = '';
      
      deleteProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      deleteProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      deleteProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            console.log(`🗑️ Model ${modelName} delete result:`, result);
            resolve(result);
          } catch (parseError) {
            console.error('❌ Failed to parse delete result:', parseError);
            reject(new Error(`Failed to parse delete result: ${parseError.message}`));
          }
        } else {
          console.error('❌ Model delete failed with code:', code);
          reject(new Error(`Model delete failed (code ${code}): ${stderr}`));
        }
      });
      
      deleteProcess.on('error', (error) => {
        console.error('❌ Model delete error:', error);
        reject(new Error(`Model delete error: ${error.message}`));
      });
    });
    
  } catch (error) {
    console.error('❌ Model delete error:', error);
    throw error;
  }
});

// Cleanup handler
ipcMain.handle('cleanup-app', async (event) => {
  try {
    cleanup();
    return { success: true, message: 'Cleanup completed successfully' };
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    throw error;
  }
});
