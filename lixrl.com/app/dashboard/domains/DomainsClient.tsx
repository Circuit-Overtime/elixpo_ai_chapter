'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PublicSubdomain } from '@/lib/subdomain-control';
import type { Tier } from '@/lib/types';

export interface DomainLinkView {
  subdomain_id: number;
  short_code: string;
  fallback_code: string;
  title: string | null;
  original_url: string;
}

interface UrlChoice {
  short_code: string;
  title: string | null;
  original_url: string;
}

export default function DomainsClient({
  tier,
  allowance,
  domains,
  urls,
  links,
}: {
  tier: Tier;
  allowance: number;
  domains: PublicSubdomain[];
  urls: UrlChoice[];
  links: DomainLinkView[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<number, { url: string; code: string }>>({});
  const canClaim = allowance === -1 || domains.length < allowance;

  const mutate = async (key: string, endpoint: string, init: RequestInit) => {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(endpoint, init);
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Request failed');
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const claim = async () => {
    const ok = await mutate('claim', '/api/subdomains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (ok) setLabel('');
  };

  if (allowance === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-2 py-2">
        <h1 className="text-2xl font-bold text-[#111]">Branded subdomains</h1>
        <div className="mt-6 rounded-2xl border border-[#f0c8c6] bg-[#fff7f6] p-6 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#c62828]">Paid feature</p>
          <h2 className="mt-2 text-2xl font-bold text-[#111]">Publish on your own lixrl.com subdomain</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#666]">
            Pro includes one single-level subdomain; Business includes three. Each has isolated codes, TLS, analytics, and a canonical lixrl.com fallback.
          </p>
          <Link href="/pricing" className="mt-5 inline-flex rounded-full bg-[#111] px-5 py-2.5 text-sm font-bold text-white no-underline">
            Compare paid plans
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-2">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#c62828]">{tier} entitlement</p>
          <h1 className="mt-1 text-2xl font-bold text-[#111]">Branded subdomains</h1>
          <p className="mt-2 text-sm text-[#666]">Reserve one DNS label under lixrl.com, verify the wildcard route, then map your links.</p>
        </div>
        <div className="rounded-full border border-[#ddd] px-4 py-2 text-xs font-semibold text-[#555]">
          {domains.length} / {allowance === -1 ? 'Unlimited' : allowance} claimed
        </div>
      </div>

      {error && <div className="mt-5 rounded-xl border border-[#efb5b2] bg-[#fff5f4] px-4 py-3 text-sm text-[#a42622]">{error}</div>}

      <section className="mt-6 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-5">
        <label htmlFor="subdomain-label" className="text-sm font-bold text-[#111]">Claim a subdomain</label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center overflow-hidden rounded-xl border border-[#d8d8d8] bg-white focus-within:border-[#e53935]">
            <input
              id="subdomain-label"
              value={label}
              onChange={(event) => setLabel(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="your-brand"
              maxLength={32}
              disabled={!canClaim || busy !== null}
              className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-[#111] outline-none"
            />
            <span className="border-l border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 font-mono text-sm text-[#777]">.lixrl.com</span>
          </div>
          <button
            type="button"
            onClick={claim}
            disabled={!canClaim || !label || busy !== null}
            className="rounded-xl bg-[#111] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'claim' ? 'Claiming…' : 'Claim'}
          </button>
        </div>
        <p className="mt-2 text-xs text-[#777]">3–32 lowercase letters, numbers, or interior hyphens. Reserved product labels cannot be claimed.</p>
      </section>

      <div className="mt-6 space-y-5">
        {domains.map((domain) => {
          const domainLinks = links.filter((link) => link.subdomain_id === domain.id);
          const draft = mapping[domain.id] || { url: urls[0]?.short_code || '', code: '' };
          const active = domain.status === 'active';
          return (
            <section key={domain.id} className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`https://${domain.hostname}`} className="font-mono text-lg font-bold text-[#111] no-underline hover:text-[#c62828]">{domain.hostname}</a>
                    <StatusBadge status={domain.status} />
                    {!!domain.is_default && <span className="rounded-full bg-[#111] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Default</span>}
                  </div>
                  <p className="mt-2 text-xs text-[#777]">
                    {active ? 'TLS and routing verified. New links use this domain when it is the default.' : domain.last_error || 'Waiting for wildcard DNS and TLS route verification.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!active && domain.status !== 'removed' && (
                    <button type="button" disabled={busy !== null} onClick={() => mutate(`verify-${domain.id}`, `/api/subdomains/${domain.id}/verify`, { method: 'POST' })} className="rounded-lg bg-[#e53935] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {busy === `verify-${domain.id}` ? 'Verifying…' : 'Verify route'}
                    </button>
                  )}
                  {active && !domain.is_default && (
                    <button type="button" disabled={busy !== null} onClick={() => mutate(`default-${domain.id}`, `/api/subdomains/${domain.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_default: true }) })} className="rounded-lg border border-[#d5d5d5] px-3 py-2 text-xs font-semibold text-[#444] disabled:opacity-50">Make default</button>
                  )}
                  <button type="button" disabled={busy !== null} onClick={() => window.confirm(`Remove ${domain.hostname}? Its branded links will stop immediately.`) && mutate(`remove-${domain.id}`, `/api/subdomains/${domain.id}`, { method: 'DELETE' })} className="rounded-lg border border-[#efc1bf] px-3 py-2 text-xs font-semibold text-[#b32622] disabled:opacity-50">Remove</button>
                </div>
              </div>

              {active && (
                <div className="mt-6 border-t border-[#ececec] pt-5">
                  <h3 className="text-sm font-bold text-[#111]">Map a link</h3>
                  <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto]">
                    <select value={draft.url} onChange={(event) => setMapping((current) => ({ ...current, [domain.id]: { ...draft, url: event.target.value } }))} className="rounded-lg border border-[#ddd] bg-white px-3 py-2.5 text-sm text-[#333]">
                      {urls.map((url) => <option key={url.short_code} value={url.short_code}>{url.title || url.short_code} · /{url.short_code}</option>)}
                    </select>
                    <input value={draft.code} onChange={(event) => setMapping((current) => ({ ...current, [domain.id]: { ...draft, code: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') } }))} placeholder="Branded code (optional)" className="rounded-lg border border-[#ddd] px-3 py-2.5 text-sm text-[#333]" />
                    <button type="button" disabled={!draft.url || busy !== null} onClick={() => mutate(`map-${domain.id}`, `/api/subdomains/${domain.id}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url_code: draft.url, short_code: draft.code || undefined }) })} className="rounded-lg bg-[#111] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Map</button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {domainLinks.map((link) => (
                      <div key={link.short_code} className="flex flex-col justify-between gap-3 rounded-xl bg-[#fafafa] px-4 py-3 sm:flex-row sm:items-center">
                        <div className="min-w-0">
                          <a href={`https://${domain.hostname}/${link.short_code}`} className="truncate font-mono text-sm font-bold text-[#c62828]">{domain.hostname}/{link.short_code}</a>
                          <p className="mt-1 truncate text-xs text-[#777]">Fallback: lixrl.com/{link.fallback_code} · {link.original_url}</p>
                        </div>
                        <button type="button" disabled={busy !== null} onClick={() => mutate(`unlink-${domain.id}-${link.short_code}`, `/api/subdomains/${domain.id}/links/${encodeURIComponent(link.short_code)}`, { method: 'DELETE' })} className="text-xs font-semibold text-[#b32622]">Unmap</button>
                      </div>
                    ))}
                    {domainLinks.length === 0 && <p className="rounded-xl bg-[#fafafa] px-4 py-4 text-sm text-[#777]">No links mapped yet. New links will map automatically when this is your default domain.</p>}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PublicSubdomain['status'] }) {
  const active = status === 'active';
  return (
    <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ background: active ? '#eaf8ef' : '#fff3df', color: active ? '#17743a' : '#9a5a00' }}>
      {status}
    </span>
  );
}
