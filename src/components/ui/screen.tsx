/**
 * Screen — the page frame. Flat ocean background, safe-area aware, with an
 * optional title block and header trailing slot.
 */

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TideText } from '@/components/ui/tide-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTideTheme } from '@/theme/use-tide-theme';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  background?: ReactNode;
  transparentBackground?: boolean;
  children: ReactNode;
  /** Wrap content in a ScrollView. Default true. */
  scroll?: boolean;
}

export function Screen({
  title,
  subtitle,
  headerRight,
  background,
  transparentBackground = false,
  children,
  scroll = true,
}: ScreenProps) {
  const { colors } = useTideTheme();
  const insets = useSafeAreaInsets();

  const contentStyle = [
    styles.content,
    {
      paddingTop: insets.top + Spacing.md,
      paddingBottom: Math.max(insets.bottom, BottomTabInset) + Spacing.lg,
    },
  ];

  const body = (
    <View style={styles.inner}>
      {title ? (
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <TideText token="title">{title}</TideText>
            {subtitle ? (
              <TideText token="body" color="textSecondary">
                {subtitle}
              </TideText>
            ) : null}
          </View>
          {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: transparentBackground ? 'transparent' : colors.background }]}>
      {background ? <View pointerEvents="none" style={styles.background}>{background}</View> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        <View style={[contentStyle, styles.fill]}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFill,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  inner: {
    gap: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerRight: {
    paddingTop: 2,
  },
});
