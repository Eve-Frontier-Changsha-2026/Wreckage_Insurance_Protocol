export const PACKAGE_ID =
  '0xc4a0468d35e9c0e8e85201a00897f3ca6ac69cec3e4ee7721dc96a7a4a572bf6';

export const SHARED_OBJECTS = {
  protocolConfig:
    '0x92cfd541600b883ba0a2532c69d77c939114f620d176bbcb0fbb0528e398a3da',
  policyRegistry:
    '0xdab997bfd2c671e40c59c096e5c8b580018c791db9b76db50f20463f7efc4b7b',
  claimRegistry:
    '0xdffef875036b20bb98f2ab9793734411fce69b634dc95adf6aa826640edd44b6',
  auctionRegistry:
    '0x22662b09a97dd23567eb77cf1cfee854e47c868e2c04acefa745bdf784f5f0a0',
} as const;

export const MODULE = {
  config: `${PACKAGE_ID}::config`,
  underwriting: `${PACKAGE_ID}::underwriting`,
  claims: `${PACKAGE_ID}::claims`,
  riskPool: `${PACKAGE_ID}::risk_pool`,
  auction: `${PACKAGE_ID}::auction`,
  registry: `${PACKAGE_ID}::registry`,
  antiFraud: `${PACKAGE_ID}::anti_fraud`,
  salvage: `${PACKAGE_ID}::salvage`,
  policy: `${PACKAGE_ID}::policy`,
  rider: `${PACKAGE_ID}::rider`,
  salvageNft: `${PACKAGE_ID}::salvage_nft`,
} as const;
