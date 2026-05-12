import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  useWindowDimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAppStore, Note } from '../store/appStore';
import { colors } from '../theme';

const EMPTY_NOTES: Note[] = [];

type ComposeMode = 'new' | 'edit' | null;

interface Props {
  visible: boolean;
  onClose: () => void;
  bookId: string;
  bookTitle: string;
  currentPage?: number;
  currentCfi?: string;
}

export function Notepad({ visible, onClose, bookId, bookTitle, currentPage, currentCfi }: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const [composeMode, setComposeMode] = useState<ComposeMode>(null);
  const [composeText, setComposeText] = useState('');
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  const notes = useAppStore((s) => s.notes[bookId]) ?? EMPTY_NOTES;
  const addNote = useAppStore((s) => s.addNote);
  const updateNote = useAppStore((s) => s.updateNote);
  const deleteNote = useAppStore((s) => s.deleteNote);

  const sheetHeight = Math.max(320, Math.min(Math.round(screenHeight * (2 / 3)), screenHeight - 16));

  useEffect(() => {
    if (!visible) {
      setComposeMode(null);
      setComposeText('');
      setActiveNote(null);
    }
  }, [visible]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}.${d.getFullYear()}`;
  };

  const openCreate = () => {
    setComposeMode('new');
    setComposeText('');
    setActiveNote(null);
  };

  const openEdit = (note: Note) => {
    setComposeMode('edit');
    setComposeText(note.text);
    setActiveNote(note);
  };

  const closeComposer = () => {
    setComposeMode(null);
    setComposeText('');
    setActiveNote(null);
  };

  const saveComposer = async () => {
    const trimmed = composeText.trim();
    if (!trimmed) {
      Alert.alert('Leere Notiz', 'Bitte gib zuerst Text ein.');
      return;
    }

    if (composeMode === 'new') {
      await addNote({
        bookId,
        text: trimmed,
        page: currentPage,
        cfi: currentCfi,
      });
      closeComposer();
      return;
    }

    if (composeMode === 'edit' && activeNote) {
      await updateNote(bookId, activeNote.id, trimmed);
      closeComposer();
    }
  };

  const copyComposer = async () => {
    await Clipboard.setStringAsync(composeText);
    Alert.alert('Kopiert', 'Notiz wurde in die Zwischenablage kopiert.');
  };

  const deleteActiveNote = () => {
    if (!activeNote) return;
    Alert.alert('Notiz löschen', 'Möchtest du diese Notiz wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          deleteNote(bookId, activeNote.id);
          closeComposer();
        },
      },
    ]);
  };

  const renderNote = ({ item }: { item: Note }) => (
    <TouchableOpacity style={styles.noteCard} activeOpacity={0.85} onPress={() => openEdit(item)}>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>{composeMode ? 'Notiz schreiben' : 'Notizen'}</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {bookTitle}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {composeMode ? (
                <TouchableOpacity
                  style={styles.headerSecondaryBtn}
                  onPress={closeComposer}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-back" size={16} color={colors.textPrimary} />
                  <Text style={styles.headerSecondaryBtnText}>Zur Liste</Text>
                </TouchableOpacity>
              ) : null}

              {!composeMode && currentPage !== undefined && (
                <View style={styles.pageBadge}>
                  <Text style={styles.pageBadgeText}>S. {currentPage + 1}</Text>
                </View>
              )}

              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.contentArea}
          >
            {composeMode ? (
              <>
                <View style={styles.composerWrap}>
                  <TextInput
                    style={styles.composerInput}
                    multiline
                    scrollEnabled
                    autoFocus
                    textAlignVertical="top"
                    placeholder="Notiz schreiben..."
                    placeholderTextColor={colors.textVeryDim}
                    value={composeText}
                    onChangeText={setComposeText}
                  />
                </View>

                <View style={styles.composerFooter}>
                  {composeMode === 'edit' && (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={copyComposer} activeOpacity={0.85}>
                      <Ionicons name="copy-outline" size={16} color={colors.textPrimary} />
                      <Text style={styles.secondaryBtnText}>Kopieren</Text>
                    </TouchableOpacity>
                  )}

                  {composeMode === 'edit' && (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={deleteActiveNote} activeOpacity={0.85}>
                      <Ionicons name="trash-outline" size={16} color={colors.textPrimary} />
                      <Text style={styles.secondaryBtnText}>Löschen</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.primaryBtn} onPress={saveComposer} activeOpacity={0.85}>
                    <Ionicons name="save-outline" size={16} color={colors.bg} />
                    <Text style={styles.primaryBtnText}>Speichern</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <FlatList
                  data={notes}
                  keyExtractor={(item) => item.id}
                  renderItem={renderNote}
                  contentContainerStyle={styles.list}
                  ListEmptyComponent={
                    <View style={styles.empty}>
                      <Ionicons name="document-text-outline" size={34} color={colors.textPrimary} />
                      <Text style={styles.emptyText}>Noch keine Notizen</Text>
                      <TouchableOpacity style={styles.emptyAddBtn} activeOpacity={0.85} onPress={openCreate}>
                        <Ionicons name="add-circle-outline" size={16} color={colors.bg} />
                        <Text style={styles.emptyAddBtnText}>Neue Notiz</Text>
                      </TouchableOpacity>
                    </View>
                  }
                />

                <View style={styles.footer}>
                  <TouchableOpacity style={styles.addNoteBtn} activeOpacity={0.85} onPress={openCreate}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.bg} />
                    <Text style={styles.addNoteBtnText}>Neue Notiz</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.36)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopWidth: 2,
    borderColor: colors.textPrimary,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.textPrimary,
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: colors.textPrimary, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerSecondaryBtn: {
    height: 30,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerSecondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  pageBadge: {
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  pageBadgeText: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },

  contentArea: {
    flex: 1,
  },

  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 88,
  },
  noteCard: {
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  noteText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  noteMetaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  noteMetaText: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
  editHint: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: colors.textPrimary, fontSize: 14, marginTop: 8, fontWeight: '600' },
  emptyAddBtn: {
    marginTop: 12,
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyAddBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '700',
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  addNoteBtn: {
    height: 44,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.textPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addNoteBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },

  composerWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  composerInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 8,
    backgroundColor: colors.bg,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  composerFooter: {
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 6,
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.textPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '700',
  },
});
