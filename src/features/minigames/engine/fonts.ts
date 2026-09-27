import { matchFont, type SkFont } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

const cache = new Map<string, SkFont | null>();

const make = (key: string, family: string | undefined, size: number, weight: 'normal' | 'bold'): SkFont | null => {
  if (cache.has(key)) return cache.get(key) ?? null;
  let font: SkFont | null = null;
  try {
    font = matchFont({ fontFamily: family, fontSize: size, fontWeight: weight });
  } catch {
    font = null;
  }
  cache.set(key, font);
  return font;
};

export const monoFont = (size = 12): SkFont | null =>
  make(`mono-${size}`, Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), size, 'bold');

export const uiFont = (size = 16): SkFont | null =>
  make(`ui-${size}`, Platform.select({ ios: 'Helvetica', android: 'sans-serif', default: 'sans-serif' }), size, 'bold');
