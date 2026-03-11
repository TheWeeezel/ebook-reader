import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Note, Book } from '../store/appStore';
import { colors } from '../theme';

export function NotesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId?: string }>();
  const [filterBookId, setFilterBookId] = useState<string | null>(params.bookId || null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const books = useAppStore((s) => s.books);
  const allNotes = useAppStore((s) => s.notes);
  const updateNote = useAppStore((s) => s.updateNote);
  const deleteNote = useAppStore((s) => s.deleteNote);

  const bookMap = useMemo(() => {
    const map: Record<string, Book> = {};
    books.forEach((b) => { map[b.id] = b; });
    return map;
  }, [books]);

  const booksWithNotes = useMemo(() => {
    return books.filter((b) => (allNotes[b.id] || []).length > 0);
  }, [books, allNotes]);

  const flatNotes = useMemo(() => {
    const result: (Note & { bookTitle: string })[] = [];
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

  const handleDelete = (note: Note) => {
    Alert.alert('Notiz löschen', 'Möchtest du diese Notiz wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => deleteNote(note.bookId, note.id),
      },
    ]);
  };

  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const handleSaveEdit = (bookId: string) => {
    if (editingId && editText.trim()) {
      updateNote(bookId, editingId, editText.trim());
    }
    setEditingId(null);
    setEditText('');
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const filterBook = filterBookId ? bookMap[filterBookId] : null;

  const renderNote = ({ item }: { item: Note & { bookTitle: string } }) => (
    <View style={styles.noteCard}>
      {!filterBookId && (
        <TouchableOpacity
          onPress={() => setFilterBookId(item.bookId)}
          style={styles.bookTag}
        >
          <Text style={styles.bookTagText} numberOfLines={1}>
            {item.bookTitle}
          </Text>
        </TouchableOpacity>
      )}

      {editingId === item.id ? (
        <View style={styles.editContainer}>
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
            placeholderTextColor={colors.textDim}
          />
          <TouchableOpacity onPress={() => handleSaveEdit(item.bookId)} style={styles.saveBtn}>
            <Ionicons name="checkmark" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onLongPress={() => handleStartEdit(item)} activeOpacity={0.7}>
          <Text style={styles.noteText}>{item.text}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.noteMeta}>
        {item.page !== undefined && (
          <Text style={styles.noteMetaText}>Seite {item.page + 1}</Text>
        )}
        <View style={{ flex: 1 }} />
        <Text style={styles.noteMetaText}>{formatDate(item.createdAt)}</Text>
        <TouchableOpacity
          onPress={() => handleDelete(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: 8 }}
        >
          <Ionicons name="trash-outline" size={16} color={colors.textDim} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
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
                <Text style={styles.chipBadgeText}>
                  {(allNotes[book.id] || []).length}
                </Text>
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
            <Ionicons name="document-text-outline" size={48} color={colors.textVeryDim} />
            <Text style={styles.emptyTitle}>Keine Notizen</Text>
            <Text style={styles.emptyHint}>
              Erstelle Notizen beim Lesen über das Notiz-Symbol im Reader.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  headerCount: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeFilterText: { flex: 1, color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  filterChips: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    marginRight: 8,
  },
  filterChipText: { fontSize: 13, fontWeight: '500', maxWidth: 120, color: colors.textPrimary },
  chipBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    backgroundColor: colors.textPrimary,
  },
  chipBadgeText: { fontSize: 11, fontWeight: '700', color: colors.bg },
  list: { padding: 16, paddingBottom: 40 },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bookTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    marginBottom: 8,
  },
  bookTagText: { fontSize: 11, fontWeight: '600', color: colors.textPrimary },
  noteText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  noteMetaText: { fontSize: 12, color: colors.textDim },
  editContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  editInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.textPrimary,
    paddingVertical: 4,
  },
  saveBtn: { padding: 4 },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.textDim, marginTop: 16 },
  emptyHint: {
    fontSize: 14,
    color: colors.textVeryDim,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
