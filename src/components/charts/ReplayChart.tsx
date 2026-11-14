import { Canvas, Circle, DashPathEffect, Group, Line, LinearGradient, Path, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue } from 'react-native-reanimated';

import { colors, formatEur, type } from '../../theme';
import { axisText, formatAxis, LegendItem, linear, niceTicks, smoothArea, smoothPath, useReveal, useScrub, useWidth } from './common';

type Point = { label: string; title: string; actual: number; withFund: number };
type Props = {
  points: Point[];
  event: { index: number; label: string };
  overdrawnDays: { actual: number; withFund: number };
};

const HEIGHT = 210;
const TOP = 30;
const BOTTOM = 22;
const LEFT = 44;
const AS_IT_WENT = '#9E9E9E';

/**
 * The balance around the costliest surprise, as it went (grey) and as it would
 * have gone with a surprise fund (green). Days below zero are tinted red.
 */
export function ReplayChart({ points, event, overdrawnDays }: Props) {
  const [width, onLayout] = useWidth();
  const [picked, setPicked] = useState(event.index);
  const reveal = useReveal(0, 1100);
  const fundReveal = useReveal(500, 1000);
  const fill = useDerivedValue(() => fundReveal.value);

  const g = useMemo(() => {
    const values = points.flatMap((p) => [p.actual, p.withFund]);
    const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 1));
    const plotW = Math.max(1, width - LEFT - 10);
    const x = (i: number) => LEFT + 4 + (i / Math.max(1, points.length - 1)) * plotW;
    const y = linear(ticks[0], ticks[ticks.length - 1], HEIGHT - BOTTOM, TOP);
    const actual = points.map((p, i) => ({ x: x(i), y: y(p.actual) }));
    const fund = points.map((p, i) => ({ x: x(i), y: y(p.withFund) }));
    return {
      ticks,
      x,
      y,
      actual,
      fund,
      actualLine: smoothPath(actual),
      actualArea: smoothArea(actual, y(0)),
      fundLine: smoothPath(fund),
      fundArea: smoothArea(fund, HEIGHT - BOTTOM),
    };
  }, [points, width]);

  const xs = useMemo(() => g.actual.map((p) => p.x), [g]);
  const scrub = useScrub(xs, setPicked);
  const zeroY = g.y(0);
  const ex = g.x(event.index);
  const p = points[picked];
  const tipLeft = Math.max(0, Math.min(width - 168, g.x(picked) - 84));

  return (
    <View>
      <View
        onLayout={onLayout}
        accessible
        accessibilityLabel={`Menon ${event.label} jälkeen ${overdrawnDays.actual} päivää miinuksella, yllätysrahaston kanssa ${overdrawnDays.withFund}`}>
        {width > 0 ? (
          <GestureDetector gesture={scrub}>
            <View style={{ height: HEIGHT }}>
              <Canvas style={StyleSheet.absoluteFill}>
                {g.ticks.map((t) => (
                  <Line key={t} p1={vec(LEFT, g.y(t))} p2={vec(width, g.y(t))} color={t === 0 ? colors.textTertiary : colors.border} strokeWidth={t === 0 ? 1 : StyleSheet.hairlineWidth} />
                ))}

                <Path path={g.fundArea} opacity={fill}>
                  <LinearGradient start={vec(0, TOP)} end={vec(0, HEIGHT - BOTTOM)} colors={['rgba(0,170,70,0.20)', 'rgba(0,170,70,0.01)']} />
                </Path>
                {/* Overdrawn: the part of the as-it-went area below zero. */}
                <Group clip={{ x: 0, y: zeroY, width, height: HEIGHT - zeroY }}>
                  <Path path={g.actualArea} color={colors.danger} opacity={0.16} />
                </Group>

                <Line p1={vec(ex, TOP - 8)} p2={vec(ex, HEIGHT - BOTTOM)} color={colors.textSecondary} strokeWidth={1}>
                  <DashPathEffect intervals={[3, 3]} />
                </Line>

                <Path path={g.actualLine} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={AS_IT_WENT} end={reveal} />
                <Path path={g.fundLine} style="stroke" strokeWidth={2.4} strokeCap="round" strokeJoin="round" color={colors.green700} end={fundReveal} />

                <Line p1={vec(g.x(picked), TOP)} p2={vec(g.x(picked), HEIGHT - BOTTOM)} color={colors.green300} strokeWidth={1} />
                <Group>
                  <Circle cx={g.x(picked)} cy={g.actual[picked].y} r={5.5} color={colors.bg} />
                  <Circle cx={g.x(picked)} cy={g.actual[picked].y} r={4} color={AS_IT_WENT} />
                  <Circle cx={g.x(picked)} cy={g.fund[picked].y} r={5.5} color={colors.bg} />
                  <Circle cx={g.x(picked)} cy={g.fund[picked].y} r={4} color={colors.green700} />
                </Group>
              </Canvas>

              {g.ticks.map((t) => (
                <Text key={t} style={[axisText, styles.yLabel, { top: g.y(t) - 7 }]}>
                  {formatAxis(t)}
                </Text>
              ))}
              <Text style={[axisText, styles.eventLabel, { left: Math.max(LEFT, Math.min(width - 150, ex - 75)) }]} numberOfLines={1}>
                {event.label}
              </Text>
              <Text style={[axisText, styles.xLabel, { left: LEFT }]}>{points[0].label}</Text>
              <Text style={[axisText, styles.xLabel, styles.xRight]}>{points[points.length - 1].label}</Text>

              {picked !== event.index ? (
                <View style={[styles.tip, { left: tipLeft }]} pointerEvents="none">
                  <Text style={styles.tipTitle}>{p.title}</Text>
                  <Text style={styles.tipRow}>
                    <Text style={{ color: '#CFCFCF' }}>● </Text>
                    {formatEur(p.actual, 0)}
                    <Text style={{ color: colors.green200 }}>{'   ● '}</Text>
                    {formatEur(p.withFund, 0)}
                  </Text>
                </View>
              ) : null}
            </View>
          </GestureDetector>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>

      <View style={styles.legend}>
        <LegendItem color={AS_IT_WENT} label="Toteutunut" />
        <LegendItem color={colors.green700} label="Yllätysrahaston kanssa" />
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, overdrawnDays.actual > 0 && styles.statBad]}>{overdrawnDays.actual}</Text>
          <Text style={styles.statLabel}>päivää miinuksella{'\n'}kuukauden aikana</Text>
        </View>
        <Text style={styles.statArrow}>→</Text>
        <View style={styles.stat}>
          <Text style={[styles.statValue, styles.statGood]}>{overdrawnDays.withFund}</Text>
          <Text style={styles.statLabel}>yllätysrahaston{'\n'}kanssa</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', left: 0, width: LEFT - 6, textAlign: 'right' },
  xLabel: { position: 'absolute', bottom: 0 },
  xRight: { right: 0 },
  eventLabel: { position: 'absolute', top: 4, width: 150, textAlign: 'center', color: colors.textSecondary, fontWeight: '600' },
  tip: { position: 'absolute', top: 0, width: 168, backgroundColor: colors.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  tipTitle: { fontSize: 11, lineHeight: 14, color: '#D9D9D9' },
  tipRow: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 4 },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 14 },
  stat: { flex: 1 },
  statValue: { fontSize: 28, lineHeight: 32, fontWeight: '600', color: colors.text },
  statBad: { color: colors.danger },
  statGood: { color: colors.green700 },
  statLabel: { ...type.caption, color: colors.textSecondary },
  statArrow: { fontSize: 20, color: colors.textTertiary },
});
