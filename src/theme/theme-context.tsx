/**
 * TIDELINE theme context. Dark-first: the cinematic ocean identity is the
 * default, with a light variant available for daytime / outdoor legibility.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  Colors,
  Radius,
  Spacing,
  Typography,
  type ColorScheme,
  type ThemeColors,
} from '@/constants/theme';

interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  fontsLoaded: boolean;
  spacing: typeof Spacing;
  radius: typeof Radius;
  typography: typeof Typography;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  children,
  scheme = 'dark',
  fontsLoaded = false,
}: {
  children: ReactNode;
  scheme?: ColorScheme;
  fontsLoaded?: boolean;
}) {
  console.log('[DIAG] ThemeProvider render:', { scheme, fontsLoaded });
  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors: Colors[scheme],
      fontsLoaded,
      spacing: Spacing,
      radius: Radius,
      typography: Typography,
    }),
    [scheme, fontsLoaded],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
