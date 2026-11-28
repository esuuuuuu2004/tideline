/**
 * Provisional astronomical harmonic prediction for Taluksangay, Zamboanga City.
 * Constituent amplitudes/phases and the datum offset are undocumented and
 * unvalidated; values returned here are predictions, not gauge observations.
 *
 * All day boundaries and formatted timestamps are locked to Philippine Standard
 * Time (Asia/Manila, UTC+8) regardless of the device's local timezone.
 */

export const STATION = {
  id: 'taluksangay-zamboanga',
  name: 'Taluksangay',
  city: 'Zamboanga City',
  country: 'Philippines',
  waters: 'Moro Gulf · Basilan Strait',
  latitude: 6.9428,
  longitude: 122.1714,
  coordsLabel: '6.9428° N, 122.1714° E',
  timezone: 'UTC+8 (PHT)',
  datum: 'MLLW (unverified)',
  provisionalDatumOffsetMeters: 0.78,
} as const;

export type TideUnit = 'm' | 'ft';
export type TimeFormat = '12h' | '24h';
export type TideLevelTrend = 'Rising' | 'Falling' | 'Near turn';
export type TideExtremumKind = 'high' | 'low';
export type TideRegime = 'Spring tide' | 'Neap tide' | 'Moderate range';

export interface TideSample {
  /** Minutes from PHT midnight (0..1440) */
  minuteOfDay: number;
  /** Epoch ms */
  timestampMs: number;
  /** Predicted height in meters relative to the unverified MLLW target */
  heightMeters: number;
}

export interface TideExtremum {
  kind: TideExtremumKind;
  timestampMs: number;
  minuteOfDay: number;
  heightMeters: number;
}

export interface LunarSnapshot {
  /** Illumination fraction 0..1 */
  illumination: number;
  /** Lunar age in days 0..29.53 */
  ageDays: number;
  phaseName: string;
  regime: TideRegime;
}

export interface SolarWindow {
  sunriseMs: number;
  sunsetMs: number;
}

export interface DayForecast {
  /** Local PHT date key YYYY-MM-DD */
  dateKey: string;
  /** Epoch ms for 00:00 PHT of that day */
  dayStartMs: number;
  extrema: TideExtremum[];
  samples: TideSample[];
  minMeters: number;
  maxMeters: number;
  rangeMeters: number;
  lunar: LunarSnapshot;
  solar: SolarWindow;
}

export interface TidePredictionSnapshot {
  timestampMs: number;
  heightMeters: number;
  rateMetersPerHour: number;
  levelTrend: TideLevelTrend;
  nextExtremum: TideExtremum;
  nextHigh: TideExtremum;
  nextLow: TideExtremum;
  previousExtremum: TideExtremum;
  predictionNote: string;
}

const PHT_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DEG_TO_RAD = Math.PI / 180;
const METERS_TO_FEET = 3.28084;

/** J2000.0 epoch: 2000-01-01T12:00:00Z */
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

interface Constituent {
  name: string;
  /** Amplitude in meters */
  amplitude: number;
  /** Reference angular speed in deg/hour; the Doodson coefficients synthesize V */
  speedDegPerHr: number;
  /** Assumed Greenwich phase lag G in degrees; the station values are unverified */
  phaseLagDeg: number;
  /** Linear coefficients on (tau, s, h, p, shift) for Doodson equilibrium V0 */
  coeff: readonly [number, number, number, number, number];
}

/**
 * Provisional, unvalidated constants retained from the previous implementation.
 * Their amplitudes/phases have no documented station or model provenance.
 * Phase is assumed Greenwich phase lag G in h = H0 + Σ fH cos(V + u - G).
 * The listed speeds are standard values; V is computed from the arguments below.
 */
const CONSTITUENTS: readonly Constituent[] = [
  { name: 'M2', amplitude: 0.37, speedDegPerHr: 28.9841042, phaseLagDeg: 204, coeff: [2, 0, 0, 0, 0] },
  { name: 'S2', amplitude: 0.16, speedDegPerHr: 30.0, phaseLagDeg: 246, coeff: [2, 2, -2, 0, 0] },
  { name: 'N2', amplitude: 0.08, speedDegPerHr: 28.4397295, phaseLagDeg: 186, coeff: [2, -1, 0, 1, 0] },
  { name: 'K1', amplitude: 0.15, speedDegPerHr: 15.0410686, phaseLagDeg: 312, coeff: [1, 1, 0, 0, 90] },
  { name: 'O1', amplitude: 0.11, speedDegPerHr: 13.9430356, phaseLagDeg: 274, coeff: [1, -1, 0, 0, -90] },
  { name: 'P1', amplitude: 0.05, speedDegPerHr: 14.9589314, phaseLagDeg: 306, coeff: [1, 1, -2, 0, -90] },
  { name: 'M4', amplitude: 0.02, speedDegPerHr: 57.9682084, phaseLagDeg: 48, coeff: [4, 0, 0, 0, 0] },
];

function normDeg(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/**
 * Computes astronomical mean longitudes (in degrees) at UTC epoch `ms`.
 * Used for Doodson equilibrium arguments and lunar phase synchronization.
 */
function astronomicalArgs(ms: number) {
  const daysSinceJ2000 = (ms - J2000_MS) / DAY_MS;
  const T = daysSinceJ2000 / 36525;

  // Mean longitude of Moon (s), Sun (h), lunar perigee (p)
  const s = normDeg(218.3164477 + 481267.88123421 * T);
  const h = normDeg(280.46646 + 36000.76983 * T);
  const p = normDeg(83.3532465 + 4069.0137287 * T);
  // Mean longitude of the Moon's ascending node (Meeus polynomial, J2000).
  const N = normDeg(
    125.04455501 -
      1934.1361849 * T +
      0.0020762 * T * T +
      (T * T * T) / 467410 -
      (T * T * T * T) / 60616000,
  );

  // Greenwich mean lunar time angle τ = UT solar angle + h - s.
  const utcDate = new Date(ms);
  const utHours =
    utcDate.getUTCHours() +
    utcDate.getUTCMinutes() / 60 +
    utcDate.getUTCSeconds() / 3600 +
    utcDate.getUTCMilliseconds() / 3600000;
  const tau = normDeg(utHours * 15 - 180 + h - s);

  const centuriesPerHour = 1 / (36525 * 24);
  const sRateDegPerHour = 481267.88123421 * centuriesPerHour;
  const hRateDegPerHour = 36000.76983 * centuriesPerHour;
  const pRateDegPerHour = 4069.0137287 * centuriesPerHour;
  const nodeRateDegPerHour =
    (-1934.1361849 +
      2 * 0.0020762 * T +
      (3 * T * T) / 467410 -
      (4 * T * T * T) / 60616000) *
    centuriesPerHour;

  return {
    tau,
    s,
    h,
    p,
    N,
    tauRateDegPerHour: 15 + hRateDegPerHour - sRateDegPerHour,
    sRateDegPerHour,
    hRateDegPerHour,
    pRateDegPerHour,
    nodeRateDegPerHour,
  };
}

interface NodalCorrection {
  factor: number;
  phaseDeg: number;
  /** Derivatives with respect to node angle in radians. */
  factorDerivativePerRad: number;
  phaseDerivativeDegPerRad: number;
}

/** Short-series nodal corrections (Schureman/Pugh convention). */
function nodalCorrection(name: string, nodeDeg: number): NodalCorrection {
  const N = nodeDeg * DEG_TO_RAD;
  const sinN = Math.sin(N);
  const cosN = Math.cos(N);
  const sin2N = Math.sin(2 * N);
  const cos2N = Math.cos(2 * N);
  const sin3N = Math.sin(3 * N);
  const cos3N = Math.cos(3 * N);

  if (name === 'M2' || name === 'N2') {
    return {
      factor: 1.0007 - 0.0373 * cosN + 0.0002 * cos2N,
      phaseDeg: -2.14 * sinN,
      factorDerivativePerRad: 0.0373 * sinN - 0.0004 * sin2N,
      phaseDerivativeDegPerRad: -2.14 * cosN,
    };
  }
  if (name === 'O1') {
    return {
      factor: 1.009 + 0.187 * cosN - 0.015 * cos2N + 0.001 * cos3N,
      phaseDeg: 10.8 * sinN - 1.3 * sin2N + 0.2 * sin3N,
      factorDerivativePerRad: -0.187 * sinN + 0.03 * sin2N - 0.003 * sin3N,
      phaseDerivativeDegPerRad: 10.8 * cosN - 2.6 * cos2N + 0.6 * cos3N,
    };
  }
  if (name === 'K1') {
    return {
      factor: 1.006 + 0.115 * cosN - 0.0088 * cos2N + 0.0006 * cos3N,
      phaseDeg: -8.9 * sinN + 0.7 * sin2N - 0.1 * sin3N,
      factorDerivativePerRad: -0.115 * sinN + 0.0176 * sin2N - 0.0018 * sin3N,
      phaseDerivativeDegPerRad: -8.9 * cosN + 1.4 * cos2N - 0.3 * cos3N,
    };
  }
  if (name === 'M4') {
    const m2 = nodalCorrection('M2', nodeDeg);
    return {
      factor: m2.factor * m2.factor,
      phaseDeg: 2 * m2.phaseDeg,
      factorDerivativePerRad: 2 * m2.factor * m2.factorDerivativePerRad,
      phaseDerivativeDegPerRad: 2 * m2.phaseDerivativeDegPerRad,
    };
  }
  // Solar S2 and P1 have no nodal correction in this convention.
  return { factor: 1, phaseDeg: 0, factorDerivativePerRad: 0, phaseDerivativeDegPerRad: 0 };
}

/**
 * Returns a model-predicted height relative to the provisional datum offset.
 * The intended MLLW realization and the 0.78 m offset are unverified.
 */
function synthesizeTide(timestampMs: number): { heightMeters: number; rateMetersPerHour: number } {
  const args = astronomicalArgs(timestampMs);
  const { tau, s, h, p, N } = args;
  let height = STATION.provisionalDatumOffsetMeters;
  let rate = 0;

  for (const c of CONSTITUENTS) {
    const [cTau, cS, cH, cP, shift] = c.coeff;
    const correction = nodalCorrection(c.name, N);
    const { factor, phaseDeg } = correction;
    const equilibriumArgDeg = cTau * tau + cS * s + cH * h + cP * p + shift;
    const argDeg = equilibriumArgDeg + phaseDeg - c.phaseLagDeg;
    const angleRad = argDeg * DEG_TO_RAD;
    const argumentRateDegPerHour =
      cTau * args.tauRateDegPerHour +
      cS * args.sRateDegPerHour +
      cH * args.hRateDegPerHour +
      cP * args.pRateDegPerHour +
      correction.phaseDerivativeDegPerRad * args.nodeRateDegPerHour * DEG_TO_RAD;
    const factorRatePerHour = correction.factorDerivativePerRad * args.nodeRateDegPerHour * DEG_TO_RAD;
    height += factor * c.amplitude * Math.cos(angleRad);
    rate += c.amplitude * (factorRatePerHour * Math.cos(angleRad) - factor * Math.sin(angleRad) * argumentRateDegPerHour * DEG_TO_RAD);
  }

  return { heightMeters: height, rateMetersPerHour: rate };
}

export function predictTideMeters(timestampMs: number): number {
  return synthesizeTide(timestampMs).heightMeters;
}

/**
 * Analytic derivative of the same harmonic synthesis, in predicted meters/hour.
 */
export function predictTideRateMetersPerHour(timestampMs: number): number {
  return synthesizeTide(timestampMs).rateMetersPerHour;
}

export function getPhtDateParts(timestampMs: number) {
  const d = new Date(timestampMs + PHT_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),
  };
}

export function phtMidnightMs(timestampMs: number): number {
  const { year, month, day } = getPhtDateParts(timestampMs);
  return Date.UTC(year, month - 1, day, 0, 0, 0) - PHT_OFFSET_MS;
}

export function toPhtDateKey(timestampMs: number): string {
  const { year, month, day } = getPhtDateParts(timestampMs);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Finds local extrema of the predicted curve inside `[startMs, endMs)`.
 */
function findExtremaInRange(startMs: number, endMs: number, dayStartMs: number): TideExtremum[] {
  const stepMs = 60 * 1000;
  const extrema: TideExtremum[] = [];
  let leftMs = startMs - stepMs;
  let leftRate = predictTideRateMetersPerHour(leftMs);

  while (leftMs < endMs) {
    const rightMs = Math.min(leftMs + stepMs, endMs);
    const rightRate = predictTideRateMetersPerHour(rightMs);
    const isHigh = leftRate > 0 && rightRate <= 0;
    const isLow = leftRate < 0 && rightRate >= 0;

    if (isHigh || isLow) {
      let lo = leftMs;
      let hi = rightMs;
      // Refine the derivative zero to a one-millisecond interval.
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        const midRate = predictTideRateMetersPerHour(mid);
        if ((isHigh && midRate > 0) || (isLow && midRate < 0)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      // Use the midpoint of the final bracket; the resulting timestamp is within 1 ms.
      const extremumMs = lo + Math.floor((hi - lo) / 2);
      if (extremumMs >= startMs && extremumMs < endMs) {
        extrema.push({
          kind: isHigh ? 'high' : 'low',
          timestampMs: extremumMs,
          minuteOfDay: (extremumMs - dayStartMs) / 60000,
          heightMeters: predictTideMeters(extremumMs),
        });
      }
    }

    leftMs = rightMs;
    leftRate = rightRate;
  }

  return extrema;
}

export function computeLunarSnapshot(timestampMs: number, rangeMeters: number): LunarSnapshot {
  const { s, h } = astronomicalArgs(timestampMs);
  // Mean elongation D = s - h
  const elongationDeg = normDeg(s - h);
  const illumination = (1 - Math.cos(elongationDeg * DEG_TO_RAD)) / 2;
  const synodicMonth = 29.53058867;
  const ageDays = (elongationDeg / 360) * synodicMonth;

  let phaseName: string;
  if (ageDays < 1.85 || ageDays >= 27.68) phaseName = 'New moon';
  else if (ageDays < 5.54) phaseName = 'Waxing crescent';
  else if (ageDays < 9.23) phaseName = 'First quarter';
  else if (ageDays < 12.92) phaseName = 'Waxing gibbous';
  else if (ageDays < 16.61) phaseName = 'Full moon';
  else if (ageDays < 20.3) phaseName = 'Waning gibbous';
  else if (ageDays < 23.99) phaseName = 'Last quarter';
  else phaseName = 'Waning crescent';

  let regime: TideRegime = 'Moderate range';
  if (rangeMeters >= 1.15) regime = 'Spring tide';
  else if (rangeMeters <= 0.65) regime = 'Neap tide';

  return {
    illumination: Math.round(illumination * 100) / 100,
    ageDays: Math.round(ageDays * 10) / 10,
    phaseName,
    regime,
  };
}

/**
 * Approximate sunrise and sunset in epoch ms for Taluksangay (6.9428° N, 122.1714° E).
 */
export function computeSolarWindow(dayStartMs: number): SolarWindow {
  const noonUtcMs = dayStartMs + 4 * 3600 * 1000; // 12:00 PHT = 04:00 UTC
  const d = (noonUtcMs - J2000_MS) / DAY_MS;

  const meanAnom = normDeg(357.5291 + 0.98560028 * d);
  const C =
    1.9148 * Math.sin(meanAnom * DEG_TO_RAD) +
    0.02 * Math.sin(2 * meanAnom * DEG_TO_RAD);
  const eclipticLon = normDeg(meanAnom + C + 180 + 102.9372);
  const declination = Math.asin(
    Math.sin(eclipticLon * DEG_TO_RAD) * Math.sin(23.4397 * DEG_TO_RAD),
  );

  const latRad = STATION.latitude * DEG_TO_RAD;
  const cosOmega =
    (Math.sin(-0.833 * DEG_TO_RAD) - Math.sin(latRad) * Math.sin(declination)) /
    (Math.cos(latRad) * Math.cos(declination));
  const clamped = Math.max(-1, Math.min(1, cosOmega));
  const omegaDeg = Math.acos(clamped) / DEG_TO_RAD;

  // Equation of time approximation
  const eqTimeMin =
    4 *
    (normDeg(meanAnom + 102.9372) -
      0.0057183 -
      Math.atan2(
        Math.tan(eclipticLon * DEG_TO_RAD) * Math.cos(23.4397 * DEG_TO_RAD),
        1,
      ) /
        DEG_TO_RAD);
  // Keep solar noon around 11:51 PHT for 122.17°E (offset from 120°E standard meridian = -8.7 min)
  const solarNoonMinutes = 12 * 60 - (STATION.longitude - 120) * 4 - (Math.abs(eqTimeMin) < 20 ? eqTimeMin : 0);
  const halfDayMinutes = omegaDeg * 4;

  return {
    sunriseMs: Math.round(dayStartMs + (solarNoonMinutes - halfDayMinutes) * 60000),
    sunsetMs: Math.round(dayStartMs + (solarNoonMinutes + halfDayMinutes) * 60000),
  };
}

/**
 * Generates a full 24-hour forecast (plus samples) for a given PHT day start.
 */
export function buildDayForecast(dayStartMs: number): DayForecast {
  const samples: TideSample[] = [];
  let minMeters = Infinity;
  let maxMeters = -Infinity;

  // 15-minute resolution (97 samples covering 00:00 through 24:00)
  for (let m = 0; m <= 1440; m += 15) {
    const timestampMs = dayStartMs + m * 60000;
    const heightMeters = predictTideMeters(timestampMs);
    if (heightMeters < minMeters) minMeters = heightMeters;
    if (heightMeters > maxMeters) maxMeters = heightMeters;
    samples.push({ minuteOfDay: m, timestampMs, heightMeters });
  }

  const extrema = findExtremaInRange(dayStartMs, dayStartMs + DAY_MS, dayStartMs);
  for (const ex of extrema) {
    if (ex.heightMeters < minMeters) minMeters = ex.heightMeters;
    if (ex.heightMeters > maxMeters) maxMeters = ex.heightMeters;
  }

  const rangeMeters = Math.round((maxMeters - minMeters) * 100) / 100;
  const lunar = computeLunarSnapshot(dayStartMs + 12 * 3600 * 1000, rangeMeters);
  const solar = computeSolarWindow(dayStartMs);

  return {
    dateKey: toPhtDateKey(dayStartMs),
    dayStartMs,
    extrema,
    samples,
    minMeters,
    maxMeters,
    rangeMeters,
    lunar,
    solar,
  };
}

export function buildMultiDayForecast(anchorMs: number, days = 7): DayForecast[] {
  const start = phtMidnightMs(anchorMs);
  const result: DayForecast[] = [];
  for (let i = 0; i < days; i++) {
    result.push(buildDayForecast(start + i * DAY_MS));
  }
  return result;
}

function buildPredictionNote(levelTrend: TideLevelTrend): string {
  const state = levelTrend === 'Near turn' ? 'near a turning point' : levelTrend.toLowerCase();
  return `Unvalidated harmonic prediction: water level is ${state}. This is not an observation or a current measurement.`;
}

export function getTidePredictionSnapshot(nowMs: number): TidePredictionSnapshot {
  const prediction = synthesizeTide(nowMs);
  const { heightMeters, rateMetersPerHour } = prediction;

  let levelTrend: TideLevelTrend = 'Near turn';
  if (rateMetersPerHour > 0.03) levelTrend = 'Rising';
  else if (rateMetersPerHour < -0.03) levelTrend = 'Falling';

  const todayStart = phtMidnightMs(nowMs);
  const windowExtrema = [
    ...findExtremaInRange(todayStart - DAY_MS, todayStart, todayStart - DAY_MS),
    ...findExtremaInRange(todayStart, todayStart + DAY_MS, todayStart),
    ...findExtremaInRange(todayStart + DAY_MS, todayStart + 2 * DAY_MS, todayStart + DAY_MS),
  ];

  const upcoming = windowExtrema.filter((e) => e.timestampMs > nowMs);
  const past = windowExtrema.filter((e) => e.timestampMs <= nowMs);

  const nextExtremum = upcoming[0] ?? windowExtrema[windowExtrema.length - 1];
  const previousExtremum = past[past.length - 1] ?? windowExtrema[0];
  const nextHigh = upcoming.find((e) => e.kind === 'high') ?? nextExtremum;
  const nextLow = upcoming.find((e) => e.kind === 'low') ?? nextExtremum;

  return {
    timestampMs: nowMs,
    heightMeters,
    rateMetersPerHour,
    levelTrend,
    nextExtremum,
    nextHigh,
    nextLow,
    previousExtremum,
    predictionNote: buildPredictionNote(levelTrend),
  };
}

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

export function formatHeight(heightMeters: number, unit: TideUnit): string {
  if (unit === 'ft') {
    return `${(heightMeters * METERS_TO_FEET).toFixed(1)} ft`;
  }
  return `${heightMeters.toFixed(2)} m`;
}

export function formatHeightNumber(heightMeters: number, unit: TideUnit): string {
  if (unit === 'ft') {
    return (heightMeters * METERS_TO_FEET).toFixed(1);
  }
  return heightMeters.toFixed(2);
}

export function formatRate(rateMetersPerHour: number, unit: TideUnit): string {
  const sign = rateMetersPerHour >= 0 ? '+' : '';
  if (unit === 'ft') {
    return `${sign}${(rateMetersPerHour * METERS_TO_FEET).toFixed(2)} ft/h`;
  }
  return `${sign}${rateMetersPerHour.toFixed(2)} m/h`;
}

export function formatPhtTime(timestampMs: number, format: TimeFormat): string {
  const { hour, minute } = getPhtDateParts(timestampMs);
  const mm = String(minute).padStart(2, '0');
  if (format === '24h') {
    return `${String(hour).padStart(2, '0')}:${mm}`;
  }
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${mm} ${suffix}`;
}

export function formatCountdown(targetMs: number, nowMs: number): string {
  const diffMin = Math.max(0, Math.round((targetMs - nowMs) / 60000));
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hours === 0) return `in ${mins}m`;
  return `in ${hours}h ${mins}m`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function formatPhtDayLabel(dayStartMs: number, indexFromToday?: number): {
  shortDay: string;
  dateText: string;
} {
  const { month, day, dayOfWeek } = getPhtDateParts(dayStartMs);
  const dateText = `${MONTHS[month - 1]} ${day}`;
  if (indexFromToday === 0) return { shortDay: 'Today', dateText };
  if (indexFromToday === 1) return { shortDay: 'Tomorrow', dateText };
  return { shortDay: WEEKDAYS[dayOfWeek], dateText };
}
