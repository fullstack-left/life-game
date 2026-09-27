import { Canvas, Group, useClock } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import { palette } from '@/core/theme/tokens';
import { deriveMood } from '@/entities/companion';
import { useCompanionStore } from '@/store/companion';

import { Character } from './character/Character';
import {
  LOOP_CODE,
  POSE_CODE,
  resolveCharacterTarget,
  walkDurationMs,
  type CharacterTarget,
} from './characterMachine';
import { goldenHour, nightFactor } from './dayNight';
import { ForegroundLayer, FurnitureLayer } from './layers/FurnitureLayer';
import { LightingLayer } from './layers/LightingLayer';
import { WallLayer } from './layers/WallLayer';
import { WindowLayer } from './layers/WindowLayer';
import {
  ANCHOR_X,
  CHARACTER_BASELINE_Y,
  computeViewport,
  hitTestZone,
  toRoomSpace,
  type Anchor,
  type InteractionZone,
} from './layout';
import { useRoomDecor } from './useRoomDecor';

interface Props {
  readonly onZonePress?: (zone: InteractionZone) => void;
}

/** World-space placement per anchor: (x, y, depth-scale). */
const placement = (anchor: Anchor, pose: CharacterTarget['pose']): { x: number; y: number; depth: number } => {
  if (pose === 'lie') return { x: 142, y: 402, depth: 0.88 };
  switch (anchor) {
    case 'shower':
      return { x: ANCHOR_X.shower, y: 430, depth: 0.8 };
    case 'computer':
      return { x: ANCHOR_X.computer, y: 505, depth: 0.95 };
    default:
      return { x: ANCHOR_X[anchor], y: CHARACTER_BASELINE_Y, depth: 1 };
  }
};

const WANDER: readonly Anchor[] = ['center', 'wanderLeft', 'wanderRight'];

/**
 * The living room. One Skia <Canvas>, ~250 draw nodes, every animated value on
 * the UI thread. React only re-renders when décor or the character *target*
 * changes (a handful of times per minute), never per frame.
 */
export const DynamicRoom = memo(function DynamicRoom({ onZonePress }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }, []);
  const viewport = useMemo(() => computeViewport(size.width, size.height), [size]);
  const roomTransform = useMemo(
    () => [{ translateX: viewport.offsetX }, { translateY: viewport.offsetY }, { scale: viewport.scale }],
    [viewport],
  );

  const decor = useRoomDecor();
  const activityType = useCompanionStore((s) => s.activity.type);
  const mood = useCompanionStore((s) => deriveMood(s.stats, s.activity));
  const energy = useCompanionStore((s) => Math.round(s.stats.energy));

  // ── Environment shared values ─────────────────────────────────────────────
  const clock = useClock();
  const night = useSharedValue(nightFactor(new Date()));
  const golden = useSharedValue(goldenHour(new Date()));
  const localMinutes = useSharedValue(new Date().getHours() * 60 + new Date().getMinutes());
  const fatigue = useSharedValue(0);
  const sleep = useSharedValue(0);

  useEffect(() => {
    const update = () => {
      const d = new Date();
      night.value = withTiming(nightFactor(d), { duration: 2000 });
      golden.value = withTiming(goldenHour(d), { duration: 2000 });
      localMinutes.value = d.getHours() * 60 + d.getMinutes();
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [night, golden, localMinutes]);

  useEffect(() => {
    // Energy < 20 → room dims & vignettes; ramps smoothly between 35 and 10.
    const f = Math.min(1, Math.max(0, (35 - energy) / 25));
    fatigue.value = withTiming(f, { duration: 1500 });
  }, [energy, fatigue]);

  useEffect(() => {
    sleep.value = withTiming(activityType === 'sleeping' ? 1 : 0, { duration: 1800 });
  }, [activityType, sleep]);

  // ── Character motion shared values ────────────────────────────────────────
  const initial = placement('center', 'stand');
  const cx = useSharedValue(initial.x);
  const cy = useSharedValue(initial.y);
  const depth = useSharedValue(initial.depth);
  const walking = useSharedValue(0);
  const loop = useSharedValue<number>(LOOP_CODE.idle_content);
  const pose = useSharedValue<number>(POSE_CODE.stand);
  const bobAmp = useSharedValue(2);
  const bobHz = useSharedValue(0.6);
  const eyelid = useSharedValue(0);

  const target = useMemo(() => resolveCharacterTarget(activityType, mood), [activityType, mood]);
  const currentAnchor = useRef<Anchor>('center');

  const moveTo = useCallback(
    (anchor: Anchor, t: CharacterTarget) => {
      const dest = placement(anchor, t.pose);
      const arrive = { loop: LOOP_CODE[t.loop], pose: POSE_CODE[t.pose] };
      const duration = anchor === currentAnchor.current ? 0 : walkDurationMs(cx.value, dest.x, t.walkSpeed) + 250;
      currentAnchor.current = anchor;

      bobAmp.value = withTiming(t.bobAmp, { duration: 600 });
      bobHz.value = t.bobHz;
      eyelid.value = withTiming(t.eyelid, { duration: 800 });

      if (duration === 0) {
        loop.value = arrive.loop;
        pose.value = arrive.pose;
        return;
      }
      // Walk first (standing, neutral loop), then enter the target loop on arrival — all on the UI thread.
      pose.value = POSE_CODE.stand;
      loop.value = LOOP_CODE.idle_content;
      walking.value = 1;
      const easing = Easing.inOut(Easing.quad);
      cy.value = withTiming(dest.y, { duration, easing });
      depth.value = withTiming(dest.depth, { duration, easing });
      cx.value = withTiming(dest.x, { duration, easing }, (finished) => {
        if (!finished) return;
        walking.value = 0;
        loop.value = arrive.loop;
        pose.value = arrive.pose;
      });
    },
    [bobAmp, bobHz, cx, cy, depth, eyelid, loop, pose, walking],
  );

  useEffect(() => {
    moveTo(target.anchor, target);
  }, [target, moveTo]);

  // Idle wandering: small random strolls make the companion feel alive.
  useEffect(() => {
    if (activityType !== 'idle' || mood === 'exhausted') return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          const options = WANDER.filter((a) => a !== currentAnchor.current);
          const next = options[Math.floor(Math.random() * options.length)] ?? 'center';
          moveTo(next, target);
          schedule();
        },
        7000 + Math.random() * 6000,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [activityType, mood, target, moveTo]);

  const motion = useMemo(
    () => ({ clock, x: cx, y: cy, depth, walking, loop, pose, bobAmp, bobHz, eyelid }),
    [clock, cx, cy, depth, walking, loop, pose, bobAmp, bobHz, eyelid],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((e) => {
          const p = toRoomSpace(viewport, e.x, e.y);
          const zone = hitTestZone(p.x, p.y);
          if (zone) onZonePress?.(zone);
        }),
    [viewport, onZonePress],
  );

  return (
    <GestureDetector gesture={tap}>
      <View style={styles.container} onLayout={onLayout} accessibilityRole="image" accessibilityLabel="Room">
        {size.width > 0 && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={roomTransform}>
              <WallLayer wallTop={decor.wall.top} wallBottom={decor.wall.bottom} pattern={decor.wall.pattern} rug={decor.rug} />
              <WindowLayer scene={decor.windowScene} night={night} golden={golden} clock={clock} />
              <FurnitureLayer
                monitor={decor.monitor}
                lamp={decor.lamp}
                plant={decor.plant}
                clock={clock}
                loop={loop}
                localMinutes={localMinutes}
              />
              <Character look={decor.look} motion={motion} />
              <ForegroundLayer loop={loop} />
              <LightingLayer
                night={night}
                fatigue={fatigue}
                sleep={sleep}
                clock={clock}
                lamp={decor.lamp}
                monitorGlow={decor.monitor.glow}
              />
            </Group>
          </Canvas>
        )}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.ink900 },
});
