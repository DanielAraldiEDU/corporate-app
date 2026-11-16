import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  ref?: Ref<TextInputInstance>;
};

export function TextField({ label, error, style, onFocus, onBlur, ref, ...props }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.danger : focused ? theme.tint : theme.separator;

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.textTertiary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.surface, borderColor },
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {error ? (
        <ThemedText type="caption" themeColor="danger" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  input: {
    minHeight: MinTouchTarget,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.twoHalf,
    fontSize: 16,
  },
});
