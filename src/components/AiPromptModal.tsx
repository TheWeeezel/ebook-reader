import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { BACKEND_URL } from '../config/backend';

type ModalState = 'prompt' | 'loading' | 'result' | 'error';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveAsNote: (text: string) => void;
  onExtractText: () => Promise<string>;
  bookTitle: string;
}

export function AiPromptModal({
  visible,
  onClose,
  onSaveAsNote,
  onExtractText,
  bookTitle,
}: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const [state, setState] = useState<ModalState>('prompt');
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const sheetHeight = Math.max(320, Math.min(Math.round(screenHeight * (2 / 3)), screenHeight - 16));

  useEffect(() => {
    if (!visible) {
      setState('prompt');
      setInstruction('');
      setResult('');
      setError('');
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!instruction.trim()) {
      Alert.alert('Keine Anweisung', 'Bitte gib eine Anweisung ein.');
      return;
    }
    setState('loading');
    try {
      const documentText = await onExtractText();
      if (!documentText.trim()) {
        setError('Kein Text konnte aus dem Dokument extrahiert werden.');
        setState('error');
        return;
      }

      const maxChars = 500000;
      const truncatedText =
        documentText.length > maxChars
          ? documentText.substring(0, maxChars) + '\n\n[Text wurde gekuerzt]'
          : documentText;

      const response = await fetch(`${BACKEND_URL}/ai/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: truncatedText,
          instruction: instruction.trim(),
          bookTitle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as any).detail || `API-Fehler: ${response.status}`
        );
      }

      const data = await response.json();
      const aiText = (data as any).text || '';
      if (!aiText) {
        throw new Error('Leere Antwort von der KI.');
      }

      setResult(aiText);
      setState('result');
    } catch (err: any) {
      setError(err.message || 'Ein unbekannter Fehler ist aufgetreten.');
      setState('error');
    }
  };

  const handleSave = () => {
    onSaveAsNote(result);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>KI-Assistent</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {bookTitle}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {(state === 'result' || state === 'error') && (
                <TouchableOpacity
                  style={styles.headerSecondaryBtn}
                  onPress={() => setState('prompt')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-back" size={16} color={colors.textPrimary} />
                  <Text style={styles.headerSecondaryBtnText}>Neue Frage</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.contentArea}
          >
            {state === 'prompt' && (
              <>
                <View style={styles.composerWrap}>
                  <TextInput
                    style={styles.composerInput}
                    multiline
                    scrollEnabled
                    autoFocus
                    textAlignVertical="top"
                    placeholder="Was soll die KI aus dem Dokument extrahieren?"
                    placeholderTextColor={colors.textVeryDim}
                    value={instruction}
                    onChangeText={setInstruction}
                  />
                </View>
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleSubmit}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="sparkles" size={16} color={colors.bg} />
                    <Text style={styles.primaryBtnText}>Analysieren</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {state === 'loading' && (
              <View style={styles.centerContent}>
                <ActivityIndicator size="large" color={colors.textPrimary} />
                <Text style={styles.loadingText}>Dokument wird analysiert...</Text>
              </View>
            )}

            {state === 'result' && (
              <>
                <ScrollView
                  style={styles.resultScroll}
                  contentContainerStyle={styles.resultContent}
                >
                  <Text style={styles.resultText} selectable>
                    {result}
                  </Text>
                </ScrollView>
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleSave}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="save-outline" size={16} color={colors.bg} />
                    <Text style={styles.primaryBtnText}>Als Notiz speichern</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {state === 'error' && (
              <View style={styles.centerContent}>
                <Ionicons name="alert-circle-outline" size={40} color={colors.textPrimary} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => setState('prompt')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.retryBtnText}>Zurueck</Text>
                </TouchableOpacity>
              </View>
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
  contentArea: {
    flex: 1,
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
  footer: {
    borderTopWidth: 2,
    borderTopColor: colors.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  primaryBtn: {
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
  primaryBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
  },
  resultScroll: {
    flex: 1,
  },
  resultContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  resultText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  errorText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 16,
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
