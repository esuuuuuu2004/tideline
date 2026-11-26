/**
 * TIDELINE design tokens.
 *
 * The single source of truth for color, type, spacing, and shape.
 * Principle: "The ocean creates the emotion. The data creates the trust."
 * Surfaces stay quiet and cinematic; Electric Cyan is the only accent and is
 * used sparingly to mark the one thing that matters on a screen.
 */

import { Platform } from 'react-native';

/* -------------------------------------------------------------------------- */
/* Color                                                                      */
/* -------------------------------------------------------------------------- */

export const Palette = {
  abyss: '#071A30',
  midnight: '#0C233B',
  ocean: '#123B59',
  cyan: '#56D8E9',
  ice: '#A5EAF1',
  textPrimary: '#F4F8FC',
  textSecondary: '#8FA7BA',
  amber: '#F4B95F',
} as const;

export const Colors = {
  dark: {
    background: Palette.abyss,
    surface: Palette.midnight,
    surfaceRaised: Palette.ocean,
    border: 'rgba(165, 234, 241, 0.12)',
    text: Palette.textPrimary,
    textSecondary: Palette.textSecondary,
    accent: Palette.cyan,
    accentMuted: Palette.ice,
    warning: Palette.amber,
  },
  light: {
    background: Palette.textPrimary,
    surface: '#EAF2F7',
    surfaceRaised: '#DCEAF1',
    border: 'rgba(7, 26, 48, 0.12)',
    text: Palette.abyss,
    textSecondary: '#44596B',
    accent: '#0E7C8A',
    accentMuted: '#0E7C8A',
    warning: '#B5781F',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];

/* -------------------------------------------------------------------------- */
/* Typography                                                                 */
/* -------------------------------------------------------------------------- */

export type FontWeightKey = '400' | '500' | '600' | '700';

/** Registered expo-font keys per weight so Android resolves static TTFs. */
export const FontFamilies = {
  interface: {
    '400': 'Manrope_400',
    '500': 'Manrope_500',
    '600': 'Manrope_600',
    '700': 'Manrope_700',
  },
  data: {
    '400': 'Inter_400',
    '500': 'Inter_500',
    '600': 'Inter_600',
    '700': 'Inter_700',
  },
} as const;

/** Fallback stacks used until the custom fonts finish loading. */
export const FontFallback = Platform.select({
  ios: { interface: 'System', data: 'Menlo' },
  android: { interface: 'sans-serif', data: 'monospace' },
  default: { interface: 'system-ui', data: 'ui-monospace, monospace' },
}) ?? { interface: 'system-ui', data: 'monospace' };

/** Type scale. Deliberately restrained — no oversized display type. */
export const Typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as FontWeightKey },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as FontWeightKey },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' as FontWeightKey },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as FontWeightKey },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as FontWeightKey },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as FontWeightKey },
  /** Large readouts: tide height, times, coordinates. */
  metric: { fontSize: 40, lineHeight: 46, fontWeight: '600' as FontWeightKey },
} as const;

export type TypeToken = keyof typeof Typography;

/* -------------------------------------------------------------------------- */
/* Spacing & shape                                                            */
/* -------------------------------------------------------------------------- */

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const MaxContentWidth = 800;

/** Bottom inset so content clears the native tab bar. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
