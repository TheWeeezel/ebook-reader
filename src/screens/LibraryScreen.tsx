import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  StatusBar,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore, Book, BookType } from '../store/appStore';
import { colors } from '../theme';

const BOOKS_DIR = FileSystem.documentDirectory + 'books/';
const UNGROUPED_GROUP_ID = '__ungrouped__';

type LibraryMode = 'all' | 'grouped';

type GroupEntry = {
  id: string;
  name: string;
  count: number;
  isVirtualUngrouped?: boolean;
};

function getBookType(name: string): BookType | null {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  if (ext === 'txt') return 'txt';
  return null;
}

function getTypeIcon(type: BookType): string {
  switch (type) {
    case 'pdf':
      return 'document';
    case 'epub':
      return 'book';
    case 'txt':
      return 'document-text';
    default:
      return 'document';
  }
}

export function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const books = useAppStore((s) => s.books);
  const groups = useAppStore((s) => s.groups);
  const notes = useAppStore((s) => s.notes);
  const init = useAppStore((s) => s.init);
  const addBook = useAppStore((s) => s.addBook);
  const removeBook = useAppStore((s) => s.removeBook);
  const setCurrentBook = useAppStore((s) => s.setCurrentBook);
  const addGroup = useAppStore((s) => s.addGroup);
  const assignBooksToGroup = useAppStore((s) => s.assignBooksToGroup);
  const initialized = useAppStore((s) => s.initialized);

  const [mode, setMode] = useState<LibraryMode>('all');
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const [menuBook, setMenuBook] = useState<Book | null>(null);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');

  useEffect(() => {
    init();
  }, [init]);

  const selectedSet = useMemo(() => new Set(selectedBookIds), [selectedBookIds]);

  const groupMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of groups) {
      map[group.id] = group.name;
    }
    return map;
  }, [groups]);

  const sortedBooks = useMemo(() => {
    return [...books].sort((a, b) => b.addedAt - a.addedAt);
  }, [books]);

  const groupedEntries = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const book of books) {
      const key = book.groupId || UNGROUPED_GROUP_ID;
      counts[key] = (counts[key] || 0) + 1;
    }

    const entries: GroupEntry[] = [...groups]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((group) => ({
        id: group.id,
        name: group.name,
        count: counts[group.id] || 0,
      }));

    const ungroupedCount = counts[UNGROUPED_GROUP_ID] || 0;
    if (ungroupedCount > 0) {
      entries.unshift({
        id: UNGROUPED_GROUP_ID,
        name: 'Ohne Gruppe',
        count: ungroupedCount,
        isVirtualUngrouped: true,
      });
    }

    return entries;
  }, [books, groups]);

  const booksInCurrentView = useMemo(() => {
    if (mode === 'all') return sortedBooks;
    if (!openGroupId) return [];
    if (openGroupId === UNGROUPED_GROUP_ID) {
      return sortedBooks.filter((b) => !b.groupId);
    }
    return sortedBooks.filter((b) => b.groupId === openGroupId);
  }, [mode, openGroupId, sortedBooks]);

  const inGroupedRoot = mode === 'grouped' && openGroupId === null;

  const currentGroupTitle = useMemo(() => {
    if (openGroupId === null) return '';
    if (openGroupId === UNGROUPED_GROUP_ID) return 'Ohne Gruppe';
    return groupMap[openGroupId] || 'Gruppe';
  }, [openGroupId, groupMap]);

  const switchMode = (nextMode: LibraryMode) => {
    setMode(nextMode);
    setOpenGroupId(null);
    setSelectedBookIds([]);
  };

  const openGroup = (groupId: string) => {
    setOpenGroupId(groupId);
    setSelectedBookIds([]);
  };

  const goToGroupedRoot = () => {
    setOpenGroupId(null);
    setSelectedBookIds([]);
  };

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

      await addBook({
        title: asset.name,
        uri: destUri,
        type,
        groupId: null,
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
            setSelectedBookIds((prev) => prev.filter((id) => id !== book.id));
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

  const toggleSelection = (bookId: string) => {
    setSelectedBookIds((prev) => {
      if (prev.includes(bookId)) return prev.filter((id) => id !== bookId);
      return [...prev, bookId];
    });
  };

  const clearSelection = () => {
    setSelectedBookIds([]);
  };

  const handleCreateGroup = async () => {
    const created = await addGroup(groupNameInput);
    if (!created) {
      Alert.alert('Ungültiger Name', 'Bitte gib einen Gruppennamen ein.');
      return;
    }
    setGroupNameInput('');
    setCreateGroupVisible(false);
  };

  const handleAssignToGroup = async (groupId: string | null) => {
    if (!selectedBookIds.length) return;
    await assignBooksToGroup(selectedBookIds, groupId);
    setAssignModalVisible(false);
    setSelectedBookIds([]);
  };

  const handleCreateAndAssign = async () => {
    const created = await addGroup(groupNameInput);
    if (!created) {
      Alert.alert('Ungültiger Name', 'Bitte gib einen Gruppennamen ein.');
      return;
    }
    await handleAssignToGroup(created.id);
    setGroupNameInput('');
  };

  const handleBookCardPress = (book: Book) => {
    if (selectedBookIds.length > 0) {
      toggleSelection(book.id);
      return;
    }
    handleOpenBook(book);
  };

  const renderBook = ({ item }: { item: Book }) => {
    const progress = getProgress(item);
    const notesCount = getNotesCount(item.id);
    const isSelected = selectedSet.has(item.id);
    const groupName = item.groupId ? groupMap[item.groupId] || 'Gruppe' : 'Ohne Gruppe';

    return (
      <TouchableOpacity
        style={[styles.bookCard, isSelected && styles.bookCardSelected]}
        onPress={() => handleBookCardPress(item)}
        onLongPress={() => toggleSelection(item.id)}
        activeOpacity={0.82}
      >
        <View style={[styles.bookCover, isSelected && styles.bookCoverSelected]}>
          <Ionicons
            name={getTypeIcon(item.type) as any}
            size={22}
            color={isSelected ? colors.bg : colors.textPrimary}
          />
          <Text style={[styles.bookTypeLabel, isSelected && styles.bookTypeLabelSelected]}>
            {item.type.toUpperCase()}
          </Text>
        </View>

        <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.bookGroup} numberOfLines={1}>
            {groupName}
          </Text>
          <Text style={styles.bookMeta}>Seite {item.lastPage + 1} / {item.totalPages || '?'}</Text>
          <Text style={styles.bookMeta}>{notesCount} Notizen</Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        </View>

        {selectedBookIds.length === 0 && (
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => setMenuBook(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderGroup = ({ item }: { item: GroupEntry }) => {
    const countLabel = `${item.count} ${item.count === 1 ? 'Dokument' : 'Dokumente'}`;

    return (
      <TouchableOpacity style={styles.groupCard} onPress={() => openGroup(item.id)} activeOpacity={0.82}>
        <View style={styles.groupCover}>
          <Ionicons
            name={item.isVirtualUngrouped ? 'albums-outline' : 'folder-outline'}
            size={24}
            color={colors.textPrimary}
          />
          <Text style={styles.groupTypeLabel}>GRUPPE</Text>
        </View>

        <View style={styles.groupInfo}>
          <Text style={styles.groupTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.groupCount}>{countLabel}</Text>
          <Text style={styles.groupHint}>Tippen zum Öffnen</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!initialized) return null;

  const showSelectionBar = selectedBookIds.length > 0 && !inGroupedRoot;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View>
          <Text style={styles.headerTitle}>Bibliothek</Text>
          <Text style={styles.headerCount}>{books.length} {books.length === 1 ? 'Buch' : 'Bücher'}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setCreateGroupVisible(true)} style={styles.headerBtn}>
            <Ionicons name="folder-open-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/notes')} style={styles.headerBtn}>
            <Ionicons name="document-text-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.modeSwitchRow}>
        <TouchableOpacity
          style={[styles.modeSwitchBtn, mode === 'all' && styles.modeSwitchBtnActive]}
          onPress={() => switchMode('all')}
          activeOpacity={0.85}
        >
          <Text style={[styles.modeSwitchText, mode === 'all' && styles.modeSwitchTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeSwitchBtn, mode === 'grouped' && styles.modeSwitchBtnActive]}
          onPress={() => switchMode('grouped')}
          activeOpacity={0.85}
        >
          <Text style={[styles.modeSwitchText, mode === 'grouped' && styles.modeSwitchTextActive]}>Grouped</Text>
        </TouchableOpacity>
      </View>

      {mode === 'grouped' && openGroupId !== null && (
        <View style={styles.groupTrail}>
          <TouchableOpacity style={styles.groupTrailBack} onPress={goToGroupedRoot} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={16} color={colors.textPrimary} />
            <Text style={styles.groupTrailBackText}>Gruppen</Text>
          </TouchableOpacity>
          <View style={styles.groupTrailInfo}>
            <Text style={styles.groupTrailTitle} numberOfLines={1}>{currentGroupTitle}</Text>
            <Text style={styles.groupTrailCount}>
              {booksInCurrentView.length} {booksInCurrentView.length === 1 ? 'Dokument' : 'Dokumente'}
            </Text>
          </View>
        </View>
      )}

      {showSelectionBar && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedBookIds.length} ausgewählt</Text>
          <TouchableOpacity style={styles.selectionBtn} onPress={() => setAssignModalVisible(true)}>
            <Text style={styles.selectionBtnText}>Zu Gruppe</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionBtn} onPress={() => handleAssignToGroup(null)}>
            <Text style={styles.selectionBtnText}>Ungruppieren</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectionBtn} onPress={clearSelection}>
            <Text style={styles.selectionBtnText}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      )}

      {inGroupedRoot ? (
        groupedEntries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textPrimary} />
            <Text style={styles.emptyTitle}>Noch keine Gruppen</Text>
            <Text style={styles.emptyHint}>Erstelle eine Gruppe über das Ordner-Symbol oben rechts.</Text>
          </View>
        ) : (
          <FlatList
            data={groupedEntries}
            keyExtractor={(item) => item.id}
            renderItem={renderGroup}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : booksInCurrentView.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="library-outline" size={48} color={colors.textPrimary} />
          <Text style={styles.emptyTitle}>
            {mode === 'all' ? 'Noch keine Bücher' : 'Keine Dokumente in dieser Gruppe'}
          </Text>
          <Text style={styles.emptyHint}>
            {mode === 'all'
              ? 'Tippe auf + um ein PDF, EPUB oder TXT zu importieren.'
              : 'Diese Gruppe ist leer. Wechsle zu All oder verschiebe Bücher in diese Gruppe.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={booksInCurrentView}
          keyExtractor={(item) => item.id}
          renderItem={renderBook}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handlePickFile} activeOpacity={0.85}>
        <Ionicons name="add" size={30} color={colors.fabFg} />
      </TouchableOpacity>

      <Modal visible={!!menuBook} transparent animationType="fade" onRequestClose={() => setMenuBook(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuBook(null)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuBook?.title}</Text>

            <TouchableOpacity style={styles.menuItem} onPress={() => menuBook && handleOpenBook(menuBook)}>
              <Ionicons name="book-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Lesen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                if (!menuBook) return;
                setMenuBook(null);
                setSelectedBookIds([menuBook.id]);
                setAssignModalVisible(true);
              }}
            >
              <Ionicons name="folder-open-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Gruppe ändern</Text>
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
              <Ionicons name="document-text-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Notizen ({menuBook ? getNotesCount(menuBook.id) : 0})</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => menuBook && handleRemoveBook(menuBook)}
            >
              <Ionicons name="trash-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Entfernen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={assignModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAssignModalVisible(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Bücher gruppieren</Text>
            <Text style={styles.assignInfo}>{selectedBookIds.length} Bücher ausgewählt</Text>

            <TextInput
              style={styles.groupInput}
              value={groupNameInput}
              onChangeText={setGroupNameInput}
              placeholder="Neue Gruppe"
              placeholderTextColor={colors.textPrimary}
            />
            <TouchableOpacity style={styles.assignCreateBtn} onPress={handleCreateAndAssign}>
              <Ionicons name="add-circle-outline" size={18} color={colors.bg} />
              <Text style={styles.assignCreateText}>Erstellen + zuweisen</Text>
            </TouchableOpacity>

            {groups
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((group) => (
                <TouchableOpacity key={group.id} style={styles.menuItem} onPress={() => handleAssignToGroup(group.id)}>
                  <Ionicons name="folder-outline" size={18} color={colors.textPrimary} />
                  <Text style={styles.menuItemText}>{group.name}</Text>
                </TouchableOpacity>
              ))}

            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={() => handleAssignToGroup(null)}>
              <Ionicons name="albums-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Ohne Gruppe</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={createGroupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateGroupVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCreateGroupVisible(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Neue Gruppe</Text>
            <TextInput
              style={styles.groupInput}
              value={groupNameInput}
              onChangeText={setGroupNameInput}
              placeholder="Gruppenname"
              placeholderTextColor={colors.textPrimary}
            />
            <TouchableOpacity style={styles.assignCreateBtn} onPress={handleCreateGroup}>
              <Ionicons name="add-circle-outline" size={18} color={colors.bg} />
              <Text style={styles.assignCreateText}>Erstellen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.textPrimary,
  },
  headerTitle: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  headerCount: { fontSize: 13, color: colors.textPrimary, marginTop: 2, fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },

  modeSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  modeSwitchBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitchBtnActive: {
    backgroundColor: colors.textPrimary,
  },
  modeSwitchText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  modeSwitchTextActive: {
    color: colors.bg,
  },

  groupTrail: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 8,
    backgroundColor: colors.bg,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupTrailBack: {
    height: 34,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bg,
  },
  groupTrailBackText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  groupTrailInfo: { flex: 1 },
  groupTrailTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  groupTrailCount: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  selectionBar: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionText: { fontSize: 13, color: colors.textPrimary, fontWeight: '700' },
  selectionBtn: {
    paddingHorizontal: 10,
    height: 34,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  selectionBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingBottom: 100 },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  bookCard: {
    width: '48.5%',
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    overflow: 'hidden',
  },
  bookCardSelected: { borderWidth: 3 },
  bookCover: {
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.textPrimary,
  },
  bookCoverSelected: { backgroundColor: colors.textPrimary },
  bookTypeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bookTypeLabelSelected: { color: colors.bg },
  bookInfo: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 9,
    minHeight: 108,
  },
  bookTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.textPrimary },
  bookGroup: { fontSize: 12, color: colors.textPrimary, marginTop: 4, fontWeight: '700' },
  bookMeta: { fontSize: 12, color: colors.textPrimary, marginTop: 2, fontWeight: '600' },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.bg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  progressFill: { height: 2, marginTop: 0, backgroundColor: colors.textPrimary },
  progressText: { fontSize: 11, color: colors.textPrimary, width: 32, fontWeight: '700' },
  menuBtn: {
    position: 'absolute',
    top: 6,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },

  groupCard: {
    width: '48.5%',
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    overflow: 'hidden',
  },
  groupCover: {
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.textPrimary,
    backgroundColor: colors.bg,
  },
  groupTypeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  groupInfo: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 96,
  },
  groupTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  groupCount: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  groupHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 16,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    fontWeight: '600',
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.fabBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuCard: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 14,
    width: '100%',
    maxWidth: 340,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: colors.textPrimary,
  },
  menuItemText: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  menuItemDanger: {
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
  },

  assignInfo: {
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 10,
    fontWeight: '600',
  },
  groupInput: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 8,
    backgroundColor: colors.bg,
    color: colors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  assignCreateBtn: {
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  assignCreateText: { color: colors.bg, fontWeight: '700', fontSize: 14 },
});
