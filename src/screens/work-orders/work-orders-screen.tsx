import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ProtectedContent } from '@/components/protected-content';
import { ThemedText } from '@/components/themed-text';
import { Section } from '@/components/ui/section';
import { ScreenScrollView } from '@/components/ui/screen-scroll-view';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-views';
import { WorkOrderRow } from '@/components/work-order-row';
import { Radius, Spacing } from '@/constants/theme';
import { useSession } from '@/contexts/session-context';
import { useResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import type { WorkOrderStatus } from '@/types/api';
import { STATUS_META } from '@/utils/format';

type Filter = 'all' | WorkOrderStatus;
const FILTERS: Filter[] = ['all', 'open', 'in_progress', 'on_hold', 'completed'];

export default function WorkOrdersScreen() {
  const { manager } = useSession();
  const orders = useResource(() => manager.api.workOrders.list());
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(
    () => (orders.data ?? []).filter((o) => filter === 'all' || o.status === filter),
    [orders.data, filter],
  );

  return (
    <ScreenScrollView refreshing={orders.refreshing} onRefresh={() => void orders.reload()}>
      <ProtectedContent>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => (
            <FilterChip
              key={f}
              label={f === 'all' ? `All ${orders.data ? `(${orders.data.length})` : ''}`.trim() : STATUS_META[f].label}
              selected={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </ScrollView>

        {orders.loading ? (
          <LoadingState label="Loading work orders…" />
        ) : orders.error && !orders.data ? (
          <ErrorState message={orders.error} onRetry={() => void orders.reload()} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={filter === 'all' ? 'No work orders' : `No ${STATUS_META[filter].label.toLowerCase()} work orders`}
            message="Work orders assigned to you will appear here."
          />
        ) : (
          <Section>
            {visible.map((order) => (
              <WorkOrderRow key={order.id} order={order} />
            ))}
          </Section>
        )}
      </ProtectedContent>
    </ScreenScrollView>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.tint : theme.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.onTint : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: {
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
    minHeight: 36,
    justifyContent: 'center',
  },
});
