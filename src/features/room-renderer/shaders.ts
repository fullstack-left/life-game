import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * Ambient lighting pass — drawn with `blendMode="multiply"` over the whole scene.
 * Output ≤ 1, so it only *darkens*: night, fatigue dimming, sleep (lights off)
 * and a soft vignette.
 */
const AMBIENT_SKSL = `
uniform float2 uRes;
uniform float uNight;
uniform float uFatigue;
uniform float uSleep;
uniform float uTime;

half4 main(float2 p) {
  float2 uv = p / uRes;
  float ambient = mix(1.0, 0.46, uNight);
  ambient *= mix(1.0, 0.72, uFatigue);
  ambient *= mix(1.0, 0.42, uSleep);

  // Fatigue "breathing" vignette: slowly pulses when the character is exhausted.
  float pulse = 0.04 * uFatigue * sin(uTime * 1.3);
  float d = distance(uv, float2(0.5, 0.5));
  float vig = smoothstep(0.95 - 0.3 * uFatigue + pulse, 0.25, d);

  float3 tint = mix(float3(1.0), float3(0.72, 0.8, 1.0), uNight);
  tint = mix(tint, float3(0.85, 0.82, 0.9), uFatigue * 0.5);
  float3 col = tint * ambient * mix(0.62, 1.0, vig);
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

/**
 * Additive light pass — drawn with `blendMode="plus"`. Warm lamp pool and cool
 * monitor glow; returns premultiplied colour, transparent elsewhere.
 */
const LIGHTS_SKSL = `
uniform float2 uRes;
uniform float2 uLamp;
uniform float3 uLampColor;
uniform float uLampOn;
uniform float uLampRadius;
uniform float2 uMonitor;
uniform float3 uMonitorColor;
uniform float uMonitorOn;
uniform float uNight;
uniform float uTime;

half4 main(float2 p) {
  float s = uRes.x;
  float ld = distance(p, uLamp) / s;
  float flicker = 0.97 + 0.03 * sin(uTime * 17.0) * sin(uTime * 7.3);
  float lamp = smoothstep(uLampRadius, 0.0, ld) * uLampOn * mix(0.18, 0.55, uNight) * flicker;

  float md = distance(p, uMonitor) / s;
  float mon = smoothstep(0.22, 0.0, md) * uMonitorOn * mix(0.12, 0.4, uNight);

  float3 col = uLampColor * lamp + uMonitorColor * mon;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  return half4(half3(col), half(a));
}
`;

const compile = (source: string, name: string): SkRuntimeEffect => {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) throw new Error(`Failed to compile SkSL shader: ${name}`);
  return effect;
};

let cache: { ambient: SkRuntimeEffect; lights: SkRuntimeEffect } | undefined;

/** Compiled once per process; compilation happens on first room mount. */
export const getRoomShaders = () => {
  cache ??= { ambient: compile(AMBIENT_SKSL, 'ambient'), lights: compile(LIGHTS_SKSL, 'lights') };
  return cache;
};

export const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
