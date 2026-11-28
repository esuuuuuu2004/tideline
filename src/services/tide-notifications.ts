import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { buildFieldForecastSummary, type PredictedTideExtremum } from '@/lib/field-flood-model';
import { loadMarineTideForecast } from '@/services/marine-tides';

export type TideNoticeMinutes = 15 | 30 | 60;

export interface TideNotificationPreferences {
  enabled: boolean;
  highTide: boolean;
  lowTide: boolean;
  advanceMinutes: TideNoticeMinutes;
}

export const DEFAULT_TIDE_NOTIFICATION_PREFERENCES: TideNotificationPreferences = {
  enabled: false,
  highTide: true,
  lowTide: true,
  advanceMinutes: 30,
};

export type TideNotificationAvailability = 'granted' | 'denied' | 'unavailable' | 'error';

const SOURCE_KEY = 'tidelineTideAlert';
const CHANNEL_ID = 'tide-alerts';
const MAX_PENDING_NOTIFICATIONS = 60;

let presentationHandlerConfigured = false;
let syncQueue: Promise<void> = Promise.resolve();

function isSupportedPlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Tide alerts',
    description: 'Reminders before predicted high and low tides',
    importance: AndroidImportance.DEFAULT,
  });
}

export async function requestTideNotificationPermission(): Promise<TideNotificationAvailability> {
  if (!isSupportedPlatform()) return 'unavailable';

  try {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.status === 'denied') return 'denied';

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function getTideNotificationAvailability(): Promise<TideNotificationAvailability> {
  if (!isSupportedPlatform()) return 'unavailable';
  try {
    const permission = await Notifications.getPermissionsAsync();
    return permission.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

interface DesiredTideAlert {
  eventKey: string;
  event: PredictedTideExtremum;
  fireAtMs: number;
}

function getEventKey(event: PredictedTideExtremum, advanceMinutes: TideNoticeMinutes): string {
  return `${event.kind}:${event.timestampMs}:${advanceMinutes}`;
}

function isManagedRequest(request: Notifications.NotificationRequest): boolean {
  return request.content.data?.[SOURCE_KEY] === true;
}

function getManagedEventKey(request: Notifications.NotificationRequest): string | null {
  const eventKey = request.content.data?.eventKey;
  return typeof eventKey === 'string' ? eventKey : null;
}

async function syncTideNotificationsNow(
  preferences: TideNotificationPreferences,
): Promise<TideNotificationAvailability> {
  if (!isSupportedPlatform()) return 'unavailable';

  try {
    if (!presentationHandlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      presentationHandlerConfigured = true;
    }

    await ensureAndroidChannel();
    let scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const managed = scheduled.filter(isManagedRequest);
    const wantsAlerts = preferences.enabled && (preferences.highTide || preferences.lowTide);

    if (!wantsAlerts) {
      await Promise.all(
        managed.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
      );
      return 'granted';
    }

    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      await Promise.all(
        managed.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
      );
      return 'denied';
    }

    const now = Date.now();
    const loadedForecast = await loadMarineTideForecast();
    const fieldForecast = buildFieldForecastSummary(loadedForecast.forecast, now);
    const desired: DesiredTideAlert[] = fieldForecast.daily
      .flatMap((day) => day.extrema)
      .filter((event) => (event.kind === 'high' ? preferences.highTide : preferences.lowTide))
      .map((event) => ({
        event,
        eventKey: getEventKey(event, preferences.advanceMinutes),
        fireAtMs: event.timestampMs - preferences.advanceMinutes * 60_000,
      }))
      .filter((alert) => alert.fireAtMs > now)
      .sort((a, b) => a.fireAtMs - b.fireAtMs)
      .slice(0, MAX_PENDING_NOTIFICATIONS);

    const desiredKeys = new Set(desired.map((alert) => alert.eventKey));
    const retainedByKey = new Map<string, Notifications.NotificationRequest>();
    const cancelIds = new Set<string>();
    for (const request of managed) {
      const key = getManagedEventKey(request);
      if (!key || !desiredKeys.has(key) || retainedByKey.has(key)) {
        cancelIds.add(request.identifier);
      } else {
        retainedByKey.set(key, request);
      }
    }

    if (cancelIds.size > 0) {
      await Promise.all(
        [...cancelIds].map((identifier) =>
          Notifications.cancelScheduledNotificationAsync(identifier),
        ),
      );
    }

    scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const activeManagedKeys = new Set(
      scheduled.filter(isManagedRequest).map(getManagedEventKey).filter((key): key is string => key !== null),
    );
    const nonManagedCount = scheduled.filter((request) => !isManagedRequest(request)).length;
    let availableSlots = Math.max(
      0,
      MAX_PENDING_NOTIFICATIONS - nonManagedCount - activeManagedKeys.size,
    );

    for (const alert of desired) {
      if (activeManagedKeys.has(alert.eventKey) || availableSlots <= 0) continue;

      const isHigh = alert.event.kind === 'high';
      const kind = isHigh ? 'high' : 'low';
      const lead = preferences.advanceMinutes;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Predicted ${kind} tide approaching`,
          body: `A ${kind} tide is predicted in ${lead} minutes. Times use PHT (UTC+8); local conditions may differ.`,
          data: {
            [SOURCE_KEY]: true,
            eventKey: alert.eventKey,
            eventTimestampMs: alert.event.timestampMs,
            kind,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(alert.fireAtMs),
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      });
      activeManagedKeys.add(alert.eventKey);
      availableSlots -= 1;
    }

    return 'granted';
  } catch {
    return 'error';
  }
}

/** Reconciles only TIDELINE-owned alerts, leaving other app notifications untouched. */
export function syncTideNotifications(
  preferences: TideNotificationPreferences,
): Promise<TideNotificationAvailability> {
  const next = syncQueue.then(() => syncTideNotificationsNow(preferences));
  syncQueue = next.then(() => undefined, () => undefined);
  return next;
}
