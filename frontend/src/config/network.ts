export const NETWORKS = ['testnet', 'mainnet'] as const;
export type Network = (typeof NETWORKS)[number];

export const DEFAULT_NETWORK: Network = 'testnet';

export const GRPC_URLS: Record<Network, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
};
