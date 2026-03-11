import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { READER_THEMES } from '../theme';

export interface EpubReaderHandle {
  nextPage: () => void;
  prevPage: () => void;
  setFontSize: (size: number) => void;
}

interface Props {
  uri: string;
  lastCfi?: string;
  fontSize: number;
  lineHeight: number;
  theme: 'dark' | 'sepia' | 'light';
  onLocationChange: (cfi: string, page: number, total: number) => void;
  onTap: () => void;
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
    #viewer { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; }
    #status { color: ${colors.fg}; font-family: sans-serif; font-size: 14px;
              position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 10; }
  </style>
</head>
<body>
  <div id="status">Loading EPUB...</div>
  <div id="viewer"></div>
  <script>
    var currentFontSize = ${fontSize};
    var currentLineHeight = ${lineHeight};
    var themeBg = '${colors.bg}';
    var themeFg = '${colors.fg}';

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
        var rendition = book.renderTo('viewer', {
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

        var lastCfi = ${lastCfi ? `'${lastCfi}'` : 'null'};
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
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'locationChange', cfi: cfi, page: page, total: total
          }));
        });

        rendition.on('click', function(e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();

          var width = window.innerWidth;
          var x = (e && typeof e.clientX === 'number') ? e.clientX : width / 2;

          if (x < width * 0.4) {
            rendition.prev();
          } else if (x > width * 0.6) {
            rendition.next();
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }));
          }
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
          } catch(err) {}
        });
      })
      .catch(function(err) {
        document.getElementById('status').textContent = 'Error: ' + (err.message || err);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error', message: err.message || 'EPUB load error'
        }));
      });
  </script>
</body>
</html>`;
}

export const EpubReader = forwardRef<EpubReaderHandle, Props>(
  ({ uri, lastCfi, fontSize, lineHeight, theme, onLocationChange, onTap }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [htmlUri, setHtmlUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const prevFontSize = useRef(fontSize);

    useImperativeHandle(ref, () => ({
      nextPage: () => {
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message', { data: '{"type":"next"}' })); true;`
        );
      },
      prevPage: () => {
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message', { data: '{"type":"prev"}' })); true;`
        );
      },
      setFontSize: (size: number) => {
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message', { data: '${JSON.stringify({ type: 'fontSize', size })}' })); true;`
        );
      },
    }));

    useEffect(() => {
      if (prevFontSize.current !== fontSize) {
        prevFontSize.current = fontSize;
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message', { data: '${JSON.stringify({ type: 'fontSize', size: fontSize })}' })); true;`
        );
      }
    }, [fontSize]);

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
