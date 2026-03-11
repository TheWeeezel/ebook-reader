import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Note } from '../store/appStore';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  bookId: string;
  bookTitle: string;
  currentPage?: number;
  currentCfi?: string;
}

export function Notepad({ visible, onClose, bookId, bookTitle, currentPage, currentCfi }: Props) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const notes = useAppStore((s) => s.notes[bookId] || []);
  const addNote = useAppStore((s) => s.addNote);
  const updateNote = useAppStore((s) => s.updateNote);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const inputRef = useRef<TextInput>(null);

  const handleAdd = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await addNote({
      bookId,
      text: trimmed,
      page: currentPage,
      cfi: currentCfi,
    });
    setText('');
  };

  const handleDelete = (noteId: string) => {
    Alert.alert('Notiz löschen', 'Möchtest du diese Notiz wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => deleteNote(bookId, noteId),
      },
    ]);
  };

  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const handleSaveEdit = async () => {
    if (editingId && editText.trim()) {
      await updateNote(bookId, editingId, editText.trim());
    }
    setEditingId(null);
    setEditText('');
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const renderNote = ({ item }: { item: Note }) => (
    <View style={styles.noteCard}>
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
          <TouchableOpacity onPress={handleSaveEdit} style={styles.saveBtn}>
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
        <Text style={styles.noteMetaText}>{formatDate(item.createdAt)}</Text>
        <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={16} color={colors.textDim} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Notizen</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {bookTitle}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {currentPage !== undefined && (
                <View style={styles.pageBadge}>
                  <Text style={styles.pageBadgeText}>S. {currentPage + 1}</Text>
                </View>
              )}
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Notiz hinzufügen..."
              placeholderTextColor={colors.textDim}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleAdd}
              style={[styles.addBtn, !text.trim() && styles.addBtnDisabled]}
              disabled={!text.trim()}
            >
              <Ionicons name="add" size={22} color={text.trim() ? colors.bg : colors.textDim} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={notes}
            keyExtractor={(item) => item.id}
            renderItem={renderNote}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="document-text-outline" size={32} color={colors.textVeryDim} />
                <Text style={styles.emptyText}>Noch keine Notizen</Text>
              </View>
            }
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '75%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageBadge: {
    backgroundColor: colors.elevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pageBadgeText: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: colors.elevated },
  list: { paddingBottom: 20 },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
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
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: colors.textDim, fontSize: 14, marginTop: 8 },
});
