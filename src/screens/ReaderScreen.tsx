import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system';
import { useAppStore } from '../store/appStore';
import { EpubReader, EpubReaderHandle } from '../components/EpubReader';
import { PdfReader, PdfReaderHandle } from '../components/PdfReader';
import { Notepad } from '../components/Notepad';
import { AiPromptModal } from '../components/AiPromptModal';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { colors, READER_THEMES } from '../theme';

export function ReaderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentBook = useAppStore((s) => s.currentBook);
  const settings = useAppStore((s) => s.settings);
  const updateBookProgress = useAppStore((s) => s.updateBookProgress);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const addNote = useAppStore((s) => s.addNote);

  const [menuVisible, setMenuVisible] = useState(false);
  const [notepadVisible, setNotepadVisible] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(currentBook?.lastPage || 0);
  const [totalPages, setTotalPages] = useState(currentBook?.totalPages || 0);
  const [currentCfi, setCurrentCfi] = useState(currentBook?.lastCfi);
  const [isZoomed, setIsZoomed] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const epubRef = useRef<EpubReaderHandle>(null);
  const pdfRef = useRef<PdfReaderHandle>(null);

  useEffect(() => {
    if (settings.keepScreenAwake) {
      activateKeepAwakeAsync();
    }
    return () => {
      deactivateKeepAwake();
    };
  }, [settings.keepScreenAwake]);

  useEffect(() => {
    setIsZoomed(false);
  }, [currentBook?.id]);

  const hideMenu = useCallback(() => {
    setMenuVisible((prev) => {
      if (!prev) return prev;
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return false;
    });
  }, [fadeAnim]);

  const toggleMenu = useCallback(() => {
    setMenuVisible((prev) => {
      Animated.timing(fadeAnim, {
        toValue: prev ? 0 : 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return !prev;
    });
  }, [fadeAnim]);

  const goNext = useCallback(() => {
    if (!currentBook) return;
    if (currentBook.type === 'epub') {
      epubRef.current?.nextPage();
    } else if (currentBook.type === 'pdf') {
      pdfRef.current?.nextPage();
    }
  }, [currentBook]);

  const goPrev = useCallback(() => {
    if (!currentBook) return;
    if (currentBook.type === 'epub') {
      epubRef.current?.prevPage();
    } else if (currentBook.type === 'pdf') {
      pdfRef.current?.prevPage();
    }
  }, [currentBook]);

  const openNotes = useCallback(() => {
    setNotepadVisible(true);
  }, []);

  const openAi = useCallback(() => {
    setAiModalVisible(true);
  }, []);

  const handleExtractText = useCallback(async (): Promise<string> => {
    if (!currentBook) return '';
    if (currentBook.type === 'epub') {
      return epubRef.current?.extractText() ?? '';
    }
    if (currentBook.type === 'pdf') {
      return pdfRef.current?.extractText() ?? '';
    }
    if (currentBook.type === 'txt') {
      try {
        return await FileSystem.readAsStringAsync(currentBook.uri);
      } catch {
        return '';
      }
    }
    return '';
  }, [currentBook]);

  const handleAiSaveAsNote = useCallback(
    async (text: string) => {
      if (!currentBook) return;
      await addNote({
        bookId: currentBook.id,
        text,
        page: currentPage,
        cfi: currentCfi,
      });
    },
    [currentBook, currentPage, currentCfi, addNote]
  );

  const canZoom = currentBook?.type === 'epub' || currentBook?.type === 'pdf';

  const handleZoomChange = useCallback(
    (zoomed: boolean) => {
      setIsZoomed(zoomed);
      if (zoomed) {
        hideMenu();
      }
    },
    [hideMenu]
  );

  const handleZoomIn = useCallback(() => {
    hideMenu();
    if (!currentBook) return;
    if (currentBook.type === 'epub') {
      epubRef.current?.zoomIn();
    } else if (currentBook.type === 'pdf') {
      pdfRef.current?.zoomIn();
    }
  }, [currentBook, hideMenu]);

  const handleZoomOut = useCallback(() => {
    if (!currentBook) return;
    if (currentBook.type === 'epub') {
      epubRef.current?.zoomOut();
    } else if (currentBook.type === 'pdf') {
      pdfRef.current?.zoomOut();
    }
  }, [currentBook]);

  const handleResetZoom = useCallback(() => {
    if (!currentBook) return;
    if (currentBook.type === 'epub') {
      epubRef.current?.resetZoom();
    } else if (currentBook.type === 'pdf') {
      pdfRef.current?.resetZoom();
    }
  }, [currentBook]);

  const handlePan = useCallback(
    (dx: number, dy: number) => {
      if (!currentBook) return;
      if (currentBook.type === 'epub') {
        epubRef.current?.panBy(dx, dy);
      } else if (currentBook.type === 'pdf') {
        pdfRef.current?.panBy(dx, dy);
      }
    },
    [currentBook]
  );

  const { inputRef, handleKeyPress, handleRefocus } = useKeyboardControls({
    onNextPage: goNext,
    onPrevPage: goPrev,
    onOpenNotes: openNotes,
    onToggleMenu: toggleMenu,
    enabled: !notepadVisible && !aiModalVisible && !isZoomed,
  });

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.min(32, Math.max(18, settings.fontSize + delta));
    updateSettings({ fontSize: newSize });
    if (currentBook?.type === 'epub') {
      epubRef.current?.setFontSize(newSize);
    }
  };

  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const readerTheme = READER_THEMES[settings.theme];
  const shouldShowTapZones = !menuVisible && !notepadVisible && !isZoomed;

  if (!currentBook) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <StatusBar hidden />
        <Ionicons name="alert-circle-outline" size={48} color={colors.textDim} />
        <Text style={styles.errorText}>Kein Buch ausgewählt</Text>
        <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()}>
          <Text style={styles.errorBtnText}>Zurück zur Bibliothek</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: readerTheme.bg }]}>
      <StatusBar hidden />

      {/* Hidden TextInput for keyboard capture */}
      {!notepadVisible && !aiModalVisible && (
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          autoFocus
          showSoftInputOnFocus={false}
          onKeyPress={(e) => handleKeyPress(e.nativeEvent.key)}
          onBlur={handleRefocus}
          caretHidden
          contextMenuHidden
        />
      )}

      {/* PDF Reader */}
      {currentBook.type === 'pdf' && (
        <PdfReader
          ref={pdfRef}
          uri={currentBook.uri}
          initialPage={currentPage}
          theme={settings.theme}
          onPageChange={(page, total) => {
            setCurrentPage(page);
            setTotalPages(total);
            updateBookProgress(currentBook.id, page, undefined, total);
          }}
          onTap={toggleMenu}
          onZoomChange={handleZoomChange}
        />
      )}

      {/* EPUB Reader */}
      {currentBook.type === 'epub' && (
        <EpubReader
          ref={epubRef}
          uri={currentBook.uri}
          lastCfi={currentBook.lastCfi}
          fontSize={settings.fontSize}
          lineHeight={settings.lineHeight}
          theme={settings.theme}
          onLocationChange={(cfi, page, total) => {
            setCurrentPage(page);
            setTotalPages(total);
            setCurrentCfi(cfi);
            updateBookProgress(currentBook.id, page, cfi, total);
          }}
          onTap={toggleMenu}
          onZoomChange={handleZoomChange}
        />
      )}

      {/* TXT Reader */}
      {currentBook.type === 'txt' && (
        <TxtReader
          uri={currentBook.uri}
          fontSize={settings.fontSize}
          lineHeight={settings.lineHeight}
          theme={settings.theme}
          topInset={insets.top}
        />
      )}

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {shouldShowTapZones && (
        <View style={styles.tapZones}>
          <TouchableOpacity style={[styles.tapZone, styles.tapZoneLeft]} onPress={goPrev} activeOpacity={1} />
          <TouchableOpacity style={[styles.tapZone, styles.tapZoneCenter]} onPress={toggleMenu} activeOpacity={1} />
          <TouchableOpacity style={[styles.tapZone, styles.tapZoneRight]} onPress={goNext} activeOpacity={1} />
        </View>
      )}

      {isZoomed && (
        <View
          style={[
            styles.zoomControls,
            {
              right: 16,
              bottom: Math.max(insets.bottom, 12) + 16,
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.zoomRail}>
            <TouchableOpacity onPress={handleZoomIn} style={styles.zoomBtn}>
              <Ionicons name="add" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleZoomOut} style={styles.zoomBtn}>
              <Ionicons name="remove" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleResetZoom} style={styles.zoomBtn}>
              <Ionicons name="contract-outline" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.panPad}>
            <View style={styles.panRow}>
              <View style={styles.panSpacer} />
              <TouchableOpacity onPress={() => handlePan(0, 96)} style={styles.zoomBtn}>
                <Ionicons name="chevron-up" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.panSpacer} />
            </View>

            <View style={styles.panRow}>
              <TouchableOpacity onPress={() => handlePan(96, 0)} style={styles.zoomBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.panCenter} />
              <TouchableOpacity onPress={() => handlePan(-96, 0)} style={styles.zoomBtn}>
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.panRow}>
              <View style={styles.panSpacer} />
              <TouchableOpacity onPress={() => handlePan(0, -96)} style={styles.zoomBtn}>
                <Ionicons name="chevron-down" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.panSpacer} />
            </View>
          </View>
        </View>
      )}

      {/* Overlay Menu */}
      <Animated.View
        style={[styles.overlay, { opacity: fadeAnim }]}
        pointerEvents={menuVisible ? 'auto' : 'none'}
      >
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
          <TouchableOpacity onPress={toggleMenu} style={styles.iconBtn}>
            <Ionicons name="chevron-up" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>
            {currentBook.title}
          </Text>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Bottom toolbar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          {/* Page info */}
          <Text style={styles.pageInfo}>
            {currentPage + 1} / {totalPages || '?'}
            {totalPages > 0 ? `  ·  ${progress}%` : ''}
          </Text>

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={goPrev} style={styles.actionBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleFontSizeChange(-2)} style={styles.actionBtn}>
              <Text style={styles.fontLabel}>A-</Text>
            </TouchableOpacity>

            <Text style={styles.fontSizeInfo}>{settings.fontSize}px</Text>

            <TouchableOpacity onPress={() => handleFontSizeChange(2)} style={styles.actionBtn}>
              <Text style={[styles.fontLabel, { fontSize: 16, fontWeight: '700' }]}>A+</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={openNotes} style={styles.actionBtn}>
              <Ionicons name="document-text-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity onPress={openAi} style={styles.actionBtn}>
              <Ionicons name="sparkles-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            {canZoom && (
              <TouchableOpacity onPress={handleZoomIn} style={styles.actionBtn}>
                <Ionicons name="search-outline" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={goNext} style={styles.actionBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Notepad Modal */}
      <Notepad
        visible={notepadVisible}
        onClose={() => setNotepadVisible(false)}
        bookId={currentBook.id}
        bookTitle={currentBook.title}
        currentPage={currentPage}
        currentCfi={currentCfi}
      />

      {/* AI Assistant Modal */}
      <AiPromptModal
        visible={aiModalVisible}
        onClose={() => setAiModalVisible(false)}
        onSaveAsNote={handleAiSaveAsNote}
        onExtractText={handleExtractText}
        bookTitle={currentBook.title}
      />
    </View>
  );
}

/** Simple TXT file reader using ScrollView */
function TxtReader({
  uri,
  fontSize,
  lineHeight,
  theme,
  topInset,
}: {
  uri: string;
  fontSize: number;
  lineHeight: number;
  theme: 'dark' | 'sepia' | 'light';
  topInset: number;
}) {
  const [content, setContent] = React.useState('');
  const readerColors = READER_THEMES[theme];

  React.useEffect(() => {
    (async () => {
      try {
        const text = await FileSystem.readAsStringAsync(uri);
        setContent(text);
      } catch {
        setContent('Fehler beim Laden der Datei.');
      }
    })();
  }, [uri]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: readerColors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: topInset + 20 }}
    >
      <Text style={{ color: readerColors.fg, fontSize, lineHeight: fontSize * lineHeight }}>
        {content}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: -10,
    zIndex: 100,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.progressTrack,
    zIndex: 20,
  },
  progressFill: { height: 2, backgroundColor: colors.textPrimary },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapZone: { justifyContent: 'center' },
  tapZoneLeft: {
    flex: 4,
  },
  tapZoneCenter: { flex: 2 },
  tapZoneRight: {
    flex: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  zoomControls: {
    position: 'absolute',
    zIndex: 15,
    alignItems: 'flex-end',
    gap: 10,
  },
  zoomRail: {
    gap: 8,
    alignItems: 'center',
  },
  zoomBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.overlayBar,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panPad: {
    gap: 8,
  },
  panRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panSpacer: {
    width: 48,
    height: 48,
  },
  panCenter: {
    width: 48,
    height: 48,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlayBar,
    paddingBottom: 10,
    paddingHorizontal: 8,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: colors.textPrimary,
  },
  topTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  bottomBar: {
    backgroundColor: colors.overlayBar,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
    alignItems: 'center',
  },
  pageInfo: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtn: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  fontLabel: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  fontSizeInfo: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: { fontSize: 16, color: colors.textDim, marginTop: 12 },
  errorBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorBtnText: { color: colors.textPrimary, fontSize: 14 },
});
