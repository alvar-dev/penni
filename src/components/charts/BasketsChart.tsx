import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { BasketPart } from '../../shared/api';
import { basketColors, colors, formatEur, type } from '../../theme';
import { useReveal } from './common';

type Props = { parts: BasketPart[]; share: number; peerShare: number; peerLabel: string };

const SIZE = 132;
const STROKE = 16;
const GAP_DEG = 3;

/** The three baskets as a ring, and the everyday share against people of the same age. */
export function BasketsChart({ parts, share, peerShare, peerLabel }: Props) {
  const reveal = useReveal(0, 1100);
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;

  const arcs = useMemo(() => {
    const r = (SIZE - STROKE) / 2;
    const oval = Skia.XYWHRect(STROKE / 2, STROKE / 2, r * 2, r * 2);
    const fractions = parts.map((p) => Math.max(0, p.value) / total);
    return parts.map((p, i) => {
      const from = fractions.slice(0, i).reduce((s, f) => s + f, 0);
      const sweep = Math.max(0, fractions[i] * 360 - GAP_DEG);
      const builder = Skia.PathBuilder.Make();
      if (sweep > 0.5) builder.addArc(oval, -90 + from * 360 + GAP_DEG / 2, sweep);
      return { path: builder.detach(), from, to: from + fractions[i], basket: p.basket };
    });
  }, [parts, total]);

  const pct = (v: number) => `${Math.round(v * 100)}\u00A0%`;

  return (
    <View>
      <View style={styles.top}>
        <View style={styles.ring} accessible accessibilityLabel={parts.map((p) => `${p.name} ${formatEur(p.value, 0)}`).join(', ')}>
          <Canvas style={StyleSheet.absoluteFill}>
            {arcs.map((a) => (
              <Arc key={a.basket} path={a.path} from={a.from} to={a.to} reveal={reveal} color={basketColors[a.basket]} />
            ))}
          </Canvas>
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.centerValue}>{pct(share)}</Text>
            <Text style={styles.centerLabel}>sormien läpi</Text>
          </View>
        </View>

        <View style={styles.legend}>
          {parts.map((p) => (
            <View key={p.basket} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: basketColors[p.basket] }]} />
              <View style={styles.legendText}>
                <Text style={styles.legendName}>{p.name}</Text>
                <Text style={styles.legendValue}>
                  {formatEur(p.value, 0)} · {pct(Math.max(0, p.value) / total)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.compareTitle}>Sormien läpi menevä osuus</Text>
      <CompareBar label="Sinä" value={share} max={Math.max(share, peerShare, 0.01)} color={colors.green700} reveal={reveal} />
      <CompareBar label={peerLabel} value={peerShare} max={Math.max(share, peerShare, 0.01)} color="#C7C7C7" reveal={reveal} note="mediaani" />
    </View>
  );
}

function Arc({ path, from, to, reveal, color }: { path: SkPath; from: number; to: number; reveal: SharedValue<number>; color: string }) {
  // Each arc draws in turn as the ring sweeps round.
  const end = useDerivedValue(() => Math.min(1, Math.max(0, (reveal.value - from) / Math.max(0.0001, to - from))));
  return <Path path={path} style="stroke" strokeWidth={STROKE} color={color} end={end} />;
}

function CompareBar({ label, value, max, color, reveal, note }: { label: string; value: number; max: number; color: string; reveal: SharedValue<number>; note?: string }) {
  const fill = useAnimatedStyle(() => ({ width: `${(value / max) * 100 * reveal.value}%` }));
  return (
    <View style={styles.compare}>
      <View style={styles.compareHead}>
        <Text style={styles.compareLabel}>
          {label}
          {note ? <Text style={styles.compareNote}> · {note}</Text> : null}
        </Text>
        <Text style={styles.compareValue}>{Math.round(value * 100)}\u00A0%</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center' },
  ring: { width: SIZE, height: SIZE },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  centerValue: { fontSize: 24, lineHeight: 28, fontWeight: '600', color: colors.text },
  centerLabel: { fontSize: 11, lineHeight: 14, color: colors.textSecondary },
  legend: { flex: 1, marginLeft: 18, gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start' },
  swatch: { width: 10, height: 10, borderRadius: 3, marginTop: 5, marginRight: 8 },
  legendText: { flex: 1 },
  legendName: { fontSize: 13, lineHeight: 18, color: colors.text },
  legendValue: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  compareTitle: { ...type.caption, color: colors.textSecondary, marginTop: 18, marginBottom: 8 },
  compare: { marginBottom: 10 },
  compareHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  compareLabel: { fontSize: 13, lineHeight: 18, color: colors.text },
  compareNote: { color: colors.textTertiary },
  compareValue: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  track: { height: 10 },
  fill: { height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
