# ONVIF Camera Viewer

## Project Overview

ONVIF Camera Viewer is a desktop application developed based on Electron, used for discovering and monitoring ONVIF-compatible network cameras. The application provides an intuitive user interface that supports real-time video streaming, multi-device management, and screenshot functionality.

### Main Features

- 📹 **ONVIF Device Auto-discovery**: Automatically scans the network for ONVIF-compatible cameras
- 🔄 **Real-time Video Streaming**: Acquires and plays camera video through the RTSP protocol
- 📷 **Screenshot Functionality**: Takes screenshots of the current live feed and saves them
- 🖥️ **Multi-device Management**: Supports adding and switching between multiple cameras
- 🔍 **Device Information Display**: Shows device details and connection status

## Technology Stack

### Core Technologies
- **Electron**: Desktop application framework
- **Node.js**: Backend runtime
- **ONVIF**: Device discovery protocol (`node-onvif`)
- **RTSP**: Real-time streaming protocol
- **FFmpeg**: Video stream transcoding and conversion (`ffmpeg-static`)
- **WebSocket**: Real-time data transmission
- **jsmpeg**: HTML5 video player

### Dependencies
- `express`: Web server
- `express-ws`: WebSocket support
- `fluent-ffmpeg`: FFmpeg wrapper
- `node-onvif`: ONVIF device discovery
- `rtsp-relay`: RTSP stream forwarding
- `ws`: WebSocket implementation
- `ffmpeg-static`: FFmpeg binary files
- `electron-builder`: Application packaging tool

## Project Structure

```
ke_tenant_zzlq/
├── assets/                      # Static resources
│   └── static/                  # Static files
│       ├── jsmpeg.min.js        # JSMpeg player
│       └── rtsp-relay-browser.js # Browser-side RTSP handling
├── src/                         # Source code
│   ├── main/                    # Main process
│   │   ├── main.js              # Electron main process
│   │   ├── onvif-discovery.js   # ONVIF device discovery
│   │   └── onvif-utils.js       # ONVIF utility functions
│   ├── preload/                 # Preload scripts
│   │   └── preload.js           # Preload script
│   ├── renderer/                # Renderer process
│   │   ├── index.html           # Main interface
│   │   ├── index.js             # Frontend logic
│   │   └── style.css            # Style file
│   ├── electron-rtsp-local/     # RTSP relay management
│   │   └── rtsp-relay-manager.js # RTSP stream management
│   └── config.js                # Configuration file
├── package.json                 # Project configuration
├── icon.png                     # Application icon
└── README.md                    # Project documentation
```

## Installation and Usage

### Development Environment Setup

1. **Clone the project**
   ```bash
   git clone <project URL>
   cd ke_tenant_zzlq
   ```

2. **Install dependencies**
   ```bash
   # Using pnpm (recommended)
   pnpm install
   
   # Or using npm
   npm install
   ```

3. **Run in development mode**
   ```bash
   # Development mode (with debug tools)
   pnpm run dev
   
   # Normal mode
   pnpm start
   ```

### Packaging the Application

1. **Install packaging dependencies** (if not already installed)
   ```bash
   pnpm install electron-builder --save-dev
   ```

2. **Execute packaging**
   ```bash
   # Package Windows version (generates installer and portable version)
   pnpm run build
   
   # Package only to directory (for testing)
   pnpm run build:dir
   ```

3. **Packaging results**
   After packaging is complete, the results will be generated in the `dist/` directory:
   - `ONVIFCameraViewer Setup 1.0.0.exe` - NSIS installer
   - `ONVIFCameraViewer-1.0.0-portable.exe` - Portable version

## Usage Guide

### First-time Use

1. **Start the application**: Run the installer or portable version
2. **Discover devices**: Click the "Discover Devices" button on the left, and the application will automatically scan the network for ONVIF cameras
3. **Select a device**: Choose a camera from the device list
4. **Device login**: Enter the device's username and password (default username is usually `admin`)
5. **View video**: After successful connection, the video stream will be displayed in the main window

### Basic Operations

- **Play/Stop**: Control the playback status of the video stream
- **Screenshot**: Click the camera icon to take a screenshot of the current screen
- **Volume adjustment**: Adjust the volume through the slider
- **Multi-device management**: You can add multiple cameras at the same time and switch between them by clicking the device panel on the left

### Screenshot Function

1. **Connect to the camera**: Ensure the video stream is playing
2. **Click the screenshot button**: The 📷 icon in the main interface control bar
3. **Save the screenshot**: The screenshot will be automatically downloaded to the default download directory
4. **File name format**: `screenshot_device name_timestamp.png`

## Notes

### Technical Limitations

1. **FFmpeg dependency**: The application includes FFmpeg binary files, no need for users to install separately
2. **Network requirements**: Devices need to be on the same local network as the computer
3. **Permission requirements**: Some cameras may require administrator permissions to access
4. **Performance considerations**: Playing multiple video streams simultaneously may consume high CPU resources

### Common Issues

1. **Device discovery failure**
   - Check network connection
   - Ensure the camera is powered on and connected to the network
   - Check if the camera supports ONVIF protocol

2. **Connection failure**
   - Confirm the username and password are correct
   - Check if the camera's RTSP service is enabled
   - Try using a different network connection method

3. **Video stream stuttering**
   - Check network bandwidth
   - Reduce the number of simultaneous video streams
   - Ensure the computer performance is sufficient

4. **Screenshot function not working**
   - Ensure the video stream is playing normally
   - Check browser download permissions
   - Try using a different browser (if using the web version)

### Security Recommendations

- **Password management**: Do not save camera passwords in public places
- **Network security**: It is recommended to use in a secure network environment
- **Regular updates**: Regularly check for camera firmware updates
- **Access control**: Restrict the network access range of cameras

## Troubleshooting

### Log Viewing

The application outputs log information to the console, which can be viewed in the following ways:

1. **Development mode**: DevTools will automatically open when starting the application
2. **Production mode**: DevTools can be opened via `Ctrl+Shift+I`

### Common Errors

| Error Message | Possible Cause | Solution |
|--------------|---------------|----------|
| `FFmpeg not found` | FFmpeg not properly packaged | Repackage the application |
| `Connection failed` | Network issue or device offline | Check network connection and device status |
| `Authentication failed` | Incorrect username or password | Confirm device credentials |
| `RTSP stream error` | RTSP service not enabled | Check camera RTSP settings |

## System Requirements

### Minimum Requirements
- **Operating System**: Windows 10/11
- **Processor**: Intel i3 or equivalent
- **Memory**: 4GB RAM
- **Network**: Local area network connection
- **Storage**: 200MB available space

### Recommended Configuration
- **Processor**: Intel i5 or equivalent
- **Memory**: 8GB RAM
- **Network**: Gigabit local area network
- **Storage**: 500MB available space
