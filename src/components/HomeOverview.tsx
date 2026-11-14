import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Summary, SummaryTile } from '../shared/api';
import { colors, formatEur } from '../theme';
import { smoothPath } from './charts/common';

type Props = {
  summary: Summary | null;
  /** Shown when the summary could not be loaded. */
  fallback: string[];
  onAsk: (question: string) => void;
};

/**
 * The start screen below the orb, all visible at once: four facts about the
 * customer's own money (each asks its question when tapped) and two more
 * questions drawn from the same data.
 */
export function HomeOverview({ summary, fallback, onAsk }: Props) {
  const questions = summary?.suggestions ?? fallback;
  return (
    <View style={styles.root}>
      {summary ? (
        <View style={styles.grid}>
          {summary.tiles.map((tile) => (
            <Tile key={tile.id} tile={tile} onPress={() => onAsk(tile.question)} />
          ))}
        </View>
      ) : null}
      <View style={styles.questions}>
        {questions.map((q) => (
          <Pressable
            key={q}
            onPress={() => onAsk(q)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Text style={styles.chipText}>{q}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Tile({ tile, onPress }: { tile: SummaryTile; onPress: () => void }) {
  const value = tile.unit === '%' ? `${tile.value}%` : formatEur(tile.value, 0);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tile.label} ${value}. ${tile.question}`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {tile.label}
      </Text>
      <View style={styles.tileValueRow}>
        <Text style={[styles.tileValue, tile.tone === 'negative' && styles.negative]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {tile.spark ? <Spark values={tile.spark} /> : null}
        {tile.compare ? <Compare you={tile.compare[0]} peers={tile.compare[1]} /> : null}
      </View>
      <Text style={styles.tileSub} numberOfLines={1}>
        {tile.sub}
      </Text>
    </Pressable>
  );
}

const SPARK_W = 52;
const SPARK_H = 24;

/** Six months of spending as a tiny line, the last month marked. */
function Spark({ values }: { values: number[] }) {
  const { path, last } = useMemo(() => {
    const max = Math.max(...values, 1);
    const pts = values.map((v, i) => ({ x: 3 + (i / Math.max(1, values.length - 1)) * (SPARK_W - 6), y: SPARK_H - 3 - (v / max) * (SPARK_H - 6) }));
    return { path: smoothPath(pts), last: pts[pts.length - 1] };
  }, [values]);
  return (
    <Canvas style={styles.spark}>
      <Path path={path} style="stroke" strokeWidth={1.6} strokeCap="round" color={colors.green500} />
      <Circle cx={last.x} cy={last.y} r={2.6} color={colors.green900} />
    </Canvas>
  );
}

/** You against your age group, as two short bars. */
function Compare({ you, peers }: { you: number; peers: number }) {
  const [width, setWidth] = useState(0);
  const max = Math.max(you, peers, 0.01);
  return (
    <View style={styles.compare} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.compareBar, { width: (width * you) / max, backgroundColor: colors.green700 }]} />
      <View style={[styles.compareBar, { width: (width * peers) / max, backgroundColor: '#C7C7C7' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  tile: {
    width: '48.6%',
    backgroundColor: colors.surfaceSoft,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 15,
  },
  pressed: { backgroundColor: colors.surface },
  tileLabel: { fontSize: 13, lineHeight: 17, color: colors.textSecondary },
  tileValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  tileValue: { flexShrink: 1, fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.4, color: colors.text },
  negative: { color: colors.danger },
  tileSub: { fontSize: 12, lineHeight: 16, color: colors.textTertiary, marginTop: 4 },
  spark: { width: SPARK_W, height: SPARK_H, marginLeft: 'auto' },
  compare: { width: 46, marginLeft: 'auto', gap: 4 },
  compareBar: { height: 5, borderTopRightRadius: 3, borderBottomRightRadius: 3 },

  questions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { fontSize: 14, lineHeight: 19, color: colors.text },
});
