const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  deviceInfo: ipcRenderer.sendSync('system:device-info'),
  security: {
    encryptField: (value) => ipcRenderer.sendSync('security:encrypt', value),
    decryptField: (value) => ipcRenderer.sendSync('security:decrypt', value),
    verifyAdmin: (password, universities) =>
      ipcRenderer.invoke('security:verify-admin', password, universities),
    encryptSyncPayload: (payload, channelKey) =>
      ipcRenderer.invoke('security:encrypt-sync', payload, channelKey),
    decryptSyncPayload: (payload, channelKey) =>
      ipcRenderer.invoke('security:decrypt-sync', payload, channelKey),
  },
});
