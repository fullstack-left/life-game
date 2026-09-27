import { smoothstep } from '@/core/utils/math';

/**
 * 0 = full daylight, 1 = deep night, driven by the player's local hour so the
 * room mirrors the real world (dawn 5–8, dusk 18–21).
 */
export const nightFactor = (date: Date): number => {
  const h = date.getHours() + date.getMinutes() / 60;
  const dawn = 1 - smoothstep(5, 8, h);
  const dusk = smoothstep(18, 21, h);
  return Math.max(dawn, dusk);
};

/** Warm "golden hour" factor around sunrise/sunset — tints the sky orange. */
export const goldenHour = (date: Date): number => {
  const h = date.getHours() + date.getMinutes() / 60;
  const bump = (center: number) => Math.max(0, 1 - Math.abs(h - center) / 1.5);
  return Math.max(bump(6.5), bump(19));
};
