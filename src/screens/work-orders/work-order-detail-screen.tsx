import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ProtectedContent } from '@/components/protected-content';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Row, Section } from '@/components/ui/section';
import { ScreenScrollView } from '@/components/ui/screen-scroll-view';
import { ErrorState, LoadingState } from '@/components/ui/state-views';
import { StatusBadge } from '@/components/ui/status-badge';
import { Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/contexts/session-context';
import { useResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, PRIORITY_META, STATUS_META } from '@/utils/format';

export default function WorkOrderDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { manager } = useSession();
  const order = useResource(() => manager.api.workOrders.get(id));
  const data = order.data;

  return (
    <>
      <Stack.Screen options={{ title: id?.toUpperCase() ?? 'Work order' }} />
      <ScreenScrollView refreshing={order.refreshing} onRefresh={() => void order.reload()}>
        <ProtectedContent>
          {order.loading ? (
            <LoadingState label="Loading work order…" />
          ) : !data ? (
            <ErrorState message={order.error ?? 'Work order not found.'} onRetry={() => void order.reload()} />
          ) : (
            <>
              <View style={[styles.header, { backgroundColor: theme.surface }]}>
                <View style={styles.badges}>
                  <StatusBadge label={STATUS_META[data.status].label} tone={STATUS_META[data.status].tone} />
                  <StatusBadge
                    label={`${PRIORITY_META[data.priority].label} priority`}
                    tone={PRIORITY_META[data.priority].tone}
                    dot={false}
                  />
                </View>
                <ThemedText type="subtitle" accessibilityRole="header">
                  {data.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Scheduled {formatDateTime(data.scheduledFor)}
                  {data.estimatedHours ? ` · est. ${data.estimatedHours} h` : ''}
                </ThemedText>
              </View>

              <Section title="Customer">
                <Row
                  icon={<Icon ios="building.2" android="badge" color={theme.textSecondary} />}
                  title={data.customerName}
                  subtitle={data.contactName ? `Contact: ${data.contactName}` : undefined}
                />
                {data.contactPhone ? (
                  <Row
                    icon={<Icon ios="phone" android="phone" color={theme.textSecondary} />}
                    title="Phone"
                    trailing={data.contactPhone}
                  />
                ) : null}
                <Row
                  icon={<Icon ios="mappin.and.ellipse" android="location_on" color={theme.textSecondary} />}
                  title="Site address"
                  subtitle={data.address}
                />
              </Section>

              <Section title="Description">
                <ThemedText type="body" style={styles.description} selectable>
                  {data.description}
                </ThemedText>
              </Section>

              <Section title="Details">
                <Row title="Work order" trailing={data.id.toUpperCase()} />
                {data.assetId ? <Row title="Asset" trailing={data.assetId} /> : null}
                <Row title="Status" trailing={STATUS_META[data.status].label} />
                <Row title="Priority" trailing={PRIORITY_META[data.priority].label} />
              </Section>
            </>
          )}
        </ProtectedContent>
      </ScreenScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  description: {
    padding: Spacing.three,
  },
});
