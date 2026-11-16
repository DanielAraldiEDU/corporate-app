import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

function variantColors(theme: Theme, variant: Variant) {
  switch (variant) {
    case 'primary':
      return { bg: theme.tint, fg: theme.onTint };
    case 'secondary':
      return { bg: theme.backgroundElement, fg: theme.text };
    case 'ghost':
      return { bg: 'transparent', fg: theme.tint };
    case 'destructive':
      return { bg: theme.dangerSoft, fg: theme.danger };
  }
}

const sizes = {
  sm: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.twoHalf, minHeight: 36 },
  md: { paddingVertical: Spacing.twoHalf, paddingHorizontal: Spacing.three, minHeight: MinTouchTarget },
  lg: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, minHeight: 52 },
} as const;

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  /** Leading icon element, e.g. <Icon …/>. */
  icon?: ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const colors = variantColors(theme, variant);
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        sizes[size],
        { backgroundColor: colors.bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <View style={styles.content}>
          {icon}
          <ThemedText type={size === 'sm' ? 'smallBold' : 'headline'} style={{ color: colors.fg }}>
            {title}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
