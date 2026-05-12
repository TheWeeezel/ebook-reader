import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  initialText: string;
  onClose: () => void;
  onSave: (text: string) => void | Promise<void>;
  onDelete?: () => void;
}

export function NoteEditorModal({
  visible,
  title,
  subtitle,
  initialText,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (visible) {
      setText(initialText);
    }
  }, [visible, initialText]);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert('Leere Notiz', 'Bitte gib Text ein, bevor du speicherst.');
      return;
    }
    await onSave(trimmed);
    onClose();
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopiert', 'Notiz wurde in die Zwischenablage kopiert.');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.editorWrap}>
          <TextInput
            style={styles.editor}
            multiline
            textAlignVertical="top"
            value={text}
            onChangeText={setText}
            placeholder="Notiz bearbeiten..."
            placeholderTextColor={colors.textDim}
            autoFocus
          />
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleCopy} activeOpacity={0.8}>
            <Ionicons name="copy-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.secondaryBtnText}>Kopieren</Text>
          </TouchableOpacity>

          {!!onDelete && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={onDelete} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Löschen</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} activeOpacity={0.8}>
            <Ionicons name="save-outline" size={18} color={colors.bg} />
            <Text style={styles.primaryBtnText}>Speichern</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.textPrimary,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
  },
  editorWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  editor: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 8,
    backgroundColor: colors.bg,
    color: colors.textPrimary,
    fontSize: 18,
    lineHeight: 28,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  footer: {
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
    paddingHorizontal: 14,
    paddingTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.bg,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.bg,
  },
});
