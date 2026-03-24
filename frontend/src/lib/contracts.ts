export const PACKAGE_ID =
  '0xbb2f732232d0bf4b3c7b91cce214635e329952ff9acea810963c56cc8d28ac41';

export const SHARED_OBJECTS = {
  protocolConfig:
    '0x0e9ca9dbc87e828f907f0c8011973a9ba5ee8d3c1e0bea08b42f050a622d4523',
  policyRegistry:
    '0x11903d4c33205930b2fd9f79cbf2899d301940a4dc79b01e76981ab3806fbef8',
  claimRegistry:
    '0xe42f02223e9e635a2b03c9e3337fdcba0fb1a9bb7fba469df17bb70c142d8036',
  auctionRegistry:
    '0x682807b31effdf6160e296b00012331b3a58b8560b102f733dfc6919944e29f9',
  valuationRegistry:
    '0x0a617a6b38cbe66b8f0e00d9b10daf3f6383bf62c9e13ad3de6d89716f99f77a',
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
  ssuExtension: `${PACKAGE_ID}::ssu_extension`,
  itemValuation: `${PACKAGE_ID}::item_valuation`,
} as const;
