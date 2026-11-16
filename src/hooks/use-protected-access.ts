import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from '@/contexts/session-context';

/**
 * Re-verifies device policy whenever a protected screen gains focus, before its data is
 * shown. Returns whether access is currently allowed and whether a check is running.
 */
export function useProtectedAccess() {
  const { manager, compliance } = useSession();
  const [checking, setChecking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setChecking(true);
      void manager.ensureAccess().finally(() => {
        if (active) setChecking(false);
      });
      return () => {
        active = false;
      };
    }, [manager]),
  );

  return { allowed: compliance.allowed, compliance, checking };
}
