import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Oval,
  Path,
  Shader,
  Skia,
  useClock,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { ORB_CANVAS } from './Orb';

/**
 * A sitting dog in profile, made of the same green energy as the orb: flowing light
 * inside the silhouette, a soft bright rim, a glow around it and a shadow
 * below. Same canvas and inputs as the orb, so it can stand in for it.
 *
 *   level   0..1  voice level: brighter glow, quicker flow, faster tail
 *   energy  0..1  0 = resting, 1 = listening or working
 *
 * Drawn on a 440-unit grid, facing right.
 */

const C = ORB_CANVAS / 440;

/** The orb's flowing greens, filling whatever shape it paints. `uShade` darkens far-side parts. */
const energyFill = Skia.RuntimeEffect.Make(`
uniform float iTime;
uniform float uLevel;
uniform float uEnergy;
uniform float uShade;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * noise(p);
    p = p * 2.03 + float2(17.1, 9.2);
    amp *= 0.5;
  }
  return v;
}

half4 main(float2 xy) {
  float2 q = (xy - float2(220.0, 214.0)) / 120.0;
  float t = iTime * (0.5 + 0.8 * uEnergy);
  float2 flow = float2(fbm(q * 1.6 + float2(0.0, t * 0.35)), fbm(q * 1.6 + float2(5.2, -t * 0.3)));
  float n = fbm(q * 2.2 + 2.0 * flow + float2(t * 0.15, 0.0));

  float3 deep = float3(0.000, 0.471, 0.255);    // #007841
  float3 mid = float3(0.000, 0.667, 0.275);     // #00AA46
  float3 bright = float3(0.000, 0.922, 0.353);  // #00EB5A
  float3 mint = float3(0.569, 0.980, 0.608);    // #91FA9B
  float3 deepest = float3(0.000, 0.275, 0.157); // #004628

  float3 col = mix(deep, mid, smoothstep(0.20, 0.50, n));
  col = mix(col, bright, smoothstep(0.42, 0.70, n));
  col = mix(col, mint, smoothstep(0.60, 0.88, n) * 0.9);

  // Light from the upper left, the belly in shade.
  float light = clamp(0.60 - q.y * 0.55 - q.x * 0.12, 0.0, 1.0);
  col = mix(col, mint, pow(light, 3.0) * 0.45);
  col = mix(col, deep, smoothstep(0.35, 1.0, q.y) * 0.35);
  col += mint * (0.06 + 0.22 * uLevel);
  col = mix(col, deepest, uShade);
  return half4(clamp(col, 0.0, 1.0), 1.0);
}
`)!;

const svg = (d: string) => Skia.Path.MakeFromSVGString(d)!;

/** The sitting dog's outline as one shape, so the rim light follows it all the way round. */
const BODY: SkPath = svg(
  'M 368 138 C 368 129 361 124 350 122 C 334 119 322 114 313 102 C 301 84 285 70 261 70 ' +
    'C 236 70 218 88 218 114 C 218 140 214 162 204 184 C 192 210 170 228 154 254 ' +
    'C 138 280 134 316 150 338 C 158 350 170 356 184 356 L 232 356 C 243 356 246 347 238 342 ' +
    'C 234 339 233 335 236 329 C 240 322 246 318 252 318 C 254 318 254 340 255 356 L 296 356 ' +
    'C 306 356 308 346 300 342 C 296 340 294 336 294 330 C 292 304 292 280 298 258 ' +
    'C 304 238 314 222 316 202 C 317 192 316 184 314 178 C 324 174 336 172 348 168 ' +
    'C 362 164 368 152 368 138 Z',
);
/** Hangs from (264, 80) on the back of the head. */
const EAR = svg('M 264 80 C 245 82 234 108 236 138 C 237 158 251 167 261 156 C 275 140 282 102 264 80 Z');
/** Lies on the floor behind the dog, sweeping from (152, 328). */
const TAIL = svg('M 154 338 C 132 348 106 352 86 344 C 76 340 76 330 86 330 C 106 334 130 330 150 320 Z');
const MOUTH_LINE = svg('M 364 150 Q 354 160 338 162');

type Props = {
  level: SharedValue<number>;
  energy: SharedValue<number>;
  /** 0..1, the soft shadow on the floor below. */
  shadow: SharedValue<number>;
  /** 0..1, strength of the glow around the dog. */
  halo: SharedValue<number>;
};

export function Dog({ level, energy, shadow, halo }: Props) {
  const clock = useClock();

  const uniforms = useDerivedValue(() => ({ iTime: clock.value / 1000, uLevel: level.value, uEnergy: energy.value, uShade: 0 }));
  const earUniforms = useDerivedValue(() => ({ iTime: clock.value / 1000, uLevel: level.value, uEnergy: energy.value, uShade: 0.28 }));

  // The whole dog floats a little, like the orb, and swells slightly with the voice.
  const float = useDerivedValue(() => {
    const t = clock.value / 1000;
    return [{ translateY: -4 + 4 * Math.sin(t * 1.15) }, { scale: 1 + 0.03 * level.value }];
  });
  const tail = useDerivedValue(() => {
    const t = clock.value / 1000;
    const speed = 2.5 + 6 * energy.value + 6 * level.value;
    return [{ rotate: (0.06 + 0.12 * energy.value + 0.14 * level.value) * Math.sin(t * speed) }];
  });
  const ear = useDerivedValue(() => {
    const t = clock.value / 1000;
    return [{ rotate: 0.05 * Math.sin(t * 1.4) - 0.14 * energy.value + 0.07 * level.value * Math.sin(t * 11) }];
  });
  const blink = useDerivedValue(() => {
    const phase = (clock.value / 1000) % 4.4;
    const closed = phase < 0.14 ? 1 - Math.abs(phase - 0.07) / 0.07 : 0;
    return [{ scaleY: 1 - 0.85 * closed }];
  });
  const mouthHeight = useDerivedValue(() => 2 + 10 * level.value);
  const mouthOpacity = useDerivedValue(() => Math.min(1, level.value * 4));
  const glow = useDerivedValue(() => halo.value * (0.45 + 0.4 * level.value + 0.15 * energy.value));
  const floor = useDerivedValue(() => 0.13 * shadow.value);

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Group transform={[{ scale: C }]}>
        <Oval x={110} y={362} width={220} height={16} color="#004628" opacity={floor}>
          <BlurMask blur={8} style="normal" />
        </Oval>

        <Group transform={float} origin={vec(220, 356)}>
          {/* Glow behind everything. */}
          <Group opacity={glow}>
            <Path path={BODY} color="#5CF58C">
              <BlurMask blur={26} style="normal" />
            </Path>
            <Group transform={tail} origin={vec(152, 328)}>
              <Path path={TAIL} color="#5CF58C">
                <BlurMask blur={18} style="normal" />
              </Path>
            </Group>
          </Group>

          <Group transform={tail} origin={vec(152, 328)}>
            <Path path={TAIL}>
              <Shader source={energyFill} uniforms={uniforms} />
            </Path>
          </Group>
          <Path path={BODY}>
            <Shader source={energyFill} uniforms={uniforms} />
          </Path>

          {/* Bright rim just inside the outline, and soft light on the head and back. */}
          <Group clip={BODY}>
            <Path path={BODY} style="stroke" strokeWidth={14} color="#B8FFC6" opacity={0.5}>
              <BlurMask blur={9} style="normal" />
            </Path>
            <Oval x={232} y={68} width={70} height={26} color="#FFFFFF" opacity={0.3}>
              <BlurMask blur={9} style="normal" />
            </Oval>
            <Oval x={166} y={200} width={40} height={90} color="#FFFFFF" opacity={0.14}>
              <BlurMask blur={12} style="normal" />
            </Oval>
          </Group>

          <Group transform={ear} origin={vec(264, 82)}>
            <Path path={EAR}>
              <Shader source={energyFill} uniforms={earUniforms} />
            </Path>
          </Group>

          {/* Face in the deepest brand green. */}
          <Group transform={blink} origin={vec(313, 109)}>
            <Circle cx={313} cy={109} r={6} color="#003A20" />
            <Circle cx={315} cy={107} r={2} color="#FFFFFF" />
          </Group>
          <Oval x={358} y={129} width={16} height={11} color="#003A20" />
          <Path path={MOUTH_LINE} style="stroke" strokeWidth={3} strokeCap="round" color="#003A20" opacity={0.6} />
          <Oval x={340} y={158} width={16} height={mouthHeight} color="#003A20" opacity={mouthOpacity} />
        </Group>
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { width: ORB_CANVAS, height: ORB_CANVAS },
});
