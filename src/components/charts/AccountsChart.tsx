import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { strings } from '../../content';
import { BankLogo } from '../BankLogo';
import { colors, formatEur, type } from '../../theme';

type Bank = { id?: string; name: string; accounts: { name: string; balance: number; note?: string }[] };
type Props = { banks: Bank[]; connectable: boolean; footnote?: string; onConnect?: () => void };

/**
 * Every account in every connected bank, grouped by bank. Until another bank is
 * connected, the last row offers to connect one, right where the gap shows.
 */
export function AccountsChart({ banks, connectable, footnote, onConnect }: Props) {
  return (
    <View>
      {banks.map((bank, b) => (
        <Animated.View key={bank.name} entering={FadeIn.duration(320).delay(120 * b)} style={b > 0 && styles.bankGap}>
          <View style={styles.bankHeader}>
            {bank.id ? <BankLogo id={bank.id} size={20} /> : null}
            <Text style={[styles.bankName, !!bank.id && styles.bankNameWithLogo]}>{bank.name}</Text>
          </View>
          {bank.accounts.map((a, i) => (
            <View key={a.name} style={[styles.row, i > 0 && styles.rowLine]}>
              <View style={styles.rowBody}>
                <Text style={styles.account}>{a.name}</Text>
                {a.note ? <Text style={styles.note}>{a.note}</Text> : null}
              </View>
              <Text style={[styles.balance, a.balance < 0 && styles.debt]}>{formatEur(a.balance, Math.abs(a.balance) < 1000 && a.balance % 1 !== 0 ? 2 : 0)}</Text>
            </View>
          ))}
        </Animated.View>
      ))}

      {connectable ? (
        <Pressable
          onPress={onConnect}
          accessibilityRole="button"
          accessibilityLabel={banks.length > 1 ? strings.accountsConnectMore : strings.accountsConnect}
          style={({ pressed }) => [styles.connect, pressed && styles.connectPressed]}>
          <Text style={styles.connectPlus}>+</Text>
          <View style={styles.rowBody}>
            <Text style={styles.connectText}>{banks.length > 1 ? strings.accountsConnectMore : strings.accountsConnect}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ) : null}

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bankGap: { marginTop: 16 },
  bankHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  bankNameWithLogo: { marginLeft: 8 },
  bankName: { ...type.caption, fontWeight: '600', color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowBody: { flex: 1 },
  account: { fontSize: 16, lineHeight: 21, color: colors.text },
  note: { ...type.caption, color: colors.textTertiary },
  balance: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'], marginLeft: 12 },
  debt: { color: colors.textSecondary },
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.green300,
  },
  connectPressed: { backgroundColor: colors.greenTint },
  connectPlus: { fontSize: 22, lineHeight: 24, fontWeight: '400', color: colors.green700, width: 26 },
  connectText: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.green700 },
  chevron: { fontSize: 22, lineHeight: 24, color: colors.green700, marginLeft: 8 },
  footnote: { ...type.caption, color: colors.textSecondary, marginTop: 12 },
});
