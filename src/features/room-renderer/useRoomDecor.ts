import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { CATALOG_BY_ID, type ItemSlot } from '@shared/catalog';

import { useCompanionStore } from '@/store/companion';

import type { CharacterLook } from './character/Character';
import type { MonitorVisual } from './layers/FurnitureLayer';

export interface RoomDecor {
  readonly wall: { top: string; bottom: string; pattern: string };
  readonly windowScene: string;
  readonly monitor: MonitorVisual;
  readonly rug?: { color: string; accent: string } | undefined;
  readonly plant?: { kind: string; color: string } | undefined;
  readonly lamp?: { kind: 'desk' | 'neon'; color: string; x: number; y: number; radius: number } | undefined;
  readonly look: CharacterLook;
}

const str = (v: string | number | undefined, fallback: string): string => (typeof v === 'string' ? v : fallback);
const num = (v: string | number | undefined, fallback: number): number => (typeof v === 'number' ? v : fallback);

/** Maps equipped catalog items → renderer parameters. Memoised on the equipped ids only. */
export const useRoomDecor = (): RoomDecor => {
  const equipped = useCompanionStore(useShallow((s) => s.equipped));

  return useMemo(() => {
    const visual = (slot: ItemSlot) => {
      const id = equipped[slot];
      return id ? CATALOG_BY_ID.get(id)?.visual : undefined;
    };
    const wp = visual('wallpaper');
    const win = visual('window');
    const mon = visual('monitor');
    const rug = visual('rug');
    const plant = visual('plant');
    const lampId = equipped.lamp;
    const lamp = visual('lamp');
    const outfit = visual('outfit');
    const hair = visual('hair');

    const isNeon = lampId === 'lamp_neon';
    return {
      wall: { top: str(wp?.top, '#3A3F74'), bottom: str(wp?.bottom, '#2A2E57'), pattern: str(wp?.pattern, 'none') },
      windowScene: str(win?.scene, 'city'),
      monitor: { tier: num(mon?.tier, 1), glow: str(mon?.glow, '#6EC3FF'), count: num(mon?.count, 1) },
      rug: rug ? { color: str(rug.color, '#E07A5F'), accent: str(rug.accent, '#F2CC8F') } : undefined,
      plant: plant ? { kind: str(plant.kind, 'cactus'), color: str(plant.color, '#4F9D69') } : undefined,
      lamp: lamp
        ? {
            kind: isNeon ? 'neon' : 'desk',
            color: str(lamp.color, '#FFD28A'),
            x: isNeon ? 72 : 254,
            y: isNeon ? 258 : 316,
            radius: num(lamp.radius, 0.35),
          }
        : undefined,
      look: {
        shirt: str(outfit?.shirt, '#6C7A99'),
        pants: str(outfit?.pants, '#2B2D42'),
        hairColor: str(hair?.color, '#3B2F2F'),
        hairStyle: str(hair?.style, 'short'),
      },
    };
  }, [equipped]);
};
