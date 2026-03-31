const { contextBridge, ipcRenderer } = require('electron');

// 直接硬编码配置值，避免在预加载脚本中使用node模块
const config = { PORT: 9999 };

// 暴露端口信息给渲染进程
contextBridge.exposeInMainWorld('appConfig', {
    PORT: config.PORT || 9999
});

contextBridge.exposeInMainWorld('electronAPI', {
    // ONVIF 设备发现
    startDiscovery: (options) => ipcRenderer.invoke('start-discovery', options),
    stopDiscovery: () => ipcRenderer.invoke('stop-discovery'),
    getDevices: () => ipcRenderer.invoke('get-devices'),
    getStreamUri: (deviceId, username, password) => ipcRenderer.invoke('get-stream-uri', deviceId, username, password),

    // RTSP 流管理
    startStream: (rtspUrl, rtspUrls) => ipcRenderer.invoke('start-stream', rtspUrl, rtspUrls),
    stopStream: (streamId) => ipcRenderer.invoke('stop-stream', streamId),
    getWsUrl: (streamId) => ipcRenderer.invoke('get-ws-url', streamId),
    
    // RTSP 连接测试
    testRtspConnection: (rtspUrl) => ipcRenderer.invoke('test-rtsp-connection', rtspUrl),
    
    // 流信息检测
    detectStreamInfo: (rtspUrl) => ipcRenderer.invoke('detect-stream-info', rtspUrl)
});
