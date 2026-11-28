import AsyncStorage from '@react-native-async-storage/async-storage';

import { STATION } from '@/lib/tides';

export const MARINE_TIDE_HORIZON_DAYS = 8;
export const MARINE_TIDE_SOURCE_LABEL = 'Open-Meteo Marine sea-level model';

const CACHE_KEY = 'tideline.marine-tides.v1';
const CACHE_TTL_MS = 6 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 12_000;

export interface MarineLevelSample {
  timestampMs: number;
  levelMetersMsl: number;
}

export interface MarineTideForecast {
  fetchedAtMs: number;
  requestedLatitude: number;
  requestedLongitude: number;
  gridLatitude: number;
  gridLongitude: number;
  timezone: string;
  samples: MarineLevelSample[];
}

export interface MarineForecastResult {
  forecast: MarineTideForecast;
  source: 'network' | 'memory' | 'cache';
  stale: boolean;
  staleReason?: string;
}

interface OpenMeteoMarineResponse {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  hourly?: {
    time?: string[];
    sea_level_height_msl?: (number | null)[];
  };
  error?: boolean;
  reason?: string;
}

export class MarineTideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarineTideError';
  }
}

let memoryForecast: MarineTideForecast | null = null;
let inFlightRequest: Promise<MarineTideForecast> | null = null;

function parsePhtTimestamp(value: string): number | null {
  const parsed = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}+08:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMarineForecast(value: unknown): value is MarineTideForecast {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MarineTideForecast>;
  return Number.isFinite(candidate.fetchedAtMs) &&
    Number.isFinite(candidate.gridLatitude) &&
    Number.isFinite(candidate.gridLongitude) &&
    candidate.timezone === 'Asia/Manila' &&
    Array.isArray(candidate.samples) &&
    candidate.samples.length > 1 &&
    candidate.samples.every((sample) =>
      Number.isFinite(sample.timestampMs) && Number.isFinite(sample.levelMetersMsl),
    );
}

function parseResponse(body: OpenMeteoMarineResponse, fetchedAtMs: number): MarineTideForecast {
  const times = body.hourly?.time;
  const levels = body.hourly?.sea_level_height_msl;
  if (!times?.length || !levels || times.length !== levels.length) {
    throw new MarineTideError('Marine forecast returned an incomplete hourly sea-level series.');
  }

  const samples: MarineLevelSample[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const timestampMs = parsePhtTimestamp(times[index]);
    const levelMetersMsl = levels[index];
    if (timestampMs === null || typeof levelMetersMsl !== 'number' || !Number.isFinite(levelMetersMsl)) {
      continue;
    }
    samples.push({ timestampMs, levelMetersMsl });
  }
  samples.sort((a, b) => a.timestampMs - b.timestampMs);
  if (samples.length < 24) {
    throw new MarineTideError('Marine forecast has too few valid hourly sea-level samples.');
  }

  return {
    fetchedAtMs,
    requestedLatitude: STATION.latitude,
    requestedLongitude: STATION.longitude,
    gridLatitude: body.latitude ?? STATION.latitude,
    gridLongitude: body.longitude ?? STATION.longitude,
    timezone: body.timezone ?? 'Asia/Manila',
    samples,
  };
}

async function requestForecast(): Promise<MarineTideForecast> {
  const params = new URLSearchParams({
    latitude: String(STATION.latitude),
    longitude: String(STATION.longitude),
    hourly: 'sea_level_height_msl',
    timezone: 'Asia/Manila',
    forecast_days: String(MARINE_TIDE_HORIZON_DAYS),
    cell_selection: 'sea',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new MarineTideError(`Marine forecast request failed (${response.status}).`);
    const body = await response.json() as OpenMeteoMarineResponse;
    if (body.error) throw new MarineTideError(`Marine forecast error: ${body.reason ?? 'request rejected'}.`);
    return parseResponse(body, Date.now());
  } catch (error) {
    if (error instanceof MarineTideError) throw error;
    throw new MarineTideError(
      error instanceof Error && error.name === 'AbortError'
        ? 'Marine forecast request timed out.'
        : 'Marine forecast is unavailable offline.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readCachedForecast(): Promise<MarineTideForecast | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isMarineForecast(parsed)) return parsed;
  } catch {
    // Corrupt or unavailable local cache is treated as no cache.
  }
  return null;
}

/** Loads one rolling forecast, deduplicates requests, and falls back to stale cache. */
export async function loadMarineTideForecast(forceRefresh = false): Promise<MarineForecastResult> {
  if (!forceRefresh && memoryForecast && Date.now() - memoryForecast.fetchedAtMs < CACHE_TTL_MS) {
    return { forecast: memoryForecast, source: 'memory', stale: false };
  }

  const cached = memoryForecast ?? await readCachedForecast();
  if (cached) memoryForecast = cached;
  if (!forceRefresh && cached && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) {
    return { forecast: cached, source: 'cache', stale: false };
  }

  try {
    const forecast = await (inFlightRequest ??= requestForecast());
    memoryForecast = forecast;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(forecast)).catch(() => {});
    return { forecast, source: 'network', stale: false };
  } catch (error) {
    if (cached) {
      return {
        forecast: cached,
        source: 'cache',
        stale: true,
        staleReason: error instanceof Error ? error.message : 'Unable to update marine forecast.',
      };
    }
    throw error;
  } finally {
    inFlightRequest = null;
  }
}
