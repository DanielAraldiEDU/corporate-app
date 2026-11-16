import { NativeTabs } from 'expo-router/native-tabs';

import { useSession } from '@/contexts/session-context';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabsLayout() {
  const theme = useTheme();
  const { compliance } = useSession();

  return (
    <NativeTabs tintColor={theme.tint}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="work-orders">
        <NativeTabs.Trigger.Icon sf={{ default: 'list.clipboard', selected: 'list.clipboard.fill' }} md="assignment" />
        <NativeTabs.Trigger.Label>Work Orders</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="security">
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.shield', selected: 'checkmark.shield.fill' }} md="verified_user" />
        <NativeTabs.Trigger.Label>Security</NativeTabs.Trigger.Label>
        {!compliance.allowed ? <NativeTabs.Trigger.Badge>!</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
