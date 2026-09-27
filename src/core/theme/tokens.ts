/** Design tokens shared by RN UI and the Skia renderer. */

export const palette = {
  ink900: '#0F1020',
  ink800: '#171933',
  ink700: '#222548',
  ink600: '#2E3260',
  ink400: '#5A5F99',
  mist: '#C9CCF2',
  white: '#FFFFFF',

  energy: '#FFC857',
  hunger: '#FF7A59',
  hygiene: '#4CC9F0',
  fun: '#B388FF',

  success: '#3DDC97',
  danger: '#FF4D6D',
  warning: '#FFB347',
  coin: '#FFD166',
  accent: '#7B61FF',
} as const;

export const radii = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const typography = {
  caption: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.3 },
  body: { fontSize: 15, fontWeight: '500' as const },
  title: { fontSize: 20, fontWeight: '800' as const },
  display: { fontSize: 32, fontWeight: '900' as const },
  mono: { fontSize: 13, fontFamily: 'monospace' as const },
} as const;

export type StatColorKey = 'energy' | 'hunger' | 'hygiene' | 'fun';
