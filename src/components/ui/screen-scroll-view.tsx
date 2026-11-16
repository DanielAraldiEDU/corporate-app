import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ScreenScrollViewProps = Omit<ScrollViewProps, 'refreshControl'> & {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * Standard screen container: grouped background, native header insets, consistent edge
 * padding, and a max content width for tablets.
 */
export function ScreenScrollView({ children, refreshing = false, onRefresh, contentContainerStyle, ...props }: ScreenScrollViewProps) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.backgroundGrouped }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      {...props}>
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
});
