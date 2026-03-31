const AppState = {
    devices: [],
    currentDevice: null,
    currentStreamId: null,
    currentPlayer: null,
    isDiscovering: false,
    currentLoginInfo: null
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
    videoWrapper: document.getElementById('video-wrapper'),
    rtspUrlInput: document.getElementById('rtsp-url-input'),
    btnTestRtsp: document.getElementById('btn-test-rtsp')
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
    elements.btnTestRtsp.addEventListener('click', testRtspConnection);
}

async function startDiscovery() {
    try {
        AppState.isDiscovering = true;
        updateDiscoveryUI();
        showLoading(elements.deviceList);
        const devices = await window.electronAPI.startDiscovery({ timeout: 8, retries: 3 });
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
        
        // 尝试使用所有可用的 RTSP 地址
        for (const rtspUrl of streamInfo.rtspUrls) {
            try {
                console.log('Trying RTSP URL:', rtspUrl);
                const streamResult = await window.electronAPI.startStream(rtspUrl, streamInfo.rtspUrls);
                AppState.currentStreamId = streamResult.streamId;
                AppState.currentDevice = streamInfo;
                AppState.currentLoginInfo = {
                    deviceId,
                    deviceName,
                    deviceIp,
                    username,
                    password
                };
                updateDeviceInfo(deviceName, deviceIp, streamInfo);
                await loadStream(streamResult.wsUrl, deviceName, rtspUrl);
                updateStreamStatus('已连接', 'connected');
                return;
            } catch (error) {
                console.error('Failed to connect with URL:', rtspUrl, error);
                // 继续尝试下一个 URL
            }
        }
        
        // 如果所有 URL 都失败
        throw new Error('Failed to connect to device with any RTSP URL');
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

async function loadStream(wsUrl, label, rtspUrl) {
    return new Promise(function (resolve, reject) {
        // 清理之前的播放器
        if (AppState.currentPlayer) {
            if (typeof AppState.currentPlayer.destroy === 'function') {
                AppState.currentPlayer.destroy();
            }
            const existingCanvas = document.getElementById('stream-canvas');
            if (existingCanvas) {
                existingCanvas.remove();
            }
        }

        // 创建新的 canvas 元素
        const videoWrapper = document.getElementById('video-wrapper');
        if (!videoWrapper) {
            reject(new Error('Video wrapper not found'));
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.id = 'stream-canvas';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
        canvas.style.display = 'block';

        // 添加 canvas 到视频容器
        videoWrapper.appendChild(canvas);
        elements.videoPlayer.style.display = 'none';

        if (typeof window.loadPlayer === 'function') {
            window.loadPlayer({
                url: wsUrl,
                canvas: canvas,
                disconnectThreshold: 5000,
                maxReconnectAttempts: 10,
                onDisconnect: function (player) {
                    console.log('Stream disconnected:', label);
                    updateStreamStatus('连接断开', 'error');
                }
            }).then(function (result) {
                console.log('Stream playing:', label);
                AppState.currentPlayer = result;

                // 显示视频画面
                elements.videoOverlay.classList.add('hidden');
                elements.videoLoading.classList.add('hidden');
                elements.videoError.classList.add('hidden');
                elements.videoWrapper.style.display = 'block';

                // 启用控制按钮
                elements.btnPlay.disabled = true;
                elements.btnStop.disabled = false;
                elements.btnScreenshot.disabled = false;
                updateStreamStatus('已连接', 'connected');
                resolve();
            }).catch(function (err) {
                console.error('Failed to load player:', err);
                showVideoError('无法加载视频播放器');
                reject(err);
            });
        } else {
            reject(new Error('loadPlayer not available'));
        }
    });
}

async function playStream() {
    if (AppState.currentPlayer) {
        console.log('RTSP player is already playing');
        elements.btnPlay.disabled = true;
        elements.btnStop.disabled = false;
        return;
    }

    if (AppState.currentLoginInfo) {
        console.log('Attempting to reconnect to device...');
        try {
            showVideoLoading();
            updateStreamStatus('正在连接...');
            const { deviceId, deviceName, deviceIp, username, password } = AppState.currentLoginInfo;
            console.log(`Reconnecting to device: ${deviceName} (${deviceIp})`);
            const streamInfo = await window.electronAPI.getStreamUri(deviceId, username, password);
            if (streamInfo.error && !streamInfo.fallback) {
                throw new Error(streamInfo.error);
            }
            console.log('Stream info:', streamInfo);
            const streamResult = await window.electronAPI.startStream(streamInfo.rtspUrl, streamInfo.rtspUrls);
            AppState.currentStreamId = streamResult.streamId;
            AppState.currentDevice = streamInfo;
            updateDeviceInfo(deviceName, deviceIp, streamInfo);
            await loadStream(streamResult.wsUrl, deviceName, streamInfo.rtspUrl);
        } catch (error) {
            console.error('Failed to reconnect to device:', error);
            showVideoError(error.message);
            updateStreamStatus('连接失败', 'error');
            if (AppState.currentStreamId) {
                await window.electronAPI.stopStream(AppState.currentStreamId);
                AppState.currentStreamId = null;
            }
        }
    } else {
        console.log('No device login information available');
        elements.videoOverlay.classList.remove('hidden');
        updateStreamStatus('未连接');
    }
}

async function stopStream() {
    try {
        if (AppState.currentPlayer) {
            if (typeof AppState.currentPlayer.destroy === 'function') {
                AppState.currentPlayer.destroy();
            }
            const canvas = document.getElementById('stream-canvas');
            if (canvas) {
                canvas.remove();
            }
            AppState.currentPlayer = null;
        }

        if (AppState.currentStreamId) {
            await window.electronAPI.stopStream(AppState.currentStreamId);
            AppState.currentStreamId = null;
        }
        AppState.currentDevice = null;

        elements.videoOverlay.classList.remove('hidden');
        elements.videoLoading.classList.add('hidden');
        elements.videoError.classList.add('hidden');
        elements.videoWrapper.style.display = 'none';
        elements.btnPlay.disabled = false;
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
    }
}

function showVideoLoading() {
    elements.videoOverlay.classList.add('hidden');
    elements.videoLoading.classList.remove('hidden');
    elements.videoError.classList.add('hidden');
}

function showVideoError(message) {
    elements.videoOverlay.classList.add('hidden');
    elements.videoLoading.classList.add('hidden');
    elements.videoError.classList.remove('hidden');
    elements.errorMessage.textContent = message;
}

function updateStreamStatus(text, type) {
    const statusElement = elements.streamStatus;
    statusElement.innerHTML = `
        <span class="status-dot ${type || ''}"></span>
        ${text}
    `;
}

function updateDeviceInfo(name, ip, streamInfo) {
    elements.deviceInfo.textContent = `${name} (${ip})`;
    elements.deviceDetails.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">设备名称</span>
            <span class="detail-value">${name}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">IP 地址</span>
            <span class="detail-value">${ip}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">RTSP URL</span>
            <span class="detail-value">${streamInfo.rtspUrl}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">端口</span>
            <span class="detail-value">${streamInfo.port}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">可用流地址</span>
            <span class="detail-value">${streamInfo.rtspUrls ? streamInfo.rtspUrls.length : 0} 个</span>
        </div>
    `;
}

function takeScreenshot() {
    if (!AppState.currentPlayer) {
        console.error('No active stream to capture');
        return;
    }

    const canvas = document.getElementById('stream-canvas');
    if (!canvas) {
        console.error('No canvas found for active stream');
        return;
    }

    try {
        const dataUrl = canvas.toDataURL('image/png');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const deviceName = elements.deviceInfo.textContent.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
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

function retryConnection() {
    const activeDevice = document.querySelector('.device-item.active');
    if (activeDevice) {
        const deviceId = activeDevice.dataset.deviceId;
        selectDevice(deviceId);
    }
}

async function testRtspConnection() {
    const rtspUrl = elements.rtspUrlInput.value.trim();
    if (!rtspUrl) {
        alert('请输入 RTSP 地址');
        return;
    }

    try {
        // 显示测试状态
        updateStreamStatus('测试连接中...');
        elements.btnTestRtsp.disabled = true;
        elements.btnTestRtsp.innerHTML = '<span class="btn-icon">⏳</span> 测试中...';

        console.log('Testing RTSP connection:', rtspUrl);
        
        // 直接尝试加载视频流，因为只有能播放才算流可用
        try {
            showVideoLoading();
            const streamResult = await window.electronAPI.startStream(rtspUrl, [rtspUrl]);
            AppState.currentStreamId = streamResult.streamId;
            AppState.currentDevice = {
                rtspUrl: rtspUrl,
                rtspUrls: [rtspUrl],
                ip: extractIpFromRtspUrl(rtspUrl),
                port: 554
            };
            AppState.currentLoginInfo = {
                deviceId: 'manual-rtsp',
                deviceName: '手动输入 RTSP',
                deviceIp: extractIpFromRtspUrl(rtspUrl),
                username: extractUsernameFromRtspUrl(rtspUrl),
                password: extractPasswordFromRtspUrl(rtspUrl)
            };
            updateDeviceInfo('手动输入 RTSP', extractIpFromRtspUrl(rtspUrl), AppState.currentDevice);
            await loadStream(streamResult.wsUrl, '手动输入 RTSP', rtspUrl);
            
            // 视频流加载成功，显示成功提示
            updateStreamStatus('连接成功', 'connected');
            alert('测试连接成功！视频流已成功加载。');
        } catch (loadError) {
            console.error('Failed to load stream after test:', loadError);
            showVideoError('测试连接失败：无法加载视频流');
            updateStreamStatus('连接失败', 'error');
            alert(`测试连接失败: ${loadError.message || '无法加载视频流'}`);
        }
    } catch (error) {
        console.error('Failed to test RTSP connection:', error);
        updateStreamStatus('连接失败', 'error');
        alert(`测试连接失败: ${error.message || '未知错误'}`);
    } finally {
        // 恢复按钮状态
        elements.btnTestRtsp.disabled = false;
        elements.btnTestRtsp.innerHTML = '测试连接';
    }
}

// 从 RTSP URL 中提取 IP 地址
function extractIpFromRtspUrl(url) {
    // 处理带认证的 URL: rtsp://user:pass@ip:port/path
    const authMatch = url.match(/rtsp:\/\/[^@]+@([^:]+):/);
    if (authMatch) {
        return authMatch[1];
    }
    
    // 处理不带认证的 URL: rtsp://ip:port/path
    const noAuthMatch = url.match(/rtsp:\/\/([^:]+):/);
    return noAuthMatch ? noAuthMatch[1] : 'Unknown IP';
}

// 从 RTSP URL 中提取用户名
function extractUsernameFromRtspUrl(url) {
    const match = url.match(/rtsp:\/\/([^:]+):/);
    return match ? match[1] : '';
}

// 从 RTSP URL 中提取密码
function extractPasswordFromRtspUrl(url) {
    const match = url.match(/rtsp:\/\/[^:]+:([^@]+)@/);
    return match ? match[1] : '';
}

window.selectDevice = selectDevice;
window.closeLoginModal = closeLoginModal;
window.loginDevice = loginDevice;
window.retryConnection = retryConnection;

initApp();