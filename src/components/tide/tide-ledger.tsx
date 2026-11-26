/**
 * TideLedger — unified hairline-separated list of High / Low tide events.
 */

import { StyleSheet, View } from 'react-native';

import { Surface } from '@/components/ui/surface';
import { TideText } from '@/components/ui/tide-text';
import { Spacing } from '@/constants/theme';
import {
  formatCountdown,
  formatHeight,
  formatPhtTime,
  type TideExtremum,
  type TideUnit,
  type TimeFormat,
} from '@/lib/tides';
import { useTideTheme } from '@/theme/use-tide-theme';

interface TideLedgerProps {
  extrema: readonly TideExtremum[];
  unit: TideUnit;
  timeFormat: TimeFormat;
  /** Current timestamp in ms when viewing Today; null for future days. */
  nowMs?: number | null;
}

export function TideLedger({
  extrema,
  unit,
  timeFormat,
  nowMs = null,
}: TideLedgerProps) {
  const { colors } = useTideTheme();

  const nextUpcomingTs =
    nowMs !== null
      ? extrema.find((e) => e.timestampMs > nowMs)?.timestampMs ?? null
      : null;

  return (
    <Surface style={styles.container}>
      {extrema.map((item, idx) => {
        const isHigh = item.kind === 'high';
        const isPast = nowMs !== null && item.timestampMs <= nowMs;
        const isNext = item.timestampMs === nextUpcomingTs;

        return (
          <View
            key={item.timestampMs}
            style={[
              styles.row,
              idx > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              },
              isPast && styles.pastRow,
            ]}>
            <View style={styles.leftGroup}>
              <View
                style={[
                  styles.marker,
                  {
                    backgroundColor: isNext
                      ? colors.accent
                      : isHigh
                        ? colors.accentMuted
                        : colors.warning,
                    opacity: isPast ? 0.45 : 1,
                  },
                ]}
              />
              <View style={styles.labelCol}>
                <TideText
                  token="body"
                  weight={isNext ? '600' : '500'}
                  color={isNext ? 'text' : isPast ? 'textSecondary' : 'text'}>
                  {isHigh ? 'High tide' : 'Low tide'}
                </TideText>
                {isNext && nowMs !== null ? (
                  <TideText token="caption" role="data" color="accent">
                    Next {formatCountdown(item.timestampMs, nowMs)}
                  </TideText>
                ) : null}
              </View>
            </View>

            <View style={styles.rightGroup}>
              <TideText
                token="body"
                role="data"
                weight="600"
                color={isNext ? 'accent' : 'text'}>
                {formatHeight(item.heightMeters, unit)}
              </TideText>
              <TideText token="caption" role="data" color="textSecondary">
                {formatPhtTime(item.timestampMs, timeFormat)}
              </TideText>
            </View>
          </View>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  pastRow: {
    opacity: 0.55,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 4,
  },
  marker: {
    width: 3,
    height: 22,
    borderRadius: 2,
  },
  labelCol: {
    gap: 1,
  },
  rightGroup: {
    alignItems: 'flex-end',
    gap: 1,
  },
});
