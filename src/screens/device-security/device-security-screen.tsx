import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Icon, type IconProps } from '@/components/ui/icon';
import { Row, Section } from '@/components/ui/section';
import { ScreenScrollView } from '@/components/ui/screen-scroll-view';
import { StatusBadge } from '@/components/ui/status-badge';
import { Radius, Spacing, toneColors } from '@/constants/theme';
import { useSession } from '@/contexts/session-context';
import { useTheme } from '@/hooks/use-theme';
import { apiConfig } from '@/services/api/config';
import { errorMessage } from '@/services/api/errors';
import type { ComplianceState } from '@/services/device/compliance';
import { biometryUnavailableReason } from '@/services/secure-store/biometrics';
import { COMPLIANCE_META, describeStorage, formatDate, formatRelativeTime } from '@/utils/format';

const HERO_ICONS: Record<ComplianceState, Pick<IconProps, 'ios' | 'android'>> = {
  compliant: { ios: 'checkmark.shield.fill', android: 'gpp_good' },
  non_compliant: { ios: 'xmark.shield.fill', android: 'gpp_bad' },
  revoked: { ios: 'xmark.shield.fill', android: 'block' },
  unverified: { ios: 'exclamationmark.shield.fill', android: 'shield' },
};

export default function DeviceSecurityScreen() {
  const theme = useTheme();
  const { manager, state, compliance } = useSession();
  const { device, policy, biometry, credential } = state;
  const [syncError, setSyncError] = useState<string | null>(null);
  const meta = COMPLIANCE_META[compliance.state];
  const heroColor = toneColors(theme, meta.tone);

  useFocusEffect(
    useCallback(() => {
      void manager.ensureAccess();
    }, [manager]),
  );

  const syncNow = async () => {
    setSyncError(null);
    try {
      await manager.sync('manual');
    } catch (error) {
      setSyncError(errorMessage(error));
    }
  };

  const biometricBadge = policy?.requireBiometrics
    ? credential?.biometricProtected
      ? { label: 'Enforced', tone: 'success' as const }
      : { label: 'Not satisfied', tone: 'danger' as const }
    : { label: 'Optional', tone: 'neutral' as const };

  return (
    <ScreenScrollView refreshing={state.syncing} onRefresh={() => void syncNow()}>
      <View
        testID="compliance-hero"
        style={[styles.hero, { backgroundColor: theme.surface }]}
        accessible
        accessibilityLabel={`Device status: ${meta.label}. ${compliance.summary}`}>
        <View style={[styles.heroIcon, { backgroundColor: heroColor.bg }]}>
          <Icon {...HERO_ICONS[compliance.state]} size={30} color={heroColor.fg} />
        </View>
        <View style={styles.heroText}>
          <ThemedText type="subtitle" style={{ color: heroColor.fg }}>
            {meta.label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {compliance.summary}
          </ThemedText>
        </View>
      </View>

      {syncError ? <Banner tone="warning" title="Check-in failed" message={syncError} /> : null}

      <Section title="Status">
        <Row
          title="Device management"
          subtitle={device?.managed ? 'Enrolled with FieldOps MDM (simulated)' : 'Not enrolled'}
          trailing={<StatusBadge label={device?.managed ? 'Managed' : 'Unmanaged'} tone={device?.managed ? 'info' : 'danger'} />}
        />
        <Row
          title="Compliance"
          subtitle={`${compliance.checks.filter((c) => c.passed).length} of ${compliance.checks.length} checks passed`}
          trailing={<StatusBadge label={meta.label} tone={meta.tone} />}
        />
        <Row
          title="Access authorization"
          subtitle={device?.accessRevoked ? 'Revoked by administrator' : 'Corporate resources permitted'}
          trailing={
            <StatusBadge
              label={device?.accessRevoked ? 'Access Revoked' : 'Authorized'}
              tone={device?.accessRevoked ? 'danger' : 'success'}
            />
          }
        />
      </Section>

      <Section
        title="Authentication"
        footer={
          biometry.available
            ? 'Credentials are stored with expo-secure-store. When biometrics are required, the refresh token can only be read after a successful system biometric prompt.'
            : biometryUnavailableReason(biometry)
        }>
        <Row
          title="Biometric authentication"
          subtitle={`${policy?.requireBiometrics ? 'Required by policy' : 'Not required by policy'} · ${
            biometry.available ? `${biometry.label} enrolled` : 'Unavailable'
          }`}
          trailing={<StatusBadge label={biometricBadge.label} tone={biometricBadge.tone} />}
        />
        <Row
          title="Secure credential storage"
          subtitle={`${describeStorage(credential?.storage)} · ${
            credential?.biometricProtected ? 'biometric-bound' : 'this device only'
          }`}
          trailing={<StatusBadge label={credential ? 'Protected' : 'Empty'} tone={credential ? 'success' : 'warning'} />}
        />
        {Platform.OS === 'android' ? (
          <Row title="Enrolled security level" trailing={biometry.securityLevel ?? 'Unknown'} />
        ) : null}
      </Section>

      <Section title="Policy">
        <Row title="Active policy" subtitle={policy?.description} trailing={policy?.name ?? '—'} />
        <Row
          title="Policy version"
          trailing={policy ? `v${policy.policyVersion}` : '—'}
          subtitle={
            device && policy && device.policyVersion !== policy.policyVersion
              ? `Device acknowledged v${device.policyVersion}`
              : 'Applied on this device'
          }
        />
        <Row title="Offline access" trailing={policy?.allowOfflineAccess ? 'Allowed' : 'Blocked'} />
        <Row
          title="Last device check-in"
          subtitle={`Every ${Math.round(apiConfig.checkInIntervalMs / 1000)} s in foreground · on resume`}
          trailing={formatRelativeTime(device?.lastCheckIn)}
        />
        <Row title="Connectivity" trailing={state.connectivity === 'online' ? 'Online' : 'Offline'} />
      </Section>

      <Section title="This device">
        <Row
          icon={<Icon ios="iphone" android="smartphone" color={theme.textSecondary} />}
          title={device?.deviceName ?? '—'}
          subtitle={[device?.model, device?.platform, device?.osVersion].filter(Boolean).join(' · ')}
        />
        <Row title="Device ID" trailing={device?.id ?? '—'} />
        <Row title="App version" trailing={device?.appVersion ?? '—'} />
        <Row title="Enrolled" trailing={formatDate(device?.enrolledAt)} />
      </Section>

      <Button
        testID="sync-device"
        title="Sync device status"
        variant="secondary"
        loading={state.syncing}
        icon={<Icon ios="arrow.triangle.2.circlepath" android="sync" size={18} color={theme.text} />}
        onPress={() => void syncNow()}
      />
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
    gap: Spacing.one,
  },
});
