import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG, FOODS, STARTING_COINS } from '@shared/catalog';

const MIGRATIONS = join(__dirname, '../../supabase/migrations');
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .join('\n');

/** Guards against client/server drift: prices shown in the app must equal what the DB charges. */
describe('catalog ↔ database seed', () => {
  const rows = new Map<string, { slot: string; kind: string; price: number; starter: boolean }>();
  for (const m of sql.matchAll(/\('([a-z0-9_]+)', '([a-z]+)', '(item|food)', (\d+), (true|false)\)/g)) {
    rows.set(m[1]!, { slot: m[2]!, kind: m[3]!, price: Number(m[4]), starter: m[5] === 'true' });
  }

  it('every catalog item exists in the seed with the same price, slot and starter flag', () => {
    for (const item of CATALOG) {
      expect(rows.get(item.id)).toEqual({ slot: item.slot, kind: 'item', price: item.price, starter: item.starter === true });
    }
  });

  it('every food exists in the seed with the same price', () => {
    for (const f of FOODS) expect(rows.get(f.id)).toEqual({ slot: 'food', kind: 'food', price: f.price, starter: false });
  });

  it('no orphan rows in the seed', () => {
    expect(rows.size).toBe(CATALOG.length + FOODS.length);
  });

  it('signup grant matches STARTING_COINS', () => {
    expect(sql).toContain(`v_start constant bigint := ${STARTING_COINS};`);
  });

  it('one starter per slot at most', () => {
    const slots = CATALOG.filter((i) => i.starter).map((i) => i.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
});
