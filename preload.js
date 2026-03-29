const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ONVIF 设备发现
    startDiscovery: (options) => ipcRenderer.invoke('start-discovery', options),
    stopDiscovery: () => ipcRenderer.invoke('stop-discovery'),
    getDevices: () => ipcRenderer.invoke('get-devices'),
    getStreamUri: (deviceId, username, password) => ipcRenderer.invoke('get-stream-uri', deviceId, username, password),

    // RTSP 流管理
    startStream: (rtspUrl, rtspUrls) => ipcRenderer.invoke('start-stream', rtspUrl, rtspUrls),
    stopStream: (streamId) => ipcRenderer.invoke('stop-stream', streamId),
    getWsUrl: (streamId) => ipcRenderer.invoke('get-ws-url', streamId)
});
