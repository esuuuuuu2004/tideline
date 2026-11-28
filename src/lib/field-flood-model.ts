import { RISING_COVERAGE_ANCHORS } from '@/data/field-flood-calibration';
import type { MarineLevelSample, MarineTideForecast } from '@/services/marine-tides';

const PHT_OFFSET_MS = 8 * 60 * 60_000;
const MAX_SAMPLE_GAP_MS = 2 * 60 * 60_000;
export const FIELD_STATUS_THRESHOLD_PERCENT = 25;
const PLAYABILITY_THRESHOLD_PERCENT = FIELD_STATUS_THRESHOLD_PERCENT;
const DIRECTION_DEADBAND_METERS_PER_HOUR = 0.015;

export type WaterDirection = 'Rising' | 'Falling' | 'Near turn' | 'Unavailable';

export interface FieldCoverageEstimate {
  timestampMs: number;
  seaLevelMetersMsl: number | null;
  coveragePercent: number | null;
  direction: WaterDirection;
  levelRateMetersPerHour: number | null;
  confidence: 'low';
}

export interface PredictedTideExtremum {
  kind: 'high' | 'low';
  timestampMs: number;
  heightMetersMsl: number;
}

export interface DailyFieldForecast {
  dateKey: string;
  samples: FieldCoverageEstimate[];
  extrema: PredictedTideExtremum[];
  maximumCoveragePercent: number;
  maximumAtMs: number;
  floodingBeginsAtMs: number | null;
  recoveryBelowPlayableAtMs: number | null;
}

export interface FieldForecastSummary {
  current: FieldCoverageEstimate | null;
  nextHigh: PredictedTideExtremum | null;
  nextLow: PredictedTideExtremum | null;
  maximumCoveragePercent: number;
  maximumAtMs: number | null;
  nextFloodingAtMs: number | null;
  recoveryAtMs: number | null;
  horizonEndMs: number;
  daily: DailyFieldForecast[];
}

function findLowerSampleIndex(samples: readonly MarineLevelSample[], timestampMs: number): number {
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (samples[mid].timestampMs <= timestampMs) low = mid;
    else high = mid - 1;
  }
  return low;
}

function interpolateLevel(samples: readonly MarineLevelSample[], timestampMs: number): {
  levelMetersMsl: number;
  rateMetersPerHour: number;
} | null {
  if (samples.length < 2 || timestampMs < samples[0].timestampMs || timestampMs > samples[samples.length - 1].timestampMs) {
    return null;
  }
  const lowerIndex = findLowerSampleIndex(samples, timestampMs);
  let left = samples[lowerIndex];
  let right = samples[Math.min(lowerIndex + 1, samples.length - 1)];
  if (left.timestampMs === timestampMs && lowerIndex > 0) {
    left = samples[lowerIndex - 1];
    right = samples[lowerIndex];
    if (lowerIndex < samples.length - 1) {
      right = samples[lowerIndex + 1];
    }
  }
  const durationMs = right.timestampMs - left.timestampMs;
  if (durationMs <= 0 || durationMs > MAX_SAMPLE_GAP_MS) return null;
  const fraction = (timestampMs - left.timestampMs) / durationMs;
  return {
    levelMetersMsl: left.levelMetersMsl + (right.levelMetersMsl - left.levelMetersMsl) * fraction,
    rateMetersPerHour: (right.levelMetersMsl - left.levelMetersMsl) / (durationMs / 3_600_000),
  };
}

/** Piecewise-linear pilot mapping from source-specific sea level to field coverage. */
export function estimateCoverageFromSeaLevel(levelMetersMsl: number): number {
  const anchors = RISING_COVERAGE_ANCHORS;
  if (!Number.isFinite(levelMetersMsl) || levelMetersMsl <= anchors[0].levelMeters) return 0;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const lower = anchors[index];
    const upper = anchors[index + 1];
    if (levelMetersMsl <= upper.levelMeters) {
      const fraction = (levelMetersMsl - lower.levelMeters) / (upper.levelMeters - lower.levelMeters);
      return lower.coveragePercent + fraction * (upper.coveragePercent - lower.coveragePercent);
    }
  }
  return 100;
}

/** Formats calculated coverage without rounding a sub-threshold value up to 25%. */
export function formatCoveragePercent(coveragePercent: number): string {
  return `${(Math.floor(coveragePercent * 10 + Number.EPSILON) / 10).toFixed(1)}%`;
}

/** Visual-only photo mapping; estimates below 25% always select the dry image. */
export function photoCoverageForEstimate(coveragePercent: number | null): number {
  if (!Number.isFinite(coveragePercent) || coveragePercent === null || coveragePercent < FIELD_STATUS_THRESHOLD_PERCENT) {
    return 0;
  }
  return Math.max(0, Math.min(100, coveragePercent));
}

function directionForRate(rateMetersPerHour: number): WaterDirection {
  if (rateMetersPerHour > DIRECTION_DEADBAND_METERS_PER_HOUR) return 'Rising';
  if (rateMetersPerHour < -DIRECTION_DEADBAND_METERS_PER_HOUR) return 'Falling';
  return 'Near turn';
}

export function estimateFieldCoverageAt(
  forecast: MarineTideForecast,
  timestampMs: number,
): FieldCoverageEstimate | null {
  const level = interpolateLevel(forecast.samples, timestampMs);
  if (!level) return null;
  return {
    timestampMs,
    seaLevelMetersMsl: level.levelMetersMsl,
    coveragePercent: estimateCoverageFromSeaLevel(level.levelMetersMsl),
    direction: directionForRate(level.rateMetersPerHour),
    levelRateMetersPerHour: level.rateMetersPerHour,
    confidence: 'low',
  };
}

function phtDateKey(timestampMs: number): string {
  return new Date(timestampMs + PHT_OFFSET_MS).toISOString().slice(0, 10);
}

function interpolateCrossingTime(
  previous: FieldCoverageEstimate,
  current: FieldCoverageEstimate,
  threshold: number,
): number {
  const previousCoverage = previous.coveragePercent ?? 0;
  const currentCoverage = current.coveragePercent ?? 0;
  const difference = currentCoverage - previousCoverage;
  if (difference === 0) return current.timestampMs;
  const fraction = (threshold - previousCoverage) / difference;
  return Math.round(previous.timestampMs + fraction * (current.timestampMs - previous.timestampMs));
}

function findForecastCrossings(estimates: readonly FieldCoverageEstimate[]) {
  const crossings: { direction: 'flooding' | 'recovery'; timestampMs: number }[] = [];
  let flooded = (estimates[0]?.coveragePercent ?? 0) >= PLAYABILITY_THRESHOLD_PERCENT;
  for (let index = 1; index < estimates.length; index += 1) {
    const previous = estimates[index - 1];
    const current = estimates[index];
    if (previous.coveragePercent === null || current.coveragePercent === null) continue;
    if (!flooded && previous.coveragePercent < PLAYABILITY_THRESHOLD_PERCENT && current.coveragePercent >= PLAYABILITY_THRESHOLD_PERCENT) {
      crossings.push({ direction: 'flooding', timestampMs: interpolateCrossingTime(previous, current, PLAYABILITY_THRESHOLD_PERCENT) });
      flooded = true;
    }
    if (flooded && previous.coveragePercent >= PLAYABILITY_THRESHOLD_PERCENT && current.coveragePercent < PLAYABILITY_THRESHOLD_PERCENT) {
      crossings.push({ direction: 'recovery', timestampMs: interpolateCrossingTime(previous, current, PLAYABILITY_THRESHOLD_PERCENT) });
      flooded = false;
    }
  }
  return crossings;
}

function dateExtrema(samples: readonly MarineLevelSample[]): PredictedTideExtremum[] {
  const events: PredictedTideExtremum[] = [];
  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous = samples[index - 1];
    const middle = samples[index];
    const next = samples[index + 1];
    const isHigh = middle.levelMetersMsl >= previous.levelMetersMsl && middle.levelMetersMsl > next.levelMetersMsl;
    const isLow = middle.levelMetersMsl <= previous.levelMetersMsl && middle.levelMetersMsl < next.levelMetersMsl;
    if (!isHigh && !isLow) continue;

    // Parabolic refinement around the hourly extremum; values remain model estimates.
    const curvature = previous.levelMetersMsl - 2 * middle.levelMetersMsl + next.levelMetersMsl;
    const offsetHours = curvature === 0
      ? 0
      : 0.5 * (previous.levelMetersMsl - next.levelMetersMsl) / curvature;
    const boundedOffset = Math.max(-1, Math.min(1, offsetHours));
    const height = curvature === 0
      ? middle.levelMetersMsl
      : middle.levelMetersMsl - ((previous.levelMetersMsl - next.levelMetersMsl) ** 2) / (8 * curvature);
    events.push({
      kind: isHigh ? 'high' : 'low',
      timestampMs: Math.round(middle.timestampMs + boundedOffset * 3_600_000),
      heightMetersMsl: height,
    });
  }
  return events;
}

export function buildFieldForecastSummary(
  forecast: MarineTideForecast,
  nowMs: number,
): FieldForecastSummary {
  const horizonEndMs = forecast.samples[forecast.samples.length - 1]?.timestampMs ?? nowMs;
  const fromMs = Math.max(nowMs, forecast.samples[0]?.timestampMs ?? nowMs);
  const current = estimateFieldCoverageAt(forecast, nowMs);
  const futureSamples = forecast.samples.filter((sample) => sample.timestampMs >= fromMs);
  const estimates = futureSamples
    .map((sample) => estimateFieldCoverageAt(forecast, sample.timestampMs))
    .filter((estimate): estimate is FieldCoverageEstimate => estimate !== null);
  if (current && (estimates.length === 0 || estimates[0].timestampMs > current.timestampMs)) {
    estimates.unshift(current);
  }
  const crossings = findForecastCrossings(estimates);
  const allExtrema = dateExtrema(forecast.samples);

  const dailyGroups = new Map<string, FieldCoverageEstimate[]>();
  for (const estimate of estimates) {
    const key = phtDateKey(estimate.timestampMs);
    const list = dailyGroups.get(key) ?? [];
    list.push(estimate);
    dailyGroups.set(key, list);
  }

  const daily = [...dailyGroups.entries()].map(([dateKey, samples]) => {
    const maximum = samples.reduce((best, sample) =>
      (sample.coveragePercent ?? -1) > (best.coveragePercent ?? -1) ? sample : best,
    );
    const dateStartMs = Date.parse(`${dateKey}T00:00:00+08:00`);
    const dateEndMs = dateStartMs + 24 * 60 * 60_000;
    const dailyCrossings = crossings.filter((crossing) =>
      crossing.timestampMs >= dateStartMs && crossing.timestampMs < dateEndMs,
    );
    return {
      dateKey,
      samples,
      extrema: allExtrema.filter((event) => phtDateKey(event.timestampMs) === dateKey),
      maximumCoveragePercent: maximum.coveragePercent ?? 0,
      maximumAtMs: maximum.timestampMs,
      floodingBeginsAtMs: dailyCrossings.find((crossing) => crossing.direction === 'flooding')?.timestampMs ?? null,
      recoveryBelowPlayableAtMs: dailyCrossings.find((crossing) => crossing.direction === 'recovery')?.timestampMs ?? null,
    };
  });

  const extrema = allExtrema;
  const nextFloodingAtMs = crossings.find((crossing) => crossing.direction === 'flooding')?.timestampMs ?? null;
  const recoveryAtMs = crossings.find((crossing) => crossing.direction === 'recovery')?.timestampMs ?? null;
  return {
    current,
    nextHigh: extrema.find((event) => event.kind === 'high' && event.timestampMs > nowMs) ?? null,
    nextLow: extrema.find((event) => event.kind === 'low' && event.timestampMs > nowMs) ?? null,
    maximumCoveragePercent: estimates.reduce((maximum, estimate) => Math.max(maximum, estimate.coveragePercent ?? 0), 0),
    maximumAtMs: estimates.reduce<FieldCoverageEstimate | null>((best, estimate) =>
      best === null || (estimate.coveragePercent ?? 0) > (best.coveragePercent ?? 0) ? estimate : best,
    null)?.timestampMs ?? null,
    nextFloodingAtMs,
    recoveryAtMs,
    horizonEndMs,
    daily,
  };
}
