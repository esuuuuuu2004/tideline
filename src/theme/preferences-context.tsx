/**
 * Persistent user preferences backed by @react-native-async-storage/async-storage.
 * Defaults for Taluksangay, Zamboanga City: meters (m), 12-hour PHT, dark theme.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ColorScheme } from '@/constants/theme';
import type { TimeFormat, TideUnit } from '@/lib/tides';

const STORAGE_KEYS = {
  unit: 'tideline.unit',
  timeFormat: 'tideline.timeFormat',
  scheme: 'tideline.scheme',
} as const;

interface PreferencesContextValue {
  ready: boolean;
  unit: TideUnit;
  timeFormat: TimeFormat;
  scheme: ColorScheme;
  setUnit: (unit: TideUnit) => void;
  setTimeFormat: (format: TimeFormat) => void;
  setScheme: (scheme: ColorScheme) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unit, setUnitState] = useState<TideUnit>('m');
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>('12h');
  const [scheme, setSchemeState] = useState<ColorScheme>('dark');

  console.log('[DIAG] PreferencesProvider render:', { ready, unit, timeFormat, scheme });

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        const [savedUnit, savedTime, savedScheme] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.unit),
          AsyncStorage.getItem(STORAGE_KEYS.timeFormat),
          AsyncStorage.getItem(STORAGE_KEYS.scheme),
        ]);
        if (!active) return;
        if (savedUnit === 'm' || savedUnit === 'ft') setUnitState(savedUnit);
        if (savedTime === '12h' || savedTime === '24h') setTimeFormatState(savedTime);
        if (savedScheme === 'dark' || savedScheme === 'light') setSchemeState(savedScheme);
      } catch (err) {
        console.error('[DIAG] PreferencesProvider storage read error:', err);
      } finally {
        if (active) {
          clearTimeout(timeoutId);
          console.log('[DIAG] PreferencesProvider load complete, setting ready=true');
          setReady(true);
        }
      }
    }

    timeoutId = setTimeout(() => {
      if (active) {
        console.log('[DIAG] PreferencesProvider timeout fallback, setting ready=true');
        setReady(true);
      }
    }, 2000);

    load();
    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const setUnit = useCallback((next: TideUnit) => {
    setUnitState(next);
    AsyncStorage.setItem(STORAGE_KEYS.unit, next).catch(() => {});
  }, []);

  const setTimeFormat = useCallback((next: TimeFormat) => {
    setTimeFormatState(next);
    AsyncStorage.setItem(STORAGE_KEYS.timeFormat, next).catch(() => {});
  }, []);

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    AsyncStorage.setItem(STORAGE_KEYS.scheme, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      ready,
      unit,
      timeFormat,
      scheme,
      setUnit,
      setTimeFormat,
      setScheme,
    }),
    [ready, unit, timeFormat, scheme, setUnit, setTimeFormat, setScheme],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
