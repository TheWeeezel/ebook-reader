import React, { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { READER_THEMES } from '../theme';

export interface PdfReaderHandle {
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
}

interface Props {
  uri: string;
  initialPage: number;
  theme: 'dark' | 'sepia' | 'light';
  onPageChange: (page: number, total: number) => void;
  onTap: () => void;
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
      display: flex; justify-content: center; align-items: center;
    }
    canvas { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
    #status { color: ${colors.fg}; font-family: sans-serif; font-size: 14px; position: absolute; }
  </style>
</head>
<body>
  <div id="status">Loading PDF...</div>
  <canvas id="pdfCanvas" style="display:none"></canvas>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    var pdfDoc = null;
    var currentPage = ${initialPage + 1};
    var totalPages = 0;
    var rendering = false;
    var pendingPage = null;

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
        canvas.style.width = (viewport.width / dpr) + 'px';
        canvas.style.height = (viewport.height / dpr) + 'px';
        page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function() {
          rendering = false;
          if (pendingPage !== null) {
            var p = pendingPage;
            pendingPage = null;
            renderPage(p);
          }
        });
      });
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pageChange', page: num - 1, total: totalPages
      }));
    }

    // Load PDF from file URI
    fetch('${bookFileUri}')
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(data) {
        return pdfjsLib.getDocument({ data: data }).promise;
      })
      .then(function(pdf) {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        if (currentPage > totalPages) currentPage = 1;
        document.getElementById('status').style.display = 'none';
        document.getElementById('pdfCanvas').style.display = 'block';
        renderPage(currentPage);
      })
      .catch(function(err) {
        document.getElementById('status').textContent = 'Error: ' + (err.message || err);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error', message: err.message || 'PDF load error'
        }));
      });

    document.body.addEventListener('click', function(e) {
      var w = window.innerWidth;
      var x = e.clientX;
      if (x < w * 0.25) {
        if (currentPage > 1) { currentPage--; renderPage(currentPage); }
      } else if (x > w * 0.75) {
        if (currentPage < totalPages) { currentPage++; renderPage(currentPage); }
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }));
      }
    });

    window.addEventListener('message', function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === 'next' && currentPage < totalPages) { currentPage++; renderPage(currentPage); }
        if (msg.type === 'prev' && currentPage > 1) { currentPage--; renderPage(currentPage); }
        if (msg.type === 'goToPage' && msg.page >= 1 && msg.page <= totalPages) { currentPage = msg.page; renderPage(currentPage); }
      } catch(err) {}
    });
  </script>
</body>
</html>`;
}

export const PdfReader = forwardRef<PdfReaderHandle, Props>(
  ({ uri, initialPage, theme, onPageChange, onTap }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [htmlUri, setHtmlUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

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
      goToPage: (page: number) => {
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message', { data: '${JSON.stringify({ type: 'goToPage', page: page + 1 })}' })); true;`
        );
      },
    }));

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
