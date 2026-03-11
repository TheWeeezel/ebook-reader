import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  Animated,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore, Note } from '../store/appStore';
import { colors } from '../theme';
import { NoteEditorModal } from './NoteEditorModal';

const EMPTY_NOTES: Note[] = [];

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
  const [editorNote, setEditorNote] = useState<Note | null>(null);
  const [createEditorVisible, setCreateEditorVisible] = useState(false);

  const notes = useAppStore((s) => s.notes[bookId]) ?? EMPTY_NOTES;
  const addNote = useAppStore((s) => s.addNote);
  const updateNote = useAppStore((s) => s.updateNote);
  const deleteNote = useAppStore((s) => s.deleteNote);

  const sheetMaxHeight = Math.max(420, Math.min(screenHeight * 0.92, screenHeight - 24));
  const sheetCollapsedHeight = Math.max(320, Math.min(screenHeight * 0.62, sheetMaxHeight));
  const collapsedOffset = Math.max(0, sheetMaxHeight - sheetCollapsedHeight);

  const sheetTranslateY = useRef(new Animated.Value(collapsedOffset)).current;
  const dragStartRef = useRef(collapsedOffset);

  useEffect(() => {
    if (visible) {
      sheetTranslateY.setValue(collapsedOffset);
    }
  }, [visible, collapsedOffset, sheetTranslateY]);

  const snapTo = useCallback((toValue: number, onDone?: () => void) => {
    Animated.spring(sheetTranslateY, {
      toValue,
      useNativeDriver: true,
      tension: 90,
      friction: 12,
    }).start(({ finished }) => {
      if (finished) {
        onDone?.();
      }
    });
  }, [sheetTranslateY]);

  const closeByGesture = useCallback(() => {
    Animated.timing(sheetTranslateY, {
      toValue: collapsedOffset + 180,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      sheetTranslateY.setValue(collapsedOffset);
      onClose();
    });
  }, [collapsedOffset, onClose, sheetTranslateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value: number) => {
            dragStartRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.max(
            0,
            Math.min(collapsedOffset + 180, dragStartRef.current + gesture.dy)
          );
          sheetTranslateY.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const projected = Math.max(
            0,
            Math.min(collapsedOffset + 180, dragStartRef.current + gesture.dy)
          );

          const closeThreshold = collapsedOffset + 85;
          if (projected > closeThreshold || (gesture.vy > 1.15 && projected > collapsedOffset * 0.7)) {
            closeByGesture();
            return;
          }

          const shouldExpand = projected < collapsedOffset * 0.5 || gesture.vy < -0.8;
          snapTo(shouldExpand ? 0 : collapsedOffset);
        },
      }),
    [closeByGesture, collapsedOffset, sheetTranslateY, snapTo]
  );

  const handleDelete = (noteId: string, onDone?: () => void) => {
    Alert.alert('Notiz löschen', 'Möchtest du diese Notiz wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          deleteNote(bookId, noteId);
          onDone?.();
        },
      },
    ]);
  };

  const handleSaveEditor = async (nextText: string) => {
    if (!editorNote) return;
    await updateNote(bookId, editorNote.id, nextText);
    setEditorNote(null);
  };

  const handleAddNote = async (nextText: string) => {
    await addNote({
      bookId,
      text: nextText,
      page: currentPage,
      cfi: currentCfi,
    });
    setCreateEditorVisible(false);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}.${d.getFullYear()}`;
  };

  const renderNote = ({ item }: { item: Note }) => (
    <TouchableOpacity style={styles.noteCard} activeOpacity={0.85} onPress={() => setEditorNote(item)}>
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
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

          <Animated.View
            style={[
              styles.sheet,
              {
                height: sheetMaxHeight,
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.dragArea} {...panResponder.panHandlers}>
              <View style={styles.handle} />
            </View>

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

            <FlatList
              data={notes}
              keyExtractor={(item) => item.id}
              renderItem={renderNote}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="document-text-outline" size={34} color={colors.textPrimary} />
                  <Text style={styles.emptyText}>Noch keine Notizen</Text>
                </View>
              }
            />

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.addNoteBtn}
                activeOpacity={0.85}
                onPress={() => setCreateEditorVisible(true)}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.bg} />
                <Text style={styles.addNoteBtnText}>Notiz hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <NoteEditorModal
        visible={createEditorVisible}
        title="Notiz hinzufügen"
        subtitle={bookTitle}
        initialText=""
        onClose={() => setCreateEditorVisible(false)}
        onSave={handleAddNote}
      />

      <NoteEditorModal
        visible={!!editorNote}
        title="Notiz bearbeiten"
        subtitle={bookTitle}
        initialText={editorNote?.text || ''}
        onClose={() => setEditorNote(null)}
        onSave={handleSaveEditor}
        onDelete={editorNote ? () => handleDelete(editorNote.id, () => setEditorNote(null)) : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 2,
    borderColor: colors.textPrimary,
    overflow: 'hidden',
  },
  dragArea: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
  },
  handle: {
    width: 64,
    height: 6,
    backgroundColor: colors.textPrimary,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.textPrimary,
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: colors.textPrimary, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageBadge: {
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  pageBadgeText: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
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
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addNoteBtn: {
    height: 46,
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
});
