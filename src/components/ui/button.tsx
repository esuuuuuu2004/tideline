/**
 * Button — the primary action. Filled Electric Cyan with abyss text for the
 * single most important action on a screen; `variant="ghost"` for secondary.
 * Uses Reanimated press-scale feedback and meets 48dp touch targets.
 */

import {
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PressableScale } from '@/components/ui/pressable-scale';
import { TideText } from '@/components/ui/tide-text';
import { Spacing } from '@/constants/theme';
import { useTideTheme } from '@/theme/use-tide-theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'ghost';
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius } = useTideTheme();
  const primary = variant === 'primary';

  return (
    <PressableScale
      {...rest}
      style={style}
      contentStyle={[
        styles.base,
        {
          borderRadius: radius.pill,
          backgroundColor: primary ? colors.accent : 'transparent',
          borderColor: primary ? colors.accent : colors.border,
        },
      ]}>
      <View style={styles.inner}>
        <TideText
          token="label"
          style={{ color: primary ? colors.background : colors.text }}>
          {label}
        </TideText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
