'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import AppShell from '../components/AppShell';
import { PLANS } from '../../lib/pricing';

function fmtPrice(symbol, amount) {
  if (!amount) return 'Free';
  const n = Number.isInteger(amount) ? amount : amount.toFixed(1);
  return `${symbol}${n}`;
}

export default function PricingPage() {
  const { user } = useAuth();
  const [pricing, setPricing] = useState(null); // { currency, symbol, prices, country, band }

  useEffect(() => {
    fetch('/api/pricing')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPricing(d); })
      .catch(() => {});
  }, []);

  const symbol = pricing?.symbol || '$';
  const prices = pricing?.prices || { free: 0, member: 6, team: 5 };
  const currentTier = user?.tier || (user ? 'free' : null);

  const startCheckout = (plan) => {
    if (plan.comingSoon) return;
    const planId = plan.id;
    if (planId === 'free') { window.location.href = user ? '/' : '/sign-in'; return; }
    if (!user) { window.location.href = '/sign-in'; return; }
    // Server route signs the handoff token (region price + buyer) and redirects
    // to Elixpo Pay's hosted checkout.
    window.location.href = `/api/checkout?plan=${encodeURIComponent(planId)}`;
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="text-center mb-3">
          <h1 className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>Plans that grow with you</h1>
          <p className="text-[15px] mt-2" style={{ color: 'var(--text-muted)' }}>
            Start free with the complete editor. Upgrade for more storage, collaboration, and publishing controls.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3 mt-10">
          {PLANS.map((plan) => {
            const isCurrent = currentTier === plan.id;
            const amount = plan.comingSoon ? null : (prices[plan.id] ?? 0);
            const highlighted = plan.highlighted;
            return (
              <div
                key={plan.id}
                className="rounded-2xl p-6 flex flex-col"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: highlighted ? '1.5px solid #9b7bf7' : '1px solid var(--border-default)',
                  boxShadow: highlighted ? '0 12px 40px rgba(155,123,247,0.12)' : 'none',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>{plan.name}</h3>
                  {plan.comingSoon ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>Coming soon</span>
                  ) : highlighted ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: '#9b7bf71f', color: '#9b7bf7' }}>Popular</span>
                  ) : null}
                </div>
                <p className="text-[12px] mb-4" style={{ color: 'var(--text-muted)' }}>{plan.tagline}</p>

                <div className="mb-5">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{plan.comingSoon ? 'Not available' : fmtPrice(symbol, amount)}</span>
                  {amount !== null && amount > 0 ? (
                    <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}> /{plan.perSeat ? 'seat · mo' : 'mo'}</span>
                  ) : null}
                </div>

                <ul className="flex-1 space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--text-body)' }}>
                      <ion-icon name="checkmark-circle" style={{ fontSize: '16px', color: '#9b7bf7', flexShrink: 0, marginTop: '1px' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                  {(plan.upcomingFeatures || []).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                      <ion-icon name="time-outline" style={{ fontSize: '16px', color: 'var(--text-faint)', flexShrink: 0, marginTop: '1px' }} />
                      <span>{feature} <span className="ml-1 rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Coming soon</span></span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => startCheckout(plan)}
                  disabled={isCurrent || plan.comingSoon}
                  className="w-full py-2.5 rounded-xl text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-default"
                  style={
                    isCurrent || plan.comingSoon
                      ? { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                      : highlighted
                        ? { backgroundColor: '#9b7bf7', color: '#fff' }
                        : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }
                  }
                >
                  {plan.comingSoon ? 'Coming soon' : isCurrent ? 'Current plan' : plan.id === 'free' ? 'Get started' : `Upgrade to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[12px] mt-8" style={{ color: 'var(--text-faint)' }}>
          {pricing?.country ? `Prices adjusted for your region (${pricing.country}). ` : ''}
          Prices are monthly in {pricing?.currency || 'USD'}. Checkout and subscription terms are provided by Elixpo Pay.
        </p>

        <div className="mt-12 grid gap-4 border-t border-[var(--border-default)] pt-8 md:grid-cols-3">
          {[
            ['Regional pricing', 'Available plan prices are adjusted by country and shown before checkout.'],
            ['Bring your own storage', 'Connect personal Cloudinary on any available plan; provider charges and quotas remain separate.'],
            ['Bring your own image generation', 'Connect Pollinations on any plan. Generations use your Pollinations Pollen balance and provider limits.'],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-xl bg-[var(--bg-surface)] p-4">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
