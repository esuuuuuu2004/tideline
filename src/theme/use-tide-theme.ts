/**
 * Accessor hook for TIDELINE's active theme and font loading state.
 */

import { useTheme } from '@/theme/theme-context';

export function useTideTheme() {
  return useTheme();
}
