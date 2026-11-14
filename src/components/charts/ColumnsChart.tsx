import { Canvas, DashPathEffect, Group, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { colors, formatEur } from '../../theme';
import { axisText, formatAxis, linear, niceTicks, Tooltip, useReveal, useScrub, useWidth } from './common';

type Bar = { label: string; title: string; value: number; selected: boolean };

const HEIGHT = 178;
const TOP = 44;
const BOTTOM = 22;
const LEFT = 44;

/** One measure month by month as columns that grow in; the asked-about months darkest. */
export function ColumnsChart({ bars, average }: { bars: Bar[]; average?: number }) {
  const [width, onLayout] = useWidth();
  const lastSelected = bars.map((b) => b.selected).lastIndexOf(true);
  const [picked, setPicked] = useState(lastSelected >= 0 ? lastSelected : bars.length - 1);
  const reveal = useReveal(0, 900);

  const g = useMemo(() => {
    const ticks = niceTicks(0, Math.max(...bars.map((b) => b.value), average ?? 0, 1));
    const plotW = Math.max(1, width - LEFT - 4);
    const slot = plotW / Math.max(1, bars.length);
    const barW = Math.min(24, slot * 0.6);
    const x = (i: number) => LEFT + slot * i + slot / 2;
    const y = linear(0, ticks[ticks.length - 1], HEIGHT - BOTTOM, TOP);
    return { ticks, x, y, barW };
  }, [bars, average, width]);

  const xs = useMemo(() => bars.map((_, i) => g.x(i)), [bars, g]);
  const scrub = useScrub(xs, setPicked);
  const step = bars.length > 8 ? 2 : 1;

  return (
    <View onLayout={onLayout} accessible accessibilityLabel={bars.map((b) => `${b.title} ${formatEur(b.value)}`).join(', ')}>
      {width > 0 ? (
        <GestureDetector gesture={scrub}>
          <View style={{ height: HEIGHT }}>
            <Canvas style={StyleSheet.absoluteFill}>
              {g.ticks.map((t) => (
                <Line key={t} p1={vec(LEFT, g.y(t))} p2={vec(width, g.y(t))} color={colors.border} strokeWidth={StyleSheet.hairlineWidth} />
              ))}
              {bars.map((b, i) => (
                <Column
                  key={b.title}
                  x={g.x(i) - g.barW / 2}
                  width={g.barW}
                  top={g.y(b.value)}
                  base={g.y(0)}
                  reveal={reveal}
                  delay={i / Math.max(1, bars.length)}
                  color={i === picked ? colors.green900 : b.selected ? colors.green700 : colors.green300}
                />
              ))}
              {average !== undefined ? (
                <Line p1={vec(LEFT, g.y(average))} p2={vec(width, g.y(average))} color={colors.textSecondary} strokeWidth={1}>
                  <DashPathEffect intervals={[4, 4]} />
                </Line>
              ) : null}
            </Canvas>

            {g.ticks.map((t) => (
              <Text key={t} style={[axisText, styles.yLabel, { top: g.y(t) - 7 }]}>
                {formatAxis(t)}
              </Text>
            ))}
            {average !== undefined ? (
              <Text style={[axisText, styles.avgLabel, { top: g.y(average) - 16 }]}>ka. {formatEur(average, average < 10 ? 2 : 0)}</Text>
            ) : null}
            {bars.map((b, i) =>
              i % step === (bars.length - 1) % step ? (
                <Text key={b.title} style={[axisText, styles.xLabel, { left: g.x(i) - 24 }, i === picked && styles.xLabelPicked]}>
                  {b.label}
                </Text>
              ) : null,
            )}
            <Tooltip x={g.x(picked)} width={width} title={bars[picked].title} value={formatEur(bars[picked].value)} />
          </View>
        </GestureDetector>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
    </View>
  );
}

/** One column, rounded at the top, square at the baseline; grows in turn. */
function Column({ x, width, top, base, reveal, delay, color }: { x: number; width: number; top: number; base: number; reveal: SharedValue<number>; delay: number; color: string }) {
  const height = useDerivedValue(() => {
    const t = Math.min(1, Math.max(0, (reveal.value - delay * 0.35) / 0.65));
    return Math.max(0, (base - top) * t);
  });
  const y = useDerivedValue(() => base - height.value);
  const footHeight = useDerivedValue(() => Math.min(4, height.value));
  const footY = useDerivedValue(() => base - footHeight.value);
  return (
    <Group>
      <RoundedRect x={x} y={y} width={width} height={height} r={4} color={color} />
      {/* Square off the bottom corners so the column stands on the baseline. */}
      <RoundedRect x={x} y={footY} width={width} height={footHeight} r={0} color={color} />
    </Group>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', left: 0, width: LEFT - 6, textAlign: 'right' },
  avgLabel: { position: 'absolute', left: LEFT + 6 },
  xLabel: { position: 'absolute', bottom: 0, width: 48, textAlign: 'center' },
  xLabelPicked: { color: colors.text, fontWeight: '600' },
});
