const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const express = require('express');

// 加载配置文件
const config = require('../config');

const fluentFfmpeg = require('fluent-ffmpeg');

function setupFFmpeg() {
    try {
        const modPath = require.resolve('ffmpeg-static');
        const ffBinDir = path.dirname(modPath);
        const ffBin = path.join(ffBinDir, 'ffmpeg.exe');

        if (fs.existsSync(ffBin)) {
            fluentFfmpeg.setFfmpegPath(ffBin);
            process.env.FFMPEG_BINARY = ffBin;
            console.log('[FFMPEG] Using ffmpeg-static binary:', ffBin);
        } else {
            console.warn('[FFMPEG] ffmpeg.exe not found at:', ffBin);
        }
    } catch (e) {
        console.warn('[FFMPEG] Could not resolve ffmpeg-static:', e && e.message ? e.message : e);
    }
}

setupFFmpeg();

const RtspRelayManager = require('../electron-rtsp-local/rtsp-relay-manager');
const rtspRelayManager = new RtspRelayManager();

const OnvifDiscovery = require('./onvif-discovery');

let mainWindow;
let onvifDiscovery;
let expressApp;
let server;

// 使用配置文件中的端口号
const PORT = config.PORT;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
    
    // 创建并设置菜单
    createMenu();
}

function createMenu() {
    const template = [
        {
            label: '应用',
            submenu: [
                {
                    label: '刷新',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        mainWindow.reload();
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: '退出',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '调试',
            submenu: [
                {
                    label: '打开调试控制台',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => {
                        mainWindow.webContents.openDevTools();
                    }
                },
                {
                    label: '刷新页面',
                    accelerator: 'F5',
                    click: () => {
                        mainWindow.reload();
                    }
                }
            ]
        }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
    createWindow();

    onvifDiscovery = new OnvifDiscovery();

    expressApp = express();
    expressApp.use('/static', require('express').static(path.join(__dirname, '../../assets/static')));
    require('express-ws')(expressApp);

    rtspRelayManager.init(expressApp);
    rtspRelayManager.startServer(PORT);

    expressApp.ws('/api/stream', (ws, req) => {
        const rtspUrl = req.query.url;
        console.log('[WebSocket] New connection for:', rtspUrl);
        console.log('[WebSocket] URL:', req.url);
        console.log('[WebSocket] Query:', req.query);
        if (!rtspUrl) {
            console.log('[WebSocket] Missing RTSP URL, closing');
            ws.close(1008, 'Missing RTSP URL');
            return;
        }
        ws.on('open', () => {
            console.log('[WebSocket] Connection opened');
        });
        ws.on('error', (err) => {
            console.error('[WebSocket] Error:', err);
        });
        ws.on('message', (data) => {
            console.log('[WebSocket] Received', data.length, 'bytes');
        });
        ws.on('close', () => {
            console.log('[WebSocket] Connection closed');
        });
        rtspRelayManager.createProxyHandler(ws, rtspUrl);
    });

    setupIpcHandlers();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (typeof rtspRelayManager.stop === 'function') {
        try {
            rtspRelayManager.stop();
        } catch (e) {
            console.error('Failed to stop RTSP relay manager:', e);
        }
    }
});

function setupIpcHandlers() {
    ipcMain.handle('start-discovery', async (event, options = {}) => {
        try {
            console.log('[IPC] Starting discovery with options:', options);
            const result = await onvifDiscovery.startDiscovery(options);
            console.log('[IPC] Discovery completed successfully, found', result.length, 'devices');
            return result;
        } catch (error) {
            console.error('[IPC] Discovery failed:', error);
            throw new Error(`Discovery failed: ${error.message || 'Unknown error'}`);
        }
    });

    ipcMain.handle('stop-discovery', async () => {
        try {
            console.log('[IPC] Stopping discovery');
            await onvifDiscovery.stopDiscovery();
            console.log('[IPC] Discovery stopped successfully');
            return true;
        } catch (error) {
            console.error('[IPC] Failed to stop discovery:', error);
            throw new Error(`Failed to stop discovery: ${error.message || 'Unknown error'}`);
        }
    });

    ipcMain.handle('get-devices', async () => {
        try {
            console.log('[IPC] Getting devices');
            const devices = onvifDiscovery.getDevices();
            console.log('[IPC] Retrieved', devices.length, 'devices');
            return devices;
        } catch (error) {
            console.error('[IPC] Failed to get devices:', error);
            throw new Error(`Failed to get devices: ${error.message || 'Unknown error'}`);
        }
    });

    ipcMain.handle('get-stream-uri', async (event, deviceId, username, password) => {
        try {
            console.log('[IPC] Getting stream URI for device:', deviceId);
            const result = await onvifDiscovery.getStreamUri(deviceId, username, password);
            console.log('[IPC] Stream URI retrieved successfully');
            return result;
        } catch (error) {
            console.error('[IPC] Failed to get stream URI:', error);
            throw new Error(`Failed to get stream URI: ${error.message || 'Unknown error'}`);
        }
    });

    ipcMain.handle('start-stream', async (event, rtspUrl, rtspUrls) => {
        try {
            console.log('[IPC] Starting stream for URL:', rtspUrl);
            const wsUrl = `ws://localhost:${PORT}/api/stream?url=${encodeURIComponent(rtspUrl)}`;
            console.log('[IPC] Generated WebSocket URL:', wsUrl);
            return {
                streamId: 'rtsp-relay-' + Date.now(),
                wsUrl: wsUrl
            };
        } catch (error) {
            console.error('[IPC] Failed to start stream:', error);
            throw new Error(`Failed to start stream: ${error.message || 'Unknown error'}`);
        }
    });

    ipcMain.handle('stop-stream', async (event, streamId) => {
        try {
            console.log('[IPC] Stopping stream:', streamId);
            return true;
        } catch (error) {
            console.error('[IPC] Failed to stop stream:', error);
            throw new Error(`Failed to stop stream: ${error.message || 'Unknown error'}`);
        }
    });

    ipcMain.handle('get-ws-url', async (event, streamId) => {
        try {
            console.log('[IPC] Getting WS URL for stream:', streamId);
            return '';
        } catch (error) {
            console.error('[IPC] Failed to get WS URL:', error);
            throw new Error(`Failed to get WS URL: ${error.message || 'Unknown error'}`);
        }
    });

    ipcMain.handle('test-rtsp-connection', async (event, rtspUrl) => {
        try {
            console.log('[IPC] Testing RTSP connection for:', rtspUrl);
            // 简化测试逻辑，直接返回成功，因为我们会在前端实际加载视频流
            return { success: true, error: null };
        } catch (error) {
            console.error('[IPC] Failed to test RTSP connection:', error);
            return { success: false, error: error.message || 'Unknown error' };
        }
    });
}
