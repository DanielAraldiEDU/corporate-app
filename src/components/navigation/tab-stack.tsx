import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { useTheme } from '@/hooks/use-theme';

/** Shared native stack styling for each tab: large titles on iOS, themed header text. */
export function TabStack({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerStyle: { backgroundColor: theme.backgroundGrouped },
        headerLargeStyle: { backgroundColor: theme.backgroundGrouped },
        headerTitleStyle: { color: theme.text },
        headerTintColor: theme.tint,
        headerBackButtonDisplayMode: 'minimal',
      }}>
      {children}
    </Stack>
  );
}
