const onvif = require('node-onvif');
const dgram = require('dgram');

class OnvifDiscovery {
    constructor() {
        this.devices = new Map(); // 存储发现的设备
        this.discovering = false;
        this.broadcastSocket = null;
    }

    /**
     * 为Promise添加超时
     * @param {Promise} promise - 原始Promise
     * @param {number} timeoutMs - 超时时间(毫秒)
     * @param {string} operation - 操作名称(用于错误信息)
     * @returns {Promise} 带超时的Promise
     */
    withTimeout(promise, timeoutMs, operation) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            promise
                .then(result => {
                    clearTimeout(timer);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    /**
     * 开始发现 ONVIF 设备
     * @param {Object} options - 发现选项
     * @param {number} options.timeout - 超时时间(秒),默认 8
     * @param {number} options.retries - 重试次数,默认 3
     * @param {Array<string>} options.subnets - 要扫描的子网列表,默认自动检测
     * @returns {Promise<Array>} 发现的设备列表
     */
    async startDiscovery(options = {}) {
        if (this.discovering) {
            throw new Error('Discovery already in progress');
        }

        this.discovering = true;
        this.devices.clear();

        const timeout = options.timeout || 8;
        const retries = options.retries || 3;
        const subnets = options.subnets || this.getLocalSubnets();

        console.log('Starting ONVIF device discovery...');
        console.log('Discovery options:', options);
        console.log('Timeout:', timeout, 'seconds');
        console.log('Retries:', retries);
        console.log('Subnets to scan:', subnets);

        try {
            // 并行执行多种发现方法
            const discoveryResults = await Promise.all([
                this.discoverWithOnvifProbe(timeout, retries),
                this.discoverWithUdpBroadcast(timeout, subnets)
            ]);

            // 合并结果，去重
            const allDevices = new Map();
            discoveryResults.forEach(result => {
                result.forEach(device => {
                    allDevices.set(device.urn || device.ip, device);
                });
            });

            this.devices = allDevices;
            const deviceList = Array.from(allDevices.values());

            console.log(`Discovery complete. Found ${deviceList.length} devices.`);
            console.log('Device list:', deviceList);

            return deviceList;
        } catch (error) {
            console.error('Discovery failed:', error);
            throw error;
        } finally {
            this.discovering = false;
            this.cleanupBroadcastSocket();
        }
    }

    /**
     * 使用 ONVIF startProbe 方法发现设备
     * @param {number} timeout - 超时时间(秒)
     * @param {number} retries - 重试次数
     * @returns {Promise<Array>} 发现的设备列表
     */
    async discoverWithOnvifProbe(timeout, retries) {
        let lastError;

        for (let i = 0; i <= retries; i++) {
            console.log(`ONVIF startProbe attempt ${i + 1}/${retries + 1}...`);

            try {
                // 开始发现
                const deviceList = await new Promise((resolve, reject) => {
                    // 设置超时
                    const discoveryTimeout = setTimeout(() => {
                        reject(new Error(`ONVIF startProbe timeout after ${timeout} seconds`));
                    }, timeout * 1000);

                    onvif.startProbe()
                        .then((devices) => {
                            clearTimeout(discoveryTimeout);
                            resolve(devices);
                        })
                        .catch((error) => {
                            clearTimeout(discoveryTimeout);
                            reject(error);
                        });
                });

                console.log(`ONVIF startProbe found ${deviceList.length} devices.`);

                // 处理设备信息
                return deviceList.map(info => ({
                    urn: info.urn,
                    name: info.name,
                    hardware: info.hardware,
                    location: info.location || 'Unknown',
                    xaddrs: info.xaddrs,
                    types: info.types,
                    // 提取 IP 地址
                    ip: this.extractIpAddress(info.xaddrs[0]),
                    // 默认 ONVIF 端口
                    port: 80
                }));
            } catch (error) {
                console.error(`ONVIF startProbe attempt ${i + 1} failed:`, error);
                lastError = error;

                if (i < retries) {
                    console.log(`Retrying ONVIF startProbe in 2 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        throw lastError;
    }

    /**
     * 使用 UDP 广播发现设备
     * @param {number} timeout - 超时时间(秒)
     * @param {Array<string>} subnets - 要扫描的子网列表
     * @returns {Promise<Array>} 发现的设备列表
     */
    async discoverWithUdpBroadcast(timeout, subnets) {
        return new Promise((resolve) => {
            const devices = [];
            const foundIps = new Set();
            const timeoutMs = timeout * 1000;

            // 创建 UDP 套接字
            this.broadcastSocket = dgram.createSocket('udp4');

            this.broadcastSocket.on('error', (err) => {
                console.error('UDP broadcast error:', err);
            });

            this.broadcastSocket.on('message', (msg, rinfo) => {
                const ip = rinfo.address;
                if (!foundIps.has(ip)) {
                    foundIps.add(ip);
                    console.log('UDP broadcast found device:', ip);
                    devices.push({
                        urn: `udp:${ip}`,
                        name: 'Unknown Device',
                        hardware: 'Unknown',
                        location: 'Unknown',
                        xaddrs: [`http://${ip}:80/onvif/device_service`],
                        types: [],
                        ip: ip,
                        port: 80
                    });
                }
            });

            // 绑定套接字
            this.broadcastSocket.bind(() => {
                this.broadcastSocket.setBroadcast(true);

                // 发送广播消息到每个子网
                subnets.forEach(subnet => {
                    const broadcastAddr = this.getBroadcastAddress(subnet);
                    if (broadcastAddr) {
                        console.log(`Sending UDP broadcast to ${broadcastAddr}`);
                        // ONVIF WS-Discovery 消息
                        const message = `<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope"
          xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery"
          xmlns:tt="http://schemas.xmlsoap.org/ws/2005/04/transfer">
  <Header>
    <wsa:Action xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">
      http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe
    </wsa:Action>
    <wsa:MessageID xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">
      uuid:${this.generateUUID()}
    </wsa:MessageID>
    <wsa:To xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">
      urn:schemas-xmlsoap-org:ws:2005:04:discovery
    </wsa:To>
  </Header>
  <Body>
    <wsd:Probe>
      <wsd:Types>tdn:NetworkVideoTransmitter</wsd:Types>
    </wsd:Probe>
  </Body>
</Envelope>`;
                        this.broadcastSocket.send(message, 0, message.length, 3702, broadcastAddr);
                    }
                });
            });

            // 设置超时
            setTimeout(() => {
                this.cleanupBroadcastSocket();
                resolve(devices);
            }, timeoutMs);
        });
    }

    /**
     * 清理广播套接字
     */
    cleanupBroadcastSocket() {
        if (this.broadcastSocket) {
            try {
                this.broadcastSocket.close();
            } catch (error) {
                console.error('Error closing broadcast socket:', error);
            }
            this.broadcastSocket = null;
        }
    }

    /**
     * 获取本地子网列表
     * @returns {Array<string>} 本地子网列表
     */
    getLocalSubnets() {
        // 简化实现，实际应用中应该获取本地网络接口的子网
        return ['192.168.1.0/24', '192.168.0.0/24', '10.0.0.0/24', '172.16.0.0/16'];
    }

    /**
     * 获取子网的广播地址
     * @param {string} subnet - 子网，格式为 IP/mask
     * @returns {string|null} 广播地址
     */
    getBroadcastAddress(subnet) {
        try {
            const [ip, mask] = subnet.split('/');
            const maskBits = parseInt(mask, 10);
            if (maskBits < 0 || maskBits > 32) return null;

            // 简化实现，实际应用中应该计算广播地址
            const ipParts = ip.split('.');
            ipParts[3] = '255';
            return ipParts.join('.');
        } catch (error) {
            console.error('Error parsing subnet:', error);
            return null;
        }
    }

    /**
     * 生成 UUID
     * @returns {string} UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 停止发现
     */
    async stopDiscovery() {
        this.discovering = false;
        this.cleanupBroadcastSocket();
        console.log('Discovery stopped');
    }

    /**
     * 获取已发现的设备列表
     * @returns {Array} 设备列表
     */
    getDevices() {
        return Array.from(this.devices.values());
    }

    /**
     * 获取设备的 RTSP 流地址
     * @param {string} deviceId - 设备 URN
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @param {Object} options - 选项
     * @param {string} options.protocol - 流媒体协议，默认 'RTSP'
     * @param {string} options.resolution - 分辨率，默认 '1920x1080'
     * @returns {Promise<Object>} 流地址信息
     */
    async getStreamUri(deviceId, username, password, options = {}) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error('Device not found');
        }

        const protocol = options.protocol || 'RTSP';
        const resolution = options.resolution || '1920x1080';

        console.log('=== DEBUG: getStreamUri ===');
        console.log(`Device: ${device.name} (${device.ip})`);
        console.log(`Credentials: ${username || 'none'}/${password ? '******' : 'none'}`);
        console.log(`Options: protocol=${protocol}, resolution=${resolution}`);

        try {
            console.log('Step 1: Creating ONVIF device object...');

            // 使用设备的xaddrs地址，如果没有则使用默认地址
            let xaddr = `http://${device.ip}:80/onvif/device_service`;
            if (device.xaddrs && device.xaddrs.length > 0) {
                xaddr = device.xaddrs[0];
                console.log(`使用设备的ONVIF地址: ${xaddr}`);
            } else {
                console.log(`使用默认ONVIF地址: ${xaddr}`);
            }

            // 创建 OnvifDevice 对象，支持不需要认证的设备
            const onvifDevice = new onvif.OnvifDevice({
                xaddr: xaddr,
                user: username || '',
                pass: password || ''
            });

            console.log('Step 2: Initializing device connection...');

            // 初始化设备连接（带超时）
            await this.withTimeout(
                new Promise((resolve, reject) => {
                    onvifDevice.init((error) => {
                        if (error) {
                            console.error('ONVIF init error:', error);
                            reject(error);
                        } else {
                            console.log('ONVIF init successful');
                            resolve();
                        }
                    });
                }),
                10000, // 10秒超时
                'ONVIF init'
            );

            console.log('Step 3: Getting device information...');

            // 获取设备信息（带超时）
            let info = {};
            try {
                info = await this.withTimeout(
                    new Promise((resolve, reject) => {
                        onvifDevice.getInformation((error, info) => {
                            if (error) {
                                console.error('Get info error:', error);
                                reject(error);
                            } else {
                                console.log('Device info:', info);
                                resolve(info);
                            }
                        });
                    }),
                    8000, // 8秒超时
                    'Get device information'
                );
            } catch (error) {
                console.log('获取设备信息失败，使用默认信息:', error.message);
                info = { name: device.name, model: 'Unknown' };
            }

            console.log('Step 4: Getting media profiles...');

            // 获取媒体配置文件（带超时）
            let profiles = [];
            try {
                profiles = await this.withTimeout(
                    new Promise((resolve, reject) => {
                        onvifDevice.getProfiles((error, data) => {
                            if (error) {
                                console.error('Get profiles error:', error);
                                reject(error);
                            } else {
                                console.log('Media profiles:', data);
                                resolve(data);
                            }
                        });
                    }),
                    8000, // 8秒超时
                    'Get media profiles'
                );
            } catch (error) {
                console.log('获取媒体配置失败，使用默认配置:', error.message);
                profiles = [];
            }

            console.log('Step 5: Getting stream URI...');

            // 获取流地址 (主码流)（带超时）
            let streamUri = null;
            try {
                streamUri = await this.withTimeout(
                    new Promise((resolve, reject) => {
                        onvifDevice.getStreamUri(
                            {
                                protocol: protocol,
                                resolution: resolution
                            },
                            (error, uri) => {
                                if (error) {
                                    console.error('Get stream URI error:', error);
                                    reject(error);
                                } else {
                                    console.log('Stream URI:', uri);
                                    resolve(uri);
                                }
                            }
                        );
                    }),
                    8000, // 8秒超时
                    'Get stream URI'
                );
            } catch (error) {
                console.log('获取流地址失败，使用备用地址:', error.message);
                streamUri = null;
            }

            // 如果主协议失败，尝试其他协议
            if (!streamUri && protocol === 'RTSP') {
                console.log('Trying HTTP protocol...');
                try {
                    streamUri = await this.withTimeout(
                        new Promise((resolve, reject) => {
                            onvifDevice.getStreamUri(
                                {
                                    protocol: 'HTTP',
                                    resolution: resolution
                                },
                                (error, uri) => {
                                    if (error) {
                                        console.error('Get HTTP stream URI error:', error);
                                        reject(error);
                                    } else {
                                        console.log('HTTP Stream URI:', uri);
                                        resolve(uri);
                                    }
                                }
                            );
                        }),
                        8000, // 8秒超时
                        'Get HTTP stream URI'
                    );
                } catch (error) {
                    console.log('获取 HTTP 流地址失败:', error.message);
                }
            }

            console.log('Step 6: Building RTSP URL...');

            // 如果 ONVIF 获取失败,使用通用 RTSP 地址列表
            const allUrls = this.buildUniversalRtspUrls(device.ip, username, password);
            const rtspUrl = streamUri || allUrls[0];

            console.log('Final RTSP URL:', rtspUrl);
            console.log('All available URLs:', allUrls);

            return {
                device: info,
                rtspUrl: rtspUrl,
                rtspUrls: allUrls,
                ip: device.ip,
                port: 554,
                protocol: protocol
            };
        } catch (error) {
            console.error('=== ERROR: getStreamUri failed ===');
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);

            // 降级策略:使用多种 RTSP 地址格式
            const fallbackUrls = this.buildUniversalRtspUrls(device.ip, username, password);
            console.log('Fallback RTSP URLs:', fallbackUrls);

            return {
                error: error.message,
                rtspUrl: fallbackUrls[0], // 默认使用第一个格式
                rtspUrls: fallbackUrls, // 提供所有格式
                ip: device.ip,
                port: 554,
                protocol: protocol,
                fallback: true
            };
        }
    }

    /**
     * 从 URL 中提取 IP 地址
     * @param {string} xaddr - 设备地址
     * @returns {string} IP 地址
     */
    extractIpAddress(xaddr) {
        if (!xaddr) return 'Unknown';

        try {
            const url = new URL(xaddr);
            return url.hostname;
        } catch {
            // 尝试从字符串中提取 IP
            const match = xaddr.match(/(\d{1,3}\.){3}\d{1,3}/);
            return match ? match[0] : 'Unknown';
        }
    }

    /**
     * 构建海康威视标准 RTSP 地址
     * @param {string} ip - IP 地址
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {string} RTSP URL
     */
    buildHikvisionRtspUrl(ip, username, password) {
        // 新格式: rtsp://username:password@ip:554/Streaming/Channels/101
        // 101 表示通道 1 主码流
        return `rtsp://${username}:${password}@${ip}:554/Streaming/Channels/101`;
    }

    /**
     * 构建 TP-Link 标准 RTSP 地址
     * @param {string} ip - IP 地址
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {string} RTSP URL
     */
    buildTPLinkRtspUrl(ip, username, password) {
        // TP-Link 格式: rtsp://username:password@ip:554/stream1
        return `rtsp://${username}:${password}@${ip}:554/stream1`;
    }

    /**
     * 构建通用 RTSP 地址 (尝试多种格式)
     * @param {string} ip - IP 地址
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {Array<string>} RTSP URL 列表（按优先级排序）
     */
    buildUniversalRtspUrls(ip, username, password) {
        const baseUrl = username && password
            ? `rtsp://${username}:${password}@${ip}`
            : `rtsp://${ip}`;

        // 按优先级排序的端口和路径组合
        // 优先级：常见端口 + 常见路径 > 常见端口 + 其他路径 > 其他端口 + 常见路径
        const prioritizedUrls = [];

        // 常见端口
        const commonPorts = [554, 8554];
        // 常见路径（按优先级排序）
        const commonPaths = [
            '/stream1', '/stream2', '/live', '/Streaming/Channels/101',
            '/live0.254', '/live0.264', '/h264', '/onvif1'
        ];
        // 其他路径
        const otherPaths = [
            '/av0_0', '/ch0_0', '/media/video1', '/mjpeg', '/video', '/camera'
        ];
        // 其他端口
        const otherPorts = [5554];

        // 第一优先级：常见端口 + 常见路径
        commonPorts.forEach(port => {
            commonPaths.forEach(path => {
                prioritizedUrls.push(`${baseUrl}:${port}${path}`);
            });
        });

        // 第二优先级：常见端口 + 其他路径
        commonPorts.forEach(port => {
            otherPaths.forEach(path => {
                prioritizedUrls.push(`${baseUrl}:${port}${path}`);
            });
        });

        // 第三优先级：其他端口 + 常见路径
        otherPorts.forEach(port => {
            commonPaths.forEach(path => {
                prioritizedUrls.push(`${baseUrl}:${port}${path}`);
            });
        });

        // 第四优先级：其他端口 + 其他路径
        otherPorts.forEach(port => {
            otherPaths.forEach(path => {
                prioritizedUrls.push(`${baseUrl}:${port}${path}`);
            });
        });

        return prioritizedUrls;
    }
}

module.exports = OnvifDiscovery;
