import { Stack } from 'expo-router';

import { TabStack } from '@/components/navigation/tab-stack';

export default function SettingsLayout() {
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ title: 'Settings & Admin' }} />
    </TabStack>
  );
}
