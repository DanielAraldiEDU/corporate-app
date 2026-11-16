import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { apiConfig } from '@/services/api/config';
import { complianceFor, createSessionManager, type SessionManager, type SessionState } from '@/services/auth';
import type { ComplianceResult } from '@/services/device/compliance';

type SessionContextValue = {
  manager: SessionManager;
  state: SessionState;
  compliance: ComplianceResult;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  manager: injected,
}: {
  children: ReactNode;
  /** Injected in tests; the app creates the real manager. */
  manager?: SessionManager;
}) {
  const [manager] = useState(() => injected ?? createSessionManager());
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);
  const isAuthenticated = state.status === 'authenticated';

  // Session restoration on launch.
  useEffect(() => {
    void manager.restore();
  }, [manager]);

  // Re-check policy whenever the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void manager.sync('foreground').catch(() => undefined);
    });
    return () => sub.remove();
  }, [manager]);

  // Periodic check-in while signed in and in the foreground.
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void manager.sync('periodic').catch(() => undefined);
    }, apiConfig.checkInIntervalMs);
    return () => clearInterval(timer);
  }, [manager, isAuthenticated]);

  const value = useMemo(() => ({ manager, state, compliance: complianceFor(state) }), [manager, state]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
