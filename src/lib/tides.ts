/**
 * Astronomical harmonic tide prediction engine for Taluksangay, Zamboanga City.
 *
 * Models mixed, predominantly semidiurnal tides (Formzahl F ≈ 0.49) typical of
 * the Moro Gulf / Basilan Strait coast using standard astronomical speeds and
 * J2000-anchored equilibrium arguments (M2, S2, N2, K1, O1, P1, M4).
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
  datum: 'MLLW',
  meanSeaLevelMeters: 0.78,
} as const;

export type TideUnit = 'm' | 'ft';
export type TimeFormat = '12h' | '24h';
export type TideDirection = 'Rising' | 'Falling' | 'Slack';
export type TideExtremumKind = 'high' | 'low';
export type TideRegime = 'Spring tide' | 'Neap tide' | 'Moderate range';

export interface TideSample {
  /** Minutes from PHT midnight (0..1440) */
  minuteOfDay: number;
  /** Epoch ms */
  timestampMs: number;
  /** Height in meters above MLLW */
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

export interface CurrentTideSnapshot {
  timestampMs: number;
  heightMeters: number;
  rateMetersPerHour: number;
  direction: TideDirection;
  nextExtremum: TideExtremum;
  nextHigh: TideExtremum;
  nextLow: TideExtremum;
  previousExtremum: TideExtremum;
  coastalNote: string;
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
  /** Angular speed in deg/hour */
  speedDegPerHr: number;
  /** Local Greenwich phase lag (G) in degrees for Zamboanga / Basilan Strait */
  phaseLagDeg: number;
  /** Linear coefficients on (tau, s, h, p, shift) for Doodson equilibrium V0 */
  coeff: readonly [number, number, number, number, number];
}

/**
 * Calibrated harmonic constituents for Zamboanga / Taluksangay coastal shelf.
 * Formzahl F = (K1 + O1) / (M2 + S2) = (0.15 + 0.11) / (0.37 + 0.16) ≈ 0.49
 * (mixed, predominantly semidiurnal).
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

  // Greenwich hour angle of mean sun in degrees at this UTC instant
  const utcDate = new Date(ms);
  const utHours =
    utcDate.getUTCHours() +
    utcDate.getUTCMinutes() / 60 +
    utcDate.getUTCSeconds() / 3600 +
    utcDate.getUTCMilliseconds() / 3600000;
  const tau = normDeg(utHours * 15 - 180 + h - s);

  return { tau, s, h, p, daysSinceJ2000 };
}

/**
 * Predicts tide height in meters above MLLW at `timestampMs`.
 */
export function predictTideMeters(timestampMs: number): number {
  const { tau, s, h, p } = astronomicalArgs(timestampMs);
  let height = STATION.meanSeaLevelMeters;

  for (const c of CONSTITUENTS) {
    const [cTau, cS, cH, cP, shift] = c.coeff;
    const argDeg = cTau * tau + cS * s + cH * h + cP * p + shift - c.phaseLagDeg;
    height += c.amplitude * Math.cos(argDeg * DEG_TO_RAD);
  }

  return height;
}

/**
 * Rate of water change in meters/hour using central finite difference (+/- 5 min).
 */
export function predictTideRateMetersPerHour(timestampMs: number): number {
  const dtMs = 5 * 60 * 1000;
  const hBefore = predictTideMeters(timestampMs - dtMs);
  const hAfter = predictTideMeters(timestampMs + dtMs);
  return (hAfter - hBefore) / (2 * (5 / 60));
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
 * Finds local extrema (High and Low tides) inside `[startMs, endMs)`.
 */
function findExtremaInRange(startMs: number, endMs: number, dayStartMs: number): TideExtremum[] {
  const stepMs = 5 * 60 * 1000;
  const extrema: TideExtremum[] = [];

  let prevH = predictTideMeters(startMs - stepMs);
  let currH = predictTideMeters(startMs);

  for (let t = startMs; t < endMs; t += stepMs) {
    const nextH = predictTideMeters(t + stepMs);
    const isMax = currH > prevH && currH >= nextH;
    const isMin = currH < prevH && currH <= nextH;

    if (isMax || isMin) {
      // Parabolic refinement within [t - stepMs, t + stepMs]
      const denom = 2 * (prevH - 2 * currH + nextH);
      let refinedOffset = 0;
      if (Math.abs(denom) > 1e-9) {
        refinedOffset = ((prevH - nextH) * stepMs) / denom;
        refinedOffset = Math.max(-stepMs, Math.min(stepMs, refinedOffset));
      }
      const peakMs = Math.round(t + refinedOffset);
      if (peakMs >= startMs && peakMs < endMs) {
        const kind: TideExtremumKind = isMax ? 'high' : 'low';
        const prev = extrema[extrema.length - 1];
        // Ignore micro-ripples within 60 minutes of a previous extremum
        if (!prev || peakMs - prev.timestampMs >= 60 * 60 * 1000) {
          extrema.push({
            kind,
            timestampMs: peakMs,
            minuteOfDay: (peakMs - dayStartMs) / 60000,
            heightMeters: predictTideMeters(peakMs),
          });
        }
      }
    }

    prevH = currH;
    currH = nextH;
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

function buildCoastalNote(
  heightMeters: number,
  direction: TideDirection,
): string {
  if (heightMeters >= 1.15) {
    return 'High water over the Taluksangay stilt flats — deep access along boat channels and seaweed lines.';
  }
  if (heightMeters <= 0.35) {
    return 'Low water exposes reef shelves and shallow sandbars; watch hull draft near the stilt boardwalk.';
  }
  if (direction === 'Rising') {
    return 'Incoming flood current across Basilan Strait — water is filling the nearshore reef flat.';
  }
  if (direction === 'Falling') {
    return 'Ebbing tide drawing water off the shelf toward Moro Gulf — steady outflow along channels.';
  }
  return 'Slack water turning at Taluksangay — minimal tidal current for nearshore mooring.';
}

export function getCurrentTideSnapshot(nowMs: number): CurrentTideSnapshot {
  const heightMeters = predictTideMeters(nowMs);
  const rateMetersPerHour = predictTideRateMetersPerHour(nowMs);

  let direction: TideDirection = 'Slack';
  if (rateMetersPerHour > 0.03) direction = 'Rising';
  else if (rateMetersPerHour < -0.03) direction = 'Falling';

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
    direction,
    nextExtremum,
    nextHigh,
    nextLow,
    previousExtremum,
    coastalNote: buildCoastalNote(heightMeters, direction),
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
