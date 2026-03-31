// RTSP Relay Browser Player
// 使用 jsmpeg 内置的 WebSocket 支持

(function () {
  var jsmpegReady = false;

  function loadJSMpeg() {
    return new Promise(function (resolve, reject) {
      if (window.JSMpeg && window.JSMpeg.Player) {
        console.log('[JSMpeg] Already available');
        resolve();
        return;
      }

      console.log('[JSMpeg] Loading from local file...');
      var script = document.createElement('script');
      var port = window.appConfig ? window.appConfig.PORT : 9999;
      script.src = `http://localhost:${port}/static/jsmpeg.min.js`;
      script.onload = function () {
        console.log('[JSMpeg] Loaded, Source:', window.JSMpeg.Source);
        resolve();
      };
      script.onerror = function (e) {
        console.error('[JSMpeg] Local file failed:', e);
        reject(e);
      };
      document.head.appendChild(script);
    });
  }

  window.loadPlayer = function (opts) {
    console.log('[loadPlayer] URL:', opts.url);

    if (!opts || !opts.url || !opts.canvas) {
      return Promise.reject(new Error('Invalid options'));
    }

    var canvas = opts.canvas;
    var originalDisplay = canvas.style.display;
    canvas.style.display = 'none';
    var lastRx = Date.now();
    var disconnectThreshold = opts.disconnectThreshold || 15000;
    var player = null;
    var monitorTimer = null;
    var reconnectTimeout = null;
    var reconnectAttempts = 0;
    var maxReconnectAttempts = opts.maxReconnectAttempts || 10;
    var isReconnecting = false;

    function cleanupPlayer() {
      if (player) {
        try { player.destroy(); } catch (e) { }
        player = null;
      }
    }

    function startMonitor() {
      stopMonitor();
      monitorTimer = setInterval(function () {
        if (isReconnecting) return;
        if (Date.now() - lastRx > disconnectThreshold) {
          console.log('[loadPlayer] Data timeout, reconnecting...');
          reconnect();
        }
      }, 3000);
    }

    function stopMonitor() {
      if (monitorTimer) {
        clearInterval(monitorTimer);
        monitorTimer = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    }

    function reconnect() {
      if (isReconnecting) return;
      isReconnecting = true;
      stopMonitor();

      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('[loadPlayer] Max reconnect attempts reached');
        isReconnecting = false;
        if (opts.onDisconnect) opts.onDisconnect(null);
        return;
      }

      reconnectAttempts++;
      console.log('[loadPlayer] Reconnecting... attempt ' + reconnectAttempts);

      cleanupPlayer();

      reconnectTimeout = setTimeout(function () {
        loadJSMpeg().then(function () {
          try {
            player = new window.JSMpeg.Player(opts.url, {
              canvas: canvas,
              disableWebGL: true,
              disableGl: true,
              preserveDrawingBuffer: true,
              audio: false,
              videoBufferSize: 2 * 1024 * 1024,
              onVideoDecode: function () {
                lastRx = Date.now();
                if (canvas.style.display === 'none') {
                  canvas.style.display = originalDisplay;
                }
              },
              onSourceEstablished: function () {
                console.log('[loadPlayer] Source established');
                canvas.style.display = originalDisplay;
                reconnectAttempts = 0;
              },
              onPlay: function () {
                console.log('[loadPlayer] Playing');
              },
              onSourceClose: function () {
                console.log('[loadPlayer] Source closed');
                isReconnecting = false;
                reconnect();
              }
            });
            startMonitor();
          } catch (e) {
            console.error('[loadPlayer] Reconnect error:', e);
            isReconnecting = false;
            startMonitor();
          }
        }).catch(function (e) {
          isReconnecting = false;
          startMonitor();
        });
      }, 2000);
    }

    return loadJSMpeg().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          console.log('[loadPlayer] Creating JSMpeg player...');

          player = new window.JSMpeg.Player(opts.url, {
            canvas: canvas,
            disableWebGL: true,
            disableGl: true,
            preserveDrawingBuffer: true,
            audio: false,
            videoBufferSize: 2 * 1024 * 1024,
            onVideoDecode: function () {
              lastRx = Date.now();
              if (canvas.style.display === 'none') {
                canvas.style.display = originalDisplay;
              }
            },
            onSourceEstablished: function () {
              console.log('[loadPlayer] Source established');
              canvas.style.display = originalDisplay;
            },
            onPlay: function () {
              console.log('[loadPlayer] Playing');
            },
            onSourceClose: function () {
              console.log('[loadPlayer] Source closed by server');
              reconnect();
            }
          });

          startMonitor();

          setTimeout(function () {
            canvas.style.display = originalDisplay;
          }, 3000);

          resolve({
            player: player,
            destroy: function () {
              stopMonitor();
              cleanupPlayer();
            }
          });
        } catch (e) {
          console.error('[loadPlayer] Error:', e);
          reject(e);
        }
      });
    });
  };
})();
