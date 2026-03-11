import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Modal,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore, KeyBinding } from '../store/appStore';
import { colors } from '../theme';

const ACTIONS = [
  { value: 'nextPage', label: 'Nächste Seite' },
  { value: 'prevPage', label: 'Vorherige Seite' },
  { value: 'openNotes', label: 'Notizen' },
  { value: 'toggleMenu', label: 'Menü' },
  { value: 'none', label: 'Keine' },
] as const;

const THEMES = [
  { value: 'dark', label: 'Dunkel' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'light', label: 'Hell' },
] as const;

export function SettingsScreen() {
  const router = useRouter();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const updateKeyBinding = useAppStore((s) => s.updateKeyBinding);

  const insets = useSafeAreaInsets();
  const [captureIndex, setCaptureIndex] = useState<number | null>(null);
  const [capturedKey, setCapturedKey] = useState<string>('');

  const handleCapture = (index: number) => {
    setCaptureIndex(index);
    setCapturedKey('');
  };

  const confirmCapture = () => {
    if (captureIndex !== null && capturedKey) {
      const label = capturedKey === ' ' ? 'Leertaste' : capturedKey;
      updateKeyBinding(captureIndex, { key: capturedKey, label });
    }
    setCaptureIndex(null);
    setCapturedKey('');
  };

  const cancelCapture = () => {
    setCaptureIndex(null);
    setCapturedKey('');
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Einstellungen</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Darstellung</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Lese-Thema</Text>
          <View style={styles.themeRow}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[
                  styles.themeBtn,
                  settings.theme === t.value && styles.themeBtnActive,
                ]}
                onPress={() => updateSettings({ theme: t.value })}
              >
                <Text
                  style={[
                    styles.themeBtnText,
                    settings.theme === t.value && styles.themeBtnTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.separator} />

          <Text style={styles.label}>Schriftgröße</Text>
          <View style={styles.fontSizeRow}>
            <TouchableOpacity
              style={styles.fontBtn}
              onPress={() => updateSettings({ fontSize: Math.max(18, settings.fontSize - 2) })}
            >
              <Text style={styles.fontBtnText}>A-</Text>
            </TouchableOpacity>
            <View style={styles.fontSizeDisplay}>
              <Text style={styles.fontSizeValue}>{settings.fontSize}px</Text>
            </View>
            <TouchableOpacity
              style={styles.fontBtn}
              onPress={() => updateSettings({ fontSize: Math.min(32, settings.fontSize + 2) })}
            >
              <Text style={styles.fontBtnText}>A+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.separator} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Bildschirm wach halten</Text>
              <Text style={styles.hint}>Verhindert, dass der Bildschirm beim Lesen ausgeht</Text>
            </View>
            <Switch
              value={settings.keepScreenAwake}
              onValueChange={(val) => updateSettings({ keepScreenAwake: val })}
              trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
              thumbColor={colors.switchThumb}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Tastenbelegung</Text>
        <Text style={styles.sectionHint}>
          Tippe auf eine Taste um sie zu ändern. Ideal für das physische Keyboard des Minimal Phone.
        </Text>
        <View style={styles.card}>
          {settings.keyBindings.map((binding, index) => (
            <View key={index}>
              {index > 0 && <View style={styles.separator} />}
              <View style={styles.bindingRow}>
                <TouchableOpacity
                  style={styles.keyChip}
                  onPress={() => handleCapture(index)}
                >
                  <Text style={styles.keyChipText}>{binding.label}</Text>
                </TouchableOpacity>
                <Ionicons name="arrow-forward" size={14} color={colors.textVeryDim} style={{ marginHorizontal: 8 }} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.actionChips}
                >
                  {ACTIONS.map((action) => (
                    <TouchableOpacity
                      key={action.value}
                      style={[
                        styles.actionChip,
                        binding.action === action.value && styles.actionChipActive,
                      ]}
                      onPress={() =>
                        updateKeyBinding(index, { action: action.value as KeyBinding['action'] })
                      }
                    >
                      <Text
                        style={[
                          styles.actionChipText,
                          binding.action === action.value && styles.actionChipTextActive,
                        ]}
                      >
                        {action.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={captureIndex !== null} transparent animationType="fade">
        <View style={styles.captureOverlay}>
          <View style={styles.captureCard}>
            <Text style={styles.captureTitle}>Taste drücken</Text>
            <Text style={styles.captureHint}>
              Drücke die gewünschte Taste auf dem physischen Keyboard
            </Text>
            <View style={styles.captureInputContainer}>
              <TextInput
                style={styles.captureInput}
                autoFocus
                maxLength={1}
                showSoftInputOnFocus={false}
                value=""
                onKeyPress={(e) => {
                  const key = e.nativeEvent.key;
                  if (key !== 'Backspace') {
                    setCapturedKey(key);
                  }
                }}
                caretHidden
              />
              <Text style={styles.capturedKeyDisplay}>
                {capturedKey
                  ? capturedKey === ' '
                    ? 'Leertaste'
                    : capturedKey
                  : '...'}
              </Text>
            </View>
            <View style={styles.captureActions}>
              <TouchableOpacity style={styles.captureCancelBtn} onPress={cancelCapture}>
                <Text style={styles.captureCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.captureConfirmBtn, !capturedKey && styles.captureConfirmBtnDisabled]}
                onPress={confirmCapture}
                disabled={!capturedKey}
              >
                <Text style={styles.captureConfirmText}>Bestätigen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  content: { padding: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionHint: { fontSize: 13, color: colors.textDim, marginBottom: 10, lineHeight: 18 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 8 },
  hint: { fontSize: 12, color: colors.textDim, marginTop: -4 },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 14 },

  themeRow: { flexDirection: 'row', gap: 8 },
  themeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  themeBtnActive: { borderColor: colors.textPrimary, borderWidth: 2 },
  themeBtnText: { fontSize: 13, color: colors.textDim, fontWeight: '600' },
  themeBtnTextActive: { color: colors.textPrimary },

  fontSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fontBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fontBtnText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  fontSizeDisplay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fontSizeValue: { fontSize: 16, color: colors.textPrimary, fontWeight: '700' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  bindingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyChip: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyChipText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  actionChips: { gap: 6 },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionChipActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  actionChipText: { fontSize: 12, color: colors.textDim },
  actionChipTextActive: { color: colors.bg, fontWeight: '600' },

  captureOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  captureCard: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  captureTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  captureHint: {
    fontSize: 13,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  captureInputContainer: {
    marginVertical: 24,
    alignItems: 'center',
  },
  captureInput: {
    width: 1,
    height: 1,
    opacity: 0,
    position: 'absolute',
  },
  capturedKeyDisplay: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    minWidth: 60,
    textAlign: 'center',
  },
  captureActions: { flexDirection: 'row', gap: 12, width: '100%' },
  captureCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  captureCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  captureConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
  },
  captureConfirmBtnDisabled: { opacity: 0.3 },
  captureConfirmText: { fontSize: 14, color: colors.bg, fontWeight: '700' },
});
