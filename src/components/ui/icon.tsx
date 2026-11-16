import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

type IconName = Extract<SymbolViewProps['name'], { ios?: unknown }>;

export type IconProps = {
  /** SF Symbol (iOS) */
  ios: NonNullable<IconName['ios']>;
  /** Material Symbol (Android / web) */
  android: NonNullable<IconName['android']>;
  size?: number;
  color: ColorValue;
  style?: StyleProp<ViewStyle>;
};

/** Platform-native iconography: SF Symbols on iOS, Material Symbols on Android. */
export function Icon({ ios, android, size = 20, color, style }: IconProps) {
  return (
    <SymbolView
      name={{ ios, android, web: android }}
      size={size}
      tintColor={color}
      style={[{ width: size, height: size }, style]}
    />
  );
}
