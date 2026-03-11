import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore, Note, Book } from '../store/appStore';
import { colors } from '../theme';
import { NoteEditorModal } from '../components/NoteEditorModal';

type NoteWithBook = Note & { bookTitle: string };

export function NotesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId?: string }>();
  const [filterBookId, setFilterBookId] = useState<string | null>(params.bookId || null);
  const [editorNote, setEditorNote] = useState<NoteWithBook | null>(null);
  const insets = useSafeAreaInsets();

  const books = useAppStore((s) => s.books);
  const allNotes = useAppStore((s) => s.notes);
  const updateNote = useAppStore((s) => s.updateNote);
  const deleteNote = useAppStore((s) => s.deleteNote);

  const bookMap = useMemo(() => {
    const map: Record<string, Book> = {};
    books.forEach((b) => {
      map[b.id] = b;
    });
    return map;
  }, [books]);

  const booksWithNotes = useMemo(() => {
    return books.filter((b) => (allNotes[b.id] || []).length > 0);
  }, [books, allNotes]);

  const flatNotes = useMemo(() => {
    const result: NoteWithBook[] = [];
    const bookIds = filterBookId ? [filterBookId] : Object.keys(allNotes);

    for (const bookId of bookIds) {
      const notes = allNotes[bookId] || [];
      const book = bookMap[bookId];
      if (!book) continue;
      for (const note of notes) {
        result.push({ ...note, bookTitle: book.title });
      }
    }

    return result.sort((a, b) => b.createdAt - a.createdAt);
  }, [allNotes, filterBookId, bookMap]);

  const handleDelete = (note: Note, onDone?: () => void) => {
    Alert.alert('Notiz löschen', 'Möchtest du diese Notiz wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          deleteNote(note.bookId, note.id);
          onDone?.();
        },
      },
    ]);
  };

  const handleSaveEditor = (text: string) => {
    if (!editorNote) return;
    updateNote(editorNote.bookId, editorNote.id, text);
    setEditorNote(null);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}.${d.getFullYear()}`;
  };

  const filterBook = filterBookId ? bookMap[filterBookId] : null;

  const renderNote = ({ item }: { item: NoteWithBook }) => (
    <TouchableOpacity style={styles.noteCard} onPress={() => setEditorNote(item)} activeOpacity={0.85}>
      {!filterBookId && (
        <View style={styles.bookTag}>
          <Text style={styles.bookTagText} numberOfLines={1}>
            {item.bookTitle}
          </Text>
        </View>
      )}

      <Text style={styles.noteText} numberOfLines={5}>
        {item.text}
      </Text>

      <View style={styles.noteMeta}>
        <View style={styles.noteMetaLeft}>
          {item.page !== undefined && <Text style={styles.noteMetaText}>Seite {item.page + 1}</Text>}
          <Text style={styles.noteMetaText}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.editHint}>Tippen zum Bearbeiten</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notizen</Text>
          <Text style={styles.headerCount}>{flatNotes.length} Notizen</Text>
        </View>
      </View>

      {filterBook && (
        <View style={styles.activeFilter}>
          <Text style={styles.activeFilterText} numberOfLines={1}>
            {filterBook.title}
          </Text>
          <TouchableOpacity onPress={() => setFilterBookId(null)}>
            <Ionicons name="close-circle" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      {booksWithNotes.length > 1 && !filterBookId && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChips}
        >
          {booksWithNotes.map((book) => (
            <TouchableOpacity
              key={book.id}
              onPress={() => setFilterBookId(book.id)}
              style={styles.filterChip}
            >
              <Text style={styles.filterChipText} numberOfLines={1}>
                {book.title}
              </Text>
              <View style={styles.chipBadge}>
                <Text style={styles.chipBadgeText}>{(allNotes[book.id] || []).length}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={flatNotes}
        keyExtractor={(item) => item.id}
        renderItem={renderNote}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={colors.textPrimary} />
            <Text style={styles.emptyTitle}>Keine Notizen</Text>
            <Text style={styles.emptyHint}>Erstelle Notizen beim Lesen über das Notiz-Symbol im Reader.</Text>
          </View>
        }
      />

      <NoteEditorModal
        visible={!!editorNote}
        title="Notiz bearbeiten"
        subtitle={editorNote ? editorNote.bookTitle : undefined}
        initialText={editorNote?.text || ''}
        onClose={() => setEditorNote(null)}
        onSave={handleSaveEditor}
        onDelete={editorNote ? () => handleDelete(editorNote, () => setEditorNote(null)) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.textPrimary,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  headerCount: { fontSize: 13, color: colors.textPrimary, marginTop: 2 },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  activeFilterText: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  filterChips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    marginRight: 8,
    backgroundColor: colors.bg,
  },
  filterChipText: { fontSize: 13, fontWeight: '600', maxWidth: 120, color: colors.textPrimary },
  chipBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    backgroundColor: colors.bg,
  },
  chipBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  list: { padding: 16, paddingBottom: 40 },
  noteCard: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  bookTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    marginBottom: 10,
    backgroundColor: colors.bg,
  },
  bookTagText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  noteText: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  noteMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteMetaText: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
  editHint: { marginLeft: 'auto', fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: 16 },
  emptyHint: {
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
