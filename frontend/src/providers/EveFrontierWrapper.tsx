import type { ReactNode } from 'react';
import {
  VaultProvider,
  SmartObjectProvider,
  NotificationProvider,
} from '@evefrontier/dapp-kit';

/**
 * Wraps children with EVE Frontier sub-providers (Vault, SmartObject, Notification).
 * We intentionally skip EveFrontierProvider because it double-wraps
 * QueryClientProvider + DAppKitProvider which we already provide in main.tsx.
 */
export function EveFrontierWrapper({ children }: { children: ReactNode }) {
  return (
    <VaultProvider>
      <SmartObjectProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </SmartObjectProvider>
    </VaultProvider>
  );
}
