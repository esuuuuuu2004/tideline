/**
 * SectionHeader — labels a region of the screen. Quiet, sentence case, no
 * all-caps eyebrow. The accent rule is the only color moment.
 */

import { StyleSheet, View } from 'react-native';

import { TideText } from '@/components/ui/tide-text';
import { Spacing } from '@/constants/theme';
import { useTideTheme } from '@/theme/use-tide-theme';

export function SectionHeader({ title }: { title: string }) {
  const { colors } = useTideTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.rule, { backgroundColor: colors.accent }]} />
      <TideText token="heading">{title}</TideText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rule: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
});