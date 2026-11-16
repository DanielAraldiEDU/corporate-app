import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './icon';

/**
 * Grouped inset list section (Settings-style). Children are separated by hairlines,
 * so rows are grouped by background rather than each being its own card.
 */
export function Section({
  title,
  footer,
  children,
  style,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <ThemedText type="overline" themeColor="textSecondary" style={styles.title} accessibilityRole="header">
          {title}
        </ThemedText>
      ) : null}
      <View style={[styles.group, { backgroundColor: theme.surface }]}>
        {items.map((child, index) => (
          <Fragment key={child.key ?? index}>
            {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.separator }]} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.footer}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

export type RowProps = {
  title: string;
  subtitle?: string;
  /** Leading icon element. */
  icon?: ReactNode;
  /** Trailing content: a value string or an element such as a StatusBadge. */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
};

/** Standard list row: leading icon, title/subtitle, trailing value, optional chevron. */
export function Row({ title, subtitle, icon, trailing, onPress, accessibilityHint, testID }: RowProps) {
  const theme = useTheme();
  const content = (
    <>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.text}>
        <ThemedText type="body">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {typeof trailing === 'string' ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.value}>
          {trailing}
        </ThemedText>
      ) : (
        trailing
      )}
      {onPress ? <Icon ios="chevron.right" android="chevron_right" size={14} color={theme.textTertiary} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={styles.row} accessible accessibilityLabel={rowLabel(title, subtitle, trailing)}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      {content}
    </Pressable>
  );
}

function rowLabel(title: string, subtitle?: string, trailing?: ReactNode) {
  return [title, subtitle, typeof trailing === 'string' ? trailing : undefined].filter(Boolean).join(', ');
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  title: {
    paddingHorizontal: Spacing.three,
  },
  group: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  footer: {
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
    minHeight: MinTouchTarget + Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
  },
  icon: {
    width: 28,
    alignItems: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  subtitle: {
    fontWeight: 400,
  },
  value: {
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '50%',
  },
});
