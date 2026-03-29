const { app, BrowserWindow, ipcMain } = require('electron');
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
        return await onvifDiscovery.startDiscovery(options);
    });

    ipcMain.handle('stop-discovery', async () => {
        return await onvifDiscovery.stopDiscovery();
    });

    ipcMain.handle('get-devices', async () => {
        return onvifDiscovery.getDevices();
    });

    ipcMain.handle('get-stream-uri', async (event, deviceId, username, password) => {
        return await onvifDiscovery.getStreamUri(deviceId, username, password);
    });

    ipcMain.handle('start-stream', async (event, rtspUrl, rtspUrls) => {
        console.log('=== DEBUG: IPC start-stream ===');
        console.log('rtspUrl:', rtspUrl);

        const wsUrl = `ws://localhost:${PORT}/api/stream?url=${encodeURIComponent(rtspUrl)}`;
        console.log('Generated WebSocket URL:', wsUrl);
        return {
            streamId: 'rtsp-relay-' + Date.now(),
            wsUrl: wsUrl
        };
    });

    ipcMain.handle('stop-stream', async (event, streamId) => {
        console.log('Stop stream requested for:', streamId);
        return true;
    });

    ipcMain.handle('get-ws-url', async (event, streamId) => {
        console.log('get-ws-url called with streamId:', streamId);
        return '';
    });
}
