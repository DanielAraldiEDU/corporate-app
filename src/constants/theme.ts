/**
 * FieldOps design tokens — the single source of truth for color, spacing, radius, and type.
 * Colors are light/dark pairs read through `useTheme()`; components import tokens,
 * screens import components.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1220',
    textSecondary: '#5B6474',
    textTertiary: '#8A93A3',
    background: '#ffffff',
    backgroundGrouped: '#F2F4F8',
    surface: '#FFFFFF',
    backgroundElement: '#EEF0F4',
    backgroundSelected: '#E0E3EA',
    separator: '#E3E6EC',
    tint: '#1F4FD8',
    onTint: '#FFFFFF',
    success: '#167A3E',
    successSoft: '#E5F5EB',
    warning: '#A15C07',
    warningSoft: '#FDF2DF',
    danger: '#C42B2B',
    dangerSoft: '#FCEBEB',
    info: '#1F4FD8',
    infoSoft: '#E8EEFD',
  },
  dark: {
    text: '#F3F5F9',
    textSecondary: '#A3ABB9',
    textTertiary: '#6E7686',
    background: '#000000',
    backgroundGrouped: '#0B0D11',
    surface: '#16191F',
    backgroundElement: '#1F232B',
    backgroundSelected: '#2A2F38',
    separator: '#262A32',
    tint: '#6B93FF',
    onTint: '#FFFFFF',
    success: '#4CC77A',
    successSoft: '#11291A',
    warning: '#F2B544',
    warningSoft: '#2E2209',
    danger: '#FF6B6B',
    dangerSoft: '#341313',
    info: '#7FA2FF',
    infoSoft: '#151F3A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Theme = { [K in ThemeColor]: string };

/** Semantic tones shared by badges, banners, and status indicators. */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function toneColors(theme: Theme, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'success':
      return { fg: theme.success, bg: theme.successSoft };
    case 'warning':
      return { fg: theme.warning, bg: theme.warningSoft };
    case 'danger':
      return { fg: theme.danger, bg: theme.dangerSoft };
    case 'info':
      return { fg: theme.info, bg: theme.infoSoft };
    default:
      return { fg: theme.textSecondary, bg: theme.backgroundElement };
  }
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  /** Recurring in-between step: row vertical padding, compact gaps. */
  twoHalf: 12,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

/** Minimum touch target (HIG 44pt / Material 48dp — use the larger). */
export const MinTouchTarget = 48;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
