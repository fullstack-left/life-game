import {
  BlurMask,
  Circle,
  Group,
  Oval,
  Path,
  RoundedRect,
  Text,
  matchFont,
  type SkFont,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { Platform } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { LOOP_CODE, POSE_CODE } from '../characterMachine';

export interface CharacterLook {
  readonly shirt: string;
  readonly pants: string;
  readonly hairColor: string;
  readonly hairStyle: string;
}

export interface CharacterMotion {
  readonly clock: SharedValue<number>;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  readonly depth: SharedValue<number>;
  readonly walking: SharedValue<number>;
  readonly loop: SharedValue<number>;
  readonly pose: SharedValue<number>;
  readonly bobAmp: SharedValue<number>;
  readonly bobHz: SharedValue<number>;
  readonly eyelid: SharedValue<number>;
}

const SKIN = '#F2C9A0';
const SKIN_SHADE = '#E0B48A';

const MOUTH = {
  smile: 'M -7 -88 Q 0 -81 7 -88',
  neutral: 'M -5 -86 L 5 -86',
  frown: 'M -6 -84 Q 0 -89 6 -84',
} as const;

const HAIR: Record<string, string> = {
  short: 'M -21 -100 C -22 -124 22 -124 21 -100 C 16 -110 6 -114 -2 -112 C -10 -112 -16 -108 -21 -100 Z',
  mohawk: 'M -5 -116 L -8 -134 L -2 -122 L 0 -140 L 3 -122 L 8 -134 L 6 -116 Z',
};

const CURLS = [
  [-16, -110],
  [-8, -117],
  [2, -119],
  [11, -116],
  [17, -108],
  [-19, -101],
  [19, -100],
] as const;

const useIs = (loop: SharedValue<number>, codes: readonly number[]) =>
  useDerivedValue(() => (codes.includes(loop.value) ? 1 : 0));

const loadFont = (): SkFont | null => {
  try {
    return matchFont({
      fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
      fontSize: 14,
      fontWeight: 'bold',
    });
  } catch {
    return null;
  }
};

/**
 * Procedurally rendered, fully vector character. Every animated property is a
 * UI-thread derived value — the JS thread only changes *which* loop is active.
 */
export const Character = memo(function Character({ look, motion }: { look: CharacterLook; motion: CharacterMotion }) {
  const { clock, x, y, depth, walking, loop, pose, bobAmp, bobHz, eyelid } = motion;
  const font = useMemo(() => loadFont(), []);

  // ── Root transform: position → depth scale → pose rotation ────────────────
  const root = useDerivedValue(() => {
    const t = clock.value / 1000;
    const lying = pose.value === POSE_CODE.lie;
    const bob = lying ? 0 : Math.sin(t * Math.PI * 2 * bobHz.value) * bobAmp.value;
    const walkBounce = walking.value * Math.abs(Math.sin(t * 9)) * -3;
    return [
      { translateX: x.value },
      { translateY: y.value + bob + walkBounce },
      { scale: depth.value },
      { rotate: lying ? -Math.PI / 2 : 0 },
    ];
  });

  const shadowOpacity = useDerivedValue(() => (pose.value === POSE_CODE.lie ? 0 : 0.28));
  const shadowTransform = useDerivedValue(() => [{ translateX: x.value }, { translateY: y.value }, { scale: depth.value }]);

  // ── Limbs ─────────────────────────────────────────────────────────────────
  const legSwing = useDerivedValue(() => walking.value * Math.sin((clock.value / 1000) * 9) * 0.45);
  const leftLeg = useDerivedValue(() => [{ translateX: -7 }, { translateY: -40 }, { rotate: legSwing.value }]);
  const rightLeg = useDerivedValue(() => [{ translateX: 7 }, { translateY: -40 }, { rotate: -legSwing.value }]);

  const armAngles = useDerivedValue(() => {
    const t = clock.value / 1000;
    const l = loop.value;
    if (walking.value > 0.5) {
      const s = Math.sin(t * 9) * 0.5;
      return [s, -s];
    }
    if (l === LOOP_CODE.eat) return [0.15, 2.5 + Math.sin(t * 8) * 0.25];
    if (l === LOOP_CODE.shower) return [2.6 + Math.sin(t * 10) * 0.3, -2.6 - Math.sin(t * 10) * 0.3];
    if (l === LOOP_CODE.work) return [-1.1 + Math.sin(t * 22) * 0.08, 1.1 + Math.cos(t * 22) * 0.08];
    if (l === LOOP_CODE.idle_happy) return [0.25 + Math.sin(t * 3) * 0.15, -0.25 - Math.sin(t * 3) * 0.15];
    if (l === LOOP_CODE.idle_exhausted || l === LOOP_CODE.idle_sad) return [0.05, -0.05];
    if (l === LOOP_CODE.idle_tired) return [0.1, -2.7 + Math.sin(t * 2) * 0.1]; // rubbing eyes
    return [0.12, -0.12];
  });
  const leftArm = useDerivedValue(() => [{ translateX: -21 }, { translateY: -74 }, { rotate: armAngles.value[0] ?? 0 }]);
  const rightArm = useDerivedValue(() => [{ translateX: 21 }, { translateY: -74 }, { rotate: armAngles.value[1] ?? 0 }]);

  // ── Head & face ───────────────────────────────────────────────────────────
  const headTilt = useDerivedValue(() => {
    const l = loop.value;
    const droop = l === LOOP_CODE.idle_exhausted ? 0.18 : l === LOOP_CODE.idle_sad ? 0.1 : 0;
    const t = clock.value / 1000;
    return [{ translateY: -98 }, { rotate: droop + Math.sin(t * 0.7) * 0.03 }, { translateY: 98 }];
  });
  const lidHeight = useDerivedValue(() => {
    const t = clock.value;
    const blink = t % 4200 < 130 ? 1 : 0;
    return Math.max(eyelid.value, blink) * 9;
  });

  const smile = useIs(loop, [LOOP_CODE.idle_happy, LOOP_CODE.idle_content, LOOP_CODE.shower]);
  const frown = useIs(loop, [LOOP_CODE.idle_sad, LOOP_CODE.idle_hungry, LOOP_CODE.idle_filthy, LOOP_CODE.idle_exhausted]);
  const neutral = useIs(loop, [LOOP_CODE.idle_tired, LOOP_CODE.work, LOOP_CODE.sleep]);
  const chewing = useIs(loop, [LOOP_CODE.eat]);
  const chewR = useDerivedValue(() => 2 + Math.abs(Math.sin(clock.value / 120)) * 2.5);
  const blush = useIs(loop, [LOOP_CODE.idle_happy]);

  // ── Emotes ────────────────────────────────────────────────────────────────
  const sleepingOn = useIs(loop, [LOOP_CODE.sleep]);
  const zPhase = useDerivedValue(() => (clock.value / 2200) % 1);
  const z1y = useDerivedValue(() => y.value - 60 - zPhase.value * 40);
  const z1x = useDerivedValue(() => x.value - 70 + zPhase.value * 16);
  const z2y = useDerivedValue(() => y.value - 50 - ((zPhase.value + 0.5) % 1) * 40);
  const z2x = useDerivedValue(() => x.value - 58 + ((zPhase.value + 0.5) % 1) * 16);
  const zOpacity = useDerivedValue(() => sleepingOn.value * (1 - zPhase.value));
  const z2Opacity = useDerivedValue(() => sleepingOn.value * (1 - ((zPhase.value + 0.5) % 1)));

  const hungry = useIs(loop, [LOOP_CODE.idle_hungry]);
  const filthy = useIs(loop, [LOOP_CODE.idle_filthy]);
  const sad = useIs(loop, [LOOP_CODE.idle_sad]);
  const exhausted = useIs(loop, [LOOP_CODE.idle_exhausted]);
  const stinkWiggle = useDerivedValue(() => [{ translateX: Math.sin(clock.value / 180) * 3 }]);
  const tearY = useDerivedValue(() => -96 + ((clock.value / 25) % 20));
  const sweatY = useDerivedValue(() => -112 + ((clock.value / 40) % 14));
  const bubbleTransform = useDerivedValue(() => [
    { translateX: 26 },
    { translateY: -140 + Math.sin(clock.value / 500) * 2 },
  ]);

  const hairPath = HAIR[look.hairStyle] ?? HAIR.short ?? '';

  return (
    <Group>
      <Group transform={shadowTransform} opacity={shadowOpacity}>
        <Oval x={-26} y={-6} width={52} height={12} color="#000" />
      </Group>

      <Group transform={root}>
        {/* Legs */}
        <Group transform={leftLeg}>
          <RoundedRect x={-5} y={0} width={10} height={36} r={4} color={look.pants} />
          <RoundedRect x={-6} y={34} width={13} height={7} r={3} color="#212121" />
        </Group>
        <Group transform={rightLeg}>
          <RoundedRect x={-5} y={0} width={10} height={36} r={4} color={look.pants} />
          <RoundedRect x={-7} y={34} width={13} height={7} r={3} color="#212121" />
        </Group>

        {/* Back arm */}
        <Group transform={leftArm}>
          <RoundedRect x={-4} y={0} width={9} height={32} r={4.5} color={look.shirt} />
          <Circle cx={0.5} cy={33} r={4.5} color={SKIN} />
        </Group>

        {/* Torso */}
        <RoundedRect x={-19} y={-80} width={38} height={46} r={10} color={look.shirt} />
        <RoundedRect x={-19} y={-44} width={38} height={8} r={3} color={look.pants} />
        <Path path="M -7 -80 L 0 -70 L 7 -80 Z" color={SKIN_SHADE} />

        {/* Front arm */}
        <Group transform={rightArm}>
          <RoundedRect x={-4} y={0} width={9} height={32} r={4.5} color={look.shirt} />
          <Circle cx={0.5} cy={33} r={4.5} color={SKIN} />
          <Group opacity={chewing}>
            <Circle cx={0.5} cy={40} r={6} color="#E63946" />
          </Group>
        </Group>

        {/* Head */}
        <Group transform={headTilt}>
          <RoundedRect x={-5} y={-82} width={10} height={6} r={2} color={SKIN_SHADE} />
          <Circle cx={0} cy={-100} r={21} color={SKIN} />
          <Circle cx={-21} cy={-98} r={4} color={SKIN_SHADE} />
          <Circle cx={21} cy={-98} r={4} color={SKIN_SHADE} />

          {/* Eyes + eyelids */}
          <Oval x={-10} y={-106} width={6} height={8} color="#2D2A32" />
          <Oval x={4} y={-106} width={6} height={8} color="#2D2A32" />
          <Circle cx={-6} cy={-104} r={1.2} color="#FFFFFF" />
          <Circle cx={8} cy={-104} r={1.2} color="#FFFFFF" />
          <RoundedRect x={-11} y={-107} width={8} height={lidHeight} r={1} color={SKIN} />
          <RoundedRect x={3} y={-107} width={8} height={lidHeight} r={1} color={SKIN} />
          {/* Brows */}
          <Path path="M -11 -110 L -4 -111" color="#3B2F2F" style="stroke" strokeWidth={1.6} strokeCap="round" />
          <Path path="M 4 -111 L 11 -110" color="#3B2F2F" style="stroke" strokeWidth={1.6} strokeCap="round" />

          {/* Mouths */}
          <Path path={MOUTH.smile} color="#8D3B3B" style="stroke" strokeWidth={2} strokeCap="round" opacity={smile} />
          <Path path={MOUTH.frown} color="#8D3B3B" style="stroke" strokeWidth={2} strokeCap="round" opacity={frown} />
          <Path path={MOUTH.neutral} color="#8D3B3B" style="stroke" strokeWidth={2} strokeCap="round" opacity={neutral} />
          <Group opacity={chewing}>
            <Circle cx={0} cy={-86} r={chewR} color="#8D3B3B" />
          </Group>
          <Group opacity={blush}>
            <Circle cx={-13} cy={-93} r={3.5} color="#FF8A80" opacity={0.6} />
            <Circle cx={13} cy={-93} r={3.5} color="#FF8A80" opacity={0.6} />
          </Group>

          {/* Hair */}
          {look.hairStyle === 'curly' ? (
            CURLS.map(([cx, cy]) => <Circle key={`${cx}${cy}`} cx={cx} cy={cy} r={8} color={look.hairColor} />)
          ) : look.hairStyle === 'mohawk' ? (
            <Group>
              <Path path={HAIR.short ?? ''} color="#3B2F2F" opacity={0.5} />
              <Path path={hairPath} color={look.hairColor}>
                <BlurMask blur={2} style="solid" />
              </Path>
            </Group>
          ) : (
            <Path path={hairPath} color={look.hairColor} />
          )}

          {/* Tear (sad) & sweat (exhausted) */}
          <Group opacity={sad}>
            <Oval x={-10} y={tearY} width={4} height={6} color="#4FC3F7" />
          </Group>
          <Group opacity={exhausted}>
            <Oval x={18} y={sweatY} width={5} height={8} color="#81D4FA" />
          </Group>
        </Group>

        {/* Stink lines (filthy) */}
        <Group opacity={filthy} transform={stinkWiggle}>
          {[-18, 0, 18].map((dx) => (
            <Path
              key={dx}
              path={`M ${dx} -130 q 5 -6 0 -12 q -5 -6 0 -12`}
              color="#8BC34A"
              style="stroke"
              strokeWidth={2.2}
              strokeCap="round"
            />
          ))}
        </Group>

        {/* Thought bubble (hungry) */}
        <Group opacity={hungry} transform={bubbleTransform}>
          <Circle cx={-10} cy={20} r={3} color="#FFFFFF" />
          <Circle cx={-4} cy={12} r={4.5} color="#FFFFFF" />
          <Oval x={0} y={-16} width={34} height={26} color="#FFFFFF" />
          <Circle cx={17} cy={-3} r={7} color="#E63946" />
          <RoundedRect x={16} y={-14} width={2} height={5} r={1} color="#5D4037" />
        </Group>
      </Group>

      {/* Zzz (drawn in world space so it doesn't rotate with the lying pose) */}
      {font && (
        <Group>
          <Text x={z1x} y={z1y} text="Z" font={font} color="#E3F2FD" opacity={zOpacity} />
          <Text x={z2x} y={z2y} text="z" font={font} color="#E3F2FD" opacity={z2Opacity} />
        </Group>
      )}
    </Group>
  );
});
