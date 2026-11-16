import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState, LoadingState } from '@/components/ui/state-views';
import { useSession } from '@/contexts/session-context';
import { useProtectedAccess } from '@/hooks/use-protected-access';

/**
 * Second layer of protection inside the signed-in area (the route guard is the first):
 * corporate data renders only while the device is compliant with the active policy.
 */
export function ProtectedContent({ children }: { children: ReactNode }) {
  const { manager, state } = useSession();
  const { allowed, compliance, checking } = useProtectedAccess();

  if (allowed) return children;
  if (checking && !state.lastSyncAt) return <LoadingState label="Verifying device policy…" />;

  return (
    <EmptyState
      title="Corporate data hidden"
      message={compliance.summary}
      icon={{ ios: 'lock.shield', android: 'shield' }}>
      <Button
        title="Check again"
        variant="secondary"
        size="sm"
        loading={state.syncing}
        onPress={() => void manager.sync('manual').catch(() => undefined)}
      />
    </EmptyState>
  );
}
