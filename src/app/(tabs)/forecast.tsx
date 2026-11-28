import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { FieldStageBackground } from '@/components/flood/field-stage-background';
import { GlassPanel, GlassText as TideText } from '@/components/ui/glass-panel';
import { PressableScale, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { buildFieldForecastSummary, estimateFieldCoverageAt, FIELD_STATUS_THRESHOLD_PERCENT, formatCoveragePercent } from '@/lib/field-flood-model';
import { formatHeight, formatPhtDayLabel, formatPhtTime, phtMidnightMs, toPhtDateKey } from '@/lib/tides';
import { loadMarineTideForecast, MARINE_TIDE_HORIZON_DAYS, MARINE_TIDE_SOURCE_LABEL, type MarineForecastResult } from '@/services/marine-tides';
import { usePreferences } from '@/theme/preferences-context';
import { useTideTheme } from '@/theme/use-tide-theme';

const REFRESH_MS = 6 * 60 * 60_000;

export default function ForecastScreen() {
  const { colors } = useTideTheme();
  const { unit, timeFormat } = usePreferences();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [result, setResult] = useState<MarineForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState(() => toPhtDateKey(phtMidnightMs(Date.now())));
  const [selectedTimestampMs, setSelectedTimestampMs] = useState<number | null>(null);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadMarineTideForecast(force);
      setResult(loaded);
      if (loaded.stale) setError(loaded.staleReason ?? 'Showing the last saved model forecast.');
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : 'Marine forecast is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNowMs(Date.now());
        void refresh();
      }
    });
    const clock = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      clearInterval(clock);
      appState.remove();
    };
  }, [refresh]);

  const summary = useMemo(
    () => result ? buildFieldForecastSummary(result.forecast, nowMs) : null,
    [nowMs, result],
  );
  const days = summary?.daily ?? [];
  const selectedDay = days.find((day) => day.dateKey === selectedDateKey) ?? days[0] ?? null;
  const selectedIndex = selectedDay ? Math.max(0, days.findIndex((day) => day.dateKey === selectedDay.dateKey)) : 0;
  const effectiveTimestampMs = selectedDay
    ? selectedTimestampMs !== null && selectedDay.samples.some((sample) => sample.timestampMs === selectedTimestampMs)
      ? selectedTimestampMs
      : selectedDay.dateKey === toPhtDateKey(nowMs) && selectedDay.samples.some((sample) => sample.timestampMs <= nowMs)
        ? nowMs
        : selectedDay.maximumAtMs
    : null;
  const selectedEstimate = result && effectiveTimestampMs !== null
    ? estimateFieldCoverageAt(result.forecast, effectiveTimestampMs)
    : null;
  const selectedCoverage = selectedEstimate?.coveragePercent ?? null;
  const selectedPlayable = selectedCoverage !== null && selectedCoverage < FIELD_STATUS_THRESHOLD_PERCENT;

  const selectDay = (dateKey: string, dayIndex: number, maximumAtMs: number) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedDateKey(dateKey);
    setSelectedTimestampMs(dateKey === toPhtDateKey(nowMs) && dayIndex === 0 ? nowMs : maximumAtMs);
  };

  return (
    <Screen
      transparentBackground
      background={<FieldStageBackground coveragePercent={selectedCoverage} ready={result !== null} />}>
      <View style={styles.screenContent}>
        <View style={styles.pageTitle}>
          <TideText token="title" color="text" style={styles.white}>Field forecast</TideText>
          <TideText token="caption" color="textSecondary" style={styles.muted}>Prediction-based coverage · low confidence</TideText>
        </View>
        <GlassPanel style={styles.statusPanel} tone={selectedCoverage === null ? 'neutral' : selectedPlayable ? 'playable' : 'flooded'}>
          <View style={styles.panelHeader}>
            <View style={styles.flex}>
              <TideText token="caption" color="textSecondary" style={styles.muted}>Selected forecast time · PHT</TideText>
              <TideText token="label" color="text" style={styles.white}>
                {effectiveTimestampMs === null ? 'Coverage unavailable' : formatPhtTime(effectiveTimestampMs, timeFormat)}
              </TideText>
            </View>
            <TideText token="title" role="data" color="accent" style={styles.accent}>
              {selectedCoverage === null ? '--' : formatCoveragePercent(selectedCoverage)}
            </TideText>
          </View>
          <TideText token="caption" color="textSecondary" style={styles.muted}>
            {selectedCoverage === null
              ? loading ? 'Loading marine forecast...' : 'The model has no usable sample at this time.'
              : `${selectedEstimate?.direction} · estimated field coverage`}
          </TideText>
          {selectedCoverage !== null ? (
            <TideText token="label" weight="700" color="text" style={styles.white}>
              {selectedPlayable ? 'Estimated playable at this forecast time.' : 'Estimated unplayable at this forecast time.'}
            </TideText>
          ) : null}
        </GlassPanel>

        <GlassPanel style={styles.infoPanel}>
          <View style={styles.panelHeader}>
            <TideText token="label" color="text" style={styles.white}>{selectedDay ? formatPhtDayLabel(Date.parse(`${selectedDay.dateKey}T12:00:00+08:00`), selectedIndex).dateText : 'Rolling flood outlook'}</TideText>
            <TideText token="caption" color="textSecondary" style={styles.muted}>
              {selectedDay ? `Peak ${selectedDay.maximumCoveragePercent}%` : '--'}
            </TideText>
          </View>
          <View style={styles.forecastPair}>
            <View style={styles.forecastMetric}>
              <TideText token="caption" color="textSecondary" style={styles.muted}>Next high</TideText>
              <TideText token="label" role="data" color="text" style={styles.white}>
                {summary?.nextHigh ? formatPhtTime(summary.nextHigh.timestampMs, timeFormat) : 'Unavailable'}
              </TideText>
              {summary?.nextHigh ? <TideText token="caption" color="accent" style={styles.accent}>{formatHeight(summary.nextHigh.heightMetersMsl, unit)}</TideText> : null}
            </View>
            <View style={styles.forecastMetric}>
              <TideText token="caption" color="textSecondary" style={styles.muted}>Next low</TideText>
              <TideText token="label" role="data" color="text" style={styles.white}>
                {summary?.nextLow ? formatPhtTime(summary.nextLow.timestampMs, timeFormat) : 'Unavailable'}
              </TideText>
              {summary?.nextLow ? <TideText token="caption" color="accent" style={styles.accent}>{formatHeight(summary.nextLow.heightMetersMsl, unit)}</TideText> : null}
            </View>
          </View>
          <TideText token="caption" color="textSecondary" style={styles.muted}>
            {selectedDay?.recoveryBelowPlayableAtMs !== null && selectedDay?.recoveryBelowPlayableAtMs !== undefined
              ? `Estimated recovery below ${FIELD_STATUS_THRESHOLD_PERCENT}%: ${formatPhtTime(selectedDay.recoveryBelowPlayableAtMs, timeFormat)}`
              : 'No recovery crossing is available for this selected date.'}
          </TideText>
          <TideText token="caption" color="textSecondary" style={styles.muted}>
            Forecast horizon ends {summary ? `${formatPhtDayLabel(summary.horizonEndMs, 0).dateText} ${formatPhtTime(summary.horizonEndMs, timeFormat)} PHT` : 'unavailable'}.
          </TideText>
        </GlassPanel>

        <View style={styles.dayStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStripContent}>
            {days.map((day, index) => {
              const active = day.dateKey === selectedDay?.dateKey;
              const dayTimestamp = Date.parse(`${day.dateKey}T12:00:00+08:00`);
              const { shortDay, dateText } = formatPhtDayLabel(dayTimestamp, index);
              return (
                <PressableScale
                  key={day.dateKey}
                  onPress={() => selectDay(day.dateKey, index, day.maximumAtMs)}
                  contentStyle={[
                    styles.dayChip,
                    { borderColor: active ? colors.accent : 'rgba(255,255,255,0.32)' },
                    active && styles.dayChipActive,
                  ]}>
                  <TideText token="label" color={active ? 'accent' : 'text'} style={active ? styles.accent : styles.white}>{shortDay}</TideText>
                  <TideText token="caption" color="textSecondary" style={styles.muted}>{dateText}</TideText>
                  <TideText token="caption" role="data" color="text" style={styles.white}>{day.maximumCoveragePercent}% max</TideText>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        {selectedDay ? (
          <GlassPanel style={styles.timePanel}>
            <View style={styles.panelHeader}>
              <TideText token="label" color="text" style={styles.white}>Preview predicted coverage</TideText>
              <TideText token="caption" color="textSecondary" style={styles.muted}>Choose a forecast time</TideText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeStrip}>
              {selectedDay.samples.map((sample) => {
                const selected = sample.timestampMs === effectiveTimestampMs;
                return (
                  <PressableScale
                    key={sample.timestampMs}
                    onPress={() => setSelectedTimestampMs(sample.timestampMs)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${formatPhtTime(sample.timestampMs, timeFormat)}, ${sample.coveragePercent === null ? 'unavailable' : formatCoveragePercent(sample.coveragePercent)} estimated coverage`}
                    contentStyle={[styles.timeChip, { borderColor: selected ? colors.accent : 'rgba(255,255,255,0.25)' }, selected && styles.dayChipActive]}>
                    <TideText token="caption" color="text" style={selected ? styles.accent : styles.white}>{formatPhtTime(sample.timestampMs, timeFormat)}</TideText>
                    <TideText token="caption" role="data" color="textSecondary" style={styles.muted}>{sample.coveragePercent === null ? '--' : formatCoveragePercent(sample.coveragePercent)}</TideText>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </GlassPanel>
        ) : null}

        <GlassPanel style={styles.daysPanel}>
          <TideText token="label" color="text" style={styles.white}>Daily field outlook</TideText>
          <TideText token="caption" color="textSecondary" style={styles.muted}>{MARINE_TIDE_SOURCE_LABEL} · {MARINE_TIDE_HORIZON_DAYS}-day rolling horizon</TideText>
          {days.map((day) => (
            <View key={day.dateKey} style={styles.dailyRow}>
              <View style={styles.dailyDate}>
                <TideText token="caption" color="text" style={styles.white}>{day.dateKey}</TideText>
                <TideText token="caption" role="data" color="accent" style={styles.accent}>
                  Peak {day.maximumCoveragePercent}% · {formatPhtTime(day.maximumAtMs, timeFormat)}
                </TideText>
              </View>
              <View style={styles.dailyTides}>
                {day.extrema.slice(0, 4).map((event) => (
                  <TideText key={`${event.kind}-${event.timestampMs}`} token="caption" role="data" color="textSecondary" style={styles.muted}>
                    {event.kind === 'high' ? 'H' : 'L'} {formatPhtTime(event.timestampMs, timeFormat)} {formatHeight(event.heightMetersMsl, unit)}
                  </TideText>
                ))}
                {day.recoveryBelowPlayableAtMs !== null ? (
                  <TideText token="caption" color="text" style={styles.white}>Recovery {formatPhtTime(day.recoveryBelowPlayableAtMs, timeFormat)}</TideText>
                ) : null}
              </View>
            </View>
          ))}
          {!days.length && !loading ? <TideText token="caption" color="textSecondary" style={styles.muted}>No future tide samples are available.</TideText> : null}
          {error ? <TideText token="caption" color="warning">{error}</TideText> : null}
          <PressableScale onPress={() => void refresh(true)} accessibilityRole="button" accessibilityLabel="Refresh marine forecast">
            <TideText token="caption" color="accent" style={styles.accent}>{loading ? 'Updating forecast...' : 'Refresh forecast'}</TideText>
          </PressableScale>
          <PressableScale onPress={() => void Linking.openURL('https://open-meteo.com/')} accessibilityRole="link" accessibilityLabel="Open-Meteo Marine attribution">
            <TideText token="caption" color="textSecondary" style={styles.muted}>Open-Meteo · Copernicus Marine · CC BY 4.0</TideText>
          </PressableScale>
        </GlassPanel>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: Spacing.md },
  pageTitle: { gap: Spacing.xs },
  white: { color: '#FFFFFF' },
  muted: { color: 'rgba(255,255,255,0.78)' },
  accent: { color: '#87EAF2' },
  flex: { flex: 1 },
  statusPanel: { padding: Spacing.md, gap: Spacing.xs },
  infoPanel: { padding: Spacing.md, gap: Spacing.sm },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  forecastPair: { flexDirection: 'row', gap: Spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: Spacing.sm },
  forecastMetric: { flex: 1, gap: 2 },
  dayStrip: { marginHorizontal: -Spacing.lg },
  dayStripContent: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  dayChip: { minWidth: 104, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'rgba(4,13,22,0.72)', gap: 3 },
  dayChipActive: { backgroundColor: 'rgba(15,82,99,0.76)' },
  timePanel: { padding: Spacing.md, gap: Spacing.sm },
  timeStrip: { gap: Spacing.xs, paddingRight: Spacing.sm },
  timeChip: { minWidth: 68, alignItems: 'center', paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.xs, borderRadius: Radius.sm, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'rgba(4,13,22,0.54)', gap: 2 },
  daysPanel: { padding: Spacing.md, gap: Spacing.sm },
  dailyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: Spacing.sm },
  dailyDate: { flex: 1, gap: 3 },
  dailyTides: { flex: 1, alignItems: 'flex-end', gap: 3 },
});
