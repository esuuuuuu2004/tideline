import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { PressableScale, Screen, SectionHeader, Surface, TideText } from '@/components/ui';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Radius, Spacing } from '@/constants/theme';
import { STATION } from '@/lib/tides';
import {
  getTideNotificationAvailability,
  requestTideNotificationPermission,
  syncTideNotifications,
  type TideNotificationAvailability,
  type TideNoticeMinutes,
} from '@/services/tide-notifications';
import { usePreferences } from '@/theme/preferences-context';
import { useTideTheme } from '@/theme/use-tide-theme';

export default function SettingsScreen() {
  const { colors } = useTideTheme();
  const {
    unit,
    setUnit,
    timeFormat,
    setTimeFormat,
    scheme,
    setScheme,
    tideNotifications,
    setTideNotifications,
  } = usePreferences();
  const [notificationAvailability, setNotificationAvailability] =
    useState<TideNotificationAvailability | 'idle'>('idle');
  const [requestingPermission, setRequestingPermission] = useState(false);

  useEffect(() => {
    if (!tideNotifications.enabled) return;
    let active = true;
    void getTideNotificationAvailability().then((availability) => {
      if (active) setNotificationAvailability(availability);
    });
    return () => {
      active = false;
    };
  }, [tideNotifications.enabled]);

  const updateTideNotifications = async (
    patch: Partial<typeof tideNotifications>,
  ) => {
    const next = { ...tideNotifications, ...patch };
    const turningOn =
      (next.enabled && !tideNotifications.enabled) ||
      (next.enabled && next.highTide && !tideNotifications.highTide) ||
      (next.enabled && next.lowTide && !tideNotifications.lowTide);

    if (turningOn && (next.highTide || next.lowTide)) {
      setRequestingPermission(true);
      const availability = await requestTideNotificationPermission();
      setRequestingPermission(false);
      setNotificationAvailability(availability);
      if (availability !== 'granted') return;
    } else {
      setNotificationAvailability('idle');
    }

    setTideNotifications(next);
    void syncTideNotifications(next).then((availability) => {
      if (availability !== 'granted') setNotificationAvailability(availability);
    });
  };

  return (
    <Screen
      title="Settings"
      subtitle="Station, units, and display">
      <View style={styles.section}>
        <SectionHeader title="Measurement" />
        <Surface style={styles.card}>
          <View style={styles.controlBlock}>
            <TideText token="label" color="text">
              Tide height unit
            </TideText>
            <SegmentedControl
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'm', label: 'Meters (m)' },
                { value: 'ft', label: 'Feet (ft)' },
              ]}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.controlBlock}>
            <TideText token="label" color="text">
              Time format
            </TideText>
            <SegmentedControl
              value={timeFormat}
              onChange={setTimeFormat}
              options={[
                { value: '12h', label: '12-hour' },
                { value: '24h', label: '24-hour' },
              ]}
            />
          </View>
        </Surface>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Tide notifications" />
        <Surface style={styles.card}>
          <View style={styles.notificationRow}>
            <View style={styles.notificationCopy}>
              <TideText token="label" color="text">Tide alerts</TideText>
              <TideText token="caption" color="textSecondary">
                Local reminders before predicted high and low tides
              </TideText>
            </View>
            <Switch
              value={tideNotifications.enabled}
              disabled={requestingPermission}
              onValueChange={(enabled) => void updateTideNotifications({ enabled })}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={tideNotifications.enabled ? colors.accent : colors.textSecondary}
              accessibilityLabel="Enable tide notifications"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationCopy}>
              <TideText token="body" color="text">High tide</TideText>
            </View>
            <Switch
              value={tideNotifications.highTide}
              disabled={!tideNotifications.enabled || requestingPermission}
              onValueChange={(highTide) => void updateTideNotifications({ highTide })}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={tideNotifications.highTide ? colors.accent : colors.textSecondary}
              accessibilityLabel="High tide notifications"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationCopy}>
              <TideText token="body" color="text">Low tide</TideText>
            </View>
            <Switch
              value={tideNotifications.lowTide}
              disabled={!tideNotifications.enabled || requestingPermission}
              onValueChange={(lowTide) => void updateTideNotifications({ lowTide })}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={tideNotifications.lowTide ? colors.accent : colors.textSecondary}
              accessibilityLabel="Low tide notifications"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.advanceBlock}>
            <TideText token="body" color="text">Notify me before</TideText>
            <View style={styles.advanceChoices}>
              {([15, 30, 60] as const).map((minutes: TideNoticeMinutes) => {
                const selected = tideNotifications.advanceMinutes === minutes;
                return (
                  <PressableScale
                    key={minutes}
                    onPress={() => void updateTideNotifications({ advanceMinutes: minutes })}
                    disabled={requestingPermission}
                    accessibilityRole="button"
                    accessibilityLabel={`${minutes} minutes before tide`}
                    contentStyle={[
                      styles.advanceChoice,
                      {
                        backgroundColor: selected ? colors.surfaceRaised : colors.surface,
                        borderColor: selected ? colors.accent : colors.border,
                        borderRadius: Radius.sm,
                      },
                    ]}>
                    <TideText token="label" color={selected ? 'accent' : 'textSecondary'}>
                      {minutes} min
                    </TideText>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          {notificationAvailability === 'denied' && (
            <TideText token="caption" color="warning">
              Notifications are blocked by device permission settings. Allow them for TIDELINE in system settings to receive tide alerts.
            </TideText>
          )}
          {notificationAvailability === 'unavailable' && (
            <TideText token="caption" color="warning">
              Local notifications are unavailable on this platform.
            </TideText>
          )}
          {notificationAvailability === 'error' && (
            <TideText token="caption" color="warning">
              Tide reminders could not be scheduled. Check notification permissions and try again.
            </TideText>
          )}
          <TideText token="caption" color="textSecondary">
            Alerts use unvalidated tide predictions; actual tide times and levels may differ.
          </TideText>
        </Surface>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Appearance" />
        <Surface style={styles.card}>
          <View style={styles.controlBlock}>
            <TideText token="label" color="text">
              Color scheme
            </TideText>
            <SegmentedControl
              value={scheme}
              onChange={setScheme}
              options={[
                { value: 'dark', label: 'Deep ocean' },
                { value: 'light', label: 'Daylight' },
              ]}
            />
          </View>
        </Surface>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Station" />
        <Surface style={styles.card}>
          <View style={styles.metaRow}>
            <TideText token="body" color="textSecondary">
              Location
            </TideText>
            <TideText token="body" weight="600" color="text">
              {STATION.name}, {STATION.city}
            </TideText>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.metaRow}>
            <TideText token="body" color="textSecondary">
              Waters
            </TideText>
            <TideText token="body" color="text">
              {STATION.waters}
            </TideText>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.metaRow}>
            <TideText token="body" color="textSecondary">
              Coordinates
            </TideText>
            <TideText token="body" role="data" color="text">
              {STATION.coordsLabel}
            </TideText>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.metaRow}>
            <TideText token="body" color="textSecondary">
              Timezone & datum
            </TideText>
            <TideText token="body" role="data" color="text">
              {STATION.timezone} · {STATION.datum}
            </TideText>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <TideText token="caption" color="textSecondary">
            Heights and turning times are unvalidated model predictions, not
            gauge observations. The seven constituent amplitudes and phases are
            provisional and undocumented. MLLW is only the intended datum; the
            0.78 m offset is unverified. The displayed rate is predicted water
            level change, not current speed. This model has not been validated
            against NAMRIA or TPXO data and is not for navigation.
          </TideText>
        </Surface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.sm + 4,
  },
  card: {
    gap: Spacing.md,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  notificationCopy: {
    flex: 1,
    gap: 2,
  },
  advanceBlock: {
    gap: Spacing.sm,
  },
  advanceChoices: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  advanceChoice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderWidth: 1,
  },
  controlBlock: {
    gap: Spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
});
