# ONVIF Camera Viewer

## 项目概述

ONVIF Camera Viewer 是一个基于 Electron 开发的桌面应用程序，用于发现和监控 ONVIF 兼容的网络摄像头。该应用提供了直观的用户界面，支持实时视频流播放、多设备管理和截图功能。

### 主要功能

- 📹 **ONVIF 设备自动发现**：自动扫描网络中的 ONVIF 兼容摄像头
- 🔄 **实时视频流**：通过 RTSP 协议获取和播放摄像头视频
- 📷 **截图功能**：对当前直播画面进行截图并保存
- 🖥️ **多设备管理**：支持同时添加和切换多个摄像头
- 🔍 **设备信息展示**：显示设备详细信息和连接状态

## 技术栈

### 核心技术
- **Electron**：桌面应用框架
- **Node.js**：后端运行时
- **ONVIF**：设备发现协议 (`node-onvif`)
- **RTSP**：实时流传输协议
- **FFmpeg**：视频流转码和转换 (`ffmpeg-static`)
- **WebSocket**：实时数据传输
- **jsmpeg**：HTML5 视频播放器

### 依赖包
- `express`：Web 服务器
- `express-ws`：WebSocket 支持
- `fluent-ffmpeg`：FFmpeg 封装
- `node-onvif`：ONVIF 设备发现
- `rtsp-relay`：RTSP 流转发
- `ws`：WebSocket 实现
- `ffmpeg-static`：FFmpeg 二进制文件
- `electron-builder`：应用打包工具

## 项目结构

```
ke_tenant_zzlq/
├── electron-rtsp-local/         # RTSP 转发管理
│   └── rtsp-relay-manager.js    # RTSP 流管理
├── static/                      # 静态资源
│   ├── jsmpeg.min.js            # JSMpeg 播放器
│   └── rtsp-relay-browser.js    # 浏览器端 RTSP 处理
├── index.html                   # 主界面
├── index.js                     # 前端逻辑
├── main.js                      # Electron 主进程
├── onvif-discovery.js           # ONVIF 设备发现
├── preload.js                   # 预加载脚本
├── style.css                    # 样式文件
├── package.json                 # 项目配置
├── icon.png                     # 应用图标
└── README.md                    # 项目说明
```

## 安装和使用

### 开发环境设置

1. **克隆项目**
   ```bash
   git clone <项目地址>
   cd ke_tenant_zzlq
   ```

2. **安装依赖**
   ```bash
   # 使用 pnpm（推荐）
   pnpm install
   
   # 或使用 npm
   npm install
   ```

3. **运行开发模式**
   ```bash
   # 开发模式（带调试工具）
   pnpm run dev
   
   # 正常模式
   pnpm start
   ```

### 打包应用

1. **安装打包依赖**（如果尚未安装）
   ```bash
   pnpm install electron-builder --save-dev
   ```

2. **执行打包**
   ```bash
   # 打包 Windows 版本（生成安装包和便携版）
   pnpm run build
   
   # 仅打包到目录（用于测试）
   pnpm run build:dir
   ```

3. **打包产物**
   打包完成后，产物会生成在 `dist/` 目录：
   - `ONVIFCameraViewer Setup 1.0.0.exe` - NSIS 安装包
   - `ONVIFCameraViewer-1.0.0-portable.exe` - 便携版

## 使用指南

### 首次使用

1. **启动应用**：运行安装包或便携版
2. **发现设备**：点击左侧的「发现设备」按钮，应用会自动扫描网络中的 ONVIF 摄像头
3. **选择设备**：从设备列表中选择一个摄像头
4. **设备登录**：输入设备的用户名和密码（默认用户名通常为 `admin`）
5. **查看视频**：连接成功后，视频流会在主窗口显示

### 基本操作

- **播放/停止**：控制视频流的播放状态
- **截图**：点击摄像头图标对当前画面进行截图
- **音量调节**：通过滑块调整音量
- **多设备管理**：可以同时添加多个摄像头，通过点击左侧的设备面板切换

### 截图功能

1. **连接摄像头**：确保视频流正在播放
2. **点击截图按钮**：主界面控制栏中的 📷 图标
3. **保存截图**：截图会自动下载到默认下载目录
4. **文件名格式**：`screenshot_设备名_时间戳.png`

## 注意事项

### 技术限制

1. **FFmpeg 依赖**：应用内置了 FFmpeg 二进制文件，无需用户单独安装
2. **网络要求**：设备需要与电脑在同一局域网内
3. **权限要求**：某些摄像头可能需要管理员权限才能访问
4. **性能考虑**：同时播放多个视频流可能会占用较高的 CPU 资源

### 常见问题

1. **设备发现失败**
   - 检查网络连接
   - 确保摄像头已开机并连接到网络
   - 检查摄像头是否支持 ONVIF 协议

2. **连接失败**
   - 确认用户名和密码正确
   - 检查摄像头 RTSP 服务是否开启
   - 尝试使用不同的网络连接方式

3. **视频流卡顿**
   - 检查网络带宽
   - 减少同时播放的视频流数量
   - 确保电脑性能足够

4. **截图功能不工作**
   - 确保视频流正在正常播放
   - 检查浏览器下载权限
   - 尝试使用不同的浏览器（如果使用 Web 版本）

### 安全建议

- **密码管理**：不要在公共场合保存摄像头密码
- **网络安全**：建议在安全的网络环境中使用
- **定期更新**：定期检查摄像头固件更新
- **访问控制**：限制摄像头的网络访问范围

## 故障排除

### 日志查看

应用运行时会在控制台输出日志信息，可以通过以下方式查看：

1. **开发模式**：启动应用时会自动打开 DevTools
2. **生产模式**：可以通过 `Ctrl+Shift+I` 打开 DevTools

### 常见错误

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|--------|
| `FFmpeg not found` | FFmpeg 未正确打包 | 重新打包应用 |
| `Connection failed` | 网络问题或设备离线 | 检查网络连接和设备状态 |
| `Authentication failed` | 用户名或密码错误 | 确认设备凭据 |
| `RTSP stream error` | RTSP 服务未开启 | 检查摄像头 RTSP 设置 |

## 系统要求

### 最低要求
- **操作系统**：Windows 10/11
- **处理器**：Intel i3 或 equivalent
- **内存**：4GB RAM
- **网络**：局域网连接
- **存储空间**：200MB 可用空间

### 推荐配置
- **处理器**：Intel i5 或 equivalent
- **内存**：8GB RAM
- **网络**：千兆局域网
- **存储空间**：500MB 可用空间