import { Canvas, Group, Line, LinearGradient, Rect, RoundedRect, Text, vec, type SkFont } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { hapticEnd, hapticHit, hapticMiss } from '../engine/haptics';
import { GameHud } from '../engine/GameHud';
import { monoFont, uiFont } from '../engine/fonts';
import type { MiniGameProps } from '../engine/types';
import { useGameLoop } from '../engine/useGameLoop';

import {
  BUG_LINES,
  CLEAN_LINES,
  LINE_HEIGHT,
  POOL_SIZE,
  createTerminalState,
  stepTerminal,
  tapTerminal,
  terminalPerformance,
  type TerminalState,
} from './logic';

const ACCENT = '#50FA7B';

const LineSlot = memo(function LineSlot({
  state,
  index,
  font,
}: {
  state: SharedValue<TerminalState>;
  index: number;
  font: SkFont | null;
}) {
  const opacity = useDerivedValue(() => {
    const l = state.value.lines[index];
    if (!l || !l.active) return 0;
    return l.flash >= 0 ? Math.max(0, 1 - l.flash * 4) : 1;
  });
  const x = useDerivedValue(() => state.value.lines[index]?.x ?? 0);
  const y = useDerivedValue(() => state.value.lines[index]?.y ?? -100);
  const w = useDerivedValue(() => state.value.lines[index]?.width ?? 0);
  const textX = useDerivedValue(() => x.value + 8);
  const textY = useDerivedValue(() => y.value + 17);
  const bg = useDerivedValue(() => {
    const l = state.value.lines[index];
    if (!l) return 'transparent';
    if (l.flash >= 0) return l.isBug ? '#FFFFFF' : '#FF4D6D';
    return l.isBug ? 'rgba(255,77,109,0.22)' : 'rgba(80,250,123,0.14)';
  });
  const border = useDerivedValue(() => (state.value.lines[index]?.isBug ? '#FF4D6D' : '#50FA7B'));
  const text = useDerivedValue(() => {
    const l = state.value.lines[index];
    if (!l) return '';
    return (l.isBug ? BUG_LINES[l.textIndex] : CLEAN_LINES[l.textIndex]) ?? '';
  });

  return (
    <Group opacity={opacity}>
      <RoundedRect x={x} y={y} width={w} height={LINE_HEIGHT} r={6} color={bg} />
      <RoundedRect x={x} y={y} width={w} height={LINE_HEIGHT} r={6} color={border} style="stroke" strokeWidth={1.2} />
      {font && <Text x={textX} y={textY} text={text} font={font} color={border} />}
    </Group>
  );
});

/**
 * Terminal Coder — all simulation & hit-testing on the UI thread:
 *   frame callback → stepTerminal (worklet) → SharedValue.modify → Skia redraw.
 * React renders this component once per round.
 */
export const TerminalCoderGame = memo(function TerminalCoderGame({ width, height, seed, durationSec, onFinish }: MiniGameProps) {
  const font = useMemo(() => monoFont(12), []);
  const hudFont = useMemo(() => uiFont(18), []);
  const state = useSharedValue<TerminalState>(createTerminalState(width, height, seed, durationSec));
  const reported = useSharedValue(false);
  const score = useDerivedValue(() => state.value.score);
  const lives = useDerivedValue(() => state.value.lives);
  const timeLeft = useDerivedValue(() => state.value.duration - state.value.elapsed);

  const finishedRef = useRef(false);
  const finish = useCallback(
    (s: number, perf: number, hits: number, misses: number, wrongTaps: number, shipped: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      hapticEnd();
      onFinish({ score: s, performance: perf, stats: { hits, misses, wrongTaps, shipped } });
    },
    [onFinish],
  );

  const step = (dt: number) => {
    'worklet';
    const livesBefore = state.value.lives;
    state.modify((s) => {
      stepTerminal(s, dt);
      return s;
    });
    const s = state.value;
    if (s.lives < livesBefore) scheduleOnRN(hapticMiss);
    if (s.over && !reported.value) {
      reported.value = true;
      scheduleOnRN(finish, s.score, terminalPerformance(s), s.hits, s.misses, s.wrongTaps, s.shipped);
    }
  };

  useGameLoop(step, true);

  const tap = Gesture.Tap()
    .maxDuration(10_000)
    .onBegin((e) => {
      'worklet';
      const before = state.value.hits + state.value.wrongTaps;
      state.modify((s) => {
        tapTerminal(s, e.x, e.y);
        return s;
      });
      if (state.value.hits + state.value.wrongTaps > before) scheduleOnRN(hapticHit);
    });

  const slots = useMemo(() => Array.from({ length: POOL_SIZE }, (_, i) => i), []);
  const gridLines = useMemo(() => Array.from({ length: Math.ceil(height / 32) }, (_, i) => i * 32), [height]);

  return (
    <GestureDetector gesture={tap}>
      <Canvas style={[styles.canvas, { width, height }]}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={['#0B1020', '#11172E']} />
        </Rect>
        {gridLines.map((y) => (
          <Line key={y} p1={vec(0, y)} p2={vec(width, y)} color="rgba(80,250,123,0.04)" strokeWidth={1} />
        ))}
        {/* Production line */}
        <Rect x={0} y={height - 40} width={width} height={40} color="rgba(255,77,109,0.10)" />
        <Line p1={vec(0, height - 40)} p2={vec(width, height - 40)} color="#FF4D6D" strokeWidth={2} />
        {font && <Text x={12} y={height - 16} text="$ deploy --prod" font={font} color="#FF4D6D" />}
        {slots.map((i) => (
          <LineSlot key={i} state={state} index={i} font={font} />
        ))}
        <GameHud font={hudFont} width={width} score={score} timeLeft={timeLeft} lives={lives} accent={ACCENT} />
      </Canvas>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({ canvas: { backgroundColor: '#0B1020' } });
