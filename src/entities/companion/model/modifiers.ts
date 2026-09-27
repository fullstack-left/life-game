import { CATALOG_BY_ID } from '@shared/catalog';

import { ZERO_MODIFIERS, type Modifiers } from './types';

/** Σ M_i over *equipped* items only (owning an item without using it gives no buff). */
export const aggregateModifiers = (equippedItemIds: readonly string[]): Modifiers => {
  if (equippedItemIds.length === 0) return ZERO_MODIFIERS;
  let fun = 0;
  let energy = 0;
  let hygiene = 0;
  for (const id of equippedItemIds) {
    const m = CATALOG_BY_ID.get(id)?.modifiers;
    if (!m) continue;
    fun += m.fun ?? 0;
    energy += m.energy ?? 0;
    hygiene += m.hygiene ?? 0;
  }
  return { fun, energy, hygiene };
};
