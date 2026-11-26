import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
  buildDayForecast,
  formatCountdown,
  formatHeight,
  formatHeightNumber,
  formatPhtDayLabel,
  formatPhtTime,
  formatRate,
  getCurrentTideSnapshot,
  getPhtDateParts,
  phtMidnightMs,
  predictTideRateMetersPerHour,
} from '@/lib/tides';
import { usePreferences } from '@/theme/preferences-context';
import { useTideTheme } from '@/theme/use-tide-theme';

export default function HomeScreen() {
  const { colors } = useTideTheme();
  const { unit, setUnit, timeFormat } = usePreferences();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  // Refresh clock every 30s so live tide height and countdown stay fresh
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dayStartMs = phtMidnightMs(nowMs);
  const todayForecast = useMemo(() => buildDayForecast(dayStartMs), [dayStartMs]);
  const liveSnapshot = useMemo(() => getCurrentTideSnapshot(nowMs), [nowMs]);

  const nowParts = getPhtDateParts(nowMs);
  const nowMinute = nowParts.hour * 60 + nowParts.minute;
  const dayLabel = formatPhtDayLabel(dayStartMs, 0);

  // Active readout switches cleanly between live tide and scrubbed chart timestamp
  const scrubbedSample =
    scrubIndex !== null ? todayForecast.samples[scrubIndex] : null;
  const activeHeightMeters = scrubbedSample
    ? scrubbedSample.heightMeters
    : liveSnapshot.heightMeters;
  const activeRate = scrubbedSample
    ? predictTideRateMetersPerHour(scrubbedSample.timestampMs)
    : liveSnapshot.rateMetersPerHour;
  const activeDirection =
    activeRate > 0.03 ? 'Rising' : activeRate < -0.03 ? 'Falling' : 'Slack';

  const toggleUnit = () => {
    Haptics.selectionAsync().catch(() => {});
    setUnit(unit === 'm' ? 'ft' : 'm');
  };

  const resetScrub = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setScrubIndex(null);
  };

  const nextExt = liveSnapshot.nextExtremum;
  const isScrubbing = scrubIndex !== null && scrubbedSample !== null;

  return (
    <Screen
      title={STATION.name}
      subtitle={`${STATION.city} · ${STATION.waters}`}
      headerRight={
        <PressableScale
          onPress={toggleUnit}
          accessibilityLabel={`Switch tide height unit to ${unit === 'm' ? 'feet' : 'meters'}`}
          contentStyle={[
            styles.unitPill,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: Radius.pill,
            },
          ]}>
          <TideText token="label" role="data" color="accent">
            {unit}
          </TideText>
        </PressableScale>
      }>
      <Surface level="raised" style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.liveDot,
                {
                  backgroundColor: isScrubbing ? colors.warning : colors.accent,
                },
              ]}
            />
            <TideText
              token="label"
              role="data"
              color={isScrubbing ? 'warning' : 'accent'}>
              {isScrubbing
                ? formatPhtTime(scrubbedSample.timestampMs, timeFormat)
                : 'Live'}
            </TideText>
            {isScrubbing ? (
              <PressableScale
                onPress={resetScrub}
                hitSlop={8}
                contentStyle={[
                  styles.liveResetBtn,
                  {
                    borderColor: colors.border,
                    borderRadius: Radius.sm,
                  },
                ]}>
                <TideText token="caption" weight="600" color="textSecondary">
                  Live
                </TideText>
              </PressableScale>
            ) : null}
          </View>
          <TideText token="caption" role="data" color="textSecondary">
            {dayLabel.dateText}
          </TideText>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricValueWrap}>
            <TideText token="metric" role="data" color="accent">
              {formatHeightNumber(activeHeightMeters, unit)}
            </TideText>
            <TideText
              token="label"
              role="data"
              color="textSecondary"
              style={styles.unitInline}>
              {unit}
            </TideText>
          </View>
          <View style={styles.directionCol}>
            <TideText token="label" color="text">
              {activeDirection}
            </TideText>
            <TideText token="caption" role="data" color="textSecondary">
              {formatRate(activeRate, unit)}
            </TideText>
          </View>
        </View>

        <TideChart
          forecast={todayForecast}
          unit={unit}
          timeFormat={timeFormat}
          nowMinute={nowMinute}
          scrubIndex={scrubIndex}
          onScrubIndexChange={setScrubIndex}
        />

        <View style={[styles.nextStrip, { borderTopColor: colors.border }]}>
          <View style={styles.nextItem}>
            <TideText token="caption" color="textSecondary">
              Next {nextExt.kind}
            </TideText>
            <TideText token="label" role="data" color="text">
              {formatPhtTime(nextExt.timestampMs, timeFormat)}
            </TideText>
          </View>
          <View style={styles.nextItem}>
            <TideText token="label" role="data" color="accent">
              {formatHeight(nextExt.heightMeters, unit)}
            </TideText>
            <TideText token="caption" role="data" color="textSecondary">
              {formatCountdown(nextExt.timestampMs, nowMs)}
            </TideText>
          </View>
        </View>
      </Surface>

      <View style={styles.section}>
        <SectionHeader title="Tide turns" />
        <TideLedger
          extrema={todayForecast.extrema}
          unit={unit}
          timeFormat={timeFormat}
          nowMs={nowMs}
        />
      </View>

      <Surface style={styles.conditionsCard}>
        <View style={styles.conditionsGrid}>
          <View style={styles.conditionCell}>
            <TideText token="caption" color="textSecondary">
              Moon
            </TideText>
            <View style={styles.moonRow}>
              <MoonGlyph ageDays={todayForecast.lunar.ageDays} size={18} />
              <TideText token="label" color="text">
                {todayForecast.lunar.phaseName}
              </TideText>
            </View>
            <TideText token="caption" role="data" color="textSecondary">
              {Math.round(todayForecast.lunar.illumination * 100)}% ·{' '}
              {todayForecast.lunar.regime}
            </TideText>
          </View>

          <View style={[styles.vRule, { backgroundColor: colors.border }]} />

          <View style={styles.conditionCell}>
            <TideText token="caption" color="textSecondary">
              Sun
            </TideText>
            <TideText token="label" role="data" color="text">
              {formatPhtTime(todayForecast.solar.sunriseMs, timeFormat)}
            </TideText>
            <TideText token="caption" role="data" color="textSecondary">
              to {formatPhtTime(todayForecast.solar.sunsetMs, timeFormat)}
            </TideText>
          </View>
        </View>

        <View style={[styles.noteBox, { borderTopColor: colors.border }]}>
          <TideText token="caption" role="data" color="textSecondary">
            Range {formatHeight(todayForecast.rangeMeters, unit)} · L{' '}
            {formatHeight(todayForecast.minMeters, unit)} · H{' '}
            {formatHeight(todayForecast.maxMeters, unit)}
          </TideText>
          <TideText token="body" color="text">
            {liveSnapshot.coastalNote}
          </TideText>
        </View>
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 34,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hero: {
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveResetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  metricValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  unitInline: {
    marginBottom: 4,
  },
  directionCol: {
    alignItems: 'flex-end',
    gap: 2,
    paddingBottom: 4,
  },
  nextStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextItem: {
    gap: 2,
  },
  section: {
    gap: Spacing.sm + 4,
  },
  conditionsCard: {
    gap: Spacing.md,
  },
  conditionsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  conditionCell: {
    flex: 1,
    gap: 4,
  },
  moonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
  },
  vRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  noteBox: {
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
});
