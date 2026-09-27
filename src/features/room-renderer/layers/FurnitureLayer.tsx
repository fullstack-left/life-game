import {
  BlurMask,
  Circle,
  Group,
  Line,
  LinearGradient,
  Oval,
  Path,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { LOOP_CODE } from '../characterMachine';

export interface MonitorVisual {
  readonly tier: number;
  readonly glow: string;
  readonly count: number;
}

interface Props {
  readonly monitor: MonitorVisual;
  readonly lamp?: { color: string; kind: 'desk' | 'neon' } | undefined;
  readonly plant?: { kind: string; color: string } | undefined;
  readonly clock: SharedValue<number>;
  readonly loop: SharedValue<number>;
  readonly localMinutes: SharedValue<number>;
}

// ── Bed ──────────────────────────────────────────────────────────────────────
const Bed = memo(function Bed() {
  return (
    <Group>
      <Oval x={8} y={425} width={145} height={22} color="rgba(0,0,0,0.3)" />
      <RoundedRect x={12} y={320} width={20} height={115} r={6} color="#6D4C41" />
      <RoundedRect x={16} y={326} width={12} height={40} r={4} color="#8D6E63" />
      <Rect x={20} y={425} width={6} height={14} color="#4E342E" />
      <Rect x={136} y={425} width={6} height={14} color="#4E342E" />
      <RoundedRect x={20} y={395} width={126} height={32} r={6} color="#5D4037" />
      <RoundedRect x={22} y={386} width={122} height={20} r={8} color="#F5F5F5" />
      <RoundedRect x={26} y={378} width={36} height={16} r={8} color="#FFFFFF" />
      <RoundedRect x={62} y={384} width={84} height={26} r={8}>
        <LinearGradient start={vec(62, 384)} end={vec(146, 410)} colors={['#5C6BC0', '#3949AB']} />
      </RoundedRect>
    </Group>
  );
});

// ── Desk + monitor(s) ────────────────────────────────────────────────────────
const CODE_ROWS = Array.from({ length: 7 }, (_, i) => ({ w: 12 + ((i * 17) % 34), indent: (i % 3) * 5 }));

const Screen = memo(function Screen({
  x,
  y,
  w,
  h,
  glow,
  clock,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  glow: string;
  clock: SharedValue<number>;
}) {
  const scroll = useDerivedValue(() => [{ translateY: -((clock.value / 70) % 7) }]);
  return (
    <Group>
      <RoundedRect x={x - 3} y={y - 3} width={w + 6} height={h + 6} r={4} color="#111" />
      <RoundedRect x={x - 2} y={y - 2} width={w + 4} height={h + 4} r={4} color={glow} opacity={0.35}>
        <BlurMask blur={8} style="outer" />
      </RoundedRect>
      <Group clip={{ x, y, width: w, height: h }}>
        <Rect x={x} y={y} width={w} height={h} color="#0B1020" />
        <Group transform={scroll}>
          {Array.from({ length: Math.ceil(h / 7) + 2 }, (_, i) => {
            const row = CODE_ROWS[i % CODE_ROWS.length] ?? { w: 20, indent: 0 };
            return (
              <Rect
                key={i}
                x={x + 4 + row.indent}
                y={y + 4 + i * 7}
                width={Math.min(row.w, w - 8 - row.indent)}
                height={3}
                color={i % 4 === 0 ? '#FF79C6' : i % 3 === 0 ? '#50FA7B' : glow}
                opacity={0.8}
              />
            );
          })}
        </Group>
      </Group>
    </Group>
  );
});

const Desk = memo(function Desk({ monitor, clock }: { monitor: MonitorVisual; clock: SharedValue<number> }) {
  const screens =
    monitor.count >= 2
      ? [
          { x: 160, y: 306, w: 44, h: 38 },
          { x: 208, y: 306, w: 44, h: 38 },
        ]
      : monitor.tier >= 2
        ? [{ x: 168, y: 296, w: 72, h: 50 }]
        : [{ x: 178, y: 310, w: 52, h: 38 }];

  return (
    <Group>
      <Oval x={146} y={432} width={118} height={16} color="rgba(0,0,0,0.3)" />
      {/* legs */}
      <Rect x={156} y={366} width={7} height={72} color="#37474F" />
      <Rect x={246} y={366} width={7} height={72} color="#37474F" />
      {/* drawer */}
      <RoundedRect x={214} y={368} width={34} height={40} r={3} color="#546E7A" />
      <Rect x={226} y={386} width={10} height={3} color="#B0BEC5" />
      {/* top */}
      <RoundedRect x={148} y={356} width={112} height={12} r={3} color="#8D6E63" />
      {/* monitor stands */}
      {screens.map((s) => (
        <Group key={s.x}>
          <Rect x={s.x + s.w / 2 - 3} y={s.y + s.h} width={6} height={356 - (s.y + s.h)} color="#263238" />
          <RoundedRect x={s.x + s.w / 2 - 12} y={352} width={24} height={5} r={2} color="#263238" />
          <Screen {...s} glow={monitor.glow} clock={clock} />
        </Group>
      ))}
      {/* keyboard + mug */}
      <RoundedRect x={176} y={350} width={46} height={6} r={2} color="#CFD8DC" />
      <RoundedRect x={232} y={342} width={10} height={12} r={2} color="#FF8A65" />
      {monitor.tier >= 3 && (
        <Rect x={150} y={366} width={108} height={2} color="#FF6AD5" opacity={0.9}>
          <BlurMask blur={3} style="solid" />
        </Rect>
      )}
    </Group>
  );
});

// ── Fridge ───────────────────────────────────────────────────────────────────
const Fridge = memo(function Fridge({ loop }: { loop: SharedValue<number> }) {
  const doorOpen = useDerivedValue(() => (loop.value === LOOP_CODE.eat ? 1 : 0));
  const doorClosed = useDerivedValue(() => 1 - doorOpen.value);
  return (
    <Group>
      <Oval x={260} y={414} width={64} height={14} color="rgba(0,0,0,0.3)" />
      <RoundedRect x={264} y={240} width={56} height={180} r={8}>
        <LinearGradient start={vec(264, 0)} end={vec(320, 0)} colors={['#ECEFF1', '#B0BEC5']} />
      </RoundedRect>
      <Line p1={vec(266, 300)} p2={vec(318, 300)} color="#90A4AE" strokeWidth={2} />
      <Group opacity={doorClosed}>
        <RoundedRect x={308} y={258} width={4} height={30} r={2} color="#78909C" />
        <RoundedRect x={308} y={312} width={4} height={40} r={2} color="#78909C" />
        <Circle cx={278} cy={326} r={4} color="#FF5252" />
        <Circle cx={290} cy={340} r={3.5} color="#FFD740" />
        <Rect x={276} y={356} width={12} height={9} color="#FFFFFF" opacity={0.9} />
      </Group>
      <Group opacity={doorOpen}>
        <Rect x={268} y={304} width={48} height={112} color="#FFF8E1" />
        <Rect x={270} y={330} width={44} height={2} color="#CFD8DC" />
        <Rect x={270} y={362} width={44} height={2} color="#CFD8DC" />
        <Circle cx={280} cy={322} r={6} color="#E63946" />
        <RoundedRect x={290} y={346} width={18} height={14} r={3} color="#E9C46A" />
        <RoundedRect x={276} y={378} width={10} height={20} r={2} color="#4CC9F0" />
        <Rect x={268} y={304} width={48} height={112} color="#FFF3B0" opacity={0.35}>
          <BlurMask blur={10} style="outer" />
        </Rect>
        {/* opened door */}
        <RoundedRect x={236} y={302} width={30} height={116} r={4} color="#CFD8DC" />
      </Group>
    </Group>
  );
});

// ── Shower (back part — tiles, head, water) ─────────────────────────────────
const TILE_ROWS = Array.from({ length: 12 }, (_, i) => 196 + i * 20);
const DROPS = Array.from({ length: 16 }, (_, i) => ({ x: 336 + ((i * 29) % 48), phase: (i * 137) % 240 }));

const Shower = memo(function Shower({ loop, clock }: { loop: SharedValue<number>; clock: SharedValue<number> }) {
  const on = useDerivedValue(() => (loop.value === LOOP_CODE.shower ? 1 : 0));
  return (
    <Group>
      <Rect x={326} y={192} width={68} height={240} color="#B3E5FC" />
      {TILE_ROWS.map((y) => (
        <Line key={y} p1={vec(326, y)} p2={vec(394, y)} color="rgba(255,255,255,0.6)" strokeWidth={1} />
      ))}
      {[343, 360, 377].map((x) => (
        <Line key={x} p1={vec(x, 192)} p2={vec(x, 432)} color="rgba(255,255,255,0.45)" strokeWidth={1} />
      ))}
      <Rect x={326} y={426} width={68} height={8} color="#90A4AE" />
      {/* shower head */}
      <Rect x={386} y={200} width={4} height={24} color="#90A4AE" />
      <Rect x={356} y={200} width={34} height={4} color="#90A4AE" />
      <RoundedRect x={346} y={202} width={22} height={8} r={4} color="#B0BEC5" />
      <Group opacity={on}>
        {DROPS.map((d) => (
          <Drop key={d.x + d.phase} x={d.x} phase={d.phase} clock={clock} />
        ))}
        <Circle cx={350} cy={230} r={18} color="rgba(255,255,255,0.35)">
          <BlurMask blur={10} style="normal" />
        </Circle>
      </Group>
    </Group>
  );
});

const Drop = memo(function Drop({ x, phase, clock }: { x: number; phase: number; clock: SharedValue<number> }) {
  const p1 = useDerivedValue(() => {
    const y = 212 + ((clock.value / 2 + phase) % 220);
    return vec(x, y);
  });
  const p2 = useDerivedValue(() => vec(x - 1, p1.value.y + 7));
  return <Line p1={p1} p2={p2} color="#E1F5FE" strokeWidth={1.4} />;
});

// ── Décor ────────────────────────────────────────────────────────────────────
const Plant = memo(function Plant({ kind, color }: { kind: string; color: string }) {
  if (kind === 'cactus') {
    return (
      <Group>
        <Oval x={16} y={532} width={46} height={10} color="rgba(0,0,0,0.3)" />
        <RoundedRect x={24} y={508} width={30} height={28} r={4} color="#C1693C" />
        <RoundedRect x={33} y={460} width={13} height={52} r={6} color={color} />
        <RoundedRect x={22} y={476} width={9} height={22} r={4} color={color} />
        <RoundedRect x={48} y={470} width={9} height={20} r={4} color={color} />
        <Circle cx={40} cy={458} r={4} color="#FF6B9A" />
      </Group>
    );
  }
  const leaves = [
    'M 40 505 C 10 490 8 460 22 450 C 30 470 38 485 40 505 Z',
    'M 40 505 C 70 488 74 458 60 446 C 52 468 44 484 40 505 Z',
    'M 40 505 C 30 470 36 440 42 428 C 50 450 48 480 40 505 Z',
    'M 40 505 C 16 500 0 486 4 474 C 20 480 32 492 40 505 Z',
  ];
  return (
    <Group>
      <Oval x={14} y={532} width={52} height={10} color="rgba(0,0,0,0.3)" />
      {leaves.map((d) => (
        <Path key={d} path={d} color={color} />
      ))}
      <RoundedRect x={22} y={502} width={36} height={34} r={5} color="#ECEFF1" />
      <Rect x={22} y={510} width={36} height={4} color="#B0BEC5" />
    </Group>
  );
});

const WallClock = memo(function WallClock({ minutes }: { minutes: SharedValue<number> }) {
  const cx = 62;
  const cy = 120;
  const hourEnd = useDerivedValue(() => {
    const a = ((minutes.value / 60) % 12) * (Math.PI / 6) - Math.PI / 2;
    return vec(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
  });
  const minEnd = useDerivedValue(() => {
    const a = (minutes.value % 60) * (Math.PI / 30) - Math.PI / 2;
    return vec(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
  });
  return (
    <Group>
      <Circle cx={cx + 2} cy={cy + 3} r={21} color="rgba(0,0,0,0.25)" />
      <Circle cx={cx} cy={cy} r={20} color="#FAFAFA" />
      <Circle cx={cx} cy={cy} r={20} color="#37474F" style="stroke" strokeWidth={3} />
      <Line p1={vec(cx, cy)} p2={hourEnd} color="#263238" strokeWidth={2.5} strokeCap="round" />
      <Line p1={vec(cx, cy)} p2={minEnd} color="#E53935" strokeWidth={1.5} strokeCap="round" />
      <Circle cx={cx} cy={cy} r={2} color="#263238" />
    </Group>
  );
});

const Poster = memo(function Poster() {
  return (
    <Group>
      <Rect x={286} y={84} width={50} height={66} color="rgba(0,0,0,0.25)" />
      <Rect x={283} y={80} width={50} height={66} color="#FFF8E7" />
      <Circle cx={308} cy={106} r={14} color="#FF7A59" />
      <Rect x={290} y={122} width={36} height={16} color="#7B61FF" />
      <Path path="M 290 138 L 302 124 L 312 134 L 320 126 L 326 138 Z" color="#3DDC97" />
    </Group>
  );
});

const Lamp = memo(function Lamp({ kind, color, clock }: { kind: 'desk' | 'neon'; color: string; clock: SharedValue<number> }) {
  const flicker = useDerivedValue(() => 0.85 + 0.15 * Math.sin(clock.value / 90) * Math.sin(clock.value / 37));
  if (kind === 'neon') {
    const bolt = 'M 70 232 L 56 258 L 70 258 L 60 284 L 88 250 L 74 250 L 84 232 Z';
    return (
      <Group opacity={flicker}>
        <Path path={bolt} color={color} style="stroke" strokeWidth={6} opacity={0.5}>
          <BlurMask blur={10} style="normal" />
        </Path>
        <Path path={bolt} color={color} style="stroke" strokeWidth={2.5} strokeJoin="round" />
      </Group>
    );
  }
  return (
    <Group>
      <RoundedRect x={243} y={350} width={14} height={4} r={2} color="#455A64" />
      <Line p1={vec(250, 350)} p2={vec(244, 322)} color="#455A64" strokeWidth={3} />
      <Line p1={vec(244, 322)} p2={vec(252, 306)} color="#455A64" strokeWidth={3} />
      <Path path="M 244 300 L 262 304 L 258 316 L 246 312 Z" color="#FFB300" />
      <Circle cx={254} cy={314} r={5} color={color} opacity={flicker}>
        <BlurMask blur={6} style="normal" />
      </Circle>
    </Group>
  );
});

/** Everything that sits *behind* the character. */
export const FurnitureLayer = memo(function FurnitureLayer({ monitor, lamp, plant, clock, loop, localMinutes }: Props) {
  const plantNode = useMemo(() => (plant ? <Plant kind={plant.kind} color={plant.color} /> : null), [plant]);
  return (
    <Group>
      <WallClock minutes={localMinutes} />
      <Poster />
      {lamp?.kind === 'neon' && <Lamp kind="neon" color={lamp.color} clock={clock} />}
      <Bed />
      <Desk monitor={monitor} clock={clock} />
      {lamp?.kind === 'desk' && <Lamp kind="desk" color={lamp.color} clock={clock} />}
      <Fridge loop={loop} />
      <Shower loop={loop} clock={clock} />
      {plantNode}
    </Group>
  );
});

/** Elements drawn *in front of* the character (blanket, shower glass). */
export const ForegroundLayer = memo(function ForegroundLayer({ loop }: { loop: SharedValue<number> }) {
  const sleeping = useDerivedValue(() => (loop.value === LOOP_CODE.sleep ? 1 : 0));
  return (
    <Group>
      <Group opacity={sleeping}>
        <RoundedRect x={58} y={386} width={88} height={32} r={10}>
          <LinearGradient start={vec(58, 386)} end={vec(146, 418)} colors={['#7986CB', '#3F51B5']} />
        </RoundedRect>
        <Path path="M 62 396 Q 100 388 142 398" color="rgba(255,255,255,0.25)" style="stroke" strokeWidth={2} />
      </Group>
      {/* Shower glass + frame */}
      <Rect x={326} y={192} width={68} height={240} color="rgba(200,235,255,0.16)" />
      <Path path="M 334 200 L 346 200 L 336 420 L 330 420 Z" color="rgba(255,255,255,0.18)" />
      <Rect x={324} y={190} width={72} height={244} color="#CFD8DC" style="stroke" strokeWidth={3} />
    </Group>
  );
});
