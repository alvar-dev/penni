import { Canvas, Circle, DashPathEffect, Group, Line, LinearGradient, Path, vec } from '@shopify/react-native-skia';
import { tr } from '../../lang';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue } from 'react-native-reanimated';

import type { BasketPart } from '../../shared/api';
import { basketColors, colors, formatEur, type } from '../../theme';
import { axisText, formatAxis, LegendItem, linear, niceTicks, smoothArea, smoothPath, straightPath, Tooltip, useReveal, useScrub, useWidth } from './common';

type Point = { label: string; title: string; balance: number; projected: boolean };
type Props = { points: Point[]; value: number; perDay: number; days: number; paydayLabel: string; parts: BasketPart[] };

const HEIGHT = 200;
const TOP = 46;
const BOTTOM = 22;
const LEFT = 44;
/** The expected path: a line in mid green over a mint area (the free money). */
const AHEAD_LINE = colors.green500;
const AHEAD_FILL = basketColors.everyday;

/**
 * The balance over the last three weeks, then the expected path to payday if
 * only the necessities are paid. Whatever is left at payday is free to spend.
 */
export function RunwayChart({ points, value, perDay, days, paydayLabel, parts }: Props) {
  const [width, onLayout] = useWidth();
  const today = points.findIndex((p) => p.projected) - 1;
  const todayIndex = today >= 0 ? today : points.length - 1;
  const [picked, setPicked] = useState(todayIndex);
  const reveal = useReveal();
  const projectionReveal = useReveal(700, 700);
  const fill = useDerivedValue(() => projectionReveal.value);
  const aheadOpacity = useDerivedValue(() => projectionReveal.value * (value < 0 ? 0.14 : 0.55));

  const g = useMemo(() => {
    const balances = points.map((p) => p.balance);
    const ticks = niceTicks(Math.min(...balances, 0), Math.max(...balances, 1));
    // The days ahead get 38 % of the width however few they are: they are the point.
    const plotW = Math.max(1, width - LEFT - 12);
    const split = todayIndex < points.length - 1 ? 0.62 : 1;
    const ahead = Math.max(1, points.length - 1 - todayIndex);
    const x = (i: number) =>
      LEFT + 4 + (i <= todayIndex ? (i / Math.max(1, todayIndex)) * split * plotW : (split + ((i - todayIndex) / ahead) * (1 - split)) * plotW);
    const y = linear(ticks[0], ticks[ticks.length - 1], HEIGHT - BOTTOM, TOP);
    const pts = points.map((p, i) => ({ x: x(i), y: y(p.balance) }));
    const past = pts.slice(0, todayIndex + 1);
    const future = pts.slice(todayIndex);
    const end = future[future.length - 1];
    return {
      ticks,
      x,
      y,
      pts,
      pastLine: smoothPath(past),
      pastArea: smoothArea(past, y(0)),
      aheadLine: straightPath(future),
      aheadArea: straightPath(future, y(0)),
      end,
    };
  }, [points, width, todayIndex]);

  const xs = useMemo(() => g.pts.map((p) => p.x), [g]);
  const scrub = useScrub(xs, setPicked);
  const active = g.pts[picked];
  const negative = value < 0;
  const aheadColor = negative ? colors.danger : AHEAD_LINE;
  const aheadFill = negative ? colors.danger : AHEAD_FILL;

  return (
    <View>
      <View onLayout={onLayout} accessible accessibilityLabel={tr(`Saldo nyt ${formatEur(points[todayIndex].balance, 0)}, arvio palkkapäivänä ${formatEur(value, 0)}`, `Balance now ${formatEur(points[todayIndex].balance, 0)}, about ${formatEur(value, 0)} on payday`)}>
        {width > 0 ? (
          <GestureDetector gesture={scrub}>
            <View style={{ height: HEIGHT }}>
              <Canvas style={StyleSheet.absoluteFill}>
                {g.ticks.map((t) => (
                  <Line key={t} p1={vec(LEFT, g.y(t))} p2={vec(width, g.y(t))} color={t === 0 ? colors.textTertiary : colors.border} strokeWidth={t === 0 ? 1 : StyleSheet.hairlineWidth} />
                ))}
                <Path path={g.pastArea} opacity={fill}>
                  <LinearGradient start={vec(0, TOP)} end={vec(0, HEIGHT - BOTTOM)} colors={['rgba(0,170,70,0.22)', 'rgba(0,170,70,0.02)']} />
                </Path>
                <Path path={g.aheadArea} color={aheadFill} opacity={aheadOpacity} />
                <Path path={g.pastLine} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={colors.green700} end={reveal} />
                <Path path={g.aheadLine} style="stroke" strokeWidth={2} strokeCap="round" color={aheadColor} end={projectionReveal}>
                  <DashPathEffect intervals={[5, 4]} />
                </Path>
                <Line p1={vec(g.pts[todayIndex].x, TOP - 6)} p2={vec(g.pts[todayIndex].x, HEIGHT - BOTTOM)} color={colors.textTertiary} strokeWidth={StyleSheet.hairlineWidth} />
                <Group opacity={fill}>
                  <Circle cx={g.end.x} cy={g.end.y} r={5.5} color={colors.bg} />
                  <Circle cx={g.end.x} cy={g.end.y} r={4} color={aheadColor} />
                </Group>
                {active ? (
                  <Group>
                    <Line p1={vec(active.x, TOP - 4)} p2={vec(active.x, HEIGHT - BOTTOM)} color={colors.green300} strokeWidth={1} />
                    <Circle cx={active.x} cy={active.y} r={6} color={colors.bg} />
                    <Circle cx={active.x} cy={active.y} r={4.5} color={points[picked].projected ? aheadColor : colors.green700} />
                  </Group>
                ) : null}
              </Canvas>

              {g.ticks.map((t) => (
                <Text key={t} style={[axisText, styles.yLabel, { top: g.y(t) - 7 }]}>
                  {formatAxis(t)}
                </Text>
              ))}
              <Text style={[axisText, styles.xLabel, { left: LEFT }]}>{points[0].label}</Text>
              <Text style={[axisText, styles.xLabel, styles.today, { left: g.pts[todayIndex].x - 30 }]}>{tr('tänään', 'today')}</Text>
              <Text style={[axisText, styles.xLabel, styles.payday]}>{paydayLabel}</Text>
              {active ? (
                <Tooltip
                  x={active.x}
                  width={width}
                  title={`${points[picked].title}${points[picked].projected ? ' · arvio' : ''}`}
                  value={formatEur(points[picked].balance, 0)}
                />
              ) : null}
            </View>
          </GestureDetector>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>

      <View style={styles.legend}>
        <LegendItem color={colors.green700} label={tr('Saldo', 'Balance')} />
        <LegendItem color={aheadColor} label={tr('Arvio, jos maksat vain pakolliset', 'Forecast if you pay only essentials')} dashed />
      </View>

      <View style={styles.rows}>
        {parts.map((p) => (
          <View key={p.basket} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: basketColors[p.basket] }]} />
            <Text style={styles.rowName}>{p.name}</Text>
            <Text style={styles.rowValue}>{formatEur(p.value, 0)}</Text>
          </View>
        ))}
      </View>
      {value > 0 ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {tr(
              `≈ ${formatEur(perDay, 0)} päivässä · ${days} ${days === 1 ? 'päivä' : 'päivää'} palkkaan`,
              `≈ ${formatEur(perDay, 0)} a day · ${days} ${days === 1 ? 'day' : 'days'} to payday`,
            )}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', left: 0, width: LEFT - 6, textAlign: 'right' },
  xLabel: { position: 'absolute', bottom: 0 },
  today: { width: 60, textAlign: 'center', color: colors.textSecondary },
  payday: { right: 0, color: colors.textSecondary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 4 },
  rows: { marginTop: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 3, marginRight: 10 },
  rowName: { ...type.label, color: colors.text, flex: 1 },
  rowValue: { ...type.label, color: colors.text, fontVariant: ['tabular-nums'] },
  pill: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: colors.greenTint, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.green700 },
});
