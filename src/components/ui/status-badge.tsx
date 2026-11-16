import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, toneColors, type Tone } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type StatusBadgeProps = {
  label: string;
  tone?: Tone;
  /** Shows a leading status dot (for status) — off for plain labels. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Compact pill for status indicators: Compliant, Managed, Access Revoked, Open, High… */
export function StatusBadge({ label, tone = 'neutral', dot = true, style }: StatusBadgeProps) {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <ThemedText type="caption" style={[styles.label, { color: fg }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontWeight: 600,
  },
});
