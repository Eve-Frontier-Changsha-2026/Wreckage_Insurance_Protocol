export const PACKAGE_ID =
  '0x053c5c2ae486c33e6e91d9169ea79385211d46373224953ad752ecf576786f77';

export const SHARED_OBJECTS = {
  protocolConfig:
    '0xaf987a7f3e744ed40d3c5fa8df827d9968bc305b78137d1b805bab4c65ba28bf',
  policyRegistry:
    '0x4b1ad0fb5d335aefaa47d46fff10e5fc30336f24138e104cb8fb26ab1f73d0bc',
  claimRegistry:
    '0xbe6e14a5b0028c84bd2af59ff96f41a5d4878783a4592341b0711df287fcab40',
  auctionRegistry:
    '0xba5a4846807889ff322983a4008069fb417b780f4cc94ec8f44e5d5a8216697d',
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
