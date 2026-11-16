import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, toneColors, type Tone } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconProps } from './icon';

const TONE_ICONS: Record<Tone, Pick<IconProps, 'ios' | 'android'>> = {
  danger: { ios: 'xmark.shield.fill', android: 'gpp_bad' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  success: { ios: 'checkmark.shield.fill', android: 'gpp_good' },
  info: { ios: 'info.circle.fill', android: 'info' },
  neutral: { ios: 'info.circle', android: 'info' },
};

export type BannerProps = {
  tone: Tone;
  title: string;
  message?: string;
  /** Optional actions rendered under the message. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Inline security feedback: revocation reasons, policy notices, demo-only warnings. */
export function Banner({ tone, title, message, children, style, testID }: BannerProps) {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[styles.container, { backgroundColor: bg }, style]}>
      <Icon {...TONE_ICONS[tone]} color={fg} size={20} />
      <View style={styles.body}>
        <ThemedText type="smallBold" style={{ color: fg }}>
          {title}
        </ThemedText>
        {message ? (
          <ThemedText type="small" themeColor="text" style={styles.message}>
            {message}
          </ThemedText>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.twoHalf,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  body: {
    flex: 1,
    gap: Spacing.one,
  },
  message: {
    fontWeight: 400,
  },
});
