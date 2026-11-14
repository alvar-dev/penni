import { Skia, type SkPath, type SkPathBuilder } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { usePanGesture } from 'react-native-gesture-handler';
import { Easing, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { colors, formatEur, formatNumber } from '../../theme';

export type Pt = { x: number; y: number };

/** Maps a value range onto a pixel range. */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** A round upper bound and tick step for an axis that starts at zero (or below). */
export function niceTicks(min: number, max: number, count = 3): number[] {
  const span = Math.max(max - Math.min(0, min), 1);
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(Math.min(0, min) / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks.length >= 2 ? ticks : [0, step];
}

/** Adds a smooth line through the points that never overshoots them (monotone cubic). */
function addSmooth(path: SkPathBuilder, points: Pt[], move: boolean): SkPathBuilder {
  const n = points.length;
  if (n === 0) return path;
  if (move) path.moveTo(points[0].x, points[0].y);
  else path.lineTo(points[0].x, points[0].y);
  if (n === 1) return path;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push(dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]);
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]));
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    path.cubicTo(points[i].x + h, points[i].y + tangent[i] * h, points[i + 1].x - h, points[i + 1].y - tangent[i + 1] * h, points[i + 1].x, points[i + 1].y);
  }
  return path;
}

export function smoothPath(points: Pt[]): SkPath {
  return addSmooth(Skia.PathBuilder.Make(), points, true).detach();
}

/** The smooth line closed down to a baseline, for an area fill. */
export function smoothArea(points: Pt[], baseline: number): SkPath {
  const path = Skia.PathBuilder.Make();
  if (points.length === 0) return path.detach();
  path.moveTo(points[0].x, baseline);
  addSmooth(path, points, false);
  path.lineTo(points[points.length - 1].x, baseline);
  path.close();
  return path.detach();
}

/** Straight segments through the points; with `baseline`, closed down to it as an area. */
export function straightPath(points: Pt[], baseline?: number): SkPath {
  const path = Skia.PathBuilder.Make();
  points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  if (baseline !== undefined && points.length) {
    path.lineTo(points[points.length - 1].x, baseline);
    path.lineTo(points[0].x, baseline);
    path.close();
  }
  return path.detach();
}

/** Width of a container, measured on layout. */
export function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (e) => setWidth(Math.round(e.nativeEvent.layout.width))];
}

/** 0 → 1 once, when the chart first appears: lines draw in, bars grow. */
export function useReveal(delay = 0, duration = 900) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
  }, [progress, delay, duration]);
  return progress;
}

/**
 * Touch and drag across a chart to pick the nearest point. Horizontal drags
 * scrub; vertical ones are left to the conversation's scroll view.
 */
export function useScrub(xs: number[], onPick: (index: number) => void) {
  const nearest = useMemo(
    () => (x: number) => {
      let best = 0;
      for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
      return best;
    },
    [xs],
  );
  return usePanGesture({
    runOnJS: true,
    activeOffsetX: [-6, 6],
    failOffsetY: [-10, 10],
    onBegin: (e) => xs.length && onPick(nearest(e.x)),
    onUpdate: (e) => xs.length && onPick(nearest(e.x)),
  });
}

/** The number counts up to its value when the answer appears. */
export function CountUp({ value, decimals = 0, style, unitStyle }: { value: number; decimals?: number; style: object; unitStyle: object }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / 800);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const final = formatEur(value, decimals);
  return (
    <Text style={style} accessibilityLabel={final}>
      {value < 0 ? '\u2212' : ''}
      {formatNumber(shown, decimals)}
      <Text style={unitStyle}>{'\u00A0€'}</Text>
    </Text>
  );
}

/** The little label that follows the finger. */
export function Tooltip({ x, width, title, value, top = 0 }: { x: number; width: number; title: string; value: string; top?: number }) {
  const boxWidth = 132;
  const left = Math.max(0, Math.min(width - boxWidth, x - boxWidth / 2));
  return (
    <View style={[styles.tooltip, { left, top, width: boxWidth }]} pointerEvents="none">
      <Text style={styles.tooltipTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.tooltipValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Identity for a series: a short line (solid or dashed) and a name. */
export function LegendItem({ color, label, dashed, swatch }: { color: string; label: string; dashed?: boolean; swatch?: boolean }) {
  return (
    <View style={styles.legendItem}>
      {swatch ? (
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      ) : dashed ? (
        <View style={styles.legendDashes}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.legendDash, { backgroundColor: color }]} />
          ))}
        </View>
      ) : (
        <View style={[styles.legendLine, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

/** Axis labels stay short: 500 €, 2 t€, 7,5 t€. */
export function formatAxis(v: number): string {
  if (Math.abs(v) < 1000) return formatEur(v, 0);
  const k = Math.abs(v) / 1000;
  return `${v < 0 ? '\u2212' : ''}${(Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)).replace('.', ',')}\u00A0t€`;
}

export const axisText = { fontSize: 11, lineHeight: 14, color: colors.textTertiary, fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    backgroundColor: colors.text,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tooltipTitle: { fontSize: 11, lineHeight: 14, color: '#D9D9D9' },
  tooltipValue: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  legendLine: { width: 16, height: 2, borderRadius: 1 },
  legendDashes: { width: 16, flexDirection: 'row', justifyContent: 'space-between' },
  legendDash: { width: 4, height: 2, borderRadius: 1 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, lineHeight: 16, color: colors.textSecondary, marginLeft: 6 },
});
