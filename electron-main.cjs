const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const os = require('os');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const {
  createCredentialsStore,
  encryptField,
  decryptField,
  encryptSyncPayload,
  decryptSyncPayload,
} = require('./electron-security.cjs');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  let credentialsStore;
  let mainWindow = null;

  function initSecurity() {
    const userDataPath = app.getPath('userData');
    credentialsStore = createCredentialsStore(userDataPath, safeStorage.isEncryptionAvailable() ? safeStorage : null);
    credentialsStore.ensureInitialized(process.env.ANATOMYZH_SUPER_PASSWORD);
  }

  function registerSecurityHandlers() {
    const userDataPath = app.getPath('userData');

    ipcMain.on('system:device-info', (event) => {
      const interfaces = os.networkInterfaces();
      const addresses = Object.values(interfaces).flatMap((items) => items || []);
      const address = addresses.find((item) => !item.internal && item.family === 'IPv4')
        || addresses.find((item) => !item.internal);
      event.returnValue = {
        deviceName: os.hostname(),
        ipAddress: address?.address || 'local/offline',
      };
    });

    ipcMain.on('security:encrypt', (event, value) => {
      event.returnValue = encryptField(value, userDataPath);
    });

    ipcMain.on('security:decrypt', (event, value) => {
      event.returnValue = decryptField(value, userDataPath);
    });

    ipcMain.handle('security:verify-admin', (_event, password, universities) => {
      return credentialsStore.verifyAdminLogin(password, universities);
    });

    ipcMain.handle('security:encrypt-sync', (_event, payload, channelKey) => {
      return encryptSyncPayload(payload, channelKey, userDataPath);
    });

    ipcMain.handle('security:decrypt-sync', (_event, payload, channelKey) => {
      return decryptSyncPayload(payload, channelKey, userDataPath);
    });
  }

  function createWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return mainWindow;
    }

    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      fullscreen: true,
      frame: false,
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    mainWindow = win;

    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null;
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('Renderer process exited:', details);
      if (!win.isDestroyed()) win.reload();
    });

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('Renderer failed to load:', errorCode, errorDescription, validatedURL);
      if (app.isPackaged && !win.isDestroyed()) {
        setTimeout(() => {
          if (!win.isDestroyed()) win.loadFile(path.join(__dirname, 'dist', 'index.html'));
        }, 1000);
      }
    });

    if (app.isPackaged) {
      void win.loadFile(path.join(__dirname, 'dist', 'index.html')).catch((error) => {
        console.error('Failed to load packaged application:', error);
      });
    } else {
      void win.loadURL('http://localhost:3000').catch((error) => {
        console.error('Failed to connect to the development server:', error);
      });
      win.setFullScreen(false);
      win.setResizable(true);
    }

    win.removeMenu();
    if (app.isPackaged) win.setFullScreen(true);
    return win;
  }

  app.whenReady().then(() => {
    initSecurity();
    registerSecurityHandlers();
    createWindow();

    if (app.isPackaged) {
      let updateInstalling = false;
      autoUpdater.on('update-downloaded', () => {
        if (updateInstalling) return;
        updateInstalling = true;
        setImmediate(() => {
          autoUpdater.quitAndInstall(false, true);
        });
      });
      autoUpdater.on('error', (error) => {
        console.error('Auto-update failed:', error);
      });
      void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        console.error('Auto-update check failed:', error);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch((error) => {
    console.error('Electron startup failed:', error);
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
