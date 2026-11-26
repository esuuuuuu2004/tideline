import * as Haptics from 'expo-haptics';
import { NativeTabs } from 'expo-router/native-tabs';

import { useTideTheme } from '@/theme/use-tide-theme';

export default function TabLayout() {
  const { colors } = useTideTheme();
  console.log('[DIAG] TabLayout render');

  return (
    <NativeTabs
      backgroundColor={colors.surface}
      tintColor={colors.accent}
      iconColor={colors.textSecondary}
      labelStyle={{ selected: { color: colors.text } }}
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync().catch(() => {});
        },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Now</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'water.waves', selected: 'water.waves' }}
          md={{ default: 'waves', selected: 'waves' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="forecast">
        <NativeTabs.Trigger.Label>Forecast</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.xyaxis.line', selected: 'chart.xyaxis.line' }}
          md={{ default: 'show_chart', selected: 'show_chart' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md={{ default: 'settings', selected: 'settings' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}