import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { BrowserRouter } from 'react-router-dom';
import { dAppKit } from './dapp-kit';
import { EveFrontierWrapper } from './providers/EveFrontierWrapper';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>
        <EveFrontierWrapper>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </EveFrontierWrapper>
      </DAppKitProvider>
    </QueryClientProvider>
  </StrictMode>,
);
