import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { Icon, type IconProps } from './icon';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.container} accessibilityLabel={label} accessibilityRole="progressbar">
      <ActivityIndicator color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon = { ios: 'tray', android: 'inventory_2' },
  children,
}: {
  title: string;
  message?: string;
  icon?: Pick<IconProps, 'ios' | 'android'>;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Icon {...icon} size={36} color={theme.textTertiary} />
      <ThemedText type="headline" style={styles.center}>
        {title}
      </ThemedText>
      {message ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {message}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState title="Couldn’t load data" message={message} icon={{ ios: 'exclamationmark.icloud', android: 'cloud_off' }}>
      {onRetry ? <Button title="Try again" variant="secondary" size="sm" onPress={onRetry} /> : null}
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  center: {
    textAlign: 'center',
  },
});
