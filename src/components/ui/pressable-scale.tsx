/**
 * PressableScale — subtle tactile press feedback per expo-animation skill.
 * 120ms cubic-bezier scale(0.97) on press-in via Reanimated CSS transitions;
 * drops scale when Reduce Motion is enabled.
 */

import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cubicBezier,
  useReducedMotion,
  type AnimatedStyle,
} from 'react-native-reanimated';

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
}

const EASE_OUT_CSS = cubicBezier(0.23, 1, 0.32, 1);

const BASE_TRANSITION: AnimatedStyle<ViewStyle> = {
  transform: [{ scale: 1 }],
  opacity: 1,
  transitionProperty: ['transform', 'opacity'],
  transitionDuration: '120ms',
  transitionTimingFunction: EASE_OUT_CSS,
};

export function PressableScale({
  children,
  style,
  contentStyle,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      hitSlop={rest.hitSlop ?? 8}
      pressRetentionOffset={rest.pressRetentionOffset ?? 16}
      style={style}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}>
      <Animated.View
        style={[
          BASE_TRANSITION,
          contentStyle,
          pressed && !disabled && (reduced ? styles.pressedReduced : { transform: [{ scale: scaleTo }], opacity: 0.9 }),
        ]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressedReduced: {
    opacity: 0.78,
  },
});
