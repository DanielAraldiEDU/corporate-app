import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProtectedContent } from '@/components/protected-content';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Row, Section } from '@/components/ui/section';
import { ScreenScrollView } from '@/components/ui/screen-scroll-view';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-views';
import { StatusBadge } from '@/components/ui/status-badge';
import { WorkOrderRow } from '@/components/work-order-row';
import { Radius, Spacing, toneColors } from '@/constants/theme';
import { useSession } from '@/contexts/session-context';
import { useResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import type { WorkOrder, WorkOrderStatus } from '@/types/api';
import { COMPLIANCE_META, firstName, formatRelativeTime, greeting, PRIORITY_META, STATUS_META } from '@/utils/format';

const SUMMARY_ORDER: WorkOrderStatus[] = ['open', 'in_progress', 'on_hold', 'completed'];

export default function DashboardScreen() {
  const theme = useTheme();
  const { manager, state, compliance } = useSession();
  const orders = useResource(() => manager.api.workOrders.list());
  const meta = COMPLIANCE_META[compliance.state];

  const counts = useMemo(() => {
    const result: Record<WorkOrderStatus, number> = { open: 0, in_progress: 0, on_hold: 0, completed: 0 };
    for (const o of orders.data ?? []) result[o.status] += 1;
    return result;
  }, [orders.data]);

  const upNext = useMemo(
    () =>
      (orders.data ?? [])
        .filter((o) => o.status !== 'completed')
        .sort(byUrgency)
        .slice(0, 3),
    [orders.data],
  );

  return (
    <ScreenScrollView
      refreshing={orders.refreshing}
      onRefresh={() => {
        void manager.sync('manual').catch(() => undefined);
        void orders.reload();
      }}>
      <View style={styles.greeting}>
        <ThemedText type="subtitle">
          {greeting()}, {firstName(state.user?.name)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[state.user?.role, state.user?.region, state.user?.employeeNumber].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>

      <Section title="Device security">
        <Row
          testID="dashboard-security-row"
          icon={<Icon ios="checkmark.shield" android="verified_user" color={toneColors(theme, meta.tone).fg} />}
          title={state.device?.deviceName ?? 'This device'}
          subtitle={`Policy ${state.policy?.name ?? '—'} v${state.policy?.policyVersion ?? '—'} · checked ${formatRelativeTime(state.lastSyncAt)}`}
          trailing={<StatusBadge label={meta.label} tone={meta.tone} />}
          onPress={() => router.navigate('/security')}
          accessibilityHint="Opens Device Security Status"
        />
      </Section>

      <ProtectedContent>
        {orders.loading ? (
          <LoadingState label="Loading work orders…" />
        ) : orders.error && !orders.data ? (
          <ErrorState message={orders.error} onRetry={() => void orders.reload()} />
        ) : (
          <>
            <View style={styles.tiles} accessibilityLabel="Work order summary">
              {SUMMARY_ORDER.map((status) => (
                <StatusTile key={status} status={status} count={counts[status]} />
              ))}
            </View>

            <Section title="Up next">
              {upNext.length === 0 ? (
                <EmptyState
                  title="All caught up"
                  message="No open work orders are assigned to you."
                  icon={{ ios: 'checkmark.circle', android: 'check_circle' }}
                />
              ) : (
                upNext.map((order) => <WorkOrderRow key={order.id} order={order} />)
              )}
              <Row title="View all work orders" onPress={() => router.navigate('/work-orders')} />
            </Section>
          </>
        )}
      </ProtectedContent>
    </ScreenScrollView>
  );
}

function StatusTile({ status, count }: { status: WorkOrderStatus; count: number }) {
  const theme = useTheme();
  const meta = STATUS_META[status];
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.surface }]}
      accessible
      accessibilityLabel={`${count} ${meta.label}`}>
      <ThemedText type="metric">{count}</ThemedText>
      <View style={styles.tileLabel}>
        <View style={[styles.dot, { backgroundColor: toneColors(theme, meta.tone).fg }]} />
        <ThemedText type="caption" themeColor="textSecondary">
          {meta.label}
        </ThemedText>
      </View>
    </View>
  );
}

function byUrgency(a: WorkOrder, b: WorkOrder) {
  const p = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
  if (p !== 0) return p;
  return (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? '');
}

const styles = StyleSheet.create({
  greeting: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.twoHalf,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    gap: Spacing.one,
  },
  tileLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
