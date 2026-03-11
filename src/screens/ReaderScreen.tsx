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
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system';
import { useAppStore } from '../store/appStore';
import { EpubReader, EpubReaderHandle } from '../components/EpubReader';
import { PdfReader, PdfReaderHandle } from '../components/PdfReader';
import { Notepad } from '../components/Notepad';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { colors, READER_THEMES } from '../theme';

export function ReaderScreen() {
  const router = useRouter();
  const currentBook = useAppStore((s) => s.currentBook);
  const settings = useAppStore((s) => s.settings);
  const updateBookProgress = useAppStore((s) => s.updateBookProgress);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [menuVisible, setMenuVisible] = useState(false);
  const [notepadVisible, setNotepadVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(currentBook?.lastPage || 0);
  const [totalPages, setTotalPages] = useState(currentBook?.totalPages || 0);
  const [currentCfi, setCurrentCfi] = useState(currentBook?.lastCfi);

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

  const { inputRef, handleKeyPress, handleRefocus } = useKeyboardControls({
    onNextPage: goNext,
    onPrevPage: goPrev,
    onOpenNotes: openNotes,
    onToggleMenu: toggleMenu,
    enabled: !notepadVisible,
  });

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.min(32, Math.max(12, settings.fontSize + delta));
    updateSettings({ fontSize: newSize });
    if (currentBook?.type === 'epub') {
      epubRef.current?.setFontSize(newSize);
    }
  };

  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const readerTheme = READER_THEMES[settings.theme];

  if (!currentBook) {
    return (
      <View style={styles.errorContainer}>
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
      {!notepadVisible && (
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
        />
      )}

      {/* TXT Reader */}
      {currentBook.type === 'txt' && (
        <TxtReader
          uri={currentBook.uri}
          fontSize={settings.fontSize}
          lineHeight={settings.lineHeight}
          theme={settings.theme}
        />
      )}

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress}%` },
          ]}
        />
      </View>

      {/* Overlay Menu */}
      <Animated.View
        style={[styles.overlay, { opacity: fadeAnim }]}
        pointerEvents={menuVisible ? 'auto' : 'none'}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.topBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle} numberOfLines={1}>
            {currentBook.title}
          </Text>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.topBtn}>
            <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={goPrev} style={styles.bottomBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.bottomCenter}>
            <Text style={styles.pageIndicator}>
              {currentPage + 1} / {totalPages || '?'}
            </Text>
            <View style={styles.fontControls}>
              <TouchableOpacity onPress={() => handleFontSizeChange(-2)} style={styles.fontBtn}>
                <Text style={styles.fontBtnTextSmall}>A-</Text>
              </TouchableOpacity>
              <Text style={styles.fontSizeLabel}>{settings.fontSize}px</Text>
              <TouchableOpacity onPress={() => handleFontSizeChange(2)} style={styles.fontBtn}>
                <Text style={styles.fontBtnTextLarge}>A+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity onPress={openNotes} style={styles.bottomBtn}>
            <Ionicons name="document-text-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goNext} style={styles.bottomBtn}>
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
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
    </View>
  );
}

/** Simple TXT file reader using ScrollView */
function TxtReader({
  uri,
  fontSize,
  lineHeight,
  theme,
}: {
  uri: string;
  fontSize: number;
  lineHeight: number;
  theme: 'dark' | 'sepia' | 'light';
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
      contentContainerStyle={{ padding: 20 }}
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlayBar,
    paddingTop: 44,
    paddingBottom: 12,
    paddingHorizontal: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBtn: { padding: 8 },
  topTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlayBar,
    paddingBottom: 30,
    paddingTop: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomBtn: { padding: 10 },
  bottomCenter: { flex: 1, alignItems: 'center' },
  pageIndicator: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  fontControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  fontBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.elevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fontBtnTextSmall: { fontSize: 13, color: colors.textSecondary },
  fontBtnTextLarge: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  fontSizeLabel: { fontSize: 13, color: colors.textDim, minWidth: 36, textAlign: 'center' },
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
