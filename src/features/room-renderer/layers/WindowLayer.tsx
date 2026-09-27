import {
  Circle,
  Group,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  rect,
  vec,
  type SkRect,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { interpolateColor, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { WINDOW } from '../layout';

interface Props {
  readonly scene: string;
  readonly night: SharedValue<number>;
  readonly golden: SharedValue<number>;
  readonly clock: SharedValue<number>;
}

const { x: WX, y: WY, w: WW, h: WH } = WINDOW;
const CLIP: SkRect = rect(WX, WY, WW, WH);

// Deterministic pseudo-random star field (no Math.random → stable across renders).
const STARS = Array.from({ length: 22 }, (_, i) => ({
  x: WX + ((i * 37) % WW),
  y: WY + ((i * 53) % (WH * 0.6)),
  r: 0.6 + ((i * 7) % 3) * 0.4,
  phase: i * 0.7,
}));

const BUILDINGS = [
  { x: 0, w: 18, h: 60 },
  { x: 16, w: 14, h: 82 },
  { x: 29, w: 20, h: 48 },
  { x: 48, w: 12, h: 95 },
  { x: 59, w: 18, h: 66 },
  { x: 76, w: 16, h: 74 },
];

const CityScene = memo(function CityScene({ night }: { night: SharedValue<number> }) {
  const windows = useMemo(
    () =>
      BUILDINGS.flatMap((b, bi) =>
        Array.from({ length: Math.floor(b.h / 12) }, (_, r) =>
          [0, 1].map((c) => ({
            key: `${bi}-${r}-${c}`,
            x: WX + b.x + 3 + c * (b.w / 2 - 1),
            y: WY + WH - b.h + 6 + r * 12,
            on: (bi * 7 + r * 3 + c) % 3 !== 0,
          })),
        ).flat(),
      ),
    [],
  );
  const litOpacity = useDerivedValue(() => 0.15 + night.value * 0.85);
  return (
    <Group>
      {BUILDINGS.map((b) => (
        <Rect key={b.x} x={WX + b.x} y={WY + WH - b.h} width={b.w} height={b.h} color="#2B2F55" />
      ))}
      <Group opacity={litOpacity}>
        {windows
          .filter((w) => w.on)
          .map((w) => (
            <Rect key={w.key} x={w.x} y={w.y} width={4} height={5} color="#FFE08A" />
          ))}
      </Group>
    </Group>
  );
});

const MountainScene = memo(function MountainScene() {
  const back = `M ${WX - 5} ${WY + WH} L ${WX + 20} ${WY + 55} L ${WX + 42} ${WY + 80} L ${WX + 66} ${WY + 40} L ${WX + WW + 5} ${WY + WH} Z`;
  const front = `M ${WX - 5} ${WY + WH} L ${WX + 30} ${WY + 85} L ${WX + 55} ${WY + 100} L ${WX + 80} ${WY + 78} L ${WX + WW + 5} ${WY + WH} Z`;
  const snow = `M ${WX + 58} ${WY + 52} L ${WX + 66} ${WY + 40} L ${WX + 74} ${WY + 53} L ${WX + 68} ${WY + 49} Z`;
  return (
    <Group>
      <Path path={back} color="#4B5D8C" />
      <Path path={snow} color="#F1F5FF" />
      <Path path={front} color="#2F6B55" />
    </Group>
  );
});

const OceanScene = memo(function OceanScene({ clock }: { clock: SharedValue<number> }) {
  const waveTransform = useDerivedValue(() => [{ translateX: Math.sin(clock.value / 900) * 4 }]);
  const wave = useMemo(() => {
    let d = `M ${WX - 10} ${WY + 88}`;
    for (let x = WX - 10; x <= WX + WW + 10; x += 10) d += ` Q ${x + 5} ${WY + 84} ${x + 10} ${WY + 88}`;
    return d;
  }, []);
  return (
    <Group>
      <Rect x={WX} y={WY + 80} width={WW} height={WH - 80}>
        <LinearGradient start={vec(0, WY + 80)} end={vec(0, WY + WH)} colors={['#2A9DF4', '#0B3D91']} />
      </Rect>
      <Group transform={waveTransform}>
        <Path path={wave} color="rgba(255,255,255,0.55)" style="stroke" strokeWidth={1.5} />
      </Group>
    </Group>
  );
});

/** Window with a real-time sky (day ↔ night, golden hour), stars, sun/moon and a purchasable view. */
export const WindowLayer = memo(function WindowLayer({ scene, night, golden, clock }: Props) {
  const skyColors = useDerivedValue(() => {
    const n = night.value;
    const g = golden.value;
    const dayTop = interpolateColor(g, [0, 1], ['#6EC6FF', '#FF9E6D']);
    const dayBottom = interpolateColor(g, [0, 1], ['#D4F0FF', '#FFD39B']);
    return [interpolateColor(n, [0, 1], [dayTop, '#070B2A']), interpolateColor(n, [0, 1], [dayBottom, '#27306B'])];
  });
  const starsOpacity = useDerivedValue(() => Math.max(0, night.value - 0.3) / 0.7);
  const twinkle = useDerivedValue(() => 0.6 + 0.4 * Math.sin(clock.value / 400));
  const sunY = useDerivedValue(() => WY + 22 + night.value * 90);
  const moonOpacity = useDerivedValue(() => night.value);
  const sunOpacity = useDerivedValue(() => 1 - night.value);
  const cloudX = useDerivedValue(() => WX - 30 + ((clock.value / 120) % (WW + 60)));
  const cloudX2 = useDerivedValue(() => cloudX.value + 9);
  const cloudX3 = useDerivedValue(() => cloudX.value + 19);

  return (
    <Group>
      {/* Frame shadow */}
      <RoundedRect x={WX - 8} y={WY - 6} width={WW + 16} height={WH + 18} r={6} color="rgba(0,0,0,0.25)" />
      <Group clip={CLIP}>
        <Rect x={WX} y={WY} width={WW} height={WH}>
          <LinearGradient start={vec(0, WY)} end={vec(0, WY + WH)} colors={skyColors} />
        </Rect>
        <Group opacity={starsOpacity}>
          {STARS.map((s) => (
            <Circle key={s.phase} cx={s.x} cy={s.y} r={s.r} color="#FFFFFF" opacity={twinkle} />
          ))}
        </Group>
        <Circle cx={WX + 68} cy={sunY} r={10} color="#FFE066" opacity={sunOpacity} />
        <Group opacity={moonOpacity}>
          <Circle cx={WX + 24} cy={WY + 24} r={8} color="#F4F1DE" />
          <Circle cx={WX + 28} cy={WY + 21} r={7} color="#101542" />
        </Group>
        <Group opacity={sunOpacity}>
          <Circle cx={cloudX} cy={WY + 34} r={7} color="rgba(255,255,255,0.85)" />
          <Circle cx={cloudX2} cy={WY + 31} r={9} color="rgba(255,255,255,0.85)" />
          <Circle cx={cloudX3} cy={WY + 35} r={6} color="rgba(255,255,255,0.85)" />
        </Group>
        {scene === 'mountains' ? (
          <MountainScene />
        ) : scene === 'ocean' ? (
          <OceanScene clock={clock} />
        ) : (
          <CityScene night={night} />
        )}
        {/* Glass reflection */}
        <Path
          path={`M ${WX + 10} ${WY + WH} L ${WX + 40} ${WY} L ${WX + 52} ${WY} L ${WX + 22} ${WY + WH} Z`}
          color="rgba(255,255,255,0.08)"
        />
      </Group>
      {/* Frame */}
      <Rect x={WX} y={WY} width={WW} height={WH} color="#F3EDE4" style="stroke" strokeWidth={6} />
      <Rect x={WX + WW / 2 - 1.5} y={WY} width={3} height={WH} color="#F3EDE4" />
      <Rect x={WX} y={WY + WH / 2 - 1.5} width={WW} height={3} color="#F3EDE4" />
      <RoundedRect x={WX - 10} y={WY + WH + 2} width={WW + 20} height={8} r={3} color="#E2D8CA" />
    </Group>
  );
});
