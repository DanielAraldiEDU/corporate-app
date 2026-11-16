import { Stack } from 'expo-router';

import { TabStack } from '@/components/navigation/tab-stack';

export default function WorkOrdersLayout() {
  return (
    <TabStack>
      <Stack.Screen name="index" options={{ title: 'Work Orders' }} />
      <Stack.Screen name="[id]" options={{ title: 'Work Order', headerLargeTitleEnabled: false }} />
    </TabStack>
  );
}
