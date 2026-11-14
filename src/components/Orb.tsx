import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

/** Edge of the square canvas, in points. The glow and shadow need the room. */
export const ORB_CANVAS = 440;
/** Diameter of the orb body at scale 1 (the shader draws it at half the canvas). */
export const ORB_DIAMETER = ORB_CANVAS * 0.5;

/**
 * One fragment shader draws everything: the body with slowly flowing light, a
 * soft halo, and a contact shadow that stays put while the body bobs above it.
 *
 *   uLevel   0..1  voice level; swells the body and ripples its edge
 *   uEnergy  0..1  0 = resting, 1 = listening or working; speeds the flow up
 */
const effect = Skia.RuntimeEffect.Make(`
uniform float2 iResolution;
uniform float iTime;
uniform float uLevel;
uniform float uEnergy;
uniform float uShadow;
uniform float uHalo;

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
  float m = min(iResolution.x, iResolution.y);
  float2 uv = (xy - 0.5 * iResolution) / m;

  // The body floats: it bobs a little, the shadow below does not.
  float bob = 0.012 * sin(iTime * 1.15);
  float2 p = uv - float2(0.0, bob - 0.02);
  float r = length(p);
  float ang = atan(p.y, p.x);

  float t = iTime * (0.5 + 0.8 * uEnergy);
  // Keep it a ball: the edge only ripples (at most ~6 % of the radius at full
  // voice). Loudness shows mainly as swelling, brightness and a wider halo.
  float amp = 0.0020 + 0.0010 * uEnergy + 0.0028 * uLevel;
  float wob = amp * (sin(ang * 3.0 + t * 1.7) + 0.7 * sin(ang * 5.0 - t * 2.3) + 0.5 * sin(ang * 2.0 + t * 0.9));
  wob += 0.0030 * uLevel * sin(ang * 9.0 - t * 4.0);
  float R = 0.25 + 0.035 * uLevel + wob;
  float d = r - R;

  // Inside: domain-warped noise mapped onto the brand greens.
  float2 q = p / R;
  float2 flow = float2(fbm(q * 1.6 + float2(0.0, t * 0.35)), fbm(q * 1.6 + float2(5.2, -t * 0.3)));
  float n = fbm(q * 2.2 + 2.0 * flow + float2(t * 0.15, 0.0));

  float3 deep = float3(0.000, 0.471, 0.255);    // #007841
  float3 mid = float3(0.000, 0.667, 0.275);     // #00AA46
  float3 bright = float3(0.000, 0.922, 0.353);  // #00EB5A
  float3 mint = float3(0.569, 0.980, 0.608);    // #91FA9B

  float3 col = mix(deep, mid, smoothstep(0.20, 0.50, n));
  col = mix(col, bright, smoothstep(0.42, 0.70, n));
  col = mix(col, mint, smoothstep(0.60, 0.88, n) * 0.9);

  // Shade it as a sphere lit from the upper left.
  float depth = sqrt(clamp(1.0 - dot(q, q), 0.0, 1.0));
  float light = clamp(dot(normalize(float3(q, depth + 0.0001)), normalize(float3(-0.45, -0.60, 0.66))), 0.0, 1.0);
  col = mix(col, mint, pow(light, 3.0) * 0.55);
  col += float3(1.0) * pow(light, 14.0) * 0.35;
  col = mix(col, bright, pow(1.0 - depth, 2.5) * 0.5);
  col += mint * (0.08 + 0.25 * uLevel) * (1.0 - smoothstep(0.0, 0.9, length(q)));
  col = clamp(col, 0.0, 1.0);

  float inside = 1.0 - smoothstep(-0.004, 0.004, d);

  // Halo outside the body, fading out before the canvas edge.
  float glow = exp(-max(d, 0.0) * (17.0 - 7.0 * uLevel)) * (0.34 + 0.34 * uLevel + 0.10 * uEnergy) * uHalo;
  glow *= 1.0 - smoothstep(0.38, 0.47, r);
  float3 glowCol = mix(bright, mint, 0.6);

  float orbA = clamp(inside + (1.0 - inside) * glow, 0.0, 1.0);
  float3 orbRGB = mix(glowCol, col, inside);

  // Contact shadow: tighter and darker when the body dips towards it.
  float2 sp = (uv - float2(0.0, 0.405)) / float2(0.150 + 0.020 * uLevel, 0.020);
  float shA = exp(-dot(sp, sp) * 1.3) * (0.15 + 2.5 * bob) * uShadow;
  float3 shRGB = float3(0.000, 0.275, 0.157);   // #004628

  float a = orbA + shA * (1.0 - orbA);
  float3 rgb = orbRGB * orbA + shRGB * shA * (1.0 - orbA);
  return half4(rgb, a);
}
`);

if (!effect) {
  throw new Error('Orb shader failed to compile');
}

type Props = {
  /** Voice level, 0..1. */
  level: SharedValue<number>;
  /** 0 = resting, 1 = listening or working. */
  energy: SharedValue<number>;
  /** 0..1, the soft shadow on the floor below a floating orb. */
  shadow: SharedValue<number>;
  /** 0..1, strength of the glow around the orb. */
  halo: SharedValue<number>;
};

export function Orb({ level, energy, shadow, halo }: Props) {
  const clock = useClock();
  const uniforms = useDerivedValue(() => ({
    iResolution: [ORB_CANVAS, ORB_CANVAS],
    iTime: clock.value / 1000,
    uLevel: level.value,
    uEnergy: energy.value,
    uShadow: shadow.value,
    uHalo: halo.value,
  }));

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Fill>
        <Shader source={effect!} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { width: ORB_CANVAS, height: ORB_CANVAS },
});
