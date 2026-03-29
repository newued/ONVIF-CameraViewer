const onvif = require('node-onvif');

class OnvifDiscovery {
    constructor() {
        this.devices = new Map(); // 存储发现的设备
        this.discovering = false;
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
     * @param {number} options.timeout - 超时时间(秒),默认 3
     * @returns {Promise<Array>} 发现的设备列表
     */
    async startDiscovery(options = {}) {
        if (this.discovering) {
            throw new Error('Discovery already in progress');
        }

        this.discovering = true;
        this.devices.clear();

        const timeout = options.timeout || 3;

        return new Promise((resolve, reject) => {
            console.log('Starting ONVIF device discovery...');

            // 开始发现
            onvif.startProbe()
                .then((deviceList) => {
                    console.log(`Discovery complete. Found ${deviceList.length} devices.`);

                    deviceList.forEach((info) => {
                        this.devices.set(info.urn, {
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
                        });
                    });

                    this.discovering = false;
                    resolve(Array.from(this.devices.values()));
                })
                .catch((error) => {
                    this.discovering = false;
                    reject(error);
                });
        });
    }

    /**
     * 停止发现
     */
    async stopDiscovery() {
        this.discovering = false;
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
     * @returns {Promise<Object>} 流地址信息
     */
    async getStreamUri(deviceId, username, password) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error('Device not found');
        }

        console.log('=== DEBUG: getStreamUri ===');
        console.log(`Device: ${device.name} (${device.ip})`);
        console.log(`Credentials: ${username}/******`);

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

            // 创建 OnvifDevice 对象
            const onvifDevice = new onvif.OnvifDevice({
                xaddr: xaddr,
                user: username,
                pass: password
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

            console.log('Step 4: Getting stream URI...');

            // 获取流地址 (主码流)（带超时）
            let streamUri = null;
            try {
                streamUri = await this.withTimeout(
                    new Promise((resolve, reject) => {
                        onvifDevice.getStreamUri(
                            {
                                protocol: 'RTSP',
                                resolution: '1920x1080'
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

            console.log('Step 5: Building RTSP URL...');

            // 如果 ONVIF 获取失败,使用通用 RTSP 地址列表
            const rtspUrl = streamUri || this.buildTPLinkRtspUrl(device.ip, username, password);
            const allUrls = this.buildUniversalRtspUrls(device.ip, username, password);

            console.log('Final RTSP URL:', rtspUrl);
            console.log('All available URLs:', allUrls);

            return {
                device: info,
                rtspUrl: rtspUrl,
                rtspUrls: allUrls,
                ip: device.ip,
                port: 554
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
                rtspUrl: fallbackUrls[1], // 默认使用 TP-Link 格式
                rtspUrls: fallbackUrls, // 提供所有格式
                ip: device.ip,
                port: 554,
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
     * @returns {Array<string>} RTSP URL 列表
     */
    buildUniversalRtspUrls(ip, username, password) {
        return [
            this.buildHikvisionRtspUrl(ip, username, password),
            this.buildTPLinkRtspUrl(ip, username, password),
            `rtsp://${username}:${password}@${ip}:554/av0_0`, // 通用格式 1
            `rtsp://${username}:${password}@${ip}:554/ch0_0`  // 通用格式 2
        ];
    }
}

module.exports = OnvifDiscovery;
