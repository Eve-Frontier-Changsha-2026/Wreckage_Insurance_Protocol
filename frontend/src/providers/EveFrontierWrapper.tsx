import type { ReactNode } from 'react';
import {
  VaultProvider,
  NotificationProvider,
} from '@evefrontier/dapp-kit';

/**
 * Wraps children with EVE Frontier sub-providers (Vault, Notification).
 * We intentionally skip EveFrontierProvider because it double-wraps
 * QueryClientProvider + DAppKitProvider which we already provide in main.tsx.
 * SmartObjectProvider removed — not used, and it spams console errors when no object ID is set.
 */
export function EveFrontierWrapper({ children }: { children: ReactNode }) {
  return (
    <VaultProvider>
      <NotificationProvider>{children}</NotificationProvider>
    </VaultProvider>
  );
}
