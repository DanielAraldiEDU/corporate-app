import { Stack } from 'expo-router';

import { TabStack } from '@/components/navigation/tab-stack';

export default function SecurityLayout() {
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ title: 'Device Security Status' }} />
    </TabStack>
  );
}
