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

/** New conversation: a plain plus, in the same thin-line style. */
export function NewChatIcon({ size, color }: Props) {
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale: size / 24 }]}>
        <Path path="M12 5.5v13M5.5 12h13" style="stroke" strokeWidth={1.8} strokeCap="round" color={color} />
      </Group>
    </Canvas>
  );
}
