import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { colors, formatEur } from '../../theme';
import { useReveal } from './common';

type Slice = { label: string; value: number };

const SIZE = 150;
const STROKE = 22;
const GAP_DEG = 2.5;
/** S-Pankki greens from dark to light, largest slice darkest; "Muut" in grey. */
const RAMP = ['#004628', '#007841', '#00AA46', '#00EB5A', '#91FA9B'];
const OTHER = '#C7C7C7';

/** Shares of a whole as a ring that sweeps round, with the amounts listed beside it. */
export function DonutChart({ slices, total }: { slices: Slice[]; total: number }) {
  const reveal = useReveal(0, 1100);
  const sum = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const colorOf = (s: Slice, i: number) => (s.label === 'Muut' ? OTHER : RAMP[Math.min(i, RAMP.length - 1)]);

  const arcs = useMemo(() => {
    const r = (SIZE - STROKE) / 2;
    const oval = Skia.XYWHRect(STROKE / 2, STROKE / 2, r * 2, r * 2);
    const fractions = slices.map((x) => Math.max(0, x.value) / sum);
    return slices.map((x, i) => {
      const from = fractions.slice(0, i).reduce((s, f) => s + f, 0);
      const sweep = Math.max(0, fractions[i] * 360 - GAP_DEG);
      const builder = Skia.PathBuilder.Make();
      if (sweep > 0.5) builder.addArc(oval, -90 + from * 360 + GAP_DEG / 2, sweep);
      return { path: builder.detach(), from, to: from + fractions[i] };
    });
  }, [slices, sum]);

  const pct = (v: number) => `${Math.round((Math.max(0, v) / sum) * 100)} %`;

  return (
    <View style={styles.row}>
      <View style={styles.ring} accessible accessibilityLabel={slices.map((s) => `${s.label} ${formatEur(s.value, 0)}`).join(', ')}>
        <Canvas style={StyleSheet.absoluteFill}>
          {arcs.map((a, i) => (
            <Arc key={slices[i].label} path={a.path} from={a.from} to={a.to} reveal={reveal} color={colorOf(slices[i], i)} />
          ))}
        </Canvas>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerValue}>{pct(slices[0]?.value ?? 0)}</Text>
          <Text style={styles.centerLabel} numberOfLines={2}>
            {slices[0]?.label.toLowerCase()}
          </Text>
        </View>
      </View>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: colorOf(s, i) }]} />
            <Text style={styles.legendName} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={styles.legendValue}>{formatEur(s.value, 0)}</Text>
          </View>
        ))}
        <Text style={styles.total}>Yhteensä {formatEur(total, 0)}</Text>
      </View>
    </View>
  );
}

function Arc({ path, from, to, reveal, color }: { path: SkPath; from: number; to: number; reveal: SharedValue<number>; color: string }) {
  const end = useDerivedValue(() => Math.min(1, Math.max(0, (reveal.value - from) / Math.max(0.0001, to - from))));
  return <Path path={path} style="stroke" strokeWidth={STROKE} color={color} end={end} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: { width: SIZE, height: SIZE },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: STROKE + 6 },
  centerValue: { fontSize: 22, lineHeight: 26, fontWeight: '600', color: colors.text },
  centerLabel: { fontSize: 11, lineHeight: 14, color: colors.textSecondary, textAlign: 'center' },
  legend: { flex: 1, marginLeft: 16, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 3, marginRight: 8 },
  legendName: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.text },
  legendValue: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'], marginLeft: 6 },
  total: { fontSize: 12, lineHeight: 16, color: colors.textTertiary, marginTop: 2 },
});
