import { StyleSheet, View } from 'react-native';

import { Screen, SectionHeader, Surface, TideText } from '@/components/ui';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Spacing } from '@/constants/theme';
import { STATION } from '@/lib/tides';
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
  } = usePreferences();

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
            Predictions use an astronomical 7-constituent harmonic model (M2, S2,
            N2, K1, O1, P1, M4) calibrated for mixed semidiurnal Zamboanga Strait
            tides. Consult official NAMRIA tables for critical navigation.
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
