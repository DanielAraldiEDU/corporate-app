/**
 * Protection of restricted screens: renders the real root layout (src/app/_layout.tsx) with
 * Expo Router's testing library. Screen components are stubbed; the guard logic is real.
 */
import { router, Stack } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '@/app/_layout';
import { useSession } from '@/contexts/session-context';
import type { SessionManager } from '@/services/auth/session-manager';

import { createFakeBackend, createTestManager, DEMO_EMAIL, DEMO_PASSWORD, type FakeBackend } from '../test-utils/fake-backend';
import { resetSecureDevice } from '../test-utils/secure-device';

let backend: FakeBackend;
let mockManager: SessionManager;

jest.mock('@/services/auth', () => ({
  ...jest.requireActual('@/services/auth'),
  createSessionManager: () => mockManager,
}));

function SignInStub() {
  const { state } = useSession();
  return (
    <>
      <Text>Sign-in screen</Text>
      {state.notice ? <Text>{state.notice.title}</Text> : null}
    </>
  );
}

const routes = {
  _layout: RootLayout,
  'sign-in': SignInStub,
  '(app)/_layout': () => <Stack />,
  '(app)/index': () => <Text>Dashboard</Text>,
  '(app)/work-orders/[id]': () => <Text>Work order detail</Text>,
};

beforeEach(() => {
  resetSecureDevice();
  backend = createFakeBackend();
  mockManager = createTestManager(backend);
});

it('redirects deep links into protected screens to sign-in while signed out', async () => {
  await renderRouter(routes, { initialUrl: '/work-orders/wo-5101' });

  expect(await screen.findByText('Sign-in screen')).toBeTruthy();
  expect(screen).toHavePathname('/sign-in');
  expect(screen.queryByText('Work order detail')).toBeNull();
});

it('unlocks protected screens after sign-in and blocks them again after revocation', async () => {
  await renderRouter(routes, { initialUrl: '/' });
  await screen.findByText('Sign-in screen');

  await act(() => mockManager.signIn(DEMO_EMAIL, DEMO_PASSWORD));
  expect(await screen.findByText('Dashboard')).toBeTruthy();

  await act(async () => {
    router.push('/work-orders/wo-5101');
  });
  expect(await screen.findByText('Work order detail')).toBeTruthy();

  // Administrator revokes the device; the next check-in detects it.
  backend.revokeDevice();
  await act(() => mockManager.sync('manual'));

  expect(await screen.findByText('Sign-in screen')).toBeTruthy();
  expect(screen.getByText('Access revoked')).toBeTruthy();
  expect(screen).toHavePathname('/sign-in');

  // Attempting to open a protected screen again stays blocked.
  await act(async () => {
    router.push('/work-orders/wo-5101');
  });
  expect(screen.queryByText('Work order detail')).toBeNull();
  expect(screen.getByText('Sign-in screen')).toBeTruthy();
});
