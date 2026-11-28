import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonGlyph } from '@/components/tide/moon-glyph';
import { FieldStageBackground } from '@/components/flood/field-stage-background';
import { GlassPanel, GlassText as TideText } from '@/components/ui/glass-panel';
import {
  PressableScale,
} from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import {
  buildDayForecast,
  formatHeight,
  formatHeightNumber,
  formatPhtDayLabel,
  formatPhtTime,
  phtMidnightMs,
} from '@/lib/tides';
import { buildFieldForecastSummary, FIELD_STATUS_THRESHOLD_PERCENT, formatCoveragePercent } from '@/lib/field-flood-model';
import { usePreferences } from '@/theme/preferences-context';
import { useTideTheme } from '@/theme/use-tide-theme';
import { loadMarineTideForecast, MARINE_TIDE_HORIZON_DAYS, MARINE_TIDE_SOURCE_LABEL, type MarineForecastResult } from '@/services/marine-tides';
import { loadWeatherForecast, type WeatherForecast, type WeatherLoadResult } from '@/services/weather';

const WEATHER_REFRESH_MS = 15 * 60_000;
const MARINE_REFRESH_MS = 6 * 60 * 60_000;
const KMH_TO_MPH = 0.621371;
const MM_TO_IN = 1 / 25.4;

function weatherDescription(code: number | null): { label: string; icon: string } {
  if (code === null) return { label: 'Conditions unavailable', icon: '·' };
  if (code === 0) return { label: 'Clear sky', icon: '☀️' };
  if (code === 1) return { label: 'Mostly clear', icon: '🌤️' };
  if (code === 2) return { label: 'Partly cloudy', icon: '⛅' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: '❄️' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: '🌦️' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: '🌨️' };
  if (code === 95 || code === 96 || code === 99) return { label: 'Thunderstorm', icon: '⛈️' };
  return { label: 'Conditions unavailable', icon: '·' };
}

function temperature(valueC: number | null, unit: 'm' | 'ft'): string {
  if (valueC === null) return '—';
  return `${Math.round(unit === 'm' ? valueC : valueC * 9 / 5 + 32)}°${unit === 'm' ? 'C' : 'F'}`;
}

function windSpeed(valueKmh: number | null, unit: 'm' | 'ft'): string {
  if (valueKmh === null) return '—';
  return `${Math.round(unit === 'm' ? valueKmh : valueKmh * KMH_TO_MPH)} ${unit === 'm' ? 'km/h' : 'mph'}`;
}

function precipitation(valueMm: number | null, unit: 'm' | 'ft'): string {
  if (valueMm === null) return '—';
  return unit === 'm'
    ? `${valueMm < 10 ? valueMm.toFixed(1) : Math.round(valueMm)} mm`
    : `${(valueMm * MM_TO_IN).toFixed(2)} in`;
}

function compassDirection(degrees: number | null): string {
  if (degrees === null) return '—';
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return `${directions[Math.round(degrees / 22.5) % 16]} ${Math.round(degrees)}°`;
}

function weatherDateLabel(timestampMs: number, index: number, timeFormat: '12h' | '24h'): string {
  if (index === 0) return 'Now';
  return formatPhtTime(timestampMs, timeFormat);
}

function WeatherMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.weatherMetric}>
      <TideText token="caption" color="textSecondary">{label}</TideText>
      <TideText token="label" role="data" color="text">{value}</TideText>
    </View>
  );
}

export default function HomeScreen() {
  const { colors } = useTideTheme();
  const { unit, setUnit, timeFormat } = usePreferences();
  const insets = useSafeAreaInsets();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [marineResult, setMarineResult] = useState<MarineForecastResult | null>(null);
  const [marineError, setMarineError] = useState<string | null>(null);
  const [marineLoading, setMarineLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherLoadResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [showDailyWeather, setShowDailyWeather] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const refreshWeather = useCallback(async (forceRefresh = false) => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const result = await loadWeatherForecast(forceRefresh);
      setWeather(result);
      if (result.source === 'cache') {
        setWeatherError(`${result.staleReason ?? 'Could not refresh.'} Showing saved forecast.`);
      }
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : 'Weather forecast is unavailable.');
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const refreshMarine = useCallback(async (forceRefresh = false) => {
    setMarineLoading(true);
    setMarineError(null);
    try {
      const result = await loadMarineTideForecast(forceRefresh);
      setMarineResult(result);
      if (result.stale) setMarineError(result.staleReason ?? 'Using a saved marine forecast.');
    } catch (error) {
      setMarineResult(null);
      setMarineError(error instanceof Error ? error.message : 'Marine forecast is unavailable.');
    } finally {
      setMarineLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refreshWeather();
      void refreshMarine();
    }, 0);
    const interval = setInterval(() => void refreshWeather(), WEATHER_REFRESH_MS);
    const marineInterval = setInterval(() => void refreshMarine(), MARINE_REFRESH_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNowMs(Date.now());
        void refreshWeather();
        void refreshMarine();
      }
    });
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
      clearInterval(marineInterval);
      appState.remove();
    };
  }, [refreshMarine, refreshWeather]);

  // Refresh clock every 30s so live tide height and countdown stay fresh
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const dayStartMs = phtMidnightMs(nowMs);
  const todayForecast = useMemo(() => buildDayForecast(dayStartMs), [dayStartMs]);
  const fieldForecast = useMemo(
    () => marineResult ? buildFieldForecastSummary(marineResult.forecast, nowMs) : null,
    [marineResult, nowMs],
  );

  const dayLabel = formatPhtDayLabel(dayStartMs, 0);

  const toggleUnit = () => {
    Haptics.selectionAsync().catch(() => {});
    setUnit(unit === 'm' ? 'ft' : 'm');
  };

  const currentCoverage = fieldForecast?.current?.coveragePercent ?? null;
  const playable = currentCoverage !== null && currentCoverage < FIELD_STATUS_THRESHOLD_PERCENT;
  const playabilityMessage = currentCoverage === null
    ? 'Field status unavailable.'
    : playable
      ? 'Field is playable right now'
      : 'Field is unplayable right now';

  return (
    <View style={styles.dashboardRoot}>
      <FieldStageBackground coveragePercent={currentCoverage} ready />
      <ScrollView
        contentContainerStyle={[
          styles.dashboardContent,
          { paddingTop: insets.top + Spacing.sm, paddingBottom: Math.max(insets.bottom, BottomTabInset) + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <GlassPanel tone={currentCoverage === null ? 'neutral' : playable ? 'playable' : 'flooded'} style={styles.statusPanel}>
          <View style={styles.statusRow}>
            <TideText token="heading" weight="700" color="text" style={[styles.overlayText, styles.statusText]}>
              {playabilityMessage}
            </TideText>
            <View style={styles.coverageValue}>
              <TideText token="title" role="data" color="accent" style={styles.overlayAccent}>
                {currentCoverage === null ? '--' : formatCoveragePercent(currentCoverage)}
              </TideText>
              <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>coverage</TideText>
            </View>
          </View>
          <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>
            Estimated visual status · not a field or safety measurement
          </TideText>
          <PressableScale
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setShowDetails((shown) => !shown);
            }}
            accessibilityRole="button"
            accessibilityLabel={showDetails ? 'Hide details' : 'Click to show details'}
            contentStyle={styles.detailsToggle}>
            <TideText token="caption" weight="700" color="accent" style={styles.overlayAccent}>
              {showDetails ? 'Hide details' : 'Click to show details'}
            </TideText>
          </PressableScale>
        </GlassPanel>

        {showDetails ? (
          <>

        <GlassPanel style={styles.tideOverlay}>
          <View style={styles.tideTopRow}>
            <View>
              <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>PREDICTED SEA LEVEL · {dayLabel.dateText}</TideText>
              <TideText token="label" color="text" style={styles.overlayText}>Model estimate · not a live gauge</TideText>
            </View>
            <View style={styles.currentLevel}>
              <TideText token="metric" role="data" color="accent" style={styles.overlayAccent}>
                {fieldForecast?.current?.seaLevelMetersMsl === null || fieldForecast?.current?.seaLevelMetersMsl === undefined
                  ? '--'
                  : formatHeightNumber(fieldForecast.current.seaLevelMetersMsl, unit)}{' '}
                <TideText token="label" color="textSecondary" style={styles.overlayMuted}>{unit}</TideText>
              </TideText>
              <PressableScale
                onPress={toggleUnit}
                accessibilityRole="button"
                accessibilityLabel={`Switch tide height unit to ${unit === 'm' ? 'feet' : 'meters'}`}
                contentStyle={styles.unitPill}>
                <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>Switch to {unit === 'm' ? 'ft' : 'm'}</TideText>
              </PressableScale>
            </View>
          </View>
          <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>
            {fieldForecast?.current?.direction ?? (marineLoading ? 'Loading tide model...' : 'Direction unavailable')}
            {marineResult?.stale ? ' · saved forecast' : ''}
          </TideText>
          <View style={[styles.forecastRow, { borderTopColor: 'rgba(255,255,255,0.18)' }]}>
            {([
              ['high', fieldForecast?.nextHigh],
              ['low', fieldForecast?.nextLow],
            ] as const).map(([kind, item]) => (
              <View key={kind} style={styles.forecastItem}>
                <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>Next {kind} tide</TideText>
                {item ? (
                  <>
                    <TideText token="label" role="data" color="text" style={styles.overlayText}>{formatPhtTime(item.timestampMs, timeFormat)}</TideText>
                    <TideText token="caption" role="data" color="accent" style={styles.overlayAccent}>{formatHeight(item.heightMetersMsl, unit)}</TideText>
                  </>
                ) : (
                  <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>Unavailable</TideText>
                )}
              </View>
            ))}
          </View>
          <PressableScale onPress={() => void Linking.openURL('https://open-meteo.com/')} accessibilityRole="link" accessibilityLabel="Open-Meteo Marine forecast attribution">
            <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>{MARINE_TIDE_SOURCE_LABEL} · Copernicus Marine · CC BY 4.0</TideText>
          </PressableScale>
          {marineError ? <TideText token="caption" color="warning">{marineError}</TideText> : null}
        </GlassPanel>

        <GlassPanel style={styles.outlookCard}>
          <View style={styles.forecastHeading}>
            <View>
              <TideText token="label" color="text" style={styles.overlayText}>Field flood outlook</TideText>
              <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>
                Rolling {MARINE_TIDE_HORIZON_DAYS}-day marine-model horizon
              </TideText>
            </View>
            <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>
              Peak {fieldForecast ? `${fieldForecast.maximumCoveragePercent}%` : '--'}
            </TideText>
          </View>
          <View style={styles.outlookCurrent}>
            <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>Current estimated coverage</TideText>
            <TideText token="label" role="data" color="accent" style={styles.overlayAccent}>
              {currentCoverage === null ? '--' : formatCoveragePercent(currentCoverage)}
              {fieldForecast?.current ? ` · ${fieldForecast.current.direction.toLowerCase()}` : ''}
            </TideText>
          </View>
          {fieldForecast?.daily.map((day, index) => {
            const dayMs = Date.parse(`${day.dateKey}T12:00:00+08:00`);
            const label = formatPhtDayLabel(dayMs, index).shortDay;
            return (
              <View key={day.dateKey} style={styles.outlookRow}>
                <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>{label}</TideText>
                <TideText token="caption" color="text" style={styles.overlayText}>
                  Max {day.maximumCoveragePercent}% · {formatPhtTime(day.maximumAtMs, timeFormat)}
                </TideText>
                <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>
                  {day.recoveryBelowPlayableAtMs !== null
                    ? `Playable estimate after ${formatPhtTime(day.recoveryBelowPlayableAtMs, timeFormat)}`
                    : day.floodingBeginsAtMs !== null
                      ? `Flooding estimate from ${formatPhtTime(day.floodingBeginsAtMs, timeFormat)}`
                      : 'Recovery time unavailable'}
                </TideText>
              </View>
            );
          })}
          {!fieldForecast ? (
            <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>
              {marineLoading ? 'Loading rolling tide forecast...' : 'Future field forecast unavailable.'}
            </TideText>
          ) : null}
          <TideText token="caption" color="textSecondary" style={styles.overlayMuted}>
            {fieldForecast?.recoveryAtMs !== null && fieldForecast?.recoveryAtMs !== undefined
              ? `Next estimated recovery: ${formatPhtDayLabel(fieldForecast.recoveryAtMs, 0).dateText} ${formatPhtTime(fieldForecast.recoveryAtMs, timeFormat)} PHT`
              : 'No playable recovery is predicted within the available horizon.'}
          </TideText>
        </GlassPanel>

      <View style={styles.section}>
        <TideText token="heading" color="text" style={styles.overlayText}>Weather</TideText>
        <GlassPanel style={styles.weatherCard}>
          {weather?.forecast ? (
            <>
              {(() => {
                const forecast: WeatherForecast = weather.forecast;
                const current = forecast.current;
                const condition = weatherDescription(current.weatherCode);
                return (
                  <>
                    <View style={styles.weatherTop}>
                      <View style={styles.weatherCondition}>
                        <TideText style={styles.weatherIcon}>{condition.icon}</TideText>
                        <View style={styles.weatherConditionText}>
                          <TideText token="heading" color="text">{condition.label}</TideText>
                          <TideText token="caption" color="textSecondary">Current estimate</TideText>
                        </View>
                      </View>
                      <View style={styles.weatherTemperature}>
                        <TideText token="title" role="data" color="accent">
                          {temperature(current.temperatureC, unit)}
                        </TideText>
                        <TideText token="caption" role="data" color="textSecondary">
                          Feels {temperature(current.apparentTemperatureC, unit)}
                        </TideText>
                      </View>
                    </View>

                    <View style={[styles.weatherMetricsGrid, { borderColor: colors.border }]}>
                      <WeatherMetric
                        label="Rain chance · amount"
                        value={`${current.precipitationProbabilityPercent === null ? '—' : `${Math.round(current.precipitationProbabilityPercent)}%`} · ${precipitation(current.precipitationMm, unit)}`}
                      />
                      <WeatherMetric
                        label="Wind · direction"
                        value={`${windSpeed(current.windSpeedKmh, unit)} · ${compassDirection(current.windDirectionDegrees)}`}
                      />
                      <WeatherMetric
                        label="Gusts"
                        value={windSpeed(current.windGustKmh, unit)}
                      />
                      <WeatherMetric
                        label="Humidity · cloud"
                        value={`${current.relativeHumidityPercent === null ? '—' : `${Math.round(current.relativeHumidityPercent)}%`} · ${current.cloudCoverPercent === null ? '—' : `${Math.round(current.cloudCoverPercent)}%`}`}
                      />
                    </View>

                    <View style={styles.hourlyHeader}>
                      <TideText token="label" color="text">Next hours</TideText>
                      <TideText token="caption" color="textSecondary">PHT · forecast estimates</TideText>
                    </View>
                    {forecast.hourly.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyList}>
                        {forecast.hourly.map((hour, index) => {
                          const hourCondition = weatherDescription(hour.weatherCode);
                          return (
                            <View key={hour.timestampMs} style={styles.hourlyItem}>
                              <TideText token="caption" role="data" color="textSecondary">
                                {weatherDateLabel(hour.timestampMs, index, timeFormat)}
                              </TideText>
                              <TideText style={styles.hourlyIcon}>{hourCondition.icon}</TideText>
                              <TideText token="label" role="data" color="text">
                                {temperature(hour.temperatureC, unit)}
                              </TideText>
                              <TideText token="caption" role="data" color="textSecondary">
                                {hour.precipitationProbabilityPercent === null ? '—' : `${Math.round(hour.precipitationProbabilityPercent)}%`}
                              </TideText>
                            </View>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <TideText token="caption" color="textSecondary">Hourly forecast is unavailable.</TideText>
                    )}

                    {showDailyWeather ? (
                      <View style={styles.dailyWeather}>
                        <TideText token="label" color="text">Seven-day weather outlook</TideText>
                        <View style={styles.dailyWeatherList}>
                          {forecast.daily.map((day, index) => {
                            const dayTimestamp = Date.parse(`${day.date}T12:00:00+08:00`);
                            const dayLabel = Number.isFinite(dayTimestamp)
                              ? formatPhtDayLabel(dayTimestamp, index).shortDay
                              : day.date;
                            const dayCondition = weatherDescription(day.weatherCode);
                            return (
                              <View key={day.date} style={styles.dailyWeatherItem}>
                                <TideText token="caption" color="textSecondary">{dayLabel}</TideText>
                                <TideText style={styles.dailyIcon}>{dayCondition.icon}</TideText>
                                <TideText token="caption" role="data" color="text">
                                  {temperature(day.temperatureMaxC, unit)} / {temperature(day.temperatureMinC, unit)}
                                </TideText>
                                <TideText token="caption" role="data" color="textSecondary">
                                  {day.precipitationProbabilityPercent === null ? '—' : `${Math.round(day.precipitationProbabilityPercent)}%`} · {precipitation(day.precipitationMm, unit)}
                                </TideText>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    <View style={[styles.weatherFooter, { borderTopColor: colors.border }]}>
                      <View style={styles.weatherUpdated}>
                        <TideText token="caption" role="data" color="textSecondary">
                          Updated {formatPhtDayLabel(phtMidnightMs(forecast.fetchedAtMs), 0).dateText} · {formatPhtTime(forecast.fetchedAtMs, timeFormat)} PHT
                        </TideText>
                        {weatherError ? (
                          <TideText token="caption" color="warning">{weatherError}</TideText>
                        ) : null}
                      </View>
                      <View style={styles.weatherActions}>
                        {weatherError ? (
                          <PressableScale
                            onPress={() => void refreshWeather(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Retry weather update">
                            <TideText token="caption" color="accent">Retry</TideText>
                          </PressableScale>
                        ) : null}
                        <PressableScale
                          onPress={() => setShowDailyWeather((shown) => !shown)}
                          accessibilityRole="button"
                          accessibilityLabel={`${showDailyWeather ? 'Hide' : 'Show'} seven-day weather outlook`}>
                          <View style={[styles.outlookButton, { borderColor: colors.border }]}>
                            <TideText token="caption" color="accent">
                              {showDailyWeather ? 'Hide 7-day outlook' : '7-day outlook'}
                            </TideText>
                          </View>
                        </PressableScale>
                      </View>
                    </View>
                  </>
                );
              })()}
            </>
          ) : (
            <View style={styles.weatherEmpty}>
              {weatherLoading ? <ActivityIndicator color={colors.accent} /> : null}
              <TideText token="body" color="textSecondary">
                {weatherLoading ? 'Loading weather forecast…' : weatherError ?? 'Weather forecast unavailable.'}
              </TideText>
              {!weatherLoading ? (
                <PressableScale
                  onPress={() => void refreshWeather(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Retry weather forecast">
                  <View style={[styles.retryButton, { borderColor: colors.border }]}>
                    <TideText token="label" color="accent">Retry</TideText>
                  </View>
                </PressableScale>
              ) : null}
            </View>
          )}
        </GlassPanel>
      </View>

      <GlassPanel style={styles.conditionsCard}>
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
          <TideText token="body" color="text">
            Tide and sea-level values are model forecasts. Local field coverage is a separate low-confidence estimate.
          </TideText>
        </View>
      </GlassPanel>
          </>
        ) : null}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  dashboardRoot: { flex: 1, backgroundColor: '#07111B' },
  overlayText: { color: '#FFFFFF' },
  overlayMuted: { color: 'rgba(255,255,255,0.78)' },
  overlayAccent: { color: '#87EAF2' },
  dashboardContent: { paddingHorizontal: Spacing.md, gap: Spacing.md, flexGrow: 1 },
  statusPanel: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: Spacing.xs, borderRadius: Radius.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  statusText: { flex: 1, flexShrink: 1 },
  coverageValue: { alignItems: 'flex-end', minWidth: 74 },
  detailsToggle: { alignSelf: 'flex-start', paddingTop: Spacing.xs },
  tideOverlay: { padding: Spacing.md, gap: Spacing.sm },
  currentLevel: { alignItems: 'flex-end', gap: Spacing.xs },
  outlookCard: { padding: Spacing.md, gap: Spacing.sm },
  forecastHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  outlookCurrent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: Spacing.xs },
  outlookRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.16)', paddingTop: Spacing.xs },
  tideTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  forecastRow: { flexDirection: 'row', gap: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm },
  forecastItem: { flex: 1, gap: 2 },
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  section: {
    gap: Spacing.sm + 4,
  },
  conditionsCard: {
    gap: Spacing.md,
    padding: Spacing.md,
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
  weatherCard: {
    gap: Spacing.md,
    padding: Spacing.md,
  },
  weatherTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  weatherCondition: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  weatherConditionText: {
    flexShrink: 1,
    gap: 2,
  },
  weatherIcon: {
    fontSize: 34,
    lineHeight: 42,
  },
  weatherTemperature: {
    alignItems: 'flex-end',
    gap: 2,
  },
  weatherMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    rowGap: Spacing.sm,
  },
  weatherMetric: {
    width: '50%',
    gap: 3,
  },
  hourlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hourlyList: {
    gap: Spacing.md,
    paddingRight: Spacing.sm,
  },
  hourlyItem: {
    minWidth: 46,
    alignItems: 'center',
    gap: 4,
  },
  hourlyIcon: {
    fontSize: 20,
    lineHeight: 25,
  },
  dailyWeather: {
    gap: Spacing.sm,
  },
  dailyWeatherList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.md,
  },
  dailyWeatherItem: {
    width: '33.333%',
    alignItems: 'center',
    gap: 4,
  },
  dailyIcon: {
    fontSize: 20,
    lineHeight: 25,
  },
  weatherFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  weatherUpdated: {
    flex: 1,
    gap: 3,
  },
  weatherActions: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  outlookButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  weatherEmpty: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  retryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
});
