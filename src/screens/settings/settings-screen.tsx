import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Row, Section } from '@/components/ui/section';
import { ScreenScrollView } from '@/components/ui/screen-scroll-view';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-views';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/contexts/session-context';
import { useResource } from '@/hooks/use-resource';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/services/api/errors';
import { formatDateTime, formatRelativeTime } from '@/utils/format';

type Feedback = { tone: 'success' | 'warning' | 'danger' | 'info'; title: string; message?: string; offerSync?: boolean };

export default function SettingsScreen() {
  const theme = useTheme();
  const { manager, state } = useSession();
  const { user, device, policy } = state;
  const logs = useResource(() => manager.api.auditLogs.list(20));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<'sync' | 'policy' | 'revoke' | 'biometrics' | 'signOut' | null>(null);

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    setBusy(kind);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      setFeedback({ tone: 'danger', title: 'Request failed', message: errorMessage(error) });
    } finally {
      setBusy(null);
      if (manager.getState().status === 'authenticated') void logs.reload();
    }
  }

  const syncDevice = () =>
    run('sync', async () => {
      await manager.sync('manual');
      setFeedback({ tone: 'success', title: 'Device synchronized', message: 'Status reported and policy re-applied.' });
    });

  const refreshPolicy = () =>
    run('policy', async () => {
      await manager.refreshPolicy();
      const p = manager.getState().policy;
      setFeedback({ tone: 'success', title: 'Policy refreshed', message: p ? `${p.name} v${p.policyVersion} is active.` : undefined });
    });

  const toggleBiometrics = (value: boolean) =>
    run('biometrics', async () => {
      if (!policy) return;
      const { policy: updated } = await manager.api.admin.updatePolicy(policy.id, { requireBiometrics: value });
      setFeedback({
        tone: 'info',
        title: `Policy updated to v${updated.policyVersion}`,
        message: value
          ? 'Biometrics are now required. Sync to apply: sessions without biometric protection must sign in again.'
          : 'Biometrics are now optional. Sync to apply the new policy version.',
        offerSync: true,
      });
    });

  const confirmRevoke = () => {
    if (!device) return;
    Alert.alert(
      'Revoke access for this device?',
      'Simulates an IT administrator revoking FieldOps access from the MDM console. The app will block corporate data and erase stored credentials at its next check-in. The physical device is not locked or wiped.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke access',
          style: 'destructive',
          onPress: () =>
            void run('revoke', async () => {
              await manager.api.admin.revokeDevice(device.id);
              setFeedback({
                tone: 'warning',
                title: 'Revocation issued on the server',
                message: 'Return to FieldOps and sync the device policy — or wait for the next automatic check-in — to see it enforced.',
                offerSync: true,
              });
            }),
        },
      ],
    );
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out of FieldOps?', 'Your session ends on the server and saved credentials are erased from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void run('signOut', () => manager.signOut()) },
    ]);

  return (
    <ScreenScrollView refreshing={logs.refreshing} onRefresh={() => void logs.reload()}>
      {feedback ? (
        <Banner tone={feedback.tone} title={feedback.title} message={feedback.message}>
          {feedback.offerSync ? (
            <Button
              testID="feedback-sync"
              title="Sync device policy now"
              size="sm"
              variant="secondary"
              loading={busy === 'sync'}
              onPress={() => void syncDevice()}
              style={styles.inlineButton}
            />
          ) : null}
        </Banner>
      ) : null}

      <Section title="Account">
        <Row
          icon={<Icon ios="person.crop.circle" android="person" color={theme.textSecondary} size={24} />}
          title={user?.name ?? '—'}
          subtitle={[user?.email, user?.role].filter(Boolean).join(' · ')}
        />
        <Row
          title="Sign out"
          icon={<Icon ios="rectangle.portrait.and.arrow.right" android="logout" color={theme.danger} />}
          onPress={confirmSignOut}
          testID="sign-out"
          accessibilityHint="Ends your session and erases stored credentials"
        />
      </Section>

      <Section title="Current device policy" footer={policy?.updatedAt ? `Updated ${formatDateTime(policy.updatedAt)}` : undefined}>
        <Row title="Policy" subtitle={policy?.description} trailing={policy ? `${policy.name} · v${policy.policyVersion}` : '—'} />
        <PolicyFlag label="Device allowed" value={policy?.deviceAllowed} />
        <PolicyFlag label="Require biometrics" value={policy?.requireBiometrics} />
        <PolicyFlag label="Allow offline access" value={policy?.allowOfflineAccess} />
        <Row title="Access revoked" trailing={<StatusBadge label={device?.accessRevoked ? 'Yes' : 'No'} tone={device?.accessRevoked ? 'danger' : 'success'} />} />
      </Section>

      <View style={styles.actions}>
        <Button
          title="Refresh policy"
          variant="secondary"
          loading={busy === 'policy'}
          onPress={() => void refreshPolicy()}
          style={styles.flex}
        />
        <Button
          testID="manual-sync"
          title="Sync device"
          variant="secondary"
          loading={busy === 'sync'}
          onPress={() => void syncDevice()}
          style={styles.flex}
        />
      </View>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.caption}>
        Last check-in {formatRelativeTime(state.lastSyncAt)}
      </ThemedText>

      <Section title="Administration · demo only">
        <Banner
          tone="warning"
          title="Demonstration only"
          message="These controls simulate actions an IT administrator performs in an MDM console. They call the mock API’s /admin routes and never lock, wipe, or manage this physical device."
          style={styles.flatBanner}
        />
        <Row
          title="Require biometrics (policy)"
          subtitle="Publishes a new policy version"
          trailing={
            <Switch
              accessibilityLabel="Require biometrics"
              value={!!policy?.requireBiometrics}
              disabled={busy !== null || !policy}
              onValueChange={(v) => void toggleBiometrics(v)}
            />
          }
        />
        <View style={styles.revoke}>
          <Button
            testID="simulate-revoke"
            title="Simulate remote access revocation"
            variant="destructive"
            loading={busy === 'revoke'}
            icon={<Icon ios="xmark.shield" android="gpp_bad" size={18} color={theme.danger} />}
            onPress={confirmRevoke}
          />
        </View>
      </Section>

      <Section title="Audit log">
        {logs.loading ? (
          <LoadingState label="Loading security events…" />
        ) : logs.error && !logs.data ? (
          <ErrorState message={logs.error} onRetry={() => void logs.reload()} />
        ) : !logs.data?.length ? (
          <EmptyState title="No security events" icon={{ ios: 'clock', android: 'history' }} />
        ) : (
          logs.data.map((log) => (
            <Row
              key={log.id}
              title={log.action.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
              subtitle={log.description}
              trailing={formatRelativeTime(log.timestamp)}
            />
          ))
        )}
      </Section>
    </ScreenScrollView>
  );
}

function PolicyFlag({ label, value }: { label: string; value: boolean | undefined }) {
  return (
    <Row
      title={label}
      trailing={
        value === undefined ? '—' : <StatusBadge label={value ? 'On' : 'Off'} tone={value ? 'info' : 'neutral'} />
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.twoHalf,
    marginBottom: -Spacing.two,
  },
  caption: {
    paddingHorizontal: Spacing.three,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
  flatBanner: {
    borderRadius: 0,
  },
  revoke: {
    padding: Spacing.three,
  },
});
