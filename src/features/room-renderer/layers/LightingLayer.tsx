import { Fill, Group, Shader } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { ROOM_H, ROOM_W } from '../layout';
import { getRoomShaders, hexToRgb01 } from '../shaders';

interface Props {
  readonly night: SharedValue<number>;
  readonly fatigue: SharedValue<number>;
  readonly sleep: SharedValue<number>;
  readonly clock: SharedValue<number>;
  readonly lamp?: { x: number; y: number; color: string; radius: number } | undefined;
  readonly monitorGlow: string;
}

/**
 * Two full-screen SkSL passes, evaluated per-pixel on the GPU:
 *   1. ambient (multiply): day/night, fatigue dimming (energy < 20), lights-off during sleep, vignette
 *   2. lights  (plus)    : warm lamp pool + monitor glow, stronger at night
 * All uniforms are Reanimated derived values → zero JS work per frame.
 */
export const LightingLayer = memo(function LightingLayer({ night, fatigue, sleep, clock, lamp, monitorGlow }: Props) {
  const { ambient, lights } = useMemo(() => getRoomShaders(), []);
  const lampColor = useMemo(() => hexToRgb01(lamp?.color ?? '#FFD28A'), [lamp?.color]);
  const monitorColor = useMemo(() => hexToRgb01(monitorGlow), [monitorGlow]);
  const lampX = lamp?.x ?? 0;
  const lampY = lamp?.y ?? 0;
  const lampOn = lamp ? 1 : 0;
  const lampRadius = lamp?.radius ?? 0.35;

  const ambientUniforms = useDerivedValue(() => ({
    uRes: [ROOM_W, ROOM_H],
    uNight: night.value,
    uFatigue: fatigue.value,
    uSleep: sleep.value,
    uTime: clock.value / 1000,
  }));

  const lightUniforms = useDerivedValue(() => ({
    uRes: [ROOM_W, ROOM_H],
    uLamp: [lampX, lampY],
    uLampColor: lampColor,
    // Lamps are switched off while the character sleeps.
    uLampOn: lampOn * (1 - sleep.value * 0.85),
    uLampRadius: lampRadius,
    uMonitor: [204, 322],
    uMonitorColor: monitorColor,
    uMonitorOn: 1 - sleep.value * 0.7,
    uNight: night.value,
    uTime: clock.value / 1000,
  }));

  return (
    <Group>
      <Fill blendMode="multiply">
        <Shader source={ambient} uniforms={ambientUniforms} />
      </Fill>
      <Fill blendMode="plus">
        <Shader source={lights} uniforms={lightUniforms} />
      </Fill>
    </Group>
  );
});
