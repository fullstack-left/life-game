/**
 * Shop catalog — shared by client (rendering, optimistic purchase) and mirrored
 * into `public.catalog_items` by the migrations (authoritative prices).
 * A unit test asserts the SQL seed and this file never drift apart.
 */

export const ITEM_SLOTS = ['monitor', 'wallpaper', 'window', 'rug', 'plant', 'lamp', 'outfit', 'hair'] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export interface LocalizedText {
  readonly en: string;
  readonly uz: string;
  readonly ru: string;
}

export interface ItemModifiers {
  /** M_i in  λ_mod = λ / (1 + Σ M_i)  for the Fun (mood) decay coefficient. */
  readonly fun?: number;
  /** Same formula applied to the Energy decay coefficient. */
  readonly energy?: number;
  /** Multiplier reduction for linear hygiene decay rate: R_mod = R / (1 + Σ M_i). */
  readonly hygiene?: number;
}

export interface CatalogItem {
  readonly id: string;
  readonly slot: ItemSlot;
  readonly price: number;
  readonly name: LocalizedText;
  readonly modifiers: ItemModifiers;
  /** Renderer-specific parameters (colours, tiers). Pure data. */
  readonly visual: Readonly<Record<string, string | number>>;
  /** Owned by every new player. */
  readonly starter?: boolean;
}

export const CATALOG: readonly CatalogItem[] = [
  // ── Monitors ────────────────────────────────────────────────────────────────
  { id: 'monitor_basic', slot: 'monitor', price: 0, starter: true, modifiers: {},
    name: { en: 'Old Monitor', uz: 'Eski monitor', ru: 'Старый монитор' },
    visual: { tier: 1, glow: '#6EC3FF', count: 1 } },
  { id: 'monitor_4k', slot: 'monitor', price: 450, modifiers: { fun: 0.15 },
    name: { en: '4K Monitor', uz: '4K monitor', ru: '4K монитор' },
    visual: { tier: 2, glow: '#8AF3FF', count: 1 } },
  { id: 'monitor_dual_rgb', slot: 'monitor', price: 1400, modifiers: { fun: 0.35, energy: 0.05 },
    name: { en: 'Dual RGB Setup', uz: 'Ikki RGB monitor', ru: 'Два RGB монитора' },
    visual: { tier: 3, glow: '#FF6AD5', count: 2 } },

  // ── Wallpapers ──────────────────────────────────────────────────────────────
  { id: 'wallpaper_plain', slot: 'wallpaper', price: 0, starter: true, modifiers: {},
    name: { en: 'Plain Wall', uz: 'Oddiy devor', ru: 'Простая стена' },
    visual: { top: '#3A3F74', bottom: '#2A2E57', pattern: 'none' } },
  { id: 'wallpaper_sunset', slot: 'wallpaper', price: 220, modifiers: { fun: 0.08 },
    name: { en: 'Sunset Stripes', uz: 'Shafaq chiziqlari', ru: 'Закатные полосы' },
    visual: { top: '#6B3FA0', bottom: '#E0677A', pattern: 'stripes' } },
  { id: 'wallpaper_forest', slot: 'wallpaper', price: 320, modifiers: { fun: 0.1, energy: 0.03 },
    name: { en: 'Forest Calm', uz: "O'rmon sokinligi", ru: 'Лесной покой' },
    visual: { top: '#1F5E4A', bottom: '#123A30', pattern: 'dots' } },

  // ── Window view ─────────────────────────────────────────────────────────────
  { id: 'window_city', slot: 'window', price: 0, starter: true, modifiers: {},
    name: { en: 'City View', uz: "Shahar ko'rinishi", ru: 'Вид на город' },
    visual: { scene: 'city' } },
  { id: 'window_mountains', slot: 'window', price: 600, modifiers: { fun: 0.12, energy: 0.04 },
    name: { en: 'Mountain View', uz: "Tog' manzarasi", ru: 'Вид на горы' },
    visual: { scene: 'mountains' } },
  { id: 'window_ocean', slot: 'window', price: 900, modifiers: { fun: 0.18, energy: 0.06 },
    name: { en: 'Ocean View', uz: 'Okean manzarasi', ru: 'Вид на океан' },
    visual: { scene: 'ocean' } },

  // ── Rugs ────────────────────────────────────────────────────────────────────
  { id: 'rug_round', slot: 'rug', price: 150, modifiers: { fun: 0.04 },
    name: { en: 'Round Rug', uz: 'Dumaloq gilam', ru: 'Круглый ковёр' },
    visual: { color: '#E07A5F', accent: '#F2CC8F' } },
  { id: 'rug_persian', slot: 'rug', price: 520, modifiers: { fun: 0.1, hygiene: 0.05 },
    name: { en: 'Persian Rug', uz: 'Fors gilami', ru: 'Персидский ковёр' },
    visual: { color: '#8E1B3A', accent: '#E9C46A' } },

  // ── Plants ──────────────────────────────────────────────────────────────────
  { id: 'plant_cactus', slot: 'plant', price: 90, modifiers: { fun: 0.03 },
    name: { en: 'Cactus', uz: 'Kaktus', ru: 'Кактус' },
    visual: { kind: 'cactus', color: '#4F9D69' } },
  { id: 'plant_monstera', slot: 'plant', price: 340, modifiers: { fun: 0.07, hygiene: 0.08 },
    name: { en: 'Monstera', uz: 'Monstera', ru: 'Монстера' },
    visual: { kind: 'monstera', color: '#2D8659' } },

  // ── Lamps ───────────────────────────────────────────────────────────────────
  { id: 'lamp_desk', slot: 'lamp', price: 120, modifiers: { energy: 0.04 },
    name: { en: 'Desk Lamp', uz: 'Stol chirog\'i', ru: 'Настольная лампа' },
    visual: { color: '#FFD28A', radius: 0.35 } },
  { id: 'lamp_neon', slot: 'lamp', price: 700, modifiers: { fun: 0.14, energy: 0.05 },
    name: { en: 'Neon Sign', uz: 'Neon yozuv', ru: 'Неоновая вывеска' },
    visual: { color: '#FF5CCB', radius: 0.5 } },

  // ── Outfits ─────────────────────────────────────────────────────────────────
  { id: 'outfit_hoodie', slot: 'outfit', price: 0, starter: true, modifiers: {},
    name: { en: 'Grey Hoodie', uz: 'Kulrang xudi', ru: 'Серое худи' },
    visual: { shirt: '#6C7A99', pants: '#2B2D42' } },
  { id: 'outfit_streetwear', slot: 'outfit', price: 380, modifiers: { fun: 0.08 },
    name: { en: 'Streetwear', uz: "Ko'cha uslubi", ru: 'Стритвир' },
    visual: { shirt: '#F77F00', pants: '#1D3557' } },
  { id: 'outfit_suit', slot: 'outfit', price: 1100, modifiers: { fun: 0.2 },
    name: { en: 'Designer Suit', uz: 'Dizayner kostyum', ru: 'Дизайнерский костюм' },
    visual: { shirt: '#14213D', pants: '#0B132B' } },

  // ── Hair ────────────────────────────────────────────────────────────────────
  { id: 'hair_short', slot: 'hair', price: 0, starter: true, modifiers: {},
    name: { en: 'Short Hair', uz: 'Qisqa soch', ru: 'Короткие волосы' },
    visual: { color: '#3B2F2F', style: 'short' } },
  { id: 'hair_curly', slot: 'hair', price: 160, modifiers: { fun: 0.04 },
    name: { en: 'Curly', uz: 'Jingalak', ru: 'Кудри' },
    visual: { color: '#6F4E37', style: 'curly' } },
  { id: 'hair_neon', slot: 'hair', price: 480, modifiers: { fun: 0.09 },
    name: { en: 'Neon Mohawk', uz: 'Neon irokez', ru: 'Неоновый ирокез' },
    visual: { color: '#39FF14', style: 'mohawk' } },
];

export interface FoodItem {
  readonly id: string;
  readonly price: number;
  readonly hungerRestore: number;
  readonly funBonus: number;
  readonly name: LocalizedText;
  readonly color: string;
}

export const FOODS: readonly FoodItem[] = [
  { id: 'food_apple', price: 5, hungerRestore: 15, funBonus: 0, color: '#E63946',
    name: { en: 'Apple', uz: 'Olma', ru: 'Яблоко' } },
  { id: 'food_plov', price: 18, hungerRestore: 55, funBonus: 6, color: '#E9C46A',
    name: { en: 'Plov', uz: 'Osh', ru: 'Плов' } },
  { id: 'food_pizza', price: 25, hungerRestore: 45, funBonus: 12, color: '#F4A261',
    name: { en: 'Pizza', uz: 'Pitsa', ru: 'Пицца' } },
];

export const STARTING_COINS = 150;

export const CATALOG_BY_ID: ReadonlyMap<string, CatalogItem> = new Map(CATALOG.map((i) => [i.id, i]));
export const FOOD_BY_ID: ReadonlyMap<string, FoodItem> = new Map(FOODS.map((f) => [f.id, f]));
export const STARTER_ITEMS: readonly CatalogItem[] = CATALOG.filter((i) => i.starter === true);
