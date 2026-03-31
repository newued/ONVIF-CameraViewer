'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class StreamDetector {
    static async detectStreamInfo(rtspUrl) {
        return new Promise((resolve, reject) => {
            // 尝试使用ffmpeg-static中的ffmpeg
            let ffmpegPath = 'ffmpeg';
            try {
                const modPath = require.resolve('ffmpeg-static');
                const ffBinDir = path.dirname(modPath);
                const ffBin = path.join(ffBinDir, 'ffmpeg.exe');
                if (fs.existsSync(ffBin)) {
                    ffmpegPath = ffBin;
                }
            } catch (e) {
                console.warn('[StreamDetector] Could not resolve ffmpeg-static:', e.message);
            }

            console.log('[StreamDetector] Using ffmpeg path:', ffmpegPath);
            console.log('[StreamDetector] Detecting stream info for:', rtspUrl);

            const ffmpeg = spawn(ffmpegPath, [
                '-i', rtspUrl,
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams'
            ]);

            let output = '';
            let errorOutput = '';

            ffmpeg.stdout.on('data', (data) => {
                output += data;
            });

            ffmpeg.stderr.on('data', (data) => {
                errorOutput += data;
            });

            ffmpeg.on('close', (code) => {
                console.log('[StreamDetector] FFmpeg exit code:', code);
                if (code === 0) {
                    try {
                        const info = JSON.parse(output);
                        console.log('[StreamDetector] Stream info detected successfully');
                        resolve(info);
                    } catch (error) {
                        console.error('[StreamDetector] Failed to parse stream info:', error);
                        console.error('[StreamDetector] Output:', output);
                        reject(new Error('Failed to parse stream info'));
                    }
                } else {
                    console.error('[StreamDetector] FFmpeg error:', errorOutput);
                    reject(new Error(`Failed to detect stream info: ${errorOutput}`));
                }
            });

            ffmpeg.on('error', (error) => {
                console.error('[StreamDetector] Spawn error:', error);
                reject(new Error(`Failed to spawn ffmpeg: ${error.message}`));
            });

            // 设置超时
            setTimeout(() => {
                ffmpeg.kill();
                reject(new Error('Stream detection timeout'));
            }, 10000);
        });
    }

    static getRecommendedTranscodeOptions(streamInfo) {
        const options = {
            '-rtsp_transport': 'tcp',
            '-max_delay': '5000000',
            '-re': '',
            '-c:v': 'mpeg1video',
            '-b:v': '1000k',
            '-r': '30',
            '-s': '1280x720',
            '-f': 'mpegts',
            '-preset': 'ultrafast',
            '-tune': 'zerolatency',
            '-an': '',
            '-probesize': '100M',
            '-analyzeduration': '100M',
            '-stimeout': '5000000'
        };

        if (streamInfo && streamInfo.streams) {
            const videoStream = streamInfo.streams.find(stream => stream.codec_type === 'video');
            if (videoStream) {
                // 调整分辨率
                if (videoStream.width && videoStream.height) {
                    if (videoStream.width > 1920) {
                        options['-s'] = '1920x1080';
                    } else if (videoStream.width > 1280) {
                        options['-s'] = '1280x720';
                    } else if (videoStream.width > 854) {
                        options['-s'] = '854x480';
                    } else {
                        options['-s'] = `${videoStream.width}x${videoStream.height}`;
                    }
                }

                // 调整帧率
                if (videoStream.r_frame_rate) {
                    try {
                        const fps = eval(videoStream.r_frame_rate);
                        options['-r'] = Math.min(30, Math.round(fps));
                    } catch (e) {
                        console.warn('[StreamDetector] Failed to parse frame rate:', e);
                    }
                }

                // 根据编码类型调整参数
                if (videoStream.codec_name) {
                    console.log('[StreamDetector] Video codec:', videoStream.codec_name);
                    if (videoStream.codec_name === 'h265' || videoStream.codec_name === 'hevc') {
                        // 对于H.265编码，需要更强的转码参数
                        options['-b:v'] = '1500k';
                        options['-preset'] = 'superfast';
                    } else if (videoStream.codec_name === 'h264' || videoStream.codec_name === 'avc1') {
                        // 对于H.264编码，使用标准参数
                        options['-b:v'] = '1200k';
                    }
                }
            }
        }

        console.log('[StreamDetector] Recommended transcode options:', options);
        return options;
    }
}

module.exports = StreamDetector;