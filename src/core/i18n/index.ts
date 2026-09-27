import { getLocales } from 'expo-localization';

import type { LocalizedText } from '@shared/catalog';

export type Locale = 'en' | 'uz' | 'ru';

const en = {
  'stat.energy': 'Energy',
  'stat.hunger': 'Food',
  'stat.hygiene': 'Hygiene',
  'stat.fun': 'Mood',

  'action.sleep': 'Sleep',
  'action.wake': 'Wake up',
  'action.eat': 'Eat',
  'action.shower': 'Shower',
  'action.work': 'Computer',
  'action.shop': 'Shop',

  'mood.sleeping': 'Sleeping…',
  'mood.exhausted': 'Exhausted',
  'mood.starving': 'Starving',
  'mood.filthy': 'Needs a shower',
  'mood.sad': 'Bored & sad',
  'mood.tired': 'A bit tired',
  'mood.content': 'Doing fine',
  'mood.happy': 'Feeling great!',

  'report.title': 'While you were away',
  'report.away': 'Away for {time}',
  'report.ok': 'Got it',
  'event.woke_up': 'Woke up after a good sleep',
  'event.became_starving': 'Got really hungry',
  'event.became_filthy': 'Really needs a shower',
  'event.became_exhausted': 'Became exhausted',
  'event.became_bored': 'Got bored',
  'event.offline_cap_reached': 'Time away was capped at 7 days',

  'pc.title': 'Workstation',
  'pc.subtitle': 'Freelance gigs pay coins and lift the mood',
  'pc.play': 'Start',
  'pc.practice': 'Offline — practice mode (no coins)',
  'pc.tooTired': 'Too tired to work. Sleep first!',
  'game.terminal-coder': 'Terminal Coder',
  'game.terminal-coder.desc': 'Squash falling bugs, let clean code through.',
  'game.farm-sim': 'Farming Simulator',
  'game.farm-sim.desc': 'Feed hungry sheep with watermelons in time.',
  'game.save-server': 'Save the Server',
  'game.save-server.desc': 'Cool overheating racks before they crash.',
  'game.score': 'Score',
  'game.time': 'Time',
  'game.lives': 'Lives',
  'game.over': 'Round complete',
  'game.coins': '+{coins} coins',
  'game.coinsPending': '+{coins} coins (verifying…)',
  'game.noCoins': 'No coins this round',
  'game.back': 'Back to room',
  'game.again': 'Play again',
  'game.quit': 'Quit',
  'game.ready': 'Get ready…',

  'shop.title': 'Shop',
  'shop.buy': 'Buy',
  'shop.equip': 'Use',
  'shop.equipped': 'In use',
  'shop.owned': 'Owned',
  'shop.food': 'Kitchen',
  'shop.insufficient': 'Not enough coins',
  'shop.slot.monitor': 'Monitors',
  'shop.slot.wallpaper': 'Wallpaper',
  'shop.slot.window': 'Window view',
  'shop.slot.rug': 'Rugs',
  'shop.slot.plant': 'Plants',
  'shop.slot.lamp': 'Lighting',
  'shop.slot.outfit': 'Outfits',
  'shop.slot.hair': 'Hair',
  'shop.modifier': 'Mood decay −{pct}%',

  'error.busy': 'Busy right now',
  'error.insufficient_funds': 'Not enough coins',
  'common.close': 'Close',
  'sync.pending': 'Syncing…',
} as const;

export type TranslationKey = keyof typeof en;
type Dictionary = Record<TranslationKey, string>;

const uz: Dictionary = {
  'stat.energy': 'Energiya',
  'stat.hunger': 'Ovqat',
  'stat.hygiene': 'Gigiyena',
  'stat.fun': 'Kayfiyat',
  'action.sleep': 'Uxlash',
  'action.wake': 'Uyg\'onish',
  'action.eat': 'Ovqatlanish',
  'action.shower': 'Dush',
  'action.work': 'Kompyuter',
  'action.shop': 'Do\'kon',
  'mood.sleeping': 'Uxlayapti…',
  'mood.exhausted': 'Holdan toygan',
  'mood.starving': 'Juda och',
  'mood.filthy': 'Dush kerak',
  'mood.sad': 'Zerikkan va xafa',
  'mood.tired': 'Biroz charchagan',
  'mood.content': 'Yaxshi',
  'mood.happy': 'Ajoyib kayfiyat!',
  'report.title': 'Siz yo\'qligingizda',
  'report.away': '{time} yo\'q edingiz',
  'report.ok': 'Tushunarli',
  'event.woke_up': 'Yaxshi uxlab uyg\'ondi',
  'event.became_starving': 'Qattiq qorni ochdi',
  'event.became_filthy': 'Dush juda zarur',
  'event.became_exhausted': 'Holdan toydi',
  'event.became_bored': 'Zerikib qoldi',
  'event.offline_cap_reached': 'Vaqt 7 kun bilan cheklandi',
  'pc.title': 'Ish stoli',
  'pc.subtitle': 'Frilans ishlar tanga beradi va kayfiyatni ko\'taradi',
  'pc.play': 'Boshlash',
  'pc.practice': 'Oflayn — mashq rejimi (tangasiz)',
  'pc.tooTired': 'Ishlash uchun juda charchagan. Avval uxlang!',
  'game.terminal-coder': 'Terminal Coder',
  'game.terminal-coder.desc': 'Tushayotgan baglarni ushlang, toza kodni o\'tkazing.',
  'game.farm-sim': 'Fermerlik Simulyatsiyasi',
  'game.farm-sim.desc': 'Och qo\'ylarni o\'z vaqtida tarvuz bilan boqing.',
  'game.save-server': 'Serverni Saqla',
  'game.save-server.desc': 'Qizib ketgan serverlarni o\'chishidan oldin sovuting.',
  'game.score': 'Ball',
  'game.time': 'Vaqt',
  'game.lives': 'Jon',
  'game.over': 'Raund tugadi',
  'game.coins': '+{coins} tanga',
  'game.coinsPending': '+{coins} tanga (tekshirilmoqda…)',
  'game.noCoins': 'Bu raundda tanga yo\'q',
  'game.back': 'Xonaga qaytish',
  'game.again': 'Yana o\'ynash',
  'game.quit': 'Chiqish',
  'game.ready': 'Tayyorlaning…',
  'shop.title': 'Do\'kon',
  'shop.buy': 'Sotib olish',
  'shop.equip': 'Qo\'llash',
  'shop.equipped': 'Ishlatilmoqda',
  'shop.owned': 'Sizniki',
  'shop.food': 'Oshxona',
  'shop.insufficient': 'Tanga yetarli emas',
  'shop.slot.monitor': 'Monitorlar',
  'shop.slot.wallpaper': 'Gulqog\'oz',
  'shop.slot.window': 'Deraza manzarasi',
  'shop.slot.rug': 'Gilamlar',
  'shop.slot.plant': 'O\'simliklar',
  'shop.slot.lamp': 'Yoritish',
  'shop.slot.outfit': 'Kiyimlar',
  'shop.slot.hair': 'Soch turmagi',
  'shop.modifier': 'Kayfiyat pasayishi −{pct}%',
  'error.busy': 'Hozir band',
  'error.insufficient_funds': 'Tanga yetarli emas',
  'common.close': 'Yopish',
  'sync.pending': 'Sinxronlanmoqda…',
};

const ru: Dictionary = {
  'stat.energy': 'Энергия',
  'stat.hunger': 'Сытость',
  'stat.hygiene': 'Гигиена',
  'stat.fun': 'Настроение',
  'action.sleep': 'Спать',
  'action.wake': 'Проснуться',
  'action.eat': 'Поесть',
  'action.shower': 'Душ',
  'action.work': 'Компьютер',
  'action.shop': 'Магазин',
  'mood.sleeping': 'Спит…',
  'mood.exhausted': 'Без сил',
  'mood.starving': 'Очень голоден',
  'mood.filthy': 'Нужен душ',
  'mood.sad': 'Скучно и грустно',
  'mood.tired': 'Немного устал',
  'mood.content': 'Всё хорошо',
  'mood.happy': 'Отличное настроение!',
  'report.title': 'Пока вас не было',
  'report.away': 'Отсутствие: {time}',
  'report.ok': 'Понятно',
  'event.woke_up': 'Выспался и проснулся',
  'event.became_starving': 'Сильно проголодался',
  'event.became_filthy': 'Очень нужен душ',
  'event.became_exhausted': 'Выбился из сил',
  'event.became_bored': 'Заскучал',
  'event.offline_cap_reached': 'Время ограничено 7 днями',
  'pc.title': 'Рабочее место',
  'pc.subtitle': 'Фриланс приносит монеты и поднимает настроение',
  'pc.play': 'Начать',
  'pc.practice': 'Офлайн — тренировка (без монет)',
  'pc.tooTired': 'Слишком устал для работы. Сначала поспите!',
  'game.terminal-coder': 'Terminal Coder',
  'game.terminal-coder.desc': 'Ловите падающие баги, пропускайте чистый код.',
  'game.farm-sim': 'Фермерский симулятор',
  'game.farm-sim.desc': 'Вовремя кормите голодных овец арбузами.',
  'game.save-server': 'Спаси сервер',
  'game.save-server.desc': 'Охлаждайте перегретые стойки до сбоя.',
  'game.score': 'Очки',
  'game.time': 'Время',
  'game.lives': 'Жизни',
  'game.over': 'Раунд завершён',
  'game.coins': '+{coins} монет',
  'game.coinsPending': '+{coins} монет (проверка…)',
  'game.noCoins': 'В этом раунде без монет',
  'game.back': 'В комнату',
  'game.again': 'Ещё раз',
  'game.quit': 'Выйти',
  'game.ready': 'Приготовьтесь…',
  'shop.title': 'Магазин',
  'shop.buy': 'Купить',
  'shop.equip': 'Использовать',
  'shop.equipped': 'Используется',
  'shop.owned': 'Куплено',
  'shop.food': 'Кухня',
  'shop.insufficient': 'Недостаточно монет',
  'shop.slot.monitor': 'Мониторы',
  'shop.slot.wallpaper': 'Обои',
  'shop.slot.window': 'Вид из окна',
  'shop.slot.rug': 'Ковры',
  'shop.slot.plant': 'Растения',
  'shop.slot.lamp': 'Освещение',
  'shop.slot.outfit': 'Одежда',
  'shop.slot.hair': 'Причёски',
  'shop.modifier': 'Падение настроения −{pct}%',
  'error.busy': 'Сейчас занят',
  'error.insufficient_funds': 'Недостаточно монет',
  'common.close': 'Закрыть',
  'sync.pending': 'Синхронизация…',
};

const dictionaries: Record<Locale, Dictionary> = { en, uz, ru };

const detectLocale = (): Locale => {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'ru' || code === 'uz' ? code : code === 'en' ? 'en' : 'uz';
  } catch {
    return 'uz';
  }
};

export const locale: Locale = detectLocale();

export const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
  let out: string = dictionaries[locale][key] ?? en[key];
  if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
};

export const localized = (text: LocalizedText): string => text[locale];

export const formatDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const unit = { en: ['h', 'm'], uz: ['soat', 'daq'], ru: ['ч', 'мин'] }[locale];
  return h > 0 ? `${h} ${unit[0]} ${m} ${unit[1]}` : `${m} ${unit[1]}`;
};
