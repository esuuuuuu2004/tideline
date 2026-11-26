/**
 * Loads TIDELINE's two typefaces and exposes font readiness and resolver.
 *
 * Manrope -> interface. Inter -> numerical / technical data.
 * Call `useAppFonts` once at the root layout and pass `fontsLoaded` into
 * `ThemeProvider` so child primitives do not re-invoke `useFonts`.
 */

import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';

import {
  FontFallback,
  FontFamilies,
  type FontWeightKey,
} from '@/constants/theme';

export function useAppFonts() {
  const [loaded, error] = useFonts({
    Manrope_400: Manrope_400Regular,
    Manrope_500: Manrope_500Medium,
    Manrope_600: Manrope_600SemiBold,
    Manrope_700: Manrope_700Bold,
    Inter_400: Inter_400Regular,
    Inter_500: Inter_500Medium,
    Inter_600: Inter_600SemiBold,
    Inter_700: Inter_700Bold,
  });

  console.log('[DIAG] useAppFonts:', { loaded, error, ready: loaded || !!error });

  return {
    loaded,
    ready: loaded || !!error,
    error,
  };
}

export function resolveFontStyle(
  role: 'interface' | 'data',
  weight: FontWeightKey,
  fontsLoaded: boolean,
) {
  if (fontsLoaded) {
    return {
      fontFamily: FontFamilies[role][weight],
    };
  }
  return {
    fontFamily: FontFallback[role],
    fontWeight: weight,
  };
}
