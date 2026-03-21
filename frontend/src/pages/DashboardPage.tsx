import { Link } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useProtocolConfig } from '../hooks/useProtocolConfig';
import { useOwnedPolicies } from '../hooks/useInsurancePolicy';
import { useOwnedLPPositions } from '../hooks/useRiskPool';
import { useAuctionRegistry } from '../hooks/useAuction';
import { SHARED_OBJECTS } from '../lib/contracts';

const MIST = 1_000_000_000;

function toSui(mist: number | string | undefined): string {
  if (mist === undefined || mist === null) return '—';
  return (Number(mist) / MIST).toFixed(4);
}

function StatCard({
  label,
  value,
  link,
  linkLabel,
}: {
  label: string;
  value: string | number;
  link: string;
  linkLabel: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 flex flex-col gap-3">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-100">{value}</p>
      <Link
        to={link}
        className="text-sm text-orange-400 hover:text-orange-300 transition-colors mt-auto"
      >
        {linkLabel} &rarr;
      </Link>
    </div>
  );
}

function QuickLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-orange-500/40 transition-colors"
    >
      <p className="font-medium text-gray-100">{title}</p>
      <p className="text-sm text-gray-500 mt-1">{desc}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const account = useCurrentAccount();
  const { data: configObj, isLoading: configLoading } = useProtocolConfig();
  const { data: policies, isLoading: policiesLoading } = useOwnedPolicies();
  const { data: positions, isLoading: positionsLoading } = useOwnedLPPositions();
  const { data: registryObj } = useAuctionRegistry();

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400 text-lg">Connect your wallet to get started</p>
        <ConnectButton />
      </div>
    );
  }

  const policyCount = policies?.length ?? 0;
  const activePolicies = policies?.filter((p: any) => {
    const fields = p?.content?.fields;
    return fields?.status === 'active' || fields?.status?.variant === 'Active';
  }).length ?? 0;

  const positionCount = positions?.length ?? 0;

  const registryFields = registryObj?.content?.fields as any;
  const auctionCount = registryFields?.active_auctions?.length ?? 0;

  const configFields = configObj?.content?.fields as any;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Wreckage Insurance Protocol — EVE Frontier
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Your Policies"
          value={policiesLoading ? '...' : `${activePolicies} active / ${policyCount} total`}
          link="/insure"
          linkLabel="Manage policies"
        />
        <StatCard
          label="LP Positions"
          value={positionsLoading ? '...' : positionCount}
          link="/pool"
          linkLabel="View pool"
        />
        <StatCard
          label="Active Auctions"
          value={auctionCount}
          link="/salvage"
          linkLabel="Browse auctions"
        />
        <StatCard
          label="Protocol Version"
          value={configLoading ? '...' : (configFields?.version ?? '—')}
          link="/demo"
          linkLabel="Demo panel"
        />
      </div>

      {/* Protocol Config Summary */}
      {configFields && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Protocol Config</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Config ID</p>
              <p className="text-gray-300 font-mono text-xs truncate">{SHARED_OBJECTS.protocolConfig}</p>
            </div>
            <div>
              <p className="text-gray-500">Policy Registry</p>
              <p className="text-gray-300 font-mono text-xs truncate">{SHARED_OBJECTS.policyRegistry}</p>
            </div>
            <div>
              <p className="text-gray-500">Claim Registry</p>
              <p className="text-gray-300 font-mono text-xs truncate">{SHARED_OBJECTS.claimRegistry}</p>
            </div>
            <div>
              <p className="text-gray-500">Auction Registry</p>
              <p className="text-gray-300 font-mono text-xs truncate">{SHARED_OBJECTS.auctionRegistry}</p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Policies */}
      {policyCount > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-100">Recent Policies</h2>
            <Link to="/insure" className="text-sm text-orange-400 hover:text-orange-300">
              View all &rarr;
            </Link>
          </div>
          <div className="space-y-2">
            {(policies ?? []).slice(0, 5).map((p: any) => {
              const f = p?.content?.fields;
              const id = p?.objectId ?? p?.id ?? '—';
              return (
                <Link
                  key={id}
                  to={`/insure/${id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-800/50 transition-colors"
                >
                  <span className="font-mono text-sm text-gray-300 truncate max-w-[200px]">
                    {id}
                  </span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-400">
                      {toSui(f?.coverage_amount ?? f?.coverageAmount)} SUI
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        (f?.status === 'active' || f?.status?.variant === 'Active')
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {f?.status?.variant ?? f?.status ?? '—'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink to="/insure" title="Purchase Insurance" desc="Insure your ship against combat losses" />
          <QuickLink to="/claims" title="Submit a Claim" desc="File a claim with a killmail" />
          <QuickLink to="/pool/deposit" title="Provide Liquidity" desc="Deposit SUI into risk pools and earn yield" />
          <QuickLink to="/pool/withdraw" title="Withdraw Liquidity" desc="Burn LP shares to withdraw SUI" />
          <QuickLink to="/salvage" title="Salvage Auctions" desc="Bid on salvaged wreckage NFTs" />
          <QuickLink to="/demo" title="Demo Panel" desc="Admin tools for hackathon demos" />
        </div>
      </div>
    </div>
  );
}
