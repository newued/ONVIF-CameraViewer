const AppState = {
    devices: [],
    currentDevice: null,
    currentStreamId: null,
    flvPlayer: null,
    isDiscovering: false,
    streams: [],
    activeStreamIndex: -1
};

const elements = {
    btnDiscover: document.getElementById('btn-discover'),
    btnStopDiscovery: document.getElementById('btn-stop-discovery'),
    deviceList: document.getElementById('device-list'),
    videoPlayer: document.getElementById('video-player'),
    videoOverlay: document.getElementById('video-overlay'),
    videoLoading: document.getElementById('video-loading'),
    videoError: document.getElementById('video-error'),
    errorMessage: document.getElementById('error-message'),
    btnPlay: document.getElementById('btn-play'),
    btnStop: document.getElementById('btn-stop'),
    btnScreenshot: document.getElementById('btn-screenshot'),
    streamStatus: document.getElementById('stream-status'),
    volumeSlider: document.getElementById('volume-slider'),
    deviceInfo: document.getElementById('device-info'),
    deviceDetails: document.getElementById('device-details-content'),
    loginModal: document.getElementById('login-modal'),
    deviceNameInput: document.getElementById('device-name'),
    deviceIpInput: document.getElementById('device-ip'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),
    streamsContainer: document.getElementById('streams-container')
};

function initApp() {
    setupEventListeners();
    console.log('Application initialized');
}

function setupEventListeners() {
    elements.btnDiscover.addEventListener('click', startDiscovery);
    elements.btnStopDiscovery.addEventListener('click', stopDiscovery);
    elements.btnPlay.addEventListener('click', playStream);
    elements.btnStop.addEventListener('click', stopStream);
    elements.btnScreenshot.addEventListener('click', takeScreenshot);
    elements.volumeSlider.addEventListener('input', handleVolumeChange);
}

async function startDiscovery() {
    try {
        AppState.isDiscovering = true;
        updateDiscoveryUI();
        showLoading(elements.deviceList);
        const devices = await window.electronAPI.startDiscovery({ timeout: 5 });
        AppState.devices = devices;
        displayDevices(devices);
        if (devices.length === 0) {
            showEmptyState('未发现设备', '请检查网络连接和设备状态');
        }
        console.log(`Discovered ${devices.length} devices:`, devices);
    } catch (error) {
        console.error('Discovery failed:', error);
        showEmptyState('发现失败', error.message);
        AppState.isDiscovering = false;
        updateDiscoveryUI();
    }
}

async function stopDiscovery() {
    try {
        await window.electronAPI.stopDiscovery();
        AppState.isDiscovering = false;
        updateDiscoveryUI();
        console.log('Discovery stopped');
    } catch (error) {
        console.error('Failed to stop discovery:', error);
    }
}

function updateDiscoveryUI() {
    elements.btnDiscover.disabled = AppState.isDiscovering;
    elements.btnStopDiscovery.disabled = !AppState.isDiscovering;
    if (AppState.isDiscovering) {
        elements.btnDiscover.innerHTML = '<span class="btn-icon">⏳</span> 发现中...';
    } else {
        elements.btnDiscover.innerHTML = '<span class="btn-icon">🔍</span> 发现设备';
    }
}

function displayDevices(devices) {
    if (!devices || devices.length === 0) {
        showEmptyState('暂无设备', '点击"发现设备"开始扫描');
        return;
    }
    elements.deviceList.innerHTML = devices.map(device => `
        <div class="device-item" data-device-id="${device.urn}" onclick="selectDevice('${device.urn}')">
            <div class="device-name">
                <span class="device-status"></span>
                ${device.name || '未知设备'}
            </div>
            <div class="device-info">📍 ${device.location || 'Unknown'}</div>
            <div class="device-info">🌐 ${device.ip || 'Unknown IP'}</div>
            <div class="device-info">💻 ${device.hardware || 'Unknown Hardware'}</div>
        </div>
    `).join('');
}

function showEmptyState(title, subtitle) {
    elements.deviceList.innerHTML = `
        <div class="empty-state">
            <p>${title}</p>
            <small>${subtitle}</small>
        </div>
    `;
}

function showLoading(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="loading-spinner" style="width: 40px; height: 40px; margin: 0 0 15px;"></div>
            <p>正在扫描网络...</p>
        </div>
    `;
}

function selectDevice(deviceId) {
    const device = AppState.devices.find(d => d.urn === deviceId);
    if (!device) {
        console.error('Device not found:', deviceId);
        return;
    }
    document.querySelectorAll('.device-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-device-id="${deviceId}"]`).classList.add('active');
    showLoginModal(device);
}

function showLoginModal(device) {
    elements.deviceNameInput.value = device.name || '未知设备';
    elements.deviceIpInput.value = device.ip || '';
    elements.usernameInput.value = 'admin';
    elements.passwordInput.value = '';
    elements.loginModal.classList.remove('hidden');
    setTimeout(() => {
        elements.passwordInput.focus();
    }, 100);
}

function closeLoginModal() {
    elements.loginModal.classList.add('hidden');
}

async function loginDevice() {
    const deviceName = elements.deviceNameInput.value;
    const deviceIp = elements.deviceIpInput.value;
    const username = elements.usernameInput.value;
    const password = elements.passwordInput.value;
    if (!password) {
        alert('请输入设备密码');
        return;
    }
    const deviceId = document.querySelector('.device-item.active').dataset.deviceId;
    closeLoginModal();
    try {
        showVideoLoading();
        updateStreamStatus('正在连接...');
        console.log(`Connecting to device: ${deviceName} (${deviceIp})`);
        const streamInfo = await window.electronAPI.getStreamUri(deviceId, username, password);
        if (streamInfo.error && !streamInfo.fallback) {
            throw new Error(streamInfo.error);
        }
        console.log('Stream info:', streamInfo);
        const streamResult = await window.electronAPI.startStream(streamInfo.rtspUrl, streamInfo.rtspUrls);
        AppState.currentStreamId = streamResult.streamId;
        AppState.currentDevice = streamInfo;
        updateDeviceInfo(deviceName, deviceIp, streamInfo);
        await createStreamPanel(streamResult.wsUrl, deviceName, streamInfo.rtspUrl);
    } catch (error) {
        console.error('Failed to connect to device:', error);
        showVideoError(error.message);
        updateStreamStatus('连接失败', 'error');
        if (AppState.currentStreamId) {
            await window.electronAPI.stopStream(AppState.currentStreamId);
            AppState.currentStreamId = null;
        }
    }
}

function createStreamPanel(wsUrl, label, rtspUrl) {
    return new Promise(function(resolve, reject) {
        const container = elements.streamsContainer;
        if (!container) {
            reject(new Error('Streams container not found'));
            return;
        }
        const streamIndex = AppState.streams.length;
        const panel = document.createElement('div');
        panel.className = 'stream-panel';
        panel.dataset.streamIndex = streamIndex;
        panel.onclick = function() {
            switchToStream(streamIndex);
        };
        
        panel.innerHTML = `
            <div class="stream-panel-header">
                <span class="stream-label">${label}</span>
                <button class="stream-close-btn" onclick="event.stopPropagation(); removeStream('${streamIndex}')">×</button>
            </div>
            <canvas class="stream-canvas" width="320" height="180"></canvas>
            <div class="stream-status-indicator"></div>
        `;
        
        container.appendChild(panel);
        
        const canvas = panel.querySelector('.stream-canvas');
        
        if (typeof window.loadPlayer === 'function') {
            window.loadPlayer({
                url: wsUrl,
                canvas: canvas,
                disconnectThreshold: 5000,
                maxReconnectAttempts: 10,
                onDisconnect: function(player) {
                    console.log('Stream disconnected:', label);
                    panel.querySelector('.stream-status-indicator').classList.add('disconnected');
                    updateStreamStatus('连接断开', 'error');
                }
            }).then(function(result) {
                console.log('Stream playing:', label);
                var actualPlayer = result.player || result;
                AppState.streams.push({
                    id: 'stream-' + Date.now(),
                    wsUrl: wsUrl,
                    rtspUrl: rtspUrl,
                    panel: panel,
                    canvas: canvas,
                    player: actualPlayer,
                    playerWrapper: result
                });
                switchToStream(streamIndex);
                elements.videoOverlay.classList.add('hidden');
                elements.videoLoading.classList.add('hidden');
                elements.videoError.classList.add('hidden');
                elements.btnScreenshot.disabled = false;
                updateStreamStatus('已连接', 'connected');
                resolve();
            }).catch(function(err) {
                console.error('Failed to load player:', err);
                panel.querySelector('.stream-status-indicator').classList.add('error');
                reject(err);
            });
        } else {
            reject(new Error('loadPlayer not available'));
        }
    });
}

function switchToStream(index) {
    if (index < 0 || index >= AppState.streams.length) return;
    AppState.activeStreamIndex = index;
    document.querySelectorAll('.stream-panel').forEach(function(p, i) {
        p.classList.toggle('active', i === index);
    });
    const stream = AppState.streams[index];
    if (stream && stream.rtspUrl) {
        const urlParts = stream.rtspUrl.split('/');
        const ipMatch = stream.rtspUrl.match(/:\/\/([^:\/]+)/);
        if (ipMatch) {
            updateDeviceInfo(
                document.querySelector('.stream-panel[data-stream-index="' + index + '"] .stream-label').textContent,
                ipMatch[1],
                { rtspUrl: stream.rtspUrl, port: 554 }
            );
        }
    }
    updateStreamStatus('已连接', 'connected');
}

function removeStream(index) {
    const stream = AppState.streams[index];
    if (stream) {
        if (stream.playerWrapper && typeof stream.playerWrapper.destroy === 'function') {
            stream.playerWrapper.destroy();
        } else if (stream.player && typeof stream.player.destroy === 'function') {
            stream.player.destroy();
        }
        if (stream.panel) {
            stream.panel.remove();
        }
        AppState.streams.splice(index, 1);
        if (AppState.activeStreamIndex === index) {
            AppState.activeStreamIndex = AppState.streams.length > 0 ? 0 : -1;
            if (AppState.activeStreamIndex >= 0) {
                switchToStream(0);
            }
        }
        for (var i = index; i < AppState.streams.length; i++) {
            AppState.streams[i].panel.dataset.streamIndex = i;
        }
        if (AppState.streams.length === 0) {
            elements.videoOverlay.classList.remove('hidden');
            updateStreamStatus('未连接');
        }
    }
}

window.removeStream = removeStream;

function playStream() {
    if (AppState.flvPlayer) {
        console.log('RTSP player is already playing');
        elements.btnPlay.disabled = true;
        elements.btnStop.disabled = false;
    }
}

async function stopStream() {
    try {
        if (AppState.flvPlayer) {
            if (typeof AppState.flvPlayer.destroy === 'function') {
                AppState.flvPlayer.destroy();
            }
            const canvas = document.getElementById('jsmpeg-canvas');
            if (canvas) {
                canvas.remove();
            }
            const videoPlayer = document.getElementById('video-player');
            if (videoPlayer) {
                videoPlayer.style.display = '';
            }
            AppState.flvPlayer = null;
        }
        
        for (var i = 0; i < AppState.streams.length; i++) {
            var stream = AppState.streams[i];
            if (stream.playerWrapper && typeof stream.playerWrapper.destroy === 'function') {
                stream.playerWrapper.destroy();
            } else if (stream.player && typeof stream.player.destroy === 'function') {
                stream.player.destroy();
            }
            if (stream.panel) {
                stream.panel.remove();
            }
        }
        AppState.streams = [];
        AppState.activeStreamIndex = -1;
        
        if (AppState.currentStreamId) {
            await window.electronAPI.stopStream(AppState.currentStreamId);
            AppState.currentStreamId = null;
        }
        AppState.currentDevice = null;
        
        elements.videoOverlay.classList.remove('hidden');
        elements.videoLoading.classList.add('hidden');
        elements.videoError.classList.add('hidden');
        elements.btnPlay.disabled = true;
        elements.btnStop.disabled = true;
        elements.btnScreenshot.disabled = true;
        elements.deviceInfo.textContent = '';
        elements.deviceDetails.innerHTML = '<p class="no-details">暂无设备信息</p>';
        
        updateStreamStatus('未连接');
        console.log('Stream stopped');
    } catch (error) {
        console.error('Failed to stop stream:', error);
    }
}

function handleVolumeChange(event) {
    const volume = event.target.value / 100;
    if (elements.videoPlayer) {
        elements.videoPlayer.volume = volume;
        elements.videoPlayer.muted = volume === 0;
    }
}

function showVideoLoading() {
    elements.videoOverlay.classList.remove('hidden');
    elements.videoLoading.classList.remove('hidden');
    elements.videoError.classList.add('hidden');
}

function showVideoError(message) {
    elements.videoOverlay.classList.remove('hidden');
    elements.videoLoading.classList.add('hidden');
    elements.videoError.classList.remove('hidden');
    elements.errorMessage.textContent = message;
}

async function retryConnection() {
    const activeDevice = document.querySelector('.device-item.active');
    if (activeDevice) {
        const deviceId = activeDevice.dataset.deviceId;
        selectDevice(deviceId);
    }
}

function updateDeviceInfo(name, ip, streamInfo) {
    elements.deviceInfo.textContent = `📍 ${name} (${ip})`;
    const details = `
        <div class="detail-row">
            <span class="detail-label">设备名称</span>
            <span class="detail-value">${name || 'Unknown'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">IP地址</span>
            <span class="detail-value">${ip || 'Unknown'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">RTSP地址</span>
            <span class="detail-value" style="font-family: monospace; font-size: 11px;">${streamInfo.rtspUrl || 'Unknown'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">流端口</span>
            <span class="detail-value">${streamInfo.port || 554}</span>
        </div>
        ${streamInfo.fallback ? `
        <div class="detail-row">
            <span class="detail-label">连接方式</span>
            <span class="detail-value" style="color: #ffc107;">降级模式</span>
        </div>
        ` : ''}
    `;
    elements.deviceDetails.innerHTML = details;
}

function updateStreamStatus(text, status) {
    const statusClass = status ? `status-dot ${status}` : 'status-dot';
    elements.streamStatus.innerHTML = `
        <span class="${statusClass}"></span>
        ${text}
    `;
}

function takeScreenshot() {
    if (AppState.activeStreamIndex < 0 || AppState.activeStreamIndex >= AppState.streams.length) {
        console.error('No active stream to capture');
        return;
    }

    const stream = AppState.streams[AppState.activeStreamIndex];
    if (!stream || !stream.canvas) {
        console.error('No canvas found for active stream');
        return;
    }

    try {
        const canvas = stream.canvas;
        const dataUrl = canvas.toDataURL('image/png');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const deviceName = stream.panel.querySelector('.stream-label').textContent.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
        const filename = `screenshot_${deviceName}_${timestamp}.png`;
        
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('Screenshot saved:', filename);
    } catch (error) {
        console.error('Failed to take screenshot:', error);
    }
}

window.selectDevice = selectDevice;
window.closeLoginModal = closeLoginModal;
window.loginDevice = loginDevice;
window.retryConnection = retryConnection;

initApp();
