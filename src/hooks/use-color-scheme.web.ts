import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribeNoop = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * The server snapshot reports "not hydrated", so the first client render matches the server.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
