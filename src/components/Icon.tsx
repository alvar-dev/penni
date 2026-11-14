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

/** "Write new": an open square with a pencil, as in iOS, for starting a new conversation. */
export function ComposeIcon({ size, color }: Props) {
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale: size / 24 }]}>
        <Path
          path="M11 4.6H7.2A2.6 2.6 0 0 0 4.6 7.2v9.6a2.6 2.6 0 0 0 2.6 2.6h9.6a2.6 2.6 0 0 0 2.6-2.6V13"
          style="stroke"
          strokeWidth={1.7}
          strokeCap="round"
          strokeJoin="round"
          color={color}
        />
        <Path
          path="M17.4 3.9a1.9 1.9 0 0 1 2.7 2.7l-7.6 7.6-3.4.8.8-3.4z"
          style="stroke"
          strokeWidth={1.7}
          strokeCap="round"
          strokeJoin="round"
          color={color}
        />
      </Group>
    </Canvas>
  );
}
