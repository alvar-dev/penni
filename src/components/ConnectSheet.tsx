import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { strings } from '../content';
import { colors, type } from '../theme';

type Step = 'consent' | 'auth' | 'done';

/**
 * Consent to read another bank's accounts (PSD2 account information), as a
 * native sheet. Signing in at the other bank is simulated in the demo.
 */
export function ConnectSheet({ visible, onClose, onConnected }: { visible: boolean; onClose: () => void; onConnected: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('consent');

  useEffect(() => {
    if (step === 'auth') {
      const t = setTimeout(() => setStep('done'), 1600);
      return () => clearTimeout(t);
    }
    if (step === 'done') {
      const t = setTimeout(onConnected, 700);
      return () => clearTimeout(t);
    }
  }, [step, onConnected]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onShow={() => setStep('consent')}>
      <View style={styles.sheet}>
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" disabled={step !== 'consent'}>
            <Text style={[styles.close, step !== 'consent' && styles.closeDisabled]}>{strings.connectClose}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{strings.connectTitle}</Text>
          <Text style={styles.lead}>{strings.connectLead}</Text>

          <View style={styles.bank}>
            <View style={styles.bankMark}>
              <Text style={styles.bankInitial}>{strings.connectBank.charAt(0)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.bankName}>{strings.connectBank}</Text>
              <Text style={styles.bankNote}>{strings.connectBankNote}</Text>
            </View>
          </View>

          <Text style={styles.section}>{strings.connectScopeTitle}</Text>
          <View style={styles.scope}>
            {strings.connectScope.map(([title, detail], i) => (
              <View key={title} style={[styles.scopeRow, i > 0 && styles.scopeLine]}>
                <Text style={styles.scopeTitle}>{title}</Text>
                <Text style={styles.scopeDetail}>{detail}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.legal}>{strings.connectLegal}</Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Pressable
            onPress={() => setStep('auth')}
            disabled={step !== 'consent'}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, step === 'done' && styles.buttonDone, pressed && step === 'consent' && styles.buttonPressed]}>
            {step === 'consent' ? (
              <Text style={styles.buttonText}>{strings.connectContinue}</Text>
            ) : step === 'auth' ? (
              <Animated.View entering={FadeIn.duration(180)} style={styles.buttonRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={[styles.buttonText, styles.buttonTextWait]}>{strings.connectAuthenticating}</Text>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(180)} style={styles.buttonRow}>
                <Text style={styles.buttonText}>✓ {strings.connectDone}</Text>
              </Animated.View>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 16 },
  close: { fontSize: 17, lineHeight: 22, color: colors.green700 },
  closeDisabled: { color: colors.textTertiary },
  body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.text },
  lead: { ...type.body, color: colors.textSecondary, marginTop: 10 },
  bank: { flexDirection: 'row', alignItems: 'center', marginTop: 24, padding: 14, borderRadius: 16, backgroundColor: colors.surface },
  bankMark: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D9D9D9', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  bankInitial: { fontSize: 17, fontWeight: '600', color: colors.text },
  bankName: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text },
  bankNote: { ...type.caption, color: colors.textSecondary },
  section: { ...type.caption, fontWeight: '600', color: colors.textSecondary, marginTop: 28, marginBottom: 4 },
  scope: {},
  scopeRow: { paddingVertical: 12 },
  scopeLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  scopeTitle: { fontSize: 16, lineHeight: 21, fontWeight: '500', color: colors.text },
  scopeDetail: { ...type.caption, color: colors.textSecondary, marginTop: 1 },
  legal: { ...type.caption, color: colors.textTertiary, marginTop: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  button: { height: 52, borderRadius: 26, backgroundColor: colors.green700, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { backgroundColor: colors.green900 },
  buttonDone: { backgroundColor: colors.green500 },
  buttonRow: { flexDirection: 'row', alignItems: 'center' },
  buttonText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: '#FFFFFF' },
  buttonTextWait: { marginLeft: 10 },
});
