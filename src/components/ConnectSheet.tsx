import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { strings } from '../content';
import { OTHER_BANKS, type OtherBankInfo } from '../shared/banks';
import { colors, type } from '../theme';
import { BankLogo } from './BankLogo';

type Step = 'choose' | 'consent' | 'auth' | 'done';

/**
 * Connecting another bank (PSD2 account information) as a native sheet: pick
 * the bank, read what the consent covers, then sign in at that bank. The
 * sign-in is only simulated in the demo, with no login form of the bank's own.
 */
export function ConnectSheet({ visible, onClose, onConnected }: { visible: boolean; onClose: () => void; onConnected: (bankId: string) => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('choose');
  const [bank, setBank] = useState<OtherBankInfo | null>(null);

  useEffect(() => {
    if (step === 'auth') {
      const t = setTimeout(() => setStep('done'), 1600);
      return () => clearTimeout(t);
    }
    if (step === 'done' && bank) {
      const t = setTimeout(() => onConnected(bank.id), 700);
      return () => clearTimeout(t);
    }
  }, [step, bank, onConnected]);

  const busy = step === 'auth' || step === 'done';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={() => {
        setStep('choose');
        setBank(null);
      }}>
      <View style={styles.sheet}>
        <View style={styles.top}>
          {step === 'consent' ? (
            <Pressable onPress={() => setStep('choose')} hitSlop={12} accessibilityRole="button">
              <Text style={styles.topAction}>‹ {strings.connectBack}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" disabled={busy}>
            <Text style={[styles.topAction, busy && styles.topActionDisabled]}>{strings.connectClose}</Text>
          </Pressable>
        </View>

        {step === 'choose' || !bank ? (
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{strings.connectTitle}</Text>
            <Text style={styles.lead}>{strings.connectLead}</Text>
            <Text style={styles.section}>{strings.connectChoose}</Text>
            {OTHER_BANKS.map((b, i) => (
              <Pressable
                key={b.id}
                onPress={() => {
                  setBank(b);
                  setStep('consent');
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.bankRow, i > 0 && styles.line, pressed && styles.pressed]}>
                <BankLogo id={b.id} size={36} />
                <Text style={styles.bankRowName}>{b.name}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
            <Text style={styles.legal}>{strings.connectBankNote}.</Text>
          </ScrollView>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <Animated.View entering={FadeIn.duration(220)}>
                <Text style={styles.title}>{strings.connectTitle}</Text>
                <View style={styles.bank}>
                  <BankLogo id={bank.id} size={44} />
                  <View style={styles.flex}>
                    <Text style={styles.bankName}>{bank.name}</Text>
                    <Text style={styles.bankNote}>{strings.connectBankNote}</Text>
                  </View>
                </View>

                <Text style={styles.section}>{strings.connectScopeTitle}</Text>
                {strings.connectScope.map(([title, detail], i) => (
                  <View key={title} style={[styles.scopeRow, i > 0 && styles.line]}>
                    <Text style={styles.scopeTitle}>{title}</Text>
                    <Text style={styles.scopeDetail}>{detail}</Text>
                  </View>
                ))}

                <Text style={styles.legal}>{strings.connectLegal}</Text>
              </Animated.View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <Pressable
                onPress={() => setStep('auth')}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [styles.button, step === 'done' && styles.buttonDone, pressed && !busy && styles.buttonPressed]}>
                {step === 'consent' ? (
                  <Text style={styles.buttonText}>{strings.connectContinue}</Text>
                ) : step === 'auth' ? (
                  <Animated.View entering={FadeIn.duration(180)} style={styles.buttonRow}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={[styles.buttonText, styles.buttonTextWait]}>{strings.connectAuthenticating.replace('{bank}', bank.inessive)}</Text>
                  </Animated.View>
                ) : (
                  <Animated.View entering={FadeIn.duration(180)} style={styles.buttonRow}>
                    <Text style={styles.buttonText}>✓ {strings.connectDone}</Text>
                  </Animated.View>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  topAction: { fontSize: 17, lineHeight: 22, color: colors.green700 },
  topActionDisabled: { color: colors.textTertiary },
  body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.text },
  lead: { ...type.body, color: colors.textSecondary, marginTop: 10 },
  section: { ...type.caption, fontWeight: '600', color: colors.textSecondary, marginTop: 28, marginBottom: 4 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surface },
  bankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  bankRowName: { flex: 1, fontSize: 17, lineHeight: 22, color: colors.text, marginLeft: 14 },
  chevron: { fontSize: 22, lineHeight: 24, color: colors.textTertiary },
  bank: { flexDirection: 'row', alignItems: 'center', marginTop: 20, padding: 14, borderRadius: 16, backgroundColor: colors.surface, gap: 12 },
  bankName: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text },
  bankNote: { ...type.caption, color: colors.textSecondary },
  scopeRow: { paddingVertical: 12 },
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
