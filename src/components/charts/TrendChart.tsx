import { Canvas, Circle, Group, Line, LinearGradient, Path, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue } from 'react-native-reanimated';

import { tr } from '../../lang';
import { colors, formatEur } from '../../theme';
import { axisText, formatAxis, linear, niceTicks, smoothArea, smoothPath, Tooltip, useReveal, useScrub, useWidth } from './common';

type Point = { label: string; title: string; value: number; selected: boolean };

const HEIGHT = 168;
const TOP = 44; // room for the tooltip
const BOTTOM = 22; // month labels
const LEFT = 40; // axis labels

/** One measure month by month: a smooth area, the asked-about months marked. */
export function TrendChart({ points, average }: { points: Point[]; average?: number }) {
  const [width, onLayout] = useWidth();
  const lastSelected = points.map((p) => p.selected).lastIndexOf(true);
  const [picked, setPicked] = useState(lastSelected >= 0 ? lastSelected : points.length - 1);
  const reveal = useReveal();
  const areaOpacity = useDerivedValue(() => reveal.value);

  const geometry = useMemo(() => {
    const max = Math.max(...points.map((p) => p.value), average ?? 0, 1);
    const ticks = niceTicks(0, max);
    const plotW = Math.max(1, width - LEFT - 8);
    const x = (i: number) => LEFT + 4 + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    const y = linear(0, ticks[ticks.length - 1], HEIGHT - BOTTOM, TOP);
    const pts = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
    return { ticks, x, y, pts, line: smoothPath(pts), area: smoothArea(pts, y(0)) };
  }, [points, average, width]);

  const xs = useMemo(() => geometry.pts.map((p) => p.x), [geometry]);
  const scrub = useScrub(xs, setPicked);
  const step = points.length > 8 ? 2 : 1;
  const active = geometry.pts[picked];

  return (
    <View onLayout={onLayout} accessible accessibilityLabel={points.map((p) => `${p.title} ${formatEur(p.value)}`).join(', ')}>
      {width > 0 ? (
        <GestureDetector gesture={scrub}>
          <View style={{ height: HEIGHT }}>
            <Canvas style={StyleSheet.absoluteFill}>
              {geometry.ticks.map((t) => (
                <Line key={t} p1={vec(LEFT, geometry.y(t))} p2={vec(width, geometry.y(t))} color={colors.border} strokeWidth={StyleSheet.hairlineWidth} />
              ))}
              <Path path={geometry.area} opacity={areaOpacity}>
                <LinearGradient start={vec(0, TOP)} end={vec(0, HEIGHT - BOTTOM)} colors={['rgba(0,170,70,0.28)', 'rgba(0,170,70,0.02)']} />
              </Path>
              {average !== undefined ? (
                <Line p1={vec(LEFT, geometry.y(average))} p2={vec(width, geometry.y(average))} color={colors.textTertiary} strokeWidth={1} />
              ) : null}
              <Path path={geometry.line} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={colors.green700} end={reveal} />
              {active ? (
                <Line p1={vec(active.x, TOP - 4)} p2={vec(active.x, HEIGHT - BOTTOM)} color={colors.green300} strokeWidth={1} />
              ) : null}
              {geometry.pts.map((p, i) =>
                points[i].selected || i === picked ? (
                  <Group key={i}>
                    <Circle cx={p.x} cy={p.y} r={i === picked ? 6 : 4.5} color={colors.bg} />
                    <Circle cx={p.x} cy={p.y} r={i === picked ? 4.5 : 3} color={points[i].selected ? colors.green900 : colors.green500} />
                  </Group>
                ) : null,
              )}
            </Canvas>

            {geometry.ticks.map((t) => (
              <Text key={t} style={[axisText, styles.yLabel, { top: geometry.y(t) - 7 }]}>
                {formatAxis(t)}
              </Text>
            ))}
            {average !== undefined ? (
              <Text style={[axisText, styles.avgLabel, { top: geometry.y(average) - 16 }]}>{tr('ka.', 'avg')} {formatEur(average, average < 10 ? 2 : 0)}</Text>
            ) : null}
            {points.map((p, i) =>
              i % step === (points.length - 1) % step ? (
                <Text key={p.title} style={[axisText, styles.xLabel, { left: geometry.x(i) - 24 }, p.selected && styles.xLabelSelected]}>
                  {p.label}
                </Text>
              ) : null,
            )}
            {active ? <Tooltip x={active.x} width={width} title={points[picked].title} value={formatEur(points[picked].value)} /> : null}
          </View>
        </GestureDetector>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', left: 0, width: LEFT - 6, textAlign: 'right' },
  avgLabel: { position: 'absolute', left: LEFT + 6 },
  xLabel: { position: 'absolute', bottom: 0, width: 48, textAlign: 'center' },
  xLabelSelected: { color: colors.text, fontWeight: '600' },
});
