import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { READER_THEMES } from '../theme';

export interface PdfReaderHandle {
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  panBy: (dx: number, dy: number) => void;
  extractText: () => Promise<string>;
}

interface Props {
  uri: string;
  initialPage: number;
  theme: 'dark' | 'sepia' | 'light';
  onPageChange: (page: number, total: number) => void;
  onTap: () => void;
  onZoomChange: (zoomed: boolean) => void;
}

function generateHtml(bookFileUri: string, initialPage: number, theme: 'dark' | 'sepia' | 'light'): string {
  const colors = READER_THEMES[theme];
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
  <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: ${colors.bg};
    }
    #viewport {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    #pageLayer {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: top left;
      will-change: transform;
    }
    canvas { display: block; }
    #status {
      color: ${colors.fg};
      font-family: sans-serif;
      font-size: 14px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1;
    }
  </style>
</head>
<body>
  <div id="viewport">
    <div id="status">Loading PDF...</div>
    <div id="pageLayer" style="display:none">
      <canvas id="pdfCanvas"></canvas>
    </div>
  </div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    var viewportEl = document.getElementById('viewport');
    var pageLayerEl = document.getElementById('pageLayer');
    var pdfDoc = null;
    var currentPage = ${initialPage + 1};
    var totalPages = 0;
    var rendering = false;
    var pendingPage = null;
    var contentWidth = 0;
    var contentHeight = 0;
    var zoomScale = 1;
    var panX = 0;
    var panY = 0;
    var zoomActive = false;
    var minZoom = 1;
    var maxZoom = 4;

    function postToNative(payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function getBaseSize() {
      return {
        width: contentWidth || window.innerWidth,
        height: contentHeight || window.innerHeight
      };
    }

    function getPanBounds(scale) {
      var base = getBaseSize();
      var viewportWidth = window.innerWidth;
      var viewportHeight = window.innerHeight;
      var scaledWidth = base.width * scale;
      var scaledHeight = base.height * scale;
      var minX = scaledWidth <= viewportWidth ? Math.round((viewportWidth - scaledWidth) / 2) : viewportWidth - scaledWidth;
      var maxX = scaledWidth <= viewportWidth ? minX : 0;
      var minY = scaledHeight <= viewportHeight ? Math.round((viewportHeight - scaledHeight) / 2) : viewportHeight - scaledHeight;
      var maxY = scaledHeight <= viewportHeight ? minY : 0;
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    function clampPan(nextX, nextY, scale) {
      var bounds = getPanBounds(scale);
      return {
        x: clamp(nextX, bounds.minX, bounds.maxX),
        y: clamp(nextY, bounds.minY, bounds.maxY)
      };
    }

    function centerZoom(scale) {
      var bounds = getPanBounds(scale);
      panX = Math.round((bounds.minX + bounds.maxX) / 2);
      panY = Math.round((bounds.minY + bounds.maxY) / 2);
    }

    function applyTransform(emitChange) {
      if (zoomScale <= 1.001) {
        zoomScale = 1;
      }

      var clampedPan = clampPan(panX, panY, zoomScale);
      panX = clampedPan.x;
      panY = clampedPan.y;
      pageLayerEl.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoomScale + ')';

      var nextZoomActive = zoomScale > 1;
      if (emitChange && nextZoomActive !== zoomActive) {
        postToNative({ type: 'zoomChange', zoomed: nextZoomActive, scale: zoomScale });
      }
      zoomActive = nextZoomActive;
    }

    function setZoom(nextScale) {
      var wasZoomed = zoomScale > 1.001;
      zoomScale = clamp(Math.round(nextScale * 100) / 100, minZoom, maxZoom);
      if (zoomScale > 1 && !wasZoomed) {
        centerZoom(zoomScale);
      }
      applyTransform(true);
    }

    function panBy(dx, dy) {
      if (zoomScale <= 1.001) return;
      var clampedPan = clampPan(panX + dx, panY + dy, zoomScale);
      panX = clampedPan.x;
      panY = clampedPan.y;
      applyTransform(false);
    }

    function renderPage(num) {
      if (rendering) { pendingPage = num; return; }
      rendering = true;
      pdfDoc.getPage(num).then(function(page) {
        var canvas = document.getElementById('pdfCanvas');
        var ctx = canvas.getContext('2d');
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var unscaledViewport = page.getViewport({ scale: 1 });
        var scale = Math.min(vw / unscaledViewport.width, vh / unscaledViewport.height);
        var dpr = window.devicePixelRatio || 1;
        var viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        contentWidth = viewport.width / dpr;
        contentHeight = viewport.height / dpr;
        canvas.style.width = contentWidth + 'px';
        canvas.style.height = contentHeight + 'px';
        pageLayerEl.style.width = contentWidth + 'px';
        pageLayerEl.style.height = contentHeight + 'px';
        applyTransform(false);
        page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function() {
          rendering = false;
          if (pendingPage !== null) {
            var p = pendingPage;
            pendingPage = null;
            renderPage(p);
          }
        });
      });
      postToNative({
        type: 'pageChange', page: num - 1, total: totalPages
      });
    }

    // Load PDF from file URI via XHR (fetch doesn't support file://)
    function loadFile(url) {
      return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function() { resolve(xhr.response); };
        xhr.onerror = function() { reject(new Error('XHR failed for ' + url)); };
        xhr.send();
      });
    }

    loadFile('${bookFileUri}')
      .then(function(data) {
        return pdfjsLib.getDocument({ data: data }).promise;
      })
      .then(function(pdf) {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        if (currentPage > totalPages) currentPage = 1;
        document.getElementById('status').style.display = 'none';
        pageLayerEl.style.display = 'block';
        renderPage(currentPage);
      })
      .catch(function(err) {
        document.getElementById('status').textContent = 'Error: ' + (err.message || err);
        postToNative({
          type: 'error', message: err.message || 'PDF load error'
        });
      });

    var dragPoint = null;
    function stopDrag() {
      dragPoint = null;
    }

    viewportEl.addEventListener('touchstart', function(evt) {
      if (zoomScale <= 1.001 || !evt.touches || evt.touches.length !== 1) return;
      var touch = evt.touches[0];
      dragPoint = { x: touch.clientX, y: touch.clientY };
      evt.preventDefault();
    }, { passive: false });

    viewportEl.addEventListener('touchmove', function(evt) {
      if (!dragPoint || zoomScale <= 1.001 || !evt.touches || evt.touches.length !== 1) return;
      var touch = evt.touches[0];
      panBy(touch.clientX - dragPoint.x, touch.clientY - dragPoint.y);
      dragPoint = { x: touch.clientX, y: touch.clientY };
      evt.preventDefault();
    }, { passive: false });

    viewportEl.addEventListener('touchend', stopDrag);
    viewportEl.addEventListener('touchcancel', stopDrag);

    document.body.addEventListener('click', function(e) {
      if (zoomScale > 1.001) return;
      var w = window.innerWidth;
      var x = e.clientX;
      if (x < w * 0.4) {
        if (currentPage > 1) { currentPage--; renderPage(currentPage); }
      } else if (x > w * 0.6) {
        if (currentPage < totalPages) { currentPage++; renderPage(currentPage); }
      } else {
        postToNative({ type: 'tap' });
      }
    });

    window.addEventListener('resize', function() {
      if (pdfDoc) {
        renderPage(currentPage);
      }
    });

    window.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'next' && currentPage < totalPages) { currentPage++; renderPage(currentPage); }
        if (msg.type === 'prev' && currentPage > 1) { currentPage--; renderPage(currentPage); }
        if (msg.type === 'goToPage' && msg.page >= 1 && msg.page <= totalPages) { currentPage = msg.page; renderPage(currentPage); }
        if (msg.type === 'zoomIn') setZoom(zoomScale + 0.4);
        if (msg.type === 'zoomOut') setZoom(zoomScale - 0.4);
        if (msg.type === 'resetZoom') setZoom(1);
        if (msg.type === 'pan') panBy(msg.dx || 0, msg.dy || 0);
        if (msg.type === 'extractText') {
          if (!pdfDoc) {
            postToNative({ type: 'textContent', text: '' });
            return;
          }
          // Walk pages one at a time and release each before moving on, so
          // large PDFs don't keep every page object alive at once.
          var pageTexts = [];
          var pi = 1;
          function extractPage() {
            if (pi > totalPages) {
              postToNative({ type: 'textContent', text: pageTexts.join('\\n\\n') });
              return;
            }
            var pageNum = pi++;
            pdfDoc.getPage(pageNum).then(function(page) {
              return page.getTextContent().then(function(tc) {
                var text = tc.items.map(function(item) { return item.str; }).join(' ');
                try { page.cleanup(); } catch(ex) {}
                return text;
              });
            }).then(function(text) {
              if (text) pageTexts.push(text);
              extractPage();
            }).catch(function() {
              extractPage();
            });
          }
          extractPage();
        }
      } catch(err) {}
    });
  </script>
</body>
</html>`;
}

export const PdfReader = forwardRef<PdfReaderHandle, Props>(
  ({ uri, initialPage, theme, onPageChange, onTap, onZoomChange }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [htmlUri, setHtmlUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const textResolveRef = useRef<((text: string) => void) | null>(null);

    const sendMessage = useCallback((message: object) => {
      const payload = JSON.stringify(message);
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(payload)} })); true;`
      );
    }, []);

    useImperativeHandle(ref, () => ({
      nextPage: () => {
        sendMessage({ type: 'next' });
      },
      prevPage: () => {
        sendMessage({ type: 'prev' });
      },
      goToPage: (page: number) => {
        sendMessage({ type: 'goToPage', page: page + 1 });
      },
      zoomIn: () => {
        sendMessage({ type: 'zoomIn' });
      },
      zoomOut: () => {
        sendMessage({ type: 'zoomOut' });
      },
      resetZoom: () => {
        sendMessage({ type: 'resetZoom' });
      },
      panBy: (dx: number, dy: number) => {
        sendMessage({ type: 'pan', dx, dy });
      },
      extractText: () => {
        return new Promise<string>((resolve) => {
          textResolveRef.current = resolve;
          sendMessage({ type: 'extractText' });
          setTimeout(() => {
            if (textResolveRef.current === resolve) {
              textResolveRef.current = null;
              resolve('');
            }
          }, 60000);
        });
      },
    }), [sendMessage]);

    useEffect(() => {
      (async () => {
        try {
          const bookFileUri = uri.startsWith('file://') ? uri : 'file://' + uri;
          const html = generateHtml(bookFileUri, initialPage, theme);
          const htmlPath = FileSystem.cacheDirectory + 'pdf_viewer.html';
          await FileSystem.writeAsStringAsync(htmlPath, html);
          setHtmlUri(htmlPath);
        } catch (err) {
          console.error('Failed to prepare PDF viewer:', err);
        }
      })();
    }, []);

    const handleMessage = (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'pageChange') {
          onPageChange(msg.page, msg.total);
        } else if (msg.type === 'tap') {
          onTap();
        } else if (msg.type === 'zoomChange') {
          onZoomChange(msg.zoomed);
        } else if (msg.type === 'textContent') {
          if (textResolveRef.current) {
            textResolveRef.current(msg.text || '');
            textResolveRef.current = null;
          }
        }
      } catch {}
    };

    if (!htmlUri) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#1a1a1a" />
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#1a1a1a" />
          </View>
        )}
        <WebView
          ref={webViewRef}
          source={{ uri: htmlUri }}
          originWhitelist={['*']}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          mixedContentMode="always"
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          onMessage={handleMessage}
          onLoadEnd={() => setLoading(false)}
          style={styles.webview}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    zIndex: 10,
  },
});
