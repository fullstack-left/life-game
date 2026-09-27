import {
  Canvas,
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
import { memo, useCallback, useMemo, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GameHud } from '../engine/GameHud';
import { hapticEnd, hapticHit } from '../engine/haptics';
import { uiFont } from '../engine/fonts';
import type { MiniGameProps } from '../engine/types';
import { useGameLoop } from '../engine/useGameLoop';

import {
  PEN_COUNT,
  POOL_SIZE,
  SheepPhase,
  createFarmState,
  farmPerformance,
  penRect,
  stepFarm,
  tapFarm,
  type FarmState,
} from './logic';

const WOOL = ['#FFFFFF', '#F5E6CC', '#E0E0E0'];
const FLUFF = [
  { x: -22, y: -4, r: 18 },
  { x: -6, y: -10, r: 20 },
  { x: 12, y: -6, r: 18 },
  { x: -14, y: 8, r: 16 },
  { x: 8, y: 8, r: 16 },
] as const;

const Pen = memo(function Pen({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <Group>
      <RoundedRect x={x} y={y} width={w} height={h} r={10} color="rgba(0,0,0,0.12)" />
      <RoundedRect x={x} y={y} width={w} height={h} r={10} color="#8D6E63" style="stroke" strokeWidth={3} />
      <Line p1={vec(x, y + h * 0.35)} p2={vec(x + w, y + h * 0.35)} color="rgba(141,110,99,0.5)" strokeWidth={2} />
      <Oval x={x + w * 0.62} y={y + h * 0.72} width={w * 0.3} height={h * 0.16} color="#795548" />
    </Group>
  );
});

const SheepSlot = memo(function SheepSlot({ state, index }: { state: SharedValue<FarmState>; index: number }) {
  const geom = useDerivedValue(() => {
    const s = state.value;
    const sh = s.sheep[index];
    if (!sh || !sh.active) return { x: -999, y: -999, s: 0, o: 0, phase: 0, p: 0, wool: 0 };
    const r = penRect(s.width, s.height, sh.pen);
    const k = sh.phaseLen > 0 ? Math.min(1, sh.t / sh.phaseLen) : 1;
    let scale = 1;
    let opacity = 1;
    let hop = 0;
    if (sh.phase === SheepPhase.Entering) scale = 0.4 + 0.6 * k;
    if (sh.phase === SheepPhase.Fed) hop = Math.sin(k * Math.PI) * 14;
    if (sh.phase === SheepPhase.Leaving) opacity = 1 - k;
    return {
      x: r.x + r.w * 0.42,
      y: r.y + r.h * 0.62 - hop,
      s: scale * Math.min(r.w, r.h * 1.6) / 120,
      o: opacity,
      phase: sh.phase,
      p: k,
      wool: sh.wool,
    };
  });

  const transform = useDerivedValue(() => [
    { translateX: geom.value.x },
    { translateY: geom.value.y },
    { scale: geom.value.s },
  ]);
  const opacity = useDerivedValue(() => geom.value.o);
  const woolColor = useDerivedValue(() => WOOL[geom.value.wool] ?? '#FFFFFF');
  const headTransform = useDerivedValue(() => {
    const grazing = geom.value.phase === SheepPhase.Grazing;
    return [{ translateX: 34 }, { translateY: grazing ? 8 + Math.sin(geom.value.p * 18) * 3 : -6 }];
  });
  const hungry = useDerivedValue(() => (geom.value.phase === SheepPhase.Hungry ? 1 : 0));
  const fed = useDerivedValue(() => (geom.value.phase === SheepPhase.Fed ? 1 : 0));
  const bubbleScale = useDerivedValue(() => [
    { translateX: 30 },
    { translateY: -58 },
    { scale: 1 + Math.sin(geom.value.p * Math.PI * 6) * 0.08 },
  ]);
  const timerEnd = useDerivedValue(() => 1 - geom.value.p);
  const timerColor = useDerivedValue(() => (geom.value.p > 0.65 ? '#FF4D6D' : '#3DDC97'));

  return (
    <Group transform={transform} opacity={opacity}>
      <Oval x={-40} y={26} width={80} height={14} color="rgba(0,0,0,0.2)" />
      {/* legs */}
      {[-24, -10, 10, 22].map((lx) => (
        <RoundedRect key={lx} x={lx} y={10} width={7} height={22} r={3} color="#3E2723" />
      ))}
      {/* body: fluffy cloud */}
      {FLUFF.map((c) => (
        <Circle key={`${c.x}${c.y}`} cx={c.x} cy={c.y} r={c.r} color={woolColor} />
      ))}
      {/* head */}
      <Group transform={headTransform}>
        <Oval x={-10} y={-12} width={24} height={26} color="#4E342E" />
        <Oval x={-16} y={-8} width={10} height={6} color="#4E342E" />
        <Oval x={10} y={-8} width={10} height={6} color="#4E342E" />
        <Circle cx={-2} cy={-2} r={2} color="#FFFFFF" />
        <Circle cx={7} cy={-2} r={2} color="#FFFFFF" />
      </Group>

      {/* Hungry: watermelon bubble + countdown ring */}
      <Group opacity={hungry} transform={bubbleScale}>
        <Circle cx={0} cy={0} r={24} color="#FFFFFF" />
        <Circle cx={0} cy={0} r={24} color={timerColor} style="stroke" strokeWidth={4} opacity={0.4} />
        <Path
          path="M -24 0 A 24 24 0 1 1 24 0 A 24 24 0 1 1 -24 0"
          color={timerColor}
          style="stroke"
          strokeWidth={4}
          start={0}
          end={timerEnd}
        />
        <Path path="M -14 -2 A 14 14 0 0 0 14 -2 Z" color="#2E7D32" />
        <Path path="M -11 -2 A 11 11 0 0 0 11 -2 Z" color="#EF5350" />
        <Circle cx={-4} cy={3} r={1.3} color="#212121" />
        <Circle cx={3} cy={4} r={1.3} color="#212121" />
        <Circle cx={0} cy={28} r={4} color="#FFFFFF" />
      </Group>

      {/* Fed: heart */}
      <Group opacity={fed}>
        <Path
          path="M 30 -50 C 30 -58 42 -58 42 -50 C 42 -58 54 -58 54 -50 C 54 -42 42 -34 42 -32 C 42 -34 30 -42 30 -50 Z"
          color="#FF4D6D"
        />
      </Group>
    </Group>
  );
});

export const FarmGame = memo(function FarmGame({ width, height, seed, durationSec, onFinish }: MiniGameProps) {
  const hudFont = useMemo(() => uiFont(18), []);
  const state = useSharedValue<FarmState>(createFarmState(width, height, seed, durationSec));
  const reported = useSharedValue(false);
  const score = useDerivedValue(() => state.value.score);
  const timeLeft = useDerivedValue(() => state.value.duration - state.value.elapsed);

  const done = useRef(false);
  const finish = useCallback(
    (s: number, perf: number, fedCount: number, missed: number, startled: number) => {
      if (done.current) return;
      done.current = true;
      hapticEnd();
      onFinish({ score: s, performance: perf, stats: { fed: fedCount, missed, startled } });
    },
    [onFinish],
  );

  useGameLoop((dt) => {
    'worklet';
    state.modify((s) => {
      stepFarm(s, dt);
      return s;
    });
    const s = state.value;
    if (s.over && !reported.value) {
      reported.value = true;
      scheduleOnRN(finish, s.score, farmPerformance(s), s.fed, s.missed, s.startled);
    }
  }, true);

  const tap = Gesture.Tap()
    .maxDuration(10_000)
    .onBegin((e) => {
      'worklet';
      const before = state.value.fed;
      state.modify((s) => {
        tapFarm(s, e.x, e.y);
        return s;
      });
      if (state.value.fed > before) scheduleOnRN(hapticHit);
    });

  const pens = useMemo(() => Array.from({ length: PEN_COUNT }, (_, i) => penRect(width, height, i)), [width, height]);
  const slots = useMemo(() => Array.from({ length: POOL_SIZE }, (_, i) => i), []);

  return (
    <GestureDetector gesture={tap}>
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={['#7CB342', '#558B2F']} />
        </Rect>
        <Rect x={0} y={0} width={width} height={56} color="rgba(0,0,0,0.25)" />
        {pens.map((p, i) => (
          <Pen key={i} {...p} />
        ))}
        {slots.map((i) => (
          <SheepSlot key={i} state={state} index={i} />
        ))}
        <GameHud font={hudFont} width={width} score={score} timeLeft={timeLeft} accent="#FFD166" />
      </Canvas>
    </GestureDetector>
  );
});
