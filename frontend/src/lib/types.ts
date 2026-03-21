export interface InsurancePolicy {
  id: string;
  owner: string;
  characterId: string;
  tier: number;
  coverageAmount: number;
  premiumPaid: number;
  startEpoch: number;
  endEpoch: number;
  ncbStreak: number;
  claimCount: number;
  hasSelfDestructRider: boolean;
  status: 'active' | 'expired' | 'claimed';
}

export interface RiskPool {
  id: string;
  tier: number;
  totalDeposits: number;
  totalShares: number;
  reservedAmount: number;
  isActive: boolean;
}

export interface LPPosition {
  id: string;
  owner: string;
  poolId: string;
  shares: number;
  depositAmount: number;
  depositEpoch: number;
}

export interface Auction {
  id: string;
  salvageNftId: string;
  startingPrice: number;
  highestBid: number;
  highestBidder: string | null;
  startsAt: number;
  endsAt: number;
  status: 'bidding' | 'buyout' | 'settled' | 'unsold';
}

export interface SalvageNFT {
  id: string;
  killmailId: string;
  victimCharacterId: string;
  killerCharacterId: string;
  estimatedValue: number;
  salvageRate: number;
}

export interface ClaimRecord {
  policyId: string;
  killmailId: string;
  payoutAmount: number;
  claimEpoch: number;
  isSelfDestruct: boolean;
}

export type RiskTier = 0 | 1 | 2;

export const TIER_NAMES: Record<RiskTier, string> = {
  0: 'Low Risk',
  1: 'Medium Risk',
  2: 'High Risk',
};
