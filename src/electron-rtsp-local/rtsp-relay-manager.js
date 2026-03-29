"use strict";

const express = require('express');
const ews = require('express-ws');

// 加载配置文件
const config = require('../config');

class RtspRelayManager {
    constructor() {
        this.expressApp = null;
        this.proxy = null;
        this.server = null;
        this.port = config.PORT;
        this.streams = new Map();
        this.rtspRelayModule = require('rtsp-relay');
    }

    init(expressApp) {
        if (!expressApp) throw new Error('Express app is required');
        this.expressApp = expressApp;

        const { proxy } = this.rtspRelayModule(expressApp);
        this.proxy = proxy;
    }

    startServer(port) {
        if (!this.expressApp) throw new Error('Express app not initialized');
        this.port = port || this.port;

        this.server = this.expressApp.listen(this.port, () => {
            console.log(`[RtspRelayManager] RTSP relay server running on port ${this.port}`);
        });

        this.server.on('error', (err) => {
            console.error('[RtspRelayManager] Server error:', err);
        });
    }

    getWsUrlFor(rtspUrl) {
        return `ws://localhost:${this.port}/api/stream?url=${encodeURIComponent(rtspUrl)}`;
    }

    createProxyHandler(ws, rtspUrl) {
        if (!this.proxy) {
            throw new Error('RTSP relay proxy is not initialized');
        }

        console.log('[RtspRelayManager] Creating stream for:', rtspUrl);

        const handler = this.proxy({
            url: rtspUrl,
            useNativeFFmpeg: true,
            verbose: true,
            transport: 'tcp'
        });

        const streamKey = rtspUrl;
        this.streams.set(streamKey, { ws, handler });

        ws.on('close', () => {
            this.streams.delete(streamKey);
            console.log('[RtspRelayManager] Stream closed:', streamKey);
        });

        handler(ws);
    }

    stopStream(rtspUrl) {
        const stream = this.streams.get(rtspUrl);
        if (stream && stream.ws) {
            stream.ws.close();
            this.streams.delete(rtspUrl);
        }
    }

    stop() {
        for (const [key, stream] of this.streams) {
            if (stream.ws) {
                stream.ws.close();
            }
        }
        this.streams.clear();

        if (this.server) {
            this.server.close(() => {
                console.log('[RtspRelayManager] RTSP relay server stopped');
            });
            this.server = null;
        }
    }
}

module.exports = RtspRelayManager;
