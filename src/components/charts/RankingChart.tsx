import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { Basket } from '../../shared/api';
import { basketColors, colors, formatEur } from '../../theme';
import { LegendItem, useReveal } from './common';

type Row = { label: string; value: number; basket: Basket };

const BASKET_LABELS: Record<Basket, string> = {
  regular: 'Pakolliset, säännölliset',
  irregular: 'Pakolliset, yllättävät',
  everyday: 'Sormien läpi',
};

/** Spending by category, largest first, each bar in its basket's colour. */
export function RankingChart({ rows }: { rows: Row[] }) {
  const reveal = useReveal(0, 1000);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const present = (['regular', 'irregular', 'everyday'] as Basket[]).filter((b) => rows.some((r) => r.basket === b));

  return (
    <View>
      <View style={styles.rows}>
        {rows.map((r, i) => (
          <RankRow key={r.label} row={r} max={max} total={total} reveal={reveal} order={i / Math.max(1, rows.length)} />
        ))}
      </View>
      <View style={styles.legend}>
        {present.map((b) => (
          <LegendItem key={b} color={basketColors[b]} label={BASKET_LABELS[b]} swatch />
        ))}
      </View>
    </View>
  );
}

function RankRow({ row, max, total, reveal, order }: { row: Row; max: number; total: number; reveal: SharedValue<number>; order: number }) {
  // Bars grow one after another, top first.
  const fill = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (reveal.value - order * 0.4) / 0.6));
    return { width: `${(row.value / max) * 100 * t}%` };
  });
  return (
    <View accessible accessibilityLabel={`${row.label} ${formatEur(row.value, 0)}`}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={styles.share}>{Math.round((row.value / total) * 100)} %</Text>
        <Text style={styles.value}>{formatEur(row.value, 0)}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: basketColors[row.basket] }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 5 },
  name: { flex: 1, fontSize: 14, lineHeight: 19, color: colors.text },
  share: { fontSize: 12, lineHeight: 16, color: colors.textTertiary, marginRight: 10, fontVariant: ['tabular-nums'] },
  value: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'right' },
  track: { height: 10 },
  fill: { height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, rowGap: 6 },
});
