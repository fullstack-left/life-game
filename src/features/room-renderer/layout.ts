/**
 * The room is authored in a fixed virtual coordinate space and uniformly scaled
 * (letter-boxed) to the device canvas. Every layer, hit-zone and animation
 * target uses these units, so the scene looks identical on any screen.
 */
export const ROOM_W = 400;
export const ROOM_H = 620;
export const FLOOR_Y = 410;
export const CHARACTER_BASELINE_Y = 540;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type InteractionZone = 'bed' | 'computer' | 'fridge' | 'shower';

export const ZONES: Readonly<Record<InteractionZone, Rect>> = {
  bed: { x: 10, y: 330, w: 135, h: 110 },
  computer: { x: 150, y: 250, w: 108, h: 170 },
  fridge: { x: 264, y: 240, w: 56, h: 180 },
  shower: { x: 324, y: 190, w: 70, h: 240 },
};

export const WINDOW: Rect = { x: 160, y: 60, w: 90, h: 120 };

/** Where the character stands (x) for each anchor. */
export const ANCHOR_X = {
  center: 205,
  bed: 78,
  computer: 205,
  fridge: 292,
  shower: 359,
  wanderLeft: 150,
  wanderRight: 250,
} as const;

export type Anchor = keyof typeof ANCHOR_X;

export interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** "Cover" horizontally, "contain" vertically — the room fills the width on phones. */
export const computeViewport = (width: number, height: number): Viewport => {
  const scale = Math.min(width / ROOM_W, height / ROOM_H);
  return {
    scale,
    offsetX: (width - ROOM_W * scale) / 2,
    offsetY: (height - ROOM_H * scale) / 2,
  };
};

export const toRoomSpace = (vp: Viewport, px: number, py: number): { x: number; y: number } => {
  'worklet';
  return { x: (px - vp.offsetX) / vp.scale, y: (py - vp.offsetY) / vp.scale };
};

export const hitTestZone = (x: number, y: number): InteractionZone | undefined => {
  'worklet';
  const order: InteractionZone[] = ['shower', 'fridge', 'computer', 'bed'];
  for (const zone of order) {
    const r = ZONES[zone];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return zone;
  }
  return undefined;
};
