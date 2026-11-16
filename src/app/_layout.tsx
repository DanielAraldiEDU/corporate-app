import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/contexts/session-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.tint,
      background: palette.backgroundGrouped,
      card: palette.surface,
      text: palette.text,
      border: palette.separator,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

/**
 * Route protection: the (app) group only exists while the session is authenticated.
 * When access is revoked the guard flips and Expo Router redirects to /sign-in;
 * deep links into protected routes are redirected the same way.
 */
function RootNavigator() {
  const { state } = useSession();
  const isAuthenticated = state.status === 'authenticated';
  const restoring = state.status === 'restoring';

  useEffect(() => {
    if (!restoring) void SplashScreen.hideAsync();
  }, [restoring]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
  );
}
