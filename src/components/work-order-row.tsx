import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing, toneColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WorkOrder } from '@/types/api';
import { formatDateTime, PRIORITY_META, STATUS_META } from '@/utils/format';

/** Work order list row: priority rail, title, customer, schedule, status. */
export function WorkOrderRow({ order }: { order: WorkOrder }) {
  const theme = useTheme();
  const priority = PRIORITY_META[order.priority];
  const status = STATUS_META[order.status];
  const rail = toneColors(theme, priority.tone).fg;

  return (
    <Link href={{ pathname: '/work-orders/[id]', params: { id: order.id } }} asChild>
      <Pressable
        testID={`work-order-${order.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${order.title}. ${order.customerName}. Priority ${priority.label}. Status ${status.label}.`}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.rail, { backgroundColor: rail }]} />
        <View style={styles.body}>
          <View style={styles.header}>
            <ThemedText type="caption" themeColor="textSecondary">
              {order.id.toUpperCase()} · {formatDateTime(order.scheduledFor)}
            </ThemedText>
          </View>
          <ThemedText type="headline" numberOfLines={2}>
            {order.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.regular}>
            {order.customerName} · {order.address}
          </ThemedText>
          <View style={styles.badges}>
            <StatusBadge label={status.label} tone={status.tone} />
            <StatusBadge label={priority.label} tone={priority.tone} dot={false} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.twoHalf,
    paddingVertical: Spacing.twoHalf,
    paddingRight: Spacing.three,
    paddingLeft: Spacing.twoHalf,
  },
  rail: {
    width: 4,
    borderRadius: 2,
  },
  body: {
    flex: 1,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  regular: {
    fontWeight: 400,
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
