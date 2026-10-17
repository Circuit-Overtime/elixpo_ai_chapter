export const runtime = 'edge';

import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import {
  CURRENCY_SYMBOL,
  type SellableTier,
  TIER_LIMITS,
  TIER_PRICING,
} from '@/lib/types';

const CARD_STYLE = {
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,250,250,0.92) 100%)',
  border: '1px solid rgba(0,0,0,0.10)',
  backdropFilter: 'blur(20px)',
} as const;

function fmtRetention(days: number): string {
  return days >= 365 ? `${Math.round(days / 365)} year` : `${days} days`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  past_due: 'Payment overdue',
  canceled: 'Canceled',
  none: 'Active',
};

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { upgraded } = await searchParams;
  const user = (await getCurrentUser())!;
  const db = getDB();
  const limits = TIER_LIMITS[user.tier];

  const [urlCount, keyCount] = await Promise.all([
    db
      .prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?')
      .bind(user.id)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as count FROM api_keys
         WHERE user_id = ? AND is_active = 1
         AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
      )
      .bind(user.id)
      .first<{ count: number }>(),
  ]);

  const isEnterprise = user.tier === 'enterprise';
  const isPaid = user.tier !== 'free' && !isEnterprise;
  const pricing = isEnterprise ? null : TIER_PRICING[user.tier as SellableTier];
  // INR monthly is the headline figure for the current-plan card.
  const headlineAmount = pricing ? pricing.price.INR.monthly : 0;
  const billingStatus = user.billing_status ?? 'none';
  const statusLabel = STATUS_LABEL[billingStatus] ?? 'Active';
  const isCanceled = billingStatus === 'canceled';

  const usedUrls = urlCount?.count ?? 0;
  const usedKeys = keyCount?.count ?? 0;
  const urlPct =
    limits.maxUrls === -1 ? 0 : Math.min(100, Math.round((usedUrls / limits.maxUrls) * 100));

  return (
    <div className="w-full max-w-4xl mx-auto py-2 px-2">
      <div className="mb-6">
        <h1 className="text-2xl md:text-[1.8rem] font-bold text-white tracking-tight">
          Subscription
        </h1>
        <p className="text-sm text-white/55 mt-1">
          Your current plan, usage, and billing.
        </p>
      </div>

      {upgraded && (
        <div
          className="mb-6 p-4 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: '#6ee7b7' }} />
          <div className="text-sm text-[#a7f3d0]">
            Payment received — you&apos;re on <strong className="capitalize">{user.tier}</strong>. Your
            new limits are active now.
          </div>
        </div>
      )}

      {/* Current plan */}
      <div className="p-6 rounded-2xl mb-6" style={CARD_STYLE}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-md text-[0.78rem] font-bold uppercase tracking-wider"
              style={{
                background: 'rgba(229,57,53,0.18)',
                color: '#c62828',
                border: '1px solid rgba(229,57,53,0.4)',
              }}
            >
              {user.tier}
            </span>
            <div>
              <div className="text-base font-bold text-white">
                {isEnterprise
                  ? 'Enterprise — custom plan'
                  : `${pricing?.name} plan`}
              </div>
              <div className="text-[0.8rem] text-white/55 mt-0.5">
                {isPaid
                  ? `${CURRENCY_SYMBOL.INR}${headlineAmount.toLocaleString()}/mo · autopay`
                  : isEnterprise
                    ? 'Billed by agreement'
                    : 'Free forever · no card on file'}
              </div>
            </div>
          </div>

          {(() => {
            const tone =
              billingStatus === 'past_due'
                ? { bg: 'rgba(251,191,36,0.12)', fg: '#fde68a', dot: '#fbbf24', bd: 'rgba(251,191,36,0.3)' }
                : isCanceled
                  ? { bg: 'rgba(248,113,113,0.12)', fg: '#fca5a5', dot: '#f87171', bd: 'rgba(248,113,113,0.3)' }
                  : { bg: 'rgba(52,211,153,0.12)', fg: '#6ee7b7', dot: '#6ee7b7', bd: 'rgba(52,211,153,0.3)' };
            return (
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[0.75rem] font-semibold self-start sm:self-center"
                style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }} />
                {statusLabel}
              </span>
            );
          })()}
        </div>

        {/* Billing meta — populated by the Elixpo Pay entitlement webhook. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/8">
          <Meta label="Status" value={statusLabel} />
          <Meta
            label={isCanceled ? 'Access until' : 'Renews'}
            value={isPaid ? fmtDate(user.tier_expires_at) : '—'}
          />
          <Meta label="Payment method" value={isPaid ? 'UPI / Card mandate' : '—'} />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mt-6">
          {!isPaid && !isEnterprise && (
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] text-sm font-semibold text-white no-underline"
              style={{
                background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
              }}
            >
              Upgrade plan
            </Link>
          )}
          {/* Active paid plan → change or cancel. Already cancelled/lapsing →
              no cancel button; offer resubscribe instead. */}
          {isPaid && !isCanceled && (
            <>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] text-sm font-semibold text-white no-underline"
                style={{
                  background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                  boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
                }}
              >
                Change plan
              </Link>
              <a
                href="mailto:hello@elixpo.com?subject=ElixpoURL%20cancel%20subscription"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] text-sm font-medium text-white/80 no-underline"
                style={{ border: '1px solid rgba(0,0,0,0.14)' }}
              >
                Cancel subscription
              </a>
            </>
          )}
          {isPaid && isCanceled && (
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] text-sm font-semibold text-white no-underline"
              style={{
                background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
              }}
            >
              Resubscribe
            </Link>
          )}
          {isEnterprise && (
            <a
              href="mailto:hello@elixpo.com?subject=ElixpoURL%20Enterprise"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] text-sm font-medium text-white/80 no-underline"
              style={{ border: '1px solid rgba(0,0,0,0.14)' }}
            >
              Contact your account manager
            </a>
          )}
        </div>
      </div>

      {/* Usage vs plan limits */}
      <div className="p-6 rounded-2xl mb-6" style={CARD_STYLE}>
        <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45 mb-4">
          Usage this plan
        </div>

        <div className="mb-5">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-white/70">Short links</span>
            <span className="text-white/55">
              {usedUrls.toLocaleString()} / {limits.maxUrls === -1 ? '∞' : limits.maxUrls.toLocaleString()}
            </span>
          </div>
          {limits.maxUrls !== -1 && (
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(urlPct, 2)}%`,
                  background:
                    urlPct >= 100
                      ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                      : urlPct >= 80
                        ? 'linear-gradient(90deg,#fbbf24,#f59e0b)'
                        : 'linear-gradient(90deg,#e53935,#c62828)',
                }}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Meta
            label="API keys"
            value={`${usedKeys} / ${limits.maxApiKeys}`}
          />
          <Meta label="Analytics retention" value={fmtRetention(limits.maxClicksRetention)} />
          <Meta label="Custom slugs" value={limits.customCodes ? 'Included' : '—'} />
        </div>
      </div>

      {/* What's included */}
      {!isEnterprise && pricing && (
        <div className="p-6 rounded-2xl" style={CARD_STYLE}>
          <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45 mb-4">
            What&apos;s included
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0">
            {planFeatures(user.tier as SellableTier).map((f) => (
              <li key={f} className="text-[0.88rem] text-white/75 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#e53935' }} />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.65rem] text-white/45 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function planFeatures(tier: SellableTier): string[] {
  const l = TIER_LIMITS[tier];
  const out = [
    `${l.maxUrls.toLocaleString()} short links`,
    `${fmtRetention(l.maxClicksRetention)} click analytics`,
    `${l.maxApiKeys} API key${l.maxApiKeys === 1 ? '' : 's'}`,
  ];
  if (l.customCodes) out.push('Custom slugs');
  if (l.analytics) out.push('Geo / device analytics + CSV export');
  if (l.expiringLinks) out.push('Expiring links');
  if (l.qrLogo) out.push('Custom QR logos and styles');
  return out;
}
