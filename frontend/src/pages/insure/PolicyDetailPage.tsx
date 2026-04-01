import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePolicyDetail, useRenewPolicy, useCancelPolicy, useTransferPolicy, useExpirePolicy } from '../../hooks/useInsurancePolicy';
import { useDiscoverPools } from '../../hooks/useDiscoverPools';
import type { RiskTier } from '../../lib/types';
import { TIER_NAMES } from '../../lib/types';
// Premium rates by tier (bps) — used for renewal estimate display only.
// Accurate values come from on-chain ProtocolConfig; these are fallback defaults.
const TIER_PREMIUM_BPS: Record<number, number> = { 0: 500, 1: 800, 2: 1200 };

const MIST_PER_SUI = 1_000_000_000;

function mistToSui(mist: number | string): string {
  const n = Number(mist);
  if (!Number.isFinite(n)) return '0.0000';
  return (n / MIST_PER_SUI).toFixed(4);
}

const TIER_BADGE: Record<number, string> = {
  0: 'bg-green-500/20 text-green-400 border-green-500/40',
  1: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  2: 'bg-red-500/20 text-red-400 border-red-500/40',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400',
  expired: 'bg-gray-500/20 text-gray-400',
  claimed: 'bg-blue-500/20 text-blue-400',
  cancelled: 'bg-orange-500/20 text-orange-400',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractFields(obj: any): Record<string, any> | null {
  try {
    return obj?.content?.fields ?? null;
  } catch {
    return null;
  }
}

function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-sm text-gray-200 ${mono ? 'font-mono break-all' : ''}`}>{value}</span>
    </div>
  );
}

export default function PolicyDetailPage() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const { data: policyObj, isLoading, error } = usePolicyDetail(policyId);
  const { execute: renew, isPending: renewPending, error: renewError } = useRenewPolicy();

  const { execute: cancel, isPending: cancelPending, error: cancelError } = useCancelPolicy();
  const { execute: transferPolicy, isPending: transferPending, error: transferError } = useTransferPolicy();
  const { execute: expire, isPending: expirePending, error: expireError } = useExpirePolicy();

  const { data: pools } = useDiscoverPools();

  const [renewPoolId, setRenewPoolId] = useState('');
  const [renewPaymentSui, setRenewPaymentSui] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [actionPoolId, setActionPoolId] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');

  // Extract fields (safe even when policyObj is null)
  const fields = policyObj ? extractFields(policyObj) : null;
  const objectId: string = policyObj
    ? ((policyObj as { objectId?: string; id?: string }).objectId ?? policyId ?? '')
    : (policyId ?? '');

  const tier = Number(fields?.risk_tier ?? fields?.tier ?? 0) as RiskTier;
  const coverage = Number(fields?.coverage_amount ?? fields?.coverageAmount ?? 0);
  const premiumPaid = Number(fields?.premium_paid ?? fields?.premiumPaid ?? 0);
  const createdAt = Number(fields?.created_at ?? fields?.createdAt ?? 0);
  const expiresAt = Number(fields?.expires_at ?? fields?.expiresAt ?? 0);
  const ncbStreak = Number(fields?.no_claim_streak ?? fields?.ncb_streak ?? 0);
  const claimCount = Number(fields?.claim_count ?? fields?.claimCount ?? 0);
  const hasSdRider = Boolean(fields?.has_self_destruct_rider ?? fields?.hasSelfDestructRider ?? false);
  const insuredAddress: string = fields?.insured_character_id ?? fields?.character_id ?? '';
  const rawStatus = fields?.status;
  const statusNum = typeof rawStatus === 'number' ? rawStatus : parseInt(String(rawStatus ?? '0'), 10);
  const status = statusNum === 0 ? 'active' : statusNum === 1 ? 'claimed' : statusNum === 2 ? 'expired' : statusNum === 3 ? 'cancelled' : 'expired';

  // Auto-populate pool ID from policy's risk_tier
  const resolvedPoolId = useMemo(
    () => pools?.find((p) => p.riskTier === tier)?.poolId ?? '',
    [pools, tier],
  );

  useEffect(() => {
    if (resolvedPoolId && !renewPoolId) setRenewPoolId(resolvedPoolId);
  }, [resolvedPoolId, renewPoolId]);

  useEffect(() => {
    if (resolvedPoolId && !actionPoolId) setActionPoolId(resolvedPoolId);
  }, [resolvedPoolId, actionPoolId]);

  // Estimate renewal premium
  const renewalEstimate = useMemo(() => {
    const bps = TIER_PREMIUM_BPS[tier] ?? 500;
    const base = (Number(mistToSui(coverage)) * bps) / 10000;
    return (hasSdRider ? base * 1.3 : base).toFixed(4);
  }, [tier, coverage, hasSdRider]);

  // Auto-fill renewal payment with estimate
  useEffect(() => {
    if (renewalEstimate && !renewPaymentSui) setRenewPaymentSui(renewalEstimate);
  }, [renewalEstimate, renewPaymentSui]);

  // Early returns AFTER all hooks
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm p-8">
        <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-orange-400 rounded-full animate-spin" />
        Loading policy…
      </div>
    );
  }

  if (error || !policyObj) {
    return (
      <div className="p-8 space-y-4">
        <p className="text-red-400 text-sm">{error?.message ?? 'Policy not found'}</p>
        <button
          onClick={() => navigate('/insure')}
          className="text-sm text-orange-400 hover:text-orange-300"
        >
          ← Back to Insurance
        </button>
      </div>
    );
  }

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    setToast(null);
    if (!renewPoolId.trim() || !renewPaymentSui) {
      setToast({ type: 'error', msg: 'Pool ID and payment amount are required.' });
      return;
    }
    try {
      const parsed = parseFloat(renewPaymentSui);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setToast({ type: 'error', msg: 'Invalid payment amount.' });
        return;
      }
      const paymentMist = BigInt(Math.round(parsed * 1e9));
      const digest = await renew({
        policyId: objectId,
        poolId: renewPoolId.trim(),
        paymentAmountMist: paymentMist,
      });
      setToast({ type: 'success', msg: `Policy renewed! Tx: ${digest}` });
      setRenewPoolId('');
      setRenewPaymentSui('');
    } catch {
      // error from hook
    }
  }

  async function handleCancel() {
    if (!actionPoolId.trim()) { setToast({ type: 'error', msg: 'Pool ID required for cancel.' }); return; }
    if (!window.confirm('Cancel this policy? This is irreversible and premium will NOT be refunded.')) return;
    setToast(null);
    try {
      const digest = await cancel({ policyId: objectId, poolId: actionPoolId.trim() });
      setToast({ type: 'success', msg: `Policy cancelled! Tx: ${digest}` });
    } catch { /* error from hook */ }
  }

  async function handleTransfer() {
    if (!transferRecipient.trim()) { setToast({ type: 'error', msg: 'Recipient address required.' }); return; }
    setToast(null);
    try {
      const digest = await transferPolicy({ policyId: objectId, recipient: transferRecipient.trim() });
      setToast({ type: 'success', msg: `Policy transferred! Tx: ${digest}` });
      setTransferRecipient('');
    } catch { /* error from hook */ }
  }

  async function handleExpire() {
    if (!actionPoolId.trim()) { setToast({ type: 'error', msg: 'Pool ID required for expire.' }); return; }
    setToast(null);
    try {
      const digest = await expire({ policyId: objectId, poolId: actionPoolId.trim() });
      setToast({ type: 'success', msg: `Policy expired! Tx: ${digest}` });
    } catch { /* error from hook */ }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Back nav */}
      <button
        onClick={() => navigate('/insure')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        ← Back to Insurance
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Policy Detail</h1>
          <p className="text-xs text-gray-600 font-mono mt-0.5 break-all">{objectId}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${TIER_BADGE[tier] ?? TIER_BADGE[0]}`}>
            {TIER_NAMES[tier] ?? `Tier ${tier}`}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_BADGE[status] ?? STATUS_BADGE['expired']}`}>
            {status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium break-all ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
              : 'bg-red-500/15 border border-red-500/40 text-red-300'
          }`}
        >
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-3 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Fields grid */}
      {fields ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 grid grid-cols-2 gap-5">
          <Field label="Coverage" value={`${mistToSui(coverage)} SUI`} />
          <Field label="Premium Paid" value={`${mistToSui(premiumPaid)} SUI`} />
          <Field label="Created At" value={createdAt ? new Date(createdAt * 1000).toLocaleString() : '—'} />
          <Field label="Expires At" value={expiresAt ? new Date(expiresAt * 1000).toLocaleString() : '—'} />
          <Field label="NCB Streak" value={
            <span className={ncbStreak > 0 ? 'text-orange-400 font-semibold' : ''}>
              {ncbStreak}
            </span>
          } />
          <Field label="Claims" value={claimCount} />
          <Field label="SD Rider" value={
            hasSdRider
              ? <span className="text-purple-400">Enabled</span>
              : <span className="text-gray-600">None</span>
          } />
          <Field label="Risk Tier" value={`${TIER_NAMES[tier] ?? tier} (${TIER_PREMIUM_BPS[tier] / 100 ?? '?'}%)`} />
          {insuredAddress && <Field label="Insured Address" value={insuredAddress} mono />}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-sm text-gray-500">Raw object ID: <span className="font-mono">{objectId}</span></p>
          <p className="text-xs text-gray-600 mt-1">Content fields not available — check object ownership or type.</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-4">
        {/* Claim link */}
        <Link
          to={`/claims?policyId=${objectId}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-400 text-sm font-medium hover:bg-blue-500/20 transition-colors"
        >
          Submit a Claim for this Policy
        </Link>

        {/* Renew form — only if active */}
        {status === 'active' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-200">Renew Policy</h2>
            <form onSubmit={handleRenew} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1" htmlFor="renew-pool">
                  Risk Pool
                </label>
                <input
                  id="renew-pool"
                  type="text"
                  value={renewPoolId}
                  onChange={(e) => setRenewPoolId(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-500 ${
                    resolvedPoolId ? 'bg-gray-800/50 border-gray-700/50 text-gray-400' : 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-600'
                  }`}
                  placeholder="0x..."
                />
                {resolvedPoolId && (
                  <p className="text-[11px] text-gray-600 mt-1">Auto-filled from Tier {tier} pool</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1" htmlFor="renew-payment">
                  Renewal Premium (SUI)
                </label>
                <div className="relative">
                  <input
                    id="renew-payment"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={renewPaymentSui}
                    onChange={(e) => setRenewPaymentSui(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">SUI</span>
                </div>
                <p className="text-[11px] text-gray-600 mt-1">
                  Estimated: <span className="text-orange-400">{renewalEstimate} SUI</span>
                  {' '}(Tier {tier}, {TIER_PREMIUM_BPS[tier] / 100}%{hasSdRider ? ' + SD rider' : ''})
                </p>
              </div>
              {renewError && <p className="text-red-400 text-sm break-all">{renewError}</p>}
              <button
                type="submit"
                disabled={renewPending}
                className="w-full py-2.5 rounded-lg font-semibold text-sm bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {renewPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Waiting for wallet…
                  </span>
                ) : (
                  'Renew Policy'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Policy Actions — cancel/transfer/expire */}
        {status === 'active' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-200">Policy Actions</h2>

            {/* Shared Pool ID input — auto-filled */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Risk Pool</label>
              <input
                type="text"
                value={actionPoolId}
                onChange={(e) => setActionPoolId(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-orange-500 ${
                  resolvedPoolId ? 'bg-gray-800/50 border-gray-700/50 text-gray-400' : 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-600'
                }`}
                placeholder="0x..."
              />
              {resolvedPoolId && (
                <p className="text-[11px] text-gray-600 mt-1">Auto-filled from Tier {tier} pool</p>
              )}
            </div>

            {/* Transfer */}
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Transfer to</label>
              <input
                type="text"
                value={transferRecipient}
                onChange={(e) => setTransferRecipient(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="Recipient address (0x...)"
              />
              <p className="text-xs text-gray-600">Warning: NCB streak will be reset and cooldown applied.</p>
              <button
                onClick={handleTransfer}
                disabled={transferPending}
                className="w-full py-2 rounded-lg text-sm font-semibold border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
              >
                {transferPending ? 'Transferring...' : 'Transfer Policy'}
              </button>
              {transferError && <p className="text-red-400 text-xs">{transferError}</p>}
            </div>

            {/* Cancel */}
            <div className="pt-3 border-t border-gray-800 space-y-2">
              <p className="text-xs text-red-400/80">Cancel is irreversible. Premium is NOT refunded.</p>
              <button
                onClick={handleCancel}
                disabled={cancelPending}
                className="w-full py-2 rounded-lg text-sm font-semibold border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {cancelPending ? 'Cancelling...' : 'Cancel Policy'}
              </button>
              {cancelError && <p className="text-red-400 text-xs">{cancelError}</p>}
            </div>
          </div>
        )}

        {/* Expire button — only if active and past expiry */}
        {status === 'active' && expiresAt > 0 && Date.now() / 1000 > expiresAt && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-gray-200">Expire Policy</h2>
            <p className="text-xs text-gray-500">This policy has passed its expiry date and can be formally expired.</p>
            {!actionPoolId.trim() && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Risk Pool Object ID</label>
                <input
                  type="text"
                  value={actionPoolId}
                  onChange={(e) => setActionPoolId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-orange-500"
                  placeholder="0x..."
                />
              </div>
            )}
            <button
              onClick={handleExpire}
              disabled={expirePending}
              className="w-full py-2 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 transition-colors"
            >
              {expirePending ? 'Expiring...' : 'Expire Policy'}
            </button>
            {expireError && <p className="text-red-400 text-xs">{expireError}</p>}
          </div>
        )}

        {status !== 'active' && (
          <p className="text-center text-xs text-gray-600">
            This policy is <span className="text-gray-500">{status}</span> and cannot be renewed.
          </p>
        )}
      </div>
    </div>
  );
}
