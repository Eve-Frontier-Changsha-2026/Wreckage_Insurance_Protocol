import { useState, useCallback } from 'react';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { useProtocolConfig } from '../../hooks/useProtocolConfig';
import {
  buildPurchasePolicy,
  buildExpirePolicy,
} from '../../lib/ptb/insure';
import {
  buildSubmitClaim,
  buildSubmitSelfDestructClaim,
} from '../../lib/ptb/claim';
import {
  buildDeposit,
} from '../../lib/ptb/pool';
import {
  buildPlaceBid,
  buildSettleAuction,
  buildDestroyUnsold,
} from '../../lib/ptb/auction';
import { buildSetItemPrice } from '../../lib/ptb/ssu';
import { buildAdminCreatePool, TIER_PRESETS } from '../../lib/ptb/admin';
import { buildCreateKillmail, buildCreateAndShareCharacter } from '../../lib/ptb/killmail';
import { fetchKillmails, type EveEyesKillmail } from '../../lib/eveEyes';
import { ADMIN_CAP, SHARED_OBJECTS } from '../../lib/contracts';

// ─── Types ───────────────────────────────────────────────────────────────────

type TxStatus = 'success' | 'fail';

interface TxLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  digest?: string;
  status: TxStatus;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EXPLORER_BASE = 'https://suiscan.xyz/testnet/tx';

const SUI_TO_MIST = 1_000_000_000n;

function suiToMist(sui: string): bigint {
  const num = parseFloat(sui);
  if (isNaN(num) || num <= 0) throw new Error('Invalid SUI amount');
  return BigInt(Math.round(num * 1_000_000_000));
}

function truncate(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function now(): string {
  return new Date().toLocaleTimeString();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-400 mb-1">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500"
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-orange-500' : 'bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
      <span className="text-xs text-gray-400">{label}</span>
    </label>
  );
}

function ExecButton({
  onClick,
  loading,
  disabled,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded transition-colors"
    >
      {loading ? (
        <svg
          className="animate-spin w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : null}
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-gray-500 hover:text-orange-400 transition-colors ml-1"
      title="Copy"
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-850 text-left"
      >
        <span className="text-sm font-semibold text-orange-400">{title}</span>
        <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 bg-gray-950 space-y-4">{children}</div>}
    </div>
  );
}

function Toast({
  toasts,
}: {
  toasts: { id: string; msg: string; type: 'ok' | 'err' }[];
}) {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded shadow-lg text-sm text-white ${
            t.type === 'ok' ? 'bg-green-700' : 'bg-red-700'
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DemoPanel() {
  const account = useCurrentAccount();
  const { signAndExecuteTransaction } = useDAppKit();
  const { data: configObj } = useProtocolConfig();

  // ── Toast state ──────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<
    { id: string; msg: string; type: 'ok' | 'err' }[]
  >([]);

  const addToast = useCallback((msg: string, type: 'ok' | 'err') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── TX log state ─────────────────────────────────────────────────────────
  const [txLog, setTxLog] = useState<TxLogEntry[]>([]);

  const logTx = useCallback(
    (action: string, status: TxStatus, digest?: string, error?: string) => {
      setTxLog((prev) => [
        {
          id: Math.random().toString(36).slice(2),
          timestamp: new Date(),
          action,
          digest,
          status,
          error,
        },
        ...prev,
      ]);
    },
    []
  );

  // ── Generic executor ─────────────────────────────────────────────────────
  const execute = useCallback(
    async (
      action: string,
      buildFn: () => ReturnType<typeof buildDeposit>
    ): Promise<boolean> => {
      try {
        const tx = buildFn();
        const result = await signAndExecuteTransaction({ transaction: tx });

        if ('FailedTransaction' in result) {
          const err = String((result as any).FailedTransaction?.error ?? 'unknown');
          logTx(action, 'fail', undefined, err);
          addToast(`${action} failed: ${err}`, 'err');
          return false;
        }

        const digest: string = (result as any).Transaction?.digest ?? '';
        logTx(action, 'success', digest);
        addToast(`${action} succeeded`, 'ok');
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logTx(action, 'fail', undefined, msg);
        addToast(`${action} error: ${msg}`, 'err');
        return false;
      }
    },
    [signAndExecuteTransaction, logTx, addToast]
  );

  // ── Form state — Deposit ─────────────────────────────────────────────────
  const [depositPoolId, setDepositPoolId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);

  // ── Form state — Purchase Policy ─────────────────────────────────────────
  const [ppPoolId, setPpPoolId] = useState('');
  const [ppCharId, setPpCharId] = useState('');
  const [ppCoverage, setPpCoverage] = useState('');
  const [ppPayment, setPpPayment] = useState('');
  const [ppSdRider, setPpSdRider] = useState(false);
  const [ppLoading, setPpLoading] = useState(false);

  // ── Form state — Submit Claim ─────────────────────────────────────────────
  const [claimPolicyId, setClaimPolicyId] = useState('');
  const [claimKillmailId, setClaimKillmailId] = useState('');
  const [claimPoolId, setClaimPoolId] = useState('');
  const [claimIsSd, setClaimIsSd] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);

  // ── Form state — Place Bid ────────────────────────────────────────────────
  const [bidAuctionId, setBidAuctionId] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [bidLoading, setBidLoading] = useState(false);

  // ── Form state — Expire Policy ────────────────────────────────────────────
  const [expPolicyId, setExpPolicyId] = useState('');
  const [expPoolId, setExpPoolId] = useState('');
  const [expLoading, setExpLoading] = useState(false);

  // ── Form state — Settle Auction ───────────────────────────────────────────
  const [settleAuctionId, setSettleAuctionId] = useState('');
  const [settlePoolId, setSettlePoolId] = useState('');
  const [settleLoading, setSettleLoading] = useState(false);

  // ── Form state — Destroy Unsold ───────────────────────────────────────────
  const [destroyAuctionId, setDestroyAuctionId] = useState('');
  const [destroyLoading, setDestroyLoading] = useState(false);

  // ── Form state — Create Pool ──────────────────────────────────────────
  const [createPoolTier, setCreatePoolTier] = useState('0');
  const [createPoolAdminCap, setCreatePoolAdminCap] = useState(ADMIN_CAP);
  const [createPoolLoading, setCreatePoolLoading] = useState(false);

  // ── Form state — Item Valuation ─────────────────────────────────────────
  const [valAdminCapId, setValAdminCapId] = useState(ADMIN_CAP);
  const [valItemTypeId, setValItemTypeId] = useState('');
  const [valPrice, setValPrice] = useState('');
  const [valLoading, setValLoading] = useState(false);

  // ── Form state — Create Character ────────────────────────────────────────
  const [charGameId, setCharGameId] = useState('');
  const [charTenant, setCharTenant] = useState('evefrontier');
  const [charName, setCharName] = useState('');
  const [charAddress, setCharAddress] = useState('');
  const [charLoading, setCharLoading] = useState(false);

  // ── Form state — Create Killmail ─────────────────────────────────────────
  const [kmCharObjectId, setKmCharObjectId] = useState('');
  const [kmSelectedIdx, setKmSelectedIdx] = useState(-1);
  const [kmKillmails, setKmKillmails] = useState<EveEyesKillmail[]>([]);
  const [kmFetchLoading, setKmFetchLoading] = useState(false);
  const [kmLoading, setKmLoading] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleDeposit() {
    if (!depositPoolId || !depositAmount) return;
    setDepositLoading(true);
    try {
      await execute('Deposit to Pool', () =>
        buildDeposit({
          poolId: depositPoolId,
          amountMist: suiToMist(depositAmount),
          senderAddress: account!.address,
        })
      );
    } finally {
      setDepositLoading(false);
    }
  }

  async function handlePurchasePolicy() {
    if (!ppPoolId || !ppCharId || !ppCoverage || !ppPayment) return;
    setPpLoading(true);
    try {
      await execute('Purchase Policy', () =>
        buildPurchasePolicy({
          poolId: ppPoolId,
          insuredAddress: ppCharId,
          coverageAmount: suiToMist(ppCoverage),
          includeSelfDestruct: ppSdRider,
          paymentAmountMist: suiToMist(ppPayment),
          senderAddress: account!.address,
        })
      );
    } finally {
      setPpLoading(false);
    }
  }

  async function handleSubmitClaim() {
    if (!claimPolicyId || !claimKillmailId || !claimPoolId) return;
    setClaimLoading(true);
    try {
      const builder = claimIsSd ? buildSubmitSelfDestructClaim : buildSubmitClaim;
      await execute(claimIsSd ? 'Submit SD Claim' : 'Submit Claim', () =>
        builder({
          policyId: claimPolicyId,
          killmailId: claimKillmailId,
          poolId: claimPoolId,
        })
      );
    } finally {
      setClaimLoading(false);
    }
  }

  async function handlePlaceBid() {
    if (!bidAuctionId || !bidAmount) return;
    setBidLoading(true);
    try {
      await execute('Place Bid', () =>
        buildPlaceBid({
          auctionId: bidAuctionId,
          bidAmountMist: suiToMist(bidAmount),
        })
      );
    } finally {
      setBidLoading(false);
    }
  }

  async function handleExpirePolicy() {
    if (!expPolicyId || !expPoolId) return;
    setExpLoading(true);
    try {
      await execute('Expire Policy', () =>
        buildExpirePolicy({
          policyId: expPolicyId,
          poolId: expPoolId,
        })
      );
    } finally {
      setExpLoading(false);
    }
  }

  async function handleSettleAuction() {
    if (!settleAuctionId || !settlePoolId) return;
    setSettleLoading(true);
    try {
      await execute('Settle Auction', () =>
        buildSettleAuction({
          auctionId: settleAuctionId,
          poolId: settlePoolId,
        })
      );
    } finally {
      setSettleLoading(false);
    }
  }

  async function handleCreatePool() {
    if (!createPoolAdminCap) return;
    setCreatePoolLoading(true);
    try {
      await execute('Create Pool (Tier ' + createPoolTier + ')', () =>
        buildAdminCreatePool({
          adminCapId: createPoolAdminCap,
          riskTier: Number(createPoolTier),
        }),
      );
    } finally {
      setCreatePoolLoading(false);
    }
  }

  async function handleSetItemPrice() {
    if (!valAdminCapId || !valItemTypeId || !valPrice) return;
    setValLoading(true);
    try {
      await execute('Set Item Price', () =>
        buildSetItemPrice({
          adminCapId: valAdminCapId,
          itemTypeId: parseInt(valItemTypeId, 10),
          pricePerUnit: suiToMist(valPrice),
        })
      );
    } finally {
      setValLoading(false);
    }
  }

  async function handleDestroyUnsold() {
    if (!destroyAuctionId) return;
    setDestroyLoading(true);
    try {
      await execute('Destroy Unsold Auction', () =>
        buildDestroyUnsold({ auctionId: destroyAuctionId })
      );
    } finally {
      setDestroyLoading(false);
    }
  }

  async function handleCreateCharacter() {
    if (!charGameId || !charName || !charAddress) return;
    setCharLoading(true);
    try {
      await execute('Create & Share Character', () =>
        buildCreateAndShareCharacter({
          gameCharacterId: Number(charGameId),
          tenant: charTenant || 'evefrontier',
          tribeId: 1,
          characterAddress: charAddress,
          name: charName,
        })
      );
    } finally {
      setCharLoading(false);
    }
  }

  async function handleFetchKillmails() {
    setKmFetchLoading(true);
    try {
      const items = await fetchKillmails(50);
      setKmKillmails(items);
      setKmSelectedIdx(-1);
    } catch (err) {
      toast(`Failed to fetch killmails: ${err}`, 'err');
    } finally {
      setKmFetchLoading(false);
    }
  }

  async function handleCreateKillmail() {
    const km = kmKillmails[kmSelectedIdx];
    if (!km || !kmCharObjectId) return;
    setKmLoading(true);
    try {
      await execute('Create Killmail On-Chain', () =>
        buildCreateKillmail({
          characterObjectId: kmCharObjectId,
          itemId: km.killmailItemId,
          killerId: km.killer.characterItemId,
          victimId: km.victim.characterItemId,
          killTimestamp: Math.floor(new Date(km.killTimestamp).getTime() / 1000),
          lossType: km.lossType === 'SHIP' ? 0 : 1,
          solarSystemId: km.solarSystemId,
        })
      );
    } finally {
      setKmLoading(false);
    }
  }

  // ── Not-connected guard ───────────────────────────────────────────────────

  if (!account) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-2xl text-orange-400 font-bold">
            Wreckage Insurance Protocol
          </div>
          <div className="text-gray-400 text-sm">
            Connect wallet to use demo panel
          </div>
        </div>
      </div>
    );
  }

  // ── Config fields ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configFields: [string, string][] = configObj
    ? Object.entries((configObj as any)?.content?.fields ?? {}).map(
        ([k, v]) => [k, String(v)]
      )
    : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-orange-400">
            Wreckage Insurance Protocol
          </h1>
          <p className="text-xs text-gray-500">Demo Panel · Hackathon Edition</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Connected</p>
          <p className="text-xs font-mono text-orange-300">
            {truncate(account.address, 8, 6)}
            <CopyButton text={account.address} />
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* ── Section 1: Protocol Status ─────────────────────────────────── */}
        <Section title="1. Protocol Status" defaultOpen>
          <div>
            <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">
              Shared Objects
            </p>
            <div className="space-y-1.5">
              {Object.entries(SHARED_OBJECTS).map(([name, id]) => (
                <div
                  key={name}
                  className="flex items-center justify-between bg-gray-900 rounded px-3 py-1.5"
                >
                  <span className="text-xs text-gray-400 w-32 shrink-0">
                    {name}
                  </span>
                  <span className="text-xs font-mono text-gray-300 truncate">
                    {id}
                  </span>
                  <CopyButton text={id} />
                </div>
              ))}
            </div>
          </div>

          {configFields.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">
                Protocol Config Fields
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {configFields.map(([k, v]) => (
                  <div
                    key={k}
                    className="bg-gray-900 rounded px-3 py-1.5 flex flex-col gap-0.5"
                  >
                    <span className="text-xs text-gray-500">{k}</span>
                    <span className="text-xs font-mono text-gray-200 truncate">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!configObj && (
            <p className="text-xs text-gray-600 italic">
              Loading protocol config…
            </p>
          )}
        </Section>

        {/* ── Section 2: Quick Actions ───────────────────────────────────── */}
        <Section title="2. Quick Actions" defaultOpen>
          {/* Deposit to Pool */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Deposit to Pool
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Pool ID</Label>
                <Input
                  value={depositPoolId}
                  onChange={setDepositPoolId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Amount (SUI)</Label>
                <Input
                  value={depositAmount}
                  onChange={setDepositAmount}
                  placeholder="10.0"
                  type="number"
                />
              </div>
            </div>
            <ExecButton
              onClick={handleDeposit}
              loading={depositLoading}
              disabled={!depositPoolId || !depositAmount}
            >
              Deposit
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Purchase Policy */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Purchase Policy
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Pool ID</Label>
                <Input
                  value={ppPoolId}
                  onChange={setPpPoolId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Character ID (Ship Object)</Label>
                <Input
                  value={ppCharId}
                  onChange={setPpCharId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Coverage (SUI)</Label>
                <Input
                  value={ppCoverage}
                  onChange={setPpCoverage}
                  placeholder="100.0"
                  type="number"
                />
              </div>
              <div>
                <Label>Premium Payment (SUI)</Label>
                <Input
                  value={ppPayment}
                  onChange={setPpPayment}
                  placeholder="2.0"
                  type="number"
                />
              </div>
            </div>
            <Toggle
              label="Include Self-Destruct Rider"
              checked={ppSdRider}
              onChange={setPpSdRider}
            />
            <ExecButton
              onClick={handlePurchasePolicy}
              loading={ppLoading}
              disabled={!ppPoolId || !ppCharId || !ppCoverage || !ppPayment}
            >
              Purchase Policy
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Submit Claim */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">Submit Claim</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Policy ID</Label>
                <Input
                  value={claimPolicyId}
                  onChange={setClaimPolicyId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Killmail ID</Label>
                <Input
                  value={claimKillmailId}
                  onChange={setClaimKillmailId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Pool ID</Label>
                <Input
                  value={claimPoolId}
                  onChange={setClaimPoolId}
                  placeholder="0x…"
                />
              </div>
            </div>
            <Toggle
              label="Self-Destruct Claim"
              checked={claimIsSd}
              onChange={setClaimIsSd}
            />
            <ExecButton
              onClick={handleSubmitClaim}
              loading={claimLoading}
              disabled={!claimPolicyId || !claimKillmailId || !claimPoolId}
            >
              Submit Claim
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Place Bid */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Place Bid (Salvage Auction)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Auction ID</Label>
                <Input
                  value={bidAuctionId}
                  onChange={setBidAuctionId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Bid Amount (SUI)</Label>
                <Input
                  value={bidAmount}
                  onChange={setBidAmount}
                  placeholder="5.0"
                  type="number"
                />
              </div>
            </div>
            <ExecButton
              onClick={handlePlaceBid}
              loading={bidLoading}
              disabled={!bidAuctionId || !bidAmount}
            >
              Place Bid
            </ExecButton>
          </div>
        </Section>

        {/* ── Section 3: Admin Actions ───────────────────────────────────── */}
        <Section title="3. Admin Actions (requires AdminCap)" defaultOpen={false}>
          <p className="text-xs text-yellow-600 bg-yellow-950 border border-yellow-800 rounded px-3 py-2">
            These calls require an AdminCap object owned by the connected wallet.
            Transactions will fail on-chain if no AdminCap is present.
          </p>

          {/* Create Pool */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">Create Risk Pool</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>AdminCap ID</Label>
                <Input
                  value={createPoolAdminCap}
                  onChange={setCreatePoolAdminCap}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Tier</Label>
                <select
                  value={createPoolTier}
                  onChange={(e) => setCreatePoolTier(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                >
                  {Object.entries(TIER_PRESETS).map(([tier, preset]) => (
                    <option key={tier} value={tier}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Creates a RiskPool + registers tier config in ProtocolConfig (one tx).
            </p>
            <ExecButton
              onClick={handleCreatePool}
              loading={createPoolLoading}
              disabled={!createPoolAdminCap}
            >
              Create Pool
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Expire Policy */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">Expire Policy</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Policy ID</Label>
                <Input
                  value={expPolicyId}
                  onChange={setExpPolicyId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Pool ID</Label>
                <Input
                  value={expPoolId}
                  onChange={setExpPoolId}
                  placeholder="0x…"
                />
              </div>
            </div>
            <ExecButton
              onClick={handleExpirePolicy}
              loading={expLoading}
              disabled={!expPolicyId || !expPoolId}
            >
              Expire Policy
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Settle Auction */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Settle Auction
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Auction ID</Label>
                <Input
                  value={settleAuctionId}
                  onChange={setSettleAuctionId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Pool ID</Label>
                <Input
                  value={settlePoolId}
                  onChange={setSettlePoolId}
                  placeholder="0x…"
                />
              </div>
            </div>
            <ExecButton
              onClick={handleSettleAuction}
              loading={settleLoading}
              disabled={!settleAuctionId || !settlePoolId}
            >
              Settle Auction
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Set Item Price (EVE Valuation) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Set Item Price (EVE Valuation Oracle)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label>AdminCap Object ID</Label>
                <Input
                  value={valAdminCapId}
                  onChange={setValAdminCapId}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Item Type ID</Label>
                <Input
                  value={valItemTypeId}
                  onChange={setValItemTypeId}
                  placeholder="e.g. 5555"
                  type="number"
                />
              </div>
              <div>
                <Label>Price Per Unit (SUI)</Label>
                <Input
                  value={valPrice}
                  onChange={setValPrice}
                  placeholder="1.0"
                  type="number"
                />
              </div>
            </div>
            <ExecButton
              onClick={handleSetItemPrice}
              loading={valLoading}
              disabled={!valAdminCapId || !valItemTypeId || !valPrice}
            >
              Set Item Price
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Destroy Unsold */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Destroy Unsold Auction
            </p>
            <div>
              <Label>Auction ID</Label>
              <Input
                value={destroyAuctionId}
                onChange={setDestroyAuctionId}
                placeholder="0x…"
              />
            </div>
            <ExecButton
              onClick={handleDestroyUnsold}
              loading={destroyLoading}
              disabled={!destroyAuctionId}
            >
              Destroy Unsold
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Create Character (prerequisite for killmail) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Create Character (World Object)
            </p>
            <p className="text-xs text-gray-500">
              Creates a shared Character object. Needed as reporter for killmail creation.
              Check tx effects for the created Character object ID.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Game Character ID</Label>
                <Input
                  value={charGameId}
                  onChange={setCharGameId}
                  placeholder="e.g. 2112000187"
                  type="number"
                />
              </div>
              <div>
                <Label>Character Name</Label>
                <Input
                  value={charName}
                  onChange={setCharName}
                  placeholder="e.g. ramonliao"
                />
              </div>
              <div>
                <Label>Wallet Address</Label>
                <Input
                  value={charAddress}
                  onChange={setCharAddress}
                  placeholder="0x…"
                />
              </div>
              <div>
                <Label>Tenant</Label>
                <Input
                  value={charTenant}
                  onChange={setCharTenant}
                  placeholder="evefrontier"
                />
              </div>
            </div>
            <ExecButton
              onClick={handleCreateCharacter}
              loading={charLoading}
              disabled={!charGameId || !charName || !charAddress}
            >
              Create & Share Character
            </ExecButton>
          </div>

          <div className="border-t border-gray-800" />

          {/* Create Killmail On-Chain */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-300">
              Create Killmail On-Chain
            </p>
            <p className="text-xs text-gray-500">
              Registers an Eve Eyes killmail as a shared Killmail object on SUI.
              Requires AdminACL sponsor (deployer wallet).
            </p>

            <div>
              <Label>Reporter Character Object ID</Label>
              <Input
                value={kmCharObjectId}
                onChange={setKmCharObjectId}
                placeholder="0x… (shared Character object)"
              />
            </div>

            <ExecButton
              onClick={handleFetchKillmails}
              loading={kmFetchLoading}
            >
              Fetch Eve Eyes Killmails
            </ExecButton>

            {kmKillmails.length > 0 && (
              <>
                <Label>Select Killmail</Label>
                <select
                  value={kmSelectedIdx}
                  onChange={(e) => setKmSelectedIdx(Number(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                >
                  <option value={-1}>— Select —</option>
                  {kmKillmails.map((km, idx) => {
                    const date = new Date(km.killTimestamp).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <option key={km.killmailItemId} value={idx}>
                        #{km.killmailItemId} — {km.victim.label} killed by {km.killer.label} ({date})
                      </option>
                    );
                  })}
                </select>

                {kmSelectedIdx >= 0 && kmKillmails[kmSelectedIdx] && (
                  <div className="text-xs text-gray-500 bg-gray-900 rounded p-2 space-y-0.5">
                    <p>Item ID: <span className="text-gray-300">{kmKillmails[kmSelectedIdx].killmailItemId}</span></p>
                    <p>Killer: <span className="text-gray-300">{kmKillmails[kmSelectedIdx].killer.label} ({kmKillmails[kmSelectedIdx].killer.characterItemId})</span></p>
                    <p>Victim: <span className="text-gray-300">{kmKillmails[kmSelectedIdx].victim.label} ({kmKillmails[kmSelectedIdx].victim.characterItemId})</span></p>
                    <p>Timestamp: <span className="text-gray-300">{kmKillmails[kmSelectedIdx].killTimestamp}</span></p>
                    <p>System: <span className="text-gray-300">{kmKillmails[kmSelectedIdx].solarSystemId}</span></p>
                    <p>Loss Type: <span className="text-gray-300">{kmKillmails[kmSelectedIdx].lossType}</span></p>
                  </div>
                )}
              </>
            )}

            <ExecButton
              onClick={handleCreateKillmail}
              loading={kmLoading}
              disabled={!kmCharObjectId || kmSelectedIdx < 0}
            >
              Create Killmail On-Chain
            </ExecButton>
          </div>
        </Section>

        {/* ── Section 4: Transaction Log ─────────────────────────────────── */}
        <Section title="4. Transaction Log" defaultOpen>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">
              {txLog.length} transaction{txLog.length !== 1 ? 's' : ''}
            </span>
            {txLog.length > 0 && (
              <button
                onClick={() => setTxLog([])}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                Clear Log
              </button>
            )}
          </div>

          {txLog.length === 0 ? (
            <p className="text-xs text-gray-700 italic text-center py-4">
              No transactions yet — execute an action above.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {txLog.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 rounded px-3 py-2 text-xs border ${
                    entry.status === 'success'
                      ? 'bg-green-950 border-green-900'
                      : 'bg-red-950 border-red-900'
                  }`}
                >
                  <span
                    className={
                      entry.status === 'success'
                        ? 'text-green-400 mt-0.5'
                        : 'text-red-400 mt-0.5'
                    }
                  >
                    {entry.status === 'success' ? '✓' : '✗'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-200">
                        {entry.action}
                      </span>
                      <span className="text-gray-600">
                        {entry.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {entry.digest && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <a
                          href={`${EXPLORER_BASE}/${entry.digest}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-orange-400 hover:text-orange-300 underline truncate"
                        >
                          {truncate(entry.digest, 10, 6)}
                        </a>
                        <CopyButton text={entry.digest} />
                      </div>
                    )}
                    {entry.error && (
                      <p className="text-red-400 mt-0.5 truncate" title={entry.error}>
                        {entry.error}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Toast container */}
      <Toast toasts={toasts} />
    </div>
  );
}
