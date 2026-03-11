import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useAppStore, Book, BookType } from '../store/appStore';

const BOOKS_DIR = FileSystem.documentDirectory + 'books/';

function getBookType(name: string): BookType | null {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  if (ext === 'txt') return 'txt';
  return null;
}

function getTypeIcon(type: BookType): string {
  switch (type) {
    case 'pdf': return 'document';
    case 'epub': return 'book';
    case 'txt': return 'document-text';
  }
}

export function LibraryScreen() {
  const router = useRouter();
  const books = useAppStore((s) => s.books);
  const notes = useAppStore((s) => s.notes);
  const init = useAppStore((s) => s.init);
  const addBook = useAppStore((s) => s.addBook);
  const removeBook = useAppStore((s) => s.removeBook);
  const setCurrentBook = useAppStore((s) => s.setCurrentBook);
  const initialized = useAppStore((s) => s.initialized);

  const [menuBook, setMenuBook] = useState<Book | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/epub+zip', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const type = getBookType(asset.name);
      if (!type) {
        Alert.alert('Fehler', 'Nur PDF, EPUB und TXT Dateien werden unterstützt.');
        return;
      }

      await FileSystem.makeDirectoryAsync(BOOKS_DIR, { intermediates: true });
      const destUri = BOOKS_DIR + asset.name;
      await FileSystem.copyAsync({ from: asset.uri, to: destUri });

      const title = asset.name.replace(/\.(pdf|epub|txt)$/i, '');
      await addBook({
        title,
        uri: destUri,
        type,
        lastPage: 0,
        totalPages: 0,
      });
    } catch (err) {
      console.error('Pick file error:', err);
    }
  };

  const handleOpenBook = (book: Book) => {
    setCurrentBook(book);
    setMenuBook(null);
    router.push('/reader');
  };

  const handleRemoveBook = (book: Book) => {
    setMenuBook(null);
    Alert.alert(
      'Buch entfernen',
      `"${book.title}" wirklich entfernen? Die Datei und alle Notizen werden gelöscht.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: async () => {
            await FileSystem.deleteAsync(book.uri, { idempotent: true });
            await removeBook(book.id);
          },
        },
      ]
    );
  };

  const getProgress = (book: Book) => {
    if (book.totalPages === 0) return 0;
    return Math.round((book.lastPage / book.totalPages) * 100);
  };

  const getNotesCount = (bookId: string) => (notes[bookId] || []).length;

  const renderBook = ({ item }: { item: Book }) => {
    const progress = getProgress(item);
    return (
      <TouchableOpacity
        style={styles.bookCard}
        onPress={() => handleOpenBook(item)}
        onLongPress={() => setMenuBook(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.bookStripe, { backgroundColor: item.coverColor || '#c9a96e' }]}>
          <Ionicons
            name={getTypeIcon(item.type) as any}
            size={20}
            color="rgba(0,0,0,0.6)"
          />
          <Text style={styles.bookTypeLabel}>{item.type.toUpperCase()}</Text>
        </View>
        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.bookPage}>
            Seite {item.lastPage + 1} von {item.totalPages || '?'}
          </Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress}%`, backgroundColor: item.coverColor || '#c9a96e' },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => setMenuBook(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color="#6b5e4e" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (!initialized) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0e0c" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Bibliothek</Text>
          <Text style={styles.headerCount}>
            {books.length} {books.length === 1 ? 'Buch' : 'Bücher'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push('/notes')}
            style={styles.headerBtn}
          >
            <Ionicons name="document-text-outline" size={22} color="#c9b89a" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={styles.headerBtn}
          >
            <Ionicons name="settings-outline" size={22} color="#c9b89a" />
          </TouchableOpacity>
        </View>
      </View>

      {books.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="library-outline" size={48} color="#4d4038" />
          <Text style={styles.emptyTitle}>Noch keine Bücher</Text>
          <Text style={styles.emptyHint}>
            Tippe auf + um ein PDF, EPUB oder TXT zu importieren
          </Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={renderBook}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handlePickFile} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#0f0e0c" />
      </TouchableOpacity>

      <Modal visible={!!menuBook} transparent animationType="fade" onRequestClose={() => setMenuBook(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuBook(null)}
        >
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle} numberOfLines={1}>
              {menuBook?.title}
            </Text>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => menuBook && handleOpenBook(menuBook)}
            >
              <Ionicons name="book-outline" size={20} color="#e8d5b5" />
              <Text style={styles.menuItemText}>Lesen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (menuBook) {
                  setMenuBook(null);
                  router.push(`/notes?bookId=${menuBook.id}`);
                }
              }}
            >
              <Ionicons name="document-text-outline" size={20} color="#e8d5b5" />
              <Text style={styles.menuItemText}>
                Notizen ({menuBook ? getNotesCount(menuBook.id) : 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => menuBook && handleRemoveBook(menuBook)}
            >
              <Ionicons name="trash-outline" size={20} color="#c97e7e" />
              <Text style={[styles.menuItemText, styles.menuItemDangerText]}>Entfernen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0e0c' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 26, fontWeight: '700', color: '#e8d5b5' },
  headerCount: { fontSize: 13, color: '#6b5e4e', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 12 },
  headerBtn: { padding: 6 },
  list: { padding: 16, paddingBottom: 100 },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1714',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2720',
    overflow: 'hidden',
  },
  bookStripe: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  bookTypeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.6)',
  },
  bookInfo: { flex: 1, padding: 12 },
  bookTitle: { fontSize: 15, fontWeight: '600', color: '#e8d5b5' },
  bookPage: { fontSize: 12, color: '#6b5e4e', marginTop: 4 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: '#2d2720',
    borderRadius: 2,
  },
  progressFill: { height: 3, borderRadius: 2 },
  progressText: { fontSize: 11, color: '#6b5e4e', width: 32 },
  menuBtn: { justifyContent: 'center', paddingHorizontal: 12 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#6b5e4e', marginTop: 16 },
  emptyHint: {
    fontSize: 14,
    color: '#4d4038',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#c9a96e',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  menuCard: {
    backgroundColor: '#1a1714',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: '#2d2720',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e8d5b5',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  menuItemText: { fontSize: 15, color: '#e8d5b5' },
  menuItemDanger: { borderTopWidth: 1, borderTopColor: '#2d2720' },
  menuItemDangerText: { color: '#c97e7e' },
});
