/**
 * Worklet-safe object pool.
 *
 * Entities are pre-allocated once and recycled via an `active` flag, so the
 * game loop performs ZERO allocations per frame (no GC pauses → no dropped
 * frames). It is a plain array of plain objects so it can live inside a
 * Reanimated SharedValue and be mutated on the UI thread.
 */

export interface Poolable {
  active: boolean;
}

export const createPool = <T extends Poolable>(size: number, factory: (index: number) => T): T[] => {
  'worklet';
  const items: T[] = [];
  for (let i = 0; i < size; i++) {
    const item = factory(i);
    item.active = false;
    items.push(item);
  }
  return items;
};

/** Returns the index of a recycled slot, or -1 if the pool is exhausted (caller skips the spawn). */
export const acquire = <T extends Poolable>(pool: T[]): number => {
  'worklet';
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    if (item && !item.active) {
      item.active = true;
      return i;
    }
  }
  return -1;
};

export const release = <T extends Poolable>(pool: T[], index: number): void => {
  'worklet';
  const item = pool[index];
  if (item) item.active = false;
};

export const activeCount = <T extends Poolable>(pool: readonly T[]): number => {
  'worklet';
  let n = 0;
  for (let i = 0; i < pool.length; i++) if (pool[i]?.active) n++;
  return n;
};
