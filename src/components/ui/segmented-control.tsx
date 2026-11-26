/**
 * Animated segmented control built from the expo-animation Tab / segmented
 * indicator recipe: measures segments once via onLayout, slides an
 * absolutely-positioned pill with EASE_IN_OUT, and fires Haptics.selectionAsync
 * on press.
 */

import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { TideText } from '@/components/ui/tide-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTideTheme } from '@/theme/use-tide-theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors } = useTideTheme();
  const reduced = useReducedMotion();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const visible = useSharedValue(0);

  useEffect(() => {
    const target = layouts[value];
    if (!target) return;
    if (visible.get() === 0 || reduced) {
      x.set(target.x);
      w.set(target.width);
      visible.set(1);
    } else {
      x.set(withTiming(target.x, { duration: 220, easing: EASE_IN_OUT }));
      w.set(withTiming(target.width, { duration: 220, easing: EASE_IN_OUT }));
    }
  }, [value, layouts, reduced, x, w, visible]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: visible.get(),
    transform: [{ translateX: x.get() }],
    width: w.get(),
  }));

  const handleLayout = (optValue: T) => (e: LayoutChangeEvent) => {
    const { x: lx, width: lw } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const curr = prev[optValue];
      if (curr && curr.x === lx && curr.width === lw) return prev;
      return { ...prev, [optValue]: { x: lx, width: lw } };
    });
  };

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderRadius: Radius.md,
        },
      ]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: Radius.sm + 2,
          },
          pillStyle,
        ]}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onLayout={handleLayout(opt.value)}
            onPress={() => {
              if (opt.value === value) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(opt.value);
            }}
            style={styles.segment}
            hitSlop={4}>
            <TideText
              token="label"
              color={active ? 'accent' : 'textSecondary'}
              numberOfLines={1}>
              {opt.label}
            </TideText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    position: 'relative',
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
