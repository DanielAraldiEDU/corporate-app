import type { Tone } from '@/constants/theme';
import type { ComplianceState } from '@/services/device/compliance';
import type { WorkOrderPriority, WorkOrderStatus } from '@/types/api';

export function formatRelativeTime(input: string | number | null | undefined, now = Date.now()): string {
  if (input === null || input === undefined) return 'Never';
  const time = typeof input === 'number' ? input : Date.parse(input);
  if (Number.isNaN(time)) return 'Unknown';
  const seconds = Math.round((now - time) / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function greeting(hour = new Date().getHours()): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function firstName(name: string | undefined | null): string {
  return name?.split(' ')[0] ?? '';
}

export const STATUS_META: Record<WorkOrderStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  on_hold: { label: 'On hold', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'success' },
};

export const PRIORITY_META: Record<WorkOrderPriority, { label: string; tone: Tone; rank: number }> = {
  critical: { label: 'Critical', tone: 'danger', rank: 0 },
  high: { label: 'High', tone: 'warning', rank: 1 },
  medium: { label: 'Medium', tone: 'info', rank: 2 },
  low: { label: 'Low', tone: 'neutral', rank: 3 },
};

export const COMPLIANCE_META: Record<ComplianceState, { label: string; tone: Tone }> = {
  compliant: { label: 'Compliant', tone: 'success' },
  non_compliant: { label: 'Non-compliant', tone: 'danger' },
  revoked: { label: 'Access Revoked', tone: 'danger' },
  unverified: { label: 'Unverified', tone: 'warning' },
};

/** Human description of where expo-secure-store stored the credential. */
export function describeStorage(storage: string | null | undefined): string {
  switch (storage) {
    case 'ios_keychain':
      return 'iOS Keychain';
    case 'android_keystore':
      return 'Android Keystore · AES-GCM';
    default:
      return storage ?? 'Not stored';
  }
}
