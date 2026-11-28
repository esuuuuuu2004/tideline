import AsyncStorage from '@react-native-async-storage/async-storage';

export const WEATHER_TIME_ZONE = 'Asia/Manila';
export const WEATHER_LATITUDE = 6.9428;
export const WEATHER_LONGITUDE = 122.1714;

const CACHE_KEY = 'tideline.weather.forecast.v1';
const CACHE_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_VERSION = 1;

type NullableNumber = number | null;

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: NullableNumber;
    apparent_temperature?: NullableNumber;
    relative_humidity_2m?: NullableNumber;
    precipitation?: NullableNumber;
    weather_code?: NullableNumber;
    cloud_cover?: NullableNumber;
    wind_speed_10m?: NullableNumber;
    wind_direction_10m?: NullableNumber;
    wind_gusts_10m?: NullableNumber;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: NullableNumber[];
    apparent_temperature?: NullableNumber[];
    precipitation_probability?: NullableNumber[];
    precipitation?: NullableNumber[];
    weather_code?: NullableNumber[];
    wind_speed_10m?: NullableNumber[];
    wind_direction_10m?: NullableNumber[];
    wind_gusts_10m?: NullableNumber[];
  };
  daily?: {
    time?: string[];
    weather_code?: NullableNumber[];
    temperature_2m_max?: NullableNumber[];
    temperature_2m_min?: NullableNumber[];
    precipitation_probability_max?: NullableNumber[];
    precipitation_sum?: NullableNumber[];
  };
  error?: boolean;
  reason?: string;
}

export interface WeatherConditions {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  precipitationProbabilityPercent: number | null;
  weatherCode: number | null;
  cloudCoverPercent: number | null;
  windSpeedKmh: number | null;
  windDirectionDegrees: number | null;
  windGustKmh: number | null;
}

export interface HourlyWeather extends WeatherConditions {
  timestampMs: number;
}

export interface DailyWeather {
  date: string;
  weatherCode: number | null;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  precipitationProbabilityPercent: number | null;
  precipitationMm: number | null;
}

export interface WeatherForecast {
  fetchedAtMs: number;
  current: WeatherConditions;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}

export interface WeatherLoadResult {
  forecast: WeatherForecast;
  source: 'network' | 'memory' | 'cache';
  staleReason?: string;
}

export class WeatherRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeatherRequestError';
  }
}

let memoryForecast: WeatherForecast | null = null;
let inFlightRequest: Promise<WeatherForecast> | null = null;

function finiteNumber(value: NullableNumber | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Open-Meteo returns local wall-clock strings for the requested timezone. */
function parseLocalTimestamp(value: string): number | null {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasZone ? value : `${value}+08:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function at<T>(values: T[] | undefined, index: number): T | undefined {
  return values?.[index];
}

function toConditions(
  values: Partial<NonNullable<OpenMeteoResponse['current']>> | undefined,
  precipitationProbabilityPercent: NullableNumber | undefined,
): WeatherConditions {
  const source = values ?? {};
  return {
    temperatureC: finiteNumber(source.temperature_2m),
    apparentTemperatureC: finiteNumber(source.apparent_temperature),
    relativeHumidityPercent: finiteNumber(source.relative_humidity_2m),
    precipitationMm: finiteNumber(source.precipitation),
    precipitationProbabilityPercent: finiteNumber(precipitationProbabilityPercent),
    weatherCode: finiteNumber(source.weather_code),
    cloudCoverPercent: finiteNumber(source.cloud_cover),
    windSpeedKmh: finiteNumber(source.wind_speed_10m),
    windDirectionDegrees: finiteNumber(source.wind_direction_10m),
    windGustKmh: finiteNumber(source.wind_gusts_10m),
  };
}

function parseResponse(response: OpenMeteoResponse, fetchedAtMs: number): WeatherForecast {
  const current = response.current;
  const hourly = response.hourly;
  const daily = response.daily;
  if (!current || !hourly?.time?.length || !daily?.time?.length) {
    throw new WeatherRequestError('The weather service returned incomplete forecast data.');
  }

  const apiNowMs = current.time ? parseLocalTimestamp(current.time) : null;
  const nowMs = apiNowMs ?? fetchedAtMs;
  const hourlyRows = hourly.time
    .map((time, index): HourlyWeather | null => {
      const timestampMs = parseLocalTimestamp(time);
      if (timestampMs === null) return null;
      const row: HourlyWeather = {
        timestampMs,
        temperatureC: finiteNumber(at(hourly.temperature_2m, index)),
        apparentTemperatureC: finiteNumber(at(hourly.apparent_temperature, index)),
        precipitationMm: finiteNumber(at(hourly.precipitation, index)),
        precipitationProbabilityPercent: finiteNumber(at(hourly.precipitation_probability, index)),
        weatherCode: finiteNumber(at(hourly.weather_code, index)),
        relativeHumidityPercent: null,
        cloudCoverPercent: null,
        windSpeedKmh: finiteNumber(at(hourly.wind_speed_10m, index)),
        windDirectionDegrees: finiteNumber(at(hourly.wind_direction_10m, index)),
        windGustKmh: finiteNumber(at(hourly.wind_gusts_10m, index)),
      };
      return row;
    })
    .filter((row): row is HourlyWeather => row !== null);
  const nextHourIndex = hourlyRows.findIndex((row) => row.timestampMs >= nowMs);
  const next24Hours = hourlyRows.slice(Math.max(0, nextHourIndex), Math.max(0, nextHourIndex) + 24);

  const currentTimeMs = current.time ? parseLocalTimestamp(current.time) : null;
  const nearestHour = currentTimeMs === null
    ? 0
    : hourlyRows.reduce((nearest, row, index, rows) =>
        Math.abs(row.timestampMs - currentTimeMs) < Math.abs(rows[nearest].timestampMs - currentTimeMs)
          ? index
          : nearest,
      0);
  const nearestSourceIndex = hourly.time.findIndex((time) => {
    const parsed = parseLocalTimestamp(time);
    return parsed !== null && hourlyRows[nearestHour]?.timestampMs === parsed;
  });

  const parsedDaily = daily.time.slice(0, 7).map((date, index): DailyWeather => ({
    date,
    weatherCode: finiteNumber(at(daily.weather_code, index)),
    temperatureMaxC: finiteNumber(at(daily.temperature_2m_max, index)),
    temperatureMinC: finiteNumber(at(daily.temperature_2m_min, index)),
    precipitationProbabilityPercent: finiteNumber(at(daily.precipitation_probability_max, index)),
    precipitationMm: finiteNumber(at(daily.precipitation_sum, index)),
  }));

  return {
    fetchedAtMs,
    current: toConditions(current, at(hourly.precipitation_probability, Math.max(0, nearestSourceIndex))),
    hourly: next24Hours,
    daily: parsedDaily,
  };
}

function isWeatherForecast(value: unknown): value is WeatherForecast {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<WeatherForecast>;
  return (
    typeof candidate.fetchedAtMs === 'number' &&
    typeof candidate.current === 'object' && candidate.current !== null &&
    Array.isArray(candidate.hourly) && Array.isArray(candidate.daily)
  );
}

async function readCachedForecast(): Promise<WeatherForecast | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null ||
      !('version' in parsed) || parsed.version !== CACHE_VERSION ||
      !('forecast' in parsed) || !isWeatherForecast(parsed.forecast)
    ) return null;
    return parsed.forecast;
  } catch {
    return null;
  }
}

async function requestForecast(): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: String(WEATHER_LATITUDE),
    longitude: String(WEATHER_LONGITUDE),
    timezone: WEATHER_TIME_ZONE,
    forecast_days: '7',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'precipitation',
      'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation',
      'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_probability_max', 'precipitation_sum',
    ].join(','),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new WeatherRequestError(`Weather API error (${response.status}).`);
    const body = (await response.json()) as OpenMeteoResponse;
    if (body.error) throw new WeatherRequestError(`Weather API error: ${body.reason ?? 'request rejected'}.`);
    return parseResponse(body, Date.now());
  } catch (error) {
    if (error instanceof WeatherRequestError) throw error;
    throw new WeatherRequestError(
      error instanceof Error && error.name === 'AbortError'
        ? 'Weather request timed out.'
        : 'Offline or unable to connect to the weather service.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetches fresh model data, deduplicates concurrent requests, and falls back to cached data. */
export async function loadWeatherForecast(forceRefresh = false): Promise<WeatherLoadResult> {
  if (!forceRefresh && memoryForecast && Date.now() - memoryForecast.fetchedAtMs < CACHE_TTL_MS) {
    return { forecast: memoryForecast, source: 'memory' };
  }

  try {
    const forecast = await (inFlightRequest ??= requestForecast());
    memoryForecast = forecast;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, forecast })).catch(() => {});
    return { forecast, source: 'network' };
  } catch (error) {
    const cached = memoryForecast ?? await readCachedForecast();
    if (cached) {
      memoryForecast = cached;
      return {
        forecast: cached,
        source: 'cache',
        staleReason: error instanceof Error ? error.message : 'Weather update failed.',
      };
    }
    throw error;
  } finally {
    inFlightRequest = null;
  }
}
