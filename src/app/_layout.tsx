import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppFonts } from '@/constants/fonts';
import { Colors } from '@/constants/theme';
import { PreferencesProvider, usePreferences } from '@/theme/preferences-context';
import { ThemeProvider } from '@/theme/theme-context';

SplashScreen.preventAutoHideAsync().catch(() => {});

function AppShell() {
  const { loaded, ready: fontsReady, error: fontError } = useAppFonts();
  const { ready: prefsReady, scheme } = usePreferences();
  const appReady = fontsReady && prefsReady;

  console.log('[DIAG] AppShell render:', { loaded, fontsReady, fontError, prefsReady, scheme, appReady });

  useEffect(() => {
    if (appReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  if (!appReady) {
    console.log('[DIAG] AppShell returning null - not ready');
    return null;
  }

  console.log('[DIAG] AppShell returning ThemeProvider');
  return (
    <ThemeProvider scheme={scheme} fontsLoaded={loaded}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  console.log('[DIAG] RootLayout render');
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors.dark.background }}>
      <PreferencesProvider>
        <AppShell />
      </PreferencesProvider>
    </GestureHandlerRootView>
  );
}
