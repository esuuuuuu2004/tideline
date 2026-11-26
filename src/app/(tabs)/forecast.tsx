import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MoonGlyph } from '@/components/tide/moon-glyph';
import { TideChart } from '@/components/tide/tide-chart';
import { TideLedger } from '@/components/tide/tide-ledger';
import {
  PressableScale,
  Screen,
  SectionHeader,
  Surface,
  TideText,
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  STATION,
  buildMultiDayForecast,
  formatHeight,
  formatPhtDayLabel,
  formatPhtTime,
  getPhtDateParts,
} from '@/lib/tides';
import { usePreferences } from '@/theme/preferences-context';
import { useTideTheme } from '@/theme/use-tide-theme';

export default function ForecastScreen() {
  const { colors } = useTideTheme();
  const { unit, timeFormat } = usePreferences();

  const [anchorMs] = useState(() => Date.now());
  const days = useMemo(() => buildMultiDayForecast(anchorMs, 7), [anchorMs]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const selectedDay = days[selectedIndex];
  const nowParts = getPhtDateParts(anchorMs);
  const nowMinute = selectedIndex === 0 ? nowParts.hour * 60 + nowParts.minute : null;

  const scrubbedSample =
    scrubIndex !== null ? selectedDay.samples[scrubIndex] : null;

  const selectDay = (index: number) => {
    if (index === selectedIndex) return;
    Haptics.selectionAsync().catch(() => {});
    setSelectedIndex(index);
    setScrubIndex(null);
  };

  return (
    <Screen
      title="7-day forecast"
      subtitle={`${STATION.name}, ${STATION.city} · ${STATION.timezone}`}>
      {/* Horizontal 7-day selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}>
        {days.map((day, idx) => {
          const active = idx === selectedIndex;
          const { shortDay, dateText } = formatPhtDayLabel(day.dayStartMs, idx);
          return (
            <PressableScale
              key={day.dateKey}
              onPress={() => selectDay(idx)}
              contentStyle={[
                styles.dayChip,
                {
                  backgroundColor: active ? colors.surfaceRaised : colors.surface,
                  borderColor: active ? colors.accent : colors.border,
                  borderRadius: Radius.md,
                },
              ]}>
              <TideText
                token="label"
                color={active ? 'accent' : 'text'}>
                {shortDay}
              </TideText>
              <TideText token="caption" role="data" color="textSecondary">
                {dateText}
              </TideText>
            </PressableScale>
          );
        })}
      </ScrollView>

      {/* Selected day curve + summary */}
      <Surface level="raised" style={styles.detailCard}>
        <View style={styles.detailHeader}>
          <View style={styles.detailTitleCol}>
            <TideText token="heading" color="text">
              {formatPhtDayLabel(selectedDay.dayStartMs, selectedIndex).shortDay} ·{' '}
              {formatPhtDayLabel(selectedDay.dayStartMs, selectedIndex).dateText}
            </TideText>
            <View style={styles.lunarInline}>
              <MoonGlyph ageDays={selectedDay.lunar.ageDays} size={15} />
              <TideText token="caption" color="textSecondary">
                {selectedDay.lunar.phaseName} · {selectedDay.lunar.regime}
              </TideText>
            </View>
          </View>

          <View style={styles.rangeBadge}>
            <TideText token="caption" color="textSecondary">
              Range
            </TideText>
            <TideText token="label" role="data" color="accent">
              {formatHeight(selectedDay.rangeMeters, unit)}
            </TideText>
          </View>
        </View>

        {scrubbedSample && (
          <View
            style={[
              styles.scrubBanner,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: Radius.sm,
              },
            ]}>
            <TideText token="caption" role="data" color="textSecondary">
              {formatPhtTime(scrubbedSample.timestampMs, timeFormat)} PHT
            </TideText>
            <TideText token="label" role="data" color="accent">
              {formatHeight(scrubbedSample.heightMeters, unit)}
            </TideText>
          </View>
        )}

        <TideChart
          forecast={selectedDay}
          unit={unit}
          timeFormat={timeFormat}
          nowMinute={nowMinute}
          scrubIndex={scrubIndex}
          onScrubIndexChange={setScrubIndex}
          height={185}
        />
      </Surface>

      {/* Selected day turning points */}
      <View style={styles.section}>
        <SectionHeader title="Tide turns" />
        <TideLedger
          extrema={selectedDay.extrema}
          unit={unit}
          timeFormat={timeFormat}
          nowMs={selectedIndex === 0 ? anchorMs : null}
        />
      </View>

      {/* 7-day range overview */}
      <View style={styles.section}>
        <SectionHeader title="Week at a glance" />
        <Surface style={styles.weekCard}>
          {days.map((day, idx) => {
            const { shortDay, dateText } = formatPhtDayLabel(day.dayStartMs, idx);
            const active = idx === selectedIndex;
            const highs = day.extrema.filter((e) => e.kind === 'high');
            const lows = day.extrema.filter((e) => e.kind === 'low');
            const peakHigh = highs.reduce(
              (best, curr) => (curr.heightMeters > best ? curr.heightMeters : best),
              day.maxMeters,
            );
            const deepLow = lows.reduce(
              (best, curr) => (curr.heightMeters < best ? curr.heightMeters : best),
              day.minMeters,
            );

            return (
              <PressableScale
                key={day.dateKey}
                onPress={() => selectDay(idx)}
                scaleTo={0.99}
                contentStyle={[
                  styles.weekRow,
                  idx > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}>
                <View style={styles.weekDayCol}>
                  <TideText
                    token="body"
                    weight={active ? '600' : '500'}
                    color={active ? 'accent' : 'text'}>
                    {shortDay}
                  </TideText>
                  <TideText token="caption" role="data" color="textSecondary">
                    {dateText}
                  </TideText>
                </View>

                <View style={styles.weekMetrics}>
                  <TideText token="caption" role="data" color="textSecondary">
                    L {formatHeight(deepLow, unit)}
                  </TideText>
                  <TideText token="body" role="data" weight="600" color="text">
                    H {formatHeight(peakHigh, unit)}
                  </TideText>
                </View>
              </PressableScale>
            );
          })}
        </Surface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayStrip: {
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  dayChip: {
    minWidth: 82,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    gap: 2,
  },
  detailCard: {
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  detailTitleCol: {
    flex: 1,
    gap: 4,
  },
  lunarInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rangeBadge: {
    alignItems: 'flex-end',
    gap: 1,
  },
  scrubBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  section: {
    gap: Spacing.sm + 4,
  },
  weekCard: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  weekDayCol: {
    gap: 1,
  },
  weekMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
});
