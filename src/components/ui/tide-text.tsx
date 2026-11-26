/**
 * TIDELINE text primitive. One component for all type.
 *
 * `role="data"` switches to Inter with tabular figures for numerical and
 * technical readouts; everything else uses Manrope.
 */

import { Text, type TextProps } from 'react-native';

import { resolveFontStyle } from '@/constants/fonts';
import type { FontWeightKey, TypeToken } from '@/constants/theme';
import { useTideTheme } from '@/theme/use-tide-theme';

interface TideTextProps extends Omit<TextProps, 'role'> {
  token?: TypeToken;
  role?: 'interface' | 'data';
  weight?: FontWeightKey;
  color?: 'text' | 'textSecondary' | 'accent' | 'accentMuted' | 'warning';
}

export function TideText({
  token = 'body',
  role = 'interface',
  weight,
  color = 'text',
  style,
  ...rest
}: TideTextProps) {
  const { colors, fontsLoaded, typography } = useTideTheme();
  const type = typography[token];
  const resolvedWeight = weight ?? type.fontWeight;
  const fontStyle = resolveFontStyle(role, resolvedWeight, fontsLoaded);

  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: type.fontSize,
          lineHeight: type.lineHeight,
          color: colors[color],
          fontVariant: role === 'data' ? ['tabular-nums'] : undefined,
        },
        fontStyle,
        style,
      ]}
    />
  );
}
