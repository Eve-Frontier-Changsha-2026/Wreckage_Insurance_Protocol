export const PACKAGE_ID =
  '0x986d8cf6ba2e0fe8c1e2b6aea014c68bf6a1c67bcccd6b5470fce8d6e5456ed2';

export const ADMIN_CAP =
  '0x60d0ac792ce7a2ba2830b1523ef15b9cc8aed17d4ad95d15b53d7c8d1a070a0b';

export const SHARED_OBJECTS = {
  protocolConfig:
    '0xf5a5ca0a0d186fc82dc5a184c4b94befa3bbc0e41eb25e02a5eacf0829fc3e3a',
  policyRegistry:
    '0x92a86986f650878762591c3a9f75f133be1fd1f35145d46202db623bb40d6edc',
  claimRegistry:
    '0xb75340106ae01287f3dc41fec308ffc44a162eabf7c598c8a21db5f5cb3995df',
  auctionRegistry:
    '0x8d3f6c002f7693250e91789738171b439aa38de184656db4dc36d589eb40ad4f',
  valuationRegistry:
    '0x0b9cbbffb3c2a743d7afd5b6f0c3f0132108802de21b05b0dbd5656952fc78bb',
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
