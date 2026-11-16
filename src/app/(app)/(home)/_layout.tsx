import { Stack } from 'expo-router';

import { TabStack } from '@/components/navigation/tab-stack';

export default function HomeLayout() {
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ title: 'Dashboard' }} />
    </TabStack>
  );
}
