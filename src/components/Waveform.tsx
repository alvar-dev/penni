import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { WAVE_BARS } from '../hooks/useVoiceInput';
import { colors } from '../theme';

const HEIGHT = 26;
const BAR = 2.5;

/**
 * Live loudness as thin bars, newest on the right, drawn on the UI thread
 * straight from the voice hook's history. Quiet moments show as dots.
 */
export function Waveform({ history }: { history: SharedValue<number[]> }) {
  const [width, setWidth] = useState(0);
  const path = useDerivedValue(() => {
    const builder = Skia.PathBuilder.Make();
    if (width <= 0) return builder.detach();
    const step = width / WAVE_BARS;
    const values = history.value;
    const mid = HEIGHT / 2;
    for (let i = 0; i < WAVE_BARS; i++) {
      // Right-aligned: the last value is the newest.
      const v = values[values.length - WAVE_BARS + i] ?? 0;
      const half = Math.max(0.01, Math.min(1, v) * (mid - BAR));
      const x = i * step + step / 2;
      builder.moveTo(x, mid - half);
      builder.lineTo(x, mid + half);
    }
    return builder.detach();
  });

  return (
    <View style={styles.wave} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={path} style="stroke" strokeWidth={BAR} strokeCap="round" color={colors.textSecondary} />
      </Canvas>
    </View>
  );
}

/** 0:07 since listening started. */
export function ListeningTime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.time}>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</Text>;
}

const styles = StyleSheet.create({
  wave: { flex: 1, height: HEIGHT, marginRight: 8 },
  time: { fontSize: 15, color: colors.textSecondary, fontVariant: ['tabular-nums'], marginRight: 12, minWidth: 34 },
});
