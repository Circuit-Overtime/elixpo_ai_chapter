'use client';

import { useState } from 'react';

interface Props {
  requestId: string;
  defaultName: string;
  activeKeys: number;
  maxKeys: number;
}

export default function AuthorizeCliClient({ requestId, defaultName, activeKeys, maxKeys }: Props) {
  const [name, setName] = useState(defaultName);
  const [scopes, setScopes] = useState('read,write');
  const [expires, setExpires] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'approved' | 'denied'>('idle');
  const [error, setError] = useState('');

  const approve = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('saving');
    setError('');
    const response = await fetch(`/api/cli/auth/requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        scopes,
        ...(expires ? { expires_at: new Date(`${expires}T23:59:59`).toISOString() } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError((payload as any).error || 'Could not approve this CLI request.');
      setStatus('idle');
      return;
    }
    setStatus('approved');
  };

  const deny = async () => {
    setStatus('saving');
    await fetch(`/api/cli/auth/requests/${encodeURIComponent(requestId)}/approve`, { method: 'DELETE' });
    setStatus('denied');
  };

  if (status === 'approved' || status === 'denied') {
    return (
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-8 text-center shadow-[0_22px_70px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e53935]/10 text-2xl text-[#c62828]">
          {status === 'approved' ? '✓' : '×'}
        </div>
        <h1 className="text-2xl font-black tracking-tight text-[#111]">
          {status === 'approved' ? 'CLI access approved' : 'CLI access denied'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#666]">
          {status === 'approved'
            ? 'Return to your terminal. Lixrl will deliver the new key directly to the waiting CLI and store only its hash.'
            : 'No API key was created. You can close this window.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={approve} className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_22px_70px_rgba(0,0,0,0.08)] sm:p-8">
      <div className="mb-5 inline-flex rounded-full border border-[#f2c6c4] bg-[#fff7f6] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[#c62828]">
        Developer CLI
      </div>
      <h1 className="text-3xl font-black tracking-[-0.035em] text-[#111]">Create a key for this CLI</h1>
      <p className="mt-3 text-sm leading-6 text-[#666]">
        Choose exactly what this device can do. The key goes directly to the waiting CLI and is saved in your OS keychain.
      </p>

      <div className="mt-7">
        <label htmlFor="cli-key-name" className="mb-2 block text-sm font-bold text-[#222]">Key name</label>
        <input
          id="cli-key-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
          required
          className="w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-sm text-[#111] outline-none focus:border-[#e53935]"
        />
      </div>

      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-bold text-[#222]">Access</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['read,write', 'Read and write', 'Create, update, disable, and inspect links.'],
            ['read', 'Read only', 'List links, analytics, and exports without changing data.'],
          ].map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScopes(value)}
              className="rounded-xl p-4 text-left transition-colors"
              style={{
                border: scopes === value ? '1.5px solid #e53935' : '1px solid #dedede',
                background: scopes === value ? '#fff7f6' : '#fff',
              }}
            >
              <span className="block text-sm font-bold text-[#222]">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-[#777]">{description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        <label htmlFor="cli-key-expiry" className="mb-2 block text-sm font-bold text-[#222]">Expiry date <span className="font-normal text-[#888]">(optional)</span></label>
        <input
          id="cli-key-expiry"
          type="date"
          value={expires}
          min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
          onChange={(event) => setExpires(event.target.value)}
          className="w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-sm text-[#111] outline-none focus:border-[#e53935]"
        />
      </div>

      <div className="mt-6 rounded-xl bg-[#f7f7f7] px-4 py-3 text-xs leading-5 text-[#666]">
        Active API keys: <strong className="text-[#222]">{activeKeys} of {maxKeys}</strong>. Creating this key uses one slot. Your plan&apos;s request-rate ceiling still applies.
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={deny}
          disabled={status === 'saving'}
          className="rounded-xl border border-[#d8d8d8] px-5 py-3 text-sm font-bold text-[#444]"
        >
          Deny
        </button>
        <button
          type="submit"
          disabled={status === 'saving' || !name.trim()}
          className="rounded-xl bg-[#e53935] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(229,57,53,0.24)] disabled:opacity-60"
        >
          {status === 'saving' ? 'Approving…' : 'Create key and approve'}
        </button>
      </div>
    </form>
  );
}
