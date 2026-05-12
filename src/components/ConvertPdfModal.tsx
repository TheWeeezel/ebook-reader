import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { colors } from '../theme';
import { Book } from '../store/appStore';
import {
  createConversion,
  downloadEpub,
  startConversion,
  uploadPdf,
} from '../services/conversion';

type Stage =
  | 'idle'
  | 'uploading'
  | 'converting'
  | 'downloading'
  | 'done'
  | 'error';

interface Props {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onDone: (info: { uri: string; title: string }) => void;
}

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  uploading: 'PDF wird hochgeladen…',
  converting: 'Konvertierung läuft (kann mehrere Minuten dauern)…',
  downloading: 'EPUB wird heruntergeladen…',
  done: 'Fertig!',
  error: 'Fehler',
};

export function ConvertPdfModal({ visible, book, onClose, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [polishStatus, setPolishStatus] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) {
      setStage('idle');
      setErrorMsg('');
      setPolishStatus(undefined);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !book || stage !== 'idle') return;
    runConversion(book);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, book]);

  const stripExt = (name: string) => name.replace(/\.pdf$/i, '').trim() || 'Document';

  const sanitizeFilename = (name: string) =>
    name.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 120);

  const pickUniqueDestUri = async (booksDir: string, base: string): Promise<string> => {
    let dest = `${booksDir}${base}.epub`;
    let n = 1;
    while ((await FileSystem.getInfoAsync(dest)).exists) {
      dest = `${booksDir}${base} (${n}).epub`;
      n += 1;
    }
    return dest;
  };

  const runConversion = async (src: Book) => {
    const title = stripExt(src.title);
    try {
      setStage('uploading');
      const { jobId, uploadUrl } = await createConversion(title);
      await uploadPdf(uploadUrl, src.uri);

      setStage('converting');
      const result = await startConversion(jobId);
      if (result.status !== 'done' || !result.downloadUrl) {
        throw new Error(result.error || `unerwarteter Status: ${result.status}`);
      }
      setPolishStatus(result.polishStatus);

      setStage('downloading');
      const booksDir = FileSystem.documentDirectory + 'books/';
      await FileSystem.makeDirectoryAsync(booksDir, { intermediates: true });
      const base = sanitizeFilename(title);
      const destUri = await pickUniqueDestUri(booksDir, base);
      await downloadEpub(result.downloadUrl, destUri);

      const destFilename = destUri.split('/').pop() ?? `${base}.epub`;
      setStage('done');
      onDone({ uri: destUri, title: destFilename });
    } catch (err: any) {
      console.error('conversion failed:', err);
      setErrorMsg(err?.message || 'Unbekannter Fehler.');
      setStage('error');
    }
  };

  const retry = () => {
    if (!book) return;
    setErrorMsg('');
    setPolishStatus(undefined);
    runConversion(book);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="swap-horizontal-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.headerTitle}>PDF → EPUB</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.bookTitle} numberOfLines={2}>
            {book?.title ?? ''}
          </Text>

          {stage !== 'done' && stage !== 'error' && (
            <View style={styles.stageBlock}>
              <ActivityIndicator size="large" color={colors.textPrimary} />
              <Text style={styles.stageLabel}>{STAGE_LABEL[stage]}</Text>
            </View>
          )}

          {stage === 'done' && (
            <View style={styles.stageBlock}>
              <Ionicons name="checkmark-circle-outline" size={36} color={colors.textPrimary} />
              <Text style={styles.stageLabel}>EPUB wurde zur Bibliothek hinzugefügt.</Text>
              {polishStatus && polishStatus !== 'polished' && (
                <Text style={styles.note}>
                  {polishStatus === 'polished_partial'
                    ? 'Hinweis: Dokument war sehr groß — nur der Anfang wurde KI-poliert.'
                    : 'Hinweis: KI-Politur übersprungen.'}
                </Text>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
                <Text style={styles.primaryBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          )}

          {stage === 'error' && (
            <View style={styles.stageBlock}>
              <Ionicons name="alert-circle-outline" size={36} color={colors.textPrimary} />
              <Text style={styles.errorText}>{errorMsg}</Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
                  <Text style={styles.secondaryBtnText}>Schließen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={retry}>
                  <Text style={styles.primaryBtnText}>Erneut versuchen</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.36)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: colors.textPrimary,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  stageBlock: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  stageLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  note: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
    opacity: 0.75,
  },
  errorText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  primaryBtn: {
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.bg, fontSize: 14, fontWeight: '700' },
  secondaryBtn: {
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
});
