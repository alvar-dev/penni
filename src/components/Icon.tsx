import { Canvas, Circle, Group, Path } from '@shopify/react-native-skia';

type Props = { size: number; color: string };

/** Outlined person, drawn on a 24-unit grid in the thin-line style S-mobiili uses. */
export function PersonIcon({ size, color }: Props) {
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale: size / 24 }]}>
        <Circle cx={12} cy={8.2} r={3.7} style="stroke" strokeWidth={1.7} color={color} />
        <Path
          path="M4.6 19.8c0-3.7 3.3-5.8 7.4-5.8s7.4 2.1 7.4 5.8"
          style="stroke"
          strokeWidth={1.7}
          strokeCap="round"
          color={color}
        />
      </Group>
    </Canvas>
  );
}

/** New conversation: a speech bubble with a plus, in the same thin-line style. */
export function NewChatIcon({ size, color }: Props) {
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale: size / 24 }]}>
        <Path
          path="M12 4.8c4.3 0 7.4 2.7 7.4 6.2s-3.1 6.2-7.4 6.2c-1 0-1.9-.1-2.8-.4l-3.6 1.8.8-3.2c-1.1-1.1-1.8-2.6-1.8-4.4 0-3.5 3.1-6.2 7.4-6.2z"
          style="stroke"
          strokeWidth={1.7}
          strokeCap="round"
          strokeJoin="round"
          color={color}
        />
        <Path path="M12 8.6v4.8M9.6 11h4.8" style="stroke" strokeWidth={1.7} strokeCap="round" color={color} />
      </Group>
    </Canvas>
  );
}
