import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { READER_THEMES } from '../theme';

export interface EpubReaderHandle {
  nextPage: () => void;
  prevPage: () => void;
  setFontSize: (size: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  panBy: (dx: number, dy: number) => void;
  extractText: () => Promise<string>;
}

interface Props {
  uri: string;
  lastCfi?: string;
  fontSize: number;
  lineHeight: number;
  theme: 'dark' | 'sepia' | 'light';
  onLocationChange: (cfi: string, page: number, total: number) => void;
  onTap: () => void;
  onZoomChange: (zoomed: boolean) => void;
}

function generateHtml(
  bookFileUri: string,
  lastCfi: string | undefined,
  fontSize: number,
  lineHeight: number,
  theme: 'dark' | 'sepia' | 'light'
): string {
  const colors = READER_THEMES[theme];
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.88/dist/epub.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100vw; height: 100vh; overflow: hidden; background: ${colors.bg}; }
    #viewer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      transform-origin: top left;
      will-change: transform;
    }
    #status { color: ${colors.fg}; font-family: sans-serif; font-size: 14px;
              position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 10; }
  </style>
</head>
<body>
  <div id="status">Loading EPUB...</div>
  <div id="viewer"></div>
  <script>
    var viewerEl = document.getElementById('viewer');
    var currentFontSize = ${fontSize};
    var currentLineHeight = ${lineHeight};
    var themeBg = '${colors.bg}';
    var themeFg = '${colors.fg}';
    var rendition = null;
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
        width: window.innerWidth,
        height: window.innerHeight
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
        panX = 0;
        panY = 0;
      } else {
        var clampedPan = clampPan(panX, panY, zoomScale);
        panX = clampedPan.x;
        panY = clampedPan.y;
      }

      viewerEl.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoomScale + ')';

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

    function bindPanHandlers(contents) {
      var doc = contents && contents.document;
      if (!doc || doc.documentElement.getAttribute('data-zoom-pan-bound') === 'true') {
        return;
      }

      doc.documentElement.setAttribute('data-zoom-pan-bound', 'true');

      var dragPoint = null;
      function stopDrag() {
        dragPoint = null;
      }

      doc.addEventListener('touchstart', function(evt) {
        if (zoomScale <= 1.001 || !evt.touches || evt.touches.length !== 1) return;
        var touch = evt.touches[0];
        dragPoint = { x: touch.clientX, y: touch.clientY };
        evt.preventDefault();
      }, { passive: false, capture: true });

      doc.addEventListener('touchmove', function(evt) {
        if (!dragPoint || zoomScale <= 1.001 || !evt.touches || evt.touches.length !== 1) return;
        var touch = evt.touches[0];
        panBy(touch.clientX - dragPoint.x, touch.clientY - dragPoint.y);
        dragPoint = { x: touch.clientX, y: touch.clientY };
        evt.preventDefault();
      }, { passive: false, capture: true });

      doc.addEventListener('touchend', stopDrag, { capture: true });
      doc.addEventListener('touchcancel', stopDrag, { capture: true });

      doc.addEventListener('click', function(evt) {
        if (zoomScale <= 1.001) return;
        evt.preventDefault();
        evt.stopPropagation();
      }, true);
    }

    // Load EPUB from file URI via XHR (fetch doesn't support file://)
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
        document.getElementById('status').style.display = 'none';

        var book = ePub(data);
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        rendition = book.renderTo('viewer', {
          flow: 'paginated',
          spread: 'none',
          width: vw,
          height: vh
        });

        function applyTheme() {
          rendition.themes.default({
            body: {
              background: themeBg + ' !important',
              color: themeFg + ' !important',
              'font-size': currentFontSize + 'px !important',
              'line-height': currentLineHeight + ' !important'
            },
            p: { 'font-size': currentFontSize + 'px !important' },
            span: { 'font-size': 'inherit !important' },
            div: { 'font-size': currentFontSize + 'px !important' }
          });
        }

        applyTheme();
        rendition.hooks.content.register(function(contents) {
          bindPanHandlers(contents);
        });

        var lastCfi = ${JSON.stringify(lastCfi ?? null)};
        if (lastCfi) {
          rendition.display(lastCfi);
        } else {
          rendition.display();
        }

        var totalPages = 0;
        book.ready.then(function() {
          return book.locations.generate(1600);
        }).then(function(locations) {
          totalPages = locations.length;
        });

        rendition.on('relocated', function(location) {
          var page = 0;
          if (location.start && location.start.location !== undefined) {
            page = location.start.location;
          }
          var cfi = location.start ? location.start.cfi : '';
          var total = totalPages || 1;
          postToNative({
            type: 'locationChange', cfi: cfi, page: page, total: total
          });
        });

        rendition.on('click', function(e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          if (zoomScale > 1.001) return;

          var width = window.innerWidth;
          var x = (e && typeof e.clientX === 'number') ? e.clientX : width / 2;

          if (x < width * 0.4) {
            rendition.prev();
          } else if (x > width * 0.6) {
            rendition.next();
          } else {
            postToNative({ type: 'tap' });
          }
        });

        window.addEventListener('resize', function() {
          if (rendition) {
            rendition.resize(window.innerWidth, window.innerHeight);
          }
          applyTransform(false);
        });

        window.addEventListener('message', function(e) {
          try {
            var msg = JSON.parse(e.data);
            if (msg.type === 'next') rendition.next();
            if (msg.type === 'prev') rendition.prev();
            if (msg.type === 'fontSize') {
              currentFontSize = msg.size;
              applyTheme();
            }
            if (msg.type === 'zoomIn') setZoom(zoomScale + 0.4);
            if (msg.type === 'zoomOut') setZoom(zoomScale - 0.4);
            if (msg.type === 'resetZoom') setZoom(1);
            if (msg.type === 'pan') panBy(msg.dx || 0, msg.dy || 0);
            if (msg.type === 'extractText') {
              if (!book || !book.spine || !book.spine.spineItems) {
                postToNative({ type: 'textContent', text: '' });
                return;
              }
              var allTexts = [];
              var items = book.spine.spineItems;
              var idx = 0;
              function extractNext() {
                if (idx >= items.length) {
                  postToNative({ type: 'textContent', text: allTexts.join('\\n\\n') });
                  return;
                }
                var item = items[idx];
                idx++;
                item.load(book.load.bind(book))
                  .then(function(contents) {
                    var txt = '';
                    try {
                      if (contents) {
                        // epub.js 0.3.88 resolves with xml.documentElement (the <html> Element),
                        // not a Document — so contents.body is undefined. Find the body child.
                        var body = contents.body
                          || (contents.querySelector && contents.querySelector('body'))
                          || (contents.getElementsByTagName && contents.getElementsByTagName('body')[0]);
                        var target = body || contents;
                        txt = target.textContent || '';
                      }
                    } catch(ex) {}
                    if (txt.trim()) allTexts.push(txt.trim());
                    try { item.unload(); } catch(ex) {}
                    extractNext();
                  })
                  .catch(function() { extractNext(); });
              }
              extractNext();
            }
          } catch(err) {}
        });
      })
      .catch(function(err) {
        document.getElementById('status').textContent = 'Error: ' + (err.message || err);
        postToNative({
          type: 'error', message: err.message || 'EPUB load error'
        });
      });
  </script>
</body>
</html>`;
}

export const EpubReader = forwardRef<EpubReaderHandle, Props>(
  ({ uri, lastCfi, fontSize, lineHeight, theme, onLocationChange, onTap, onZoomChange }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [htmlUri, setHtmlUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const prevFontSize = useRef(fontSize);
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
      setFontSize: (size: number) => {
        sendMessage({ type: 'fontSize', size });
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
      if (prevFontSize.current !== fontSize) {
        prevFontSize.current = fontSize;
        sendMessage({ type: 'fontSize', size: fontSize });
      }
    }, [fontSize, sendMessage]);

    useEffect(() => {
      (async () => {
        try {
          const bookFileUri = uri.startsWith('file://') ? uri : 'file://' + uri;
          const html = generateHtml(bookFileUri, lastCfi, fontSize, lineHeight, theme);
          const htmlPath = FileSystem.cacheDirectory + 'epub_viewer.html';
          await FileSystem.writeAsStringAsync(htmlPath, html);
          setHtmlUri(htmlPath);
        } catch (err) {
          console.error('Failed to prepare EPUB viewer:', err);
        }
      })();
    }, []);

    const handleMessage = (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'locationChange') {
          onLocationChange(msg.cfi, msg.page, msg.total);
        } else if (msg.type === 'tap') {
          onTap();
        } else if (msg.type === 'zoomChange') {
          onZoomChange(msg.zoomed);
        } else if (msg.type === 'textContent') {
          if (textResolveRef.current) {
            textResolveRef.current(msg.text || '');
            textResolveRef.current = null;
          }
        } else if (msg.type === 'error') {
          console.error('[EPUB Error]', msg.message);
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
