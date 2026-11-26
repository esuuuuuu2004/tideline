/**
 * Surface — TIDELINE's flat tonal card. Depth comes from a lighter ocean tone
 * and a hairline border, never from shadows, gradients, or blur.
 */

import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTideTheme } from '@/theme/use-tide-theme';

interface SurfaceProps extends ViewProps {
  level?: 'base' | 'raised';
}

export function Surface({ level = 'base', style, ...rest }: SurfaceProps) {
  const { colors, radius } = useTideTheme();
  return (
    <View
      {...rest}
      style={[
        styles.surface,
        {
          backgroundColor:
            level === 'raised' ? colors.surfaceRaised : colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
});