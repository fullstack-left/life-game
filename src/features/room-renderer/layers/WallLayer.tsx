import { Circle, Group, Line, LinearGradient, Oval, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import { FLOOR_Y, ROOM_H, ROOM_W } from '../layout';

interface Props {
  readonly wallTop: string;
  readonly wallBottom: string;
  readonly pattern: string;
  readonly rug?: { color: string; accent: string } | undefined;
}

const PLANK_H = 26;

/** Static background: wall, pattern, baseboard, wooden floor, rug. Re-renders only when décor changes. */
export const WallLayer = memo(function WallLayer({ wallTop, wallBottom, pattern, rug }: Props) {
  const stripes = useMemo(() => Array.from({ length: 10 }, (_, i) => i * 44 + 8), []);
  const dots = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: (i % 10) * 42 + ((Math.floor(i / 10) % 2) * 21 + 12),
        y: Math.floor(i / 10) * 55 + 24,
      })),
    [],
  );
  const planks = useMemo(() => {
    const rows: { y: number; seams: number[] }[] = [];
    for (let y = FLOOR_Y + 12, r = 0; y < ROOM_H; y += PLANK_H, r++) {
      const offset = (r % 3) * 47;
      rows.push({ y, seams: [offset + 30, offset + 150, offset + 270, offset + 390].filter((x) => x < ROOM_W) });
    }
    return rows;
  }, []);

  return (
    <Group>
      {/* Wall */}
      <Rect x={0} y={0} width={ROOM_W} height={FLOOR_Y}>
        <LinearGradient start={vec(0, 0)} end={vec(0, FLOOR_Y)} colors={[wallTop, wallBottom]} />
      </Rect>
      {pattern === 'stripes' &&
        stripes.map((x) => <Rect key={x} x={x} y={0} width={18} height={FLOOR_Y} color="rgba(255,255,255,0.05)" />)}
      {pattern === 'dots' &&
        dots.map((d) => <Circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={3} color="rgba(255,255,255,0.07)" />)}

      {/* Ceiling shadow */}
      <Rect x={0} y={0} width={ROOM_W} height={40}>
        <LinearGradient start={vec(0, 0)} end={vec(0, 40)} colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']} />
      </Rect>

      {/* Floor */}
      <Rect x={0} y={FLOOR_Y} width={ROOM_W} height={ROOM_H - FLOOR_Y}>
        <LinearGradient start={vec(0, FLOOR_Y)} end={vec(0, ROOM_H)} colors={['#8A5A3C', '#5E3B26']} />
      </Rect>
      {planks.map((row) => (
        <Group key={row.y}>
          <Line p1={vec(0, row.y)} p2={vec(ROOM_W, row.y)} color="rgba(0,0,0,0.18)" strokeWidth={1.2} />
          {row.seams.map((x) => (
            <Line key={x} p1={vec(x, row.y)} p2={vec(x, row.y + PLANK_H)} color="rgba(0,0,0,0.14)" strokeWidth={1} />
          ))}
        </Group>
      ))}

      {/* Baseboard */}
      <Rect x={0} y={FLOOR_Y - 4} width={ROOM_W} height={16} color="#E8E1D9" />
      <Rect x={0} y={FLOOR_Y + 10} width={ROOM_W} height={3} color="rgba(0,0,0,0.25)" />

      {/* Rug */}
      {rug && (
        <Group>
          <Oval x={95} y={505} width={220} height={70} color="rgba(0,0,0,0.25)" />
          <Oval x={95} y={498} width={220} height={70} color={rug.color} />
          <Oval x={120} y={508} width={170} height={50} color={rug.accent} style="stroke" strokeWidth={4} />
          <Oval x={150} y={518} width={110} height={30} color={rug.accent} opacity={0.35} />
        </Group>
      )}

      {/* Soft floor contact shadow under furniture line */}
      <RoundedRect x={0} y={FLOOR_Y + 12} width={ROOM_W} height={18} r={0} color="rgba(0,0,0,0.12)" />
    </Group>
  );
});
