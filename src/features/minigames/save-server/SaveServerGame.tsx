import { BlurMask, Canvas, Circle, Group, LinearGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { interpolateColor, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GameHud } from '../engine/GameHud';
import { hapticEnd, hapticHit, hapticMiss } from '../engine/haptics';
import { uiFont } from '../engine/fonts';
import type { MiniGameProps } from '../engine/types';
import { useGameLoop } from '../engine/useGameLoop';

import {
  RACK_COUNT,
  WARN_HEAT,
  createServerState,
  rackRect,
  serverPerformance,
  stepServer,
  tapServer,
  type RackRect,
  type ServerState,
} from './logic';

/**
 * Each rack is a group of Skia drawing nodes on ONE canvas — twelve independent
 * heat timers without twelve React components re-rendering.
 */
const RackNode = memo(function RackNode({
  state,
  index,
  rect,
  clock,
}: {
  state: SharedValue<ServerState>;
  index: number;
  rect: RackRect;
  clock: SharedValue<number>;
}) {
  const { x, y, w, h } = rect;
  const heat = useDerivedValue(() => state.value.racks[index]?.heat ?? 0);
  const rebooting = useDerivedValue(() => ((state.value.racks[index]?.reboot ?? 0) > 0 ? 1 : 0));
  const online = useDerivedValue(() => 1 - rebooting.value);
  const frost = useDerivedValue(() => Math.max(0, 1 - (state.value.racks[index]?.cooled ?? 99) * 3));

  const body = useDerivedValue(() =>
    interpolateColor(heat.value, [0, 60, 85, 100], ['#263238', '#37474F', '#6D2E2E', '#B71C1C']),
  );
  // Red warning blink accelerates as heat approaches 100.
  const warn = useDerivedValue(() => {
    if (heat.value < WARN_HEAT || rebooting.value > 0) return 0;
    const urgency = (heat.value - WARN_HEAT) / (100 - WARN_HEAT);
    const hz = 2 + urgency * 8;
    return (0.5 + 0.5 * Math.sin((clock.value / 1000) * Math.PI * 2 * hz)) * (0.3 + 0.7 * urgency);
  });
  const barW = useDerivedValue(() => Math.max(0, (heat.value / 100) * (w - 16)));
  const barColor = useDerivedValue(() => interpolateColor(heat.value, [0, 50, 80, 100], ['#3DDC97', '#FFD166', '#FF8A3D', '#FF4D6D']));
  const rebootBlink = useDerivedValue(() => rebooting.value * (0.4 + 0.6 * Math.abs(Math.sin(clock.value / 180))));

  const rebootShade = useDerivedValue(() => rebooting.value * 0.55);
  const leds = useMemo(() => Array.from({ length: 4 }, (_, i) => y + 18 + i * ((h - 44) / 4)), [y, h]);
  const ledOn = useDerivedValue(() => online.value * (0.5 + 0.5 * Math.sin(clock.value / 90 + index)));

  return (
    <Group>
      <RoundedRect x={x} y={y} width={w} height={h} r={8} color={body} />
      <RoundedRect x={x} y={y} width={w} height={h} r={8} color="#FF1744" opacity={warn}>
        <BlurMask blur={12} style="outer" />
      </RoundedRect>
      <RoundedRect x={x} y={y} width={w} height={h} r={8} color="#FF1744" opacity={warn} style="stroke" strokeWidth={3} />
      {leds.map((ly) => (
        <Group key={ly}>
          <RoundedRect x={x + 8} y={ly} width={w - 30} height={6} r={2} color="#11181C" />
          <Circle cx={x + w - 14} cy={ly + 3} r={3} color="#3DDC97" opacity={ledOn} />
        </Group>
      ))}
      {/* Heat bar */}
      <RoundedRect x={x + 8} y={y + h - 16} width={w - 16} height={7} r={3} color="rgba(0,0,0,0.4)" />
      <RoundedRect x={x + 8} y={y + h - 16} width={barW} height={7} r={3} color={barColor} />
      {/* Frost flash on cooling */}
      <RoundedRect x={x} y={y} width={w} height={h} r={8} color="#B3E5FC" opacity={frost} />
      {/* Rebooting overlay */}
      <RoundedRect x={x} y={y} width={w} height={h} r={8} color="#000" opacity={rebootShade} />
      <Circle cx={x + w / 2} cy={y + h / 2} r={8} color="#FFB347" opacity={rebootBlink} />
    </Group>
  );
});

export const SaveServerGame = memo(function SaveServerGame({ width, height, seed, durationSec, onFinish }: MiniGameProps) {
  const hudFont = useMemo(() => uiFont(18), []);
  const state = useSharedValue<ServerState>(createServerState(width, height, seed, durationSec));
  const reported = useSharedValue(false);
  const clock = useSharedValue(0);
  const score = useDerivedValue(() => state.value.score);
  const lives = useDerivedValue(() => state.value.lives);
  const timeLeft = useDerivedValue(() => state.value.duration - state.value.elapsed);

  const done = useRef(false);
  const finish = useCallback(
    (s: number, perf: number, crashes: number, cools: number) => {
      if (done.current) return;
      done.current = true;
      hapticEnd();
      onFinish({ score: Math.floor(s), performance: perf, stats: { crashes, cools } });
    },
    [onFinish],
  );

  useGameLoop((dt) => {
    'worklet';
    clock.value += dt * 1000;
    const livesBefore = state.value.lives;
    state.modify((s) => {
      stepServer(s, dt);
      return s;
    });
    const s = state.value;
    if (s.lives < livesBefore) scheduleOnRN(hapticMiss);
    if (s.over && !reported.value) {
      reported.value = true;
      scheduleOnRN(finish, s.score, serverPerformance(s), s.crashes, s.cools);
    }
  }, true);

  const tap = Gesture.Tap()
    .maxDuration(10_000)
    .onBegin((e) => {
      'worklet';
      const before = state.value.cools;
      state.modify((s) => {
        tapServer(s, e.x, e.y);
        return s;
      });
      if (state.value.cools > before) scheduleOnRN(hapticHit);
    });

  const rects = useMemo(() => Array.from({ length: RACK_COUNT }, (_, i) => rackRect(width, height, i)), [width, height]);

  return (
    <GestureDetector gesture={tap}>
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={['#0D1B2A', '#1B263B']} />
        </Rect>
        {rects.map((r, i) => (
          <RackNode key={i} state={state} index={i} rect={r} clock={clock} />
        ))}
        <GameHud font={hudFont} width={width} score={score} timeLeft={timeLeft} lives={lives} accent="#4CC9F0" />
      </Canvas>
    </GestureDetector>
  );
});
