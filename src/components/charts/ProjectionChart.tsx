import { Canvas, Circle, Group, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue } from 'react-native-reanimated';

import { colors, formatEur } from '../../theme';
import { axisText, formatAxis, LegendItem, linear, niceTicks, straightPath, Tooltip, useReveal, useScrub, useWidth } from './common';

type Props = { nowMonthly: number; afterMonthly: number; changeLabel: string; yearly: number };

const HEIGHT = 190;
const TOP = 46;
const BOTTOM = 22;
const LEFT = 48;
const MONTHS = 12;
const NOW = '#9E9E9E';

/**
 * Spending added up month by month over a year, at today's pace and after the
 * change. The wedge between the two lines is what the change saves.
 */
export function ProjectionChart({ nowMonthly, afterMonthly, changeLabel, yearly }: Props) {
  const [width, onLayout] = useWidth();
  const [picked, setPicked] = useState(MONTHS);
  const reveal = useReveal();
  const wedgeOpacity = useDerivedValue(() => reveal.value * 0.18);
  const saving = nowMonthly >= afterMonthly;

  const g = useMemo(() => {
    const ticks = niceTicks(0, Math.max(nowMonthly, afterMonthly) * MONTHS);
    const plotW = Math.max(1, width - LEFT - 12);
    const x = (m: number) => LEFT + 4 + (m / MONTHS) * plotW;
    const y = linear(0, ticks[ticks.length - 1], HEIGHT - BOTTOM, TOP);
    const months = Array.from({ length: MONTHS + 1 }, (_, m) => m);
    const now = months.map((m) => ({ x: x(m), y: y(nowMonthly * m) }));
    const after = months.map((m) => ({ x: x(m), y: y(afterMonthly * m) }));
    const wedge = Skia.PathBuilder.Make()
      .moveTo(now[0].x, now[0].y)
      .lineTo(now[MONTHS].x, now[MONTHS].y)
      .lineTo(after[MONTHS].x, after[MONTHS].y)
      .close()
      .detach();
    return { ticks, x, y, now, after, nowLine: straightPath(now), afterLine: straightPath(after), wedge };
  }, [nowMonthly, afterMonthly, width]);

  const xs = useMemo(() => g.now.map((p) => p.x), [g]);
  const scrub = useScrub(xs, setPicked);
  const difference = (yearly * picked) / MONTHS;

  return (
    <View>
      <View onLayout={onLayout} accessible accessibilityLabel={`In a year at today's pace ${formatEur(nowMonthly * 12, 0)}, after the change ${formatEur(afterMonthly * 12, 0)}`}>
        {width > 0 ? (
          <GestureDetector gesture={scrub}>
            <View style={{ height: HEIGHT }}>
              <Canvas style={StyleSheet.absoluteFill}>
                {g.ticks.map((t) => (
                  <Line key={t} p1={vec(LEFT, g.y(t))} p2={vec(width, g.y(t))} color={colors.border} strokeWidth={StyleSheet.hairlineWidth} />
                ))}
                <Path path={g.wedge} color={saving ? colors.green500 : colors.danger} opacity={wedgeOpacity} />
                <Path path={g.nowLine} style="stroke" strokeWidth={2} strokeCap="round" color={NOW} end={reveal} />
                <Path path={g.afterLine} style="stroke" strokeWidth={2} strokeCap="round" color={colors.green700} end={reveal} />
                <Line p1={vec(g.now[picked].x, TOP - 4)} p2={vec(g.now[picked].x, HEIGHT - BOTTOM)} color={colors.green300} strokeWidth={1} />
                <Group>
                  {[g.now[picked], g.after[picked]].map((p, i) => (
                    <Group key={i}>
                      <Circle cx={p.x} cy={p.y} r={5.5} color={colors.bg} />
                      <Circle cx={p.x} cy={p.y} r={4} color={i === 0 ? NOW : colors.green700} />
                    </Group>
                  ))}
                </Group>
              </Canvas>

              {g.ticks.map((t) => (
                <Text key={t} style={[axisText, styles.yLabel, { top: g.y(t) - 7 }]}>
                  {formatAxis(t)}
                </Text>
              ))}
              {[0, 3, 6, 9, 12].map((m) => (
                <Text key={m} style={[axisText, styles.xLabel, { left: g.x(m) - 20 }]}>
                  {m === 0 ? 'now' : `${m} mo`}
                </Text>
              ))}
              <Tooltip
                x={g.now[picked].x}
                width={width}
                title={picked === 0 ? 'Now' : `In ${picked} ${picked === 1 ? 'month' : 'months'}`}
                value={`${saving ? 'saved' : 'extra'} ${formatEur(difference, 0)}`}
              />
            </View>
          </GestureDetector>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
      <View style={styles.legend}>
        <LegendItem color={NOW} label={`Now ${formatEur(nowMonthly, 0)}/mo`} />
        <LegendItem color={colors.green700} label={`${changeLabel}: ${formatEur(afterMonthly, 0)}/mo`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', left: 0, width: LEFT - 6, textAlign: 'right' },
  xLabel: { position: 'absolute', bottom: 0, width: 40, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 4 },
});
