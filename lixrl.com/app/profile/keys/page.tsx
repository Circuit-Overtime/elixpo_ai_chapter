'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Modal, { ConfirmDialog } from '@/app/components/Modal';

interface ApiKey {
  id: number;
  key_prefix: string;
  name: string;
  scopes: string;
  last_used_at: string | null;
  is_active: number;
  created_at: string;
}

const scopeOptions = [
  {
    value: 'read,write',
    label: 'Read & Write',
    desc: 'Full access to create, read, update, and delete URLs',
  },
  {
    value: 'read',
    label: 'Read only',
    desc: 'Can only list and view URLs and analytics',
  },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('read,write');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // "Save this key once" modal state
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke confirm state
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  const fetchKeys = async () => {
    const res = await fetch('/api/keys');
    const data: any = await res.json();
    setKeys(data.keys || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes }),
      });
      const data: any = await res.json();
      if (data.key) {
        setNewKey(data.key);
        setName('');
        setCreateOpen(false);
        fetchKeys();
      } else {
        setCreateError(data.error || 'Failed to create key');
      }
    } catch {
      setCreateError('Network error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setRevokeError('');
    setRevoking(true);
    try {
      const response = await fetch(`/api/keys/${revokeTarget.id}`, { method: 'DELETE' });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setRevokeError(data?.error || 'The key could not be revoked. Refresh and try again.');
        return;
      }
      setRevokeTarget(null);
      await fetchKeys();
    } catch {
      setRevokeError('Could not reach Lixrl. Check your connection and try again.');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-2">
      {/* Header row — title + primary CTA */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-[1.8rem] font-bold text-white tracking-tight">
            API Keys
          </h1>
          <p className="text-sm text-white/55 mt-1">
            Manage keys for programmatic access ·{' '}
            <Link
              href="/docs/keys"
              className="text-[#e53935] no-underline hover:underline"
            >
              Read the docs
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError('');
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-white transition-all"
          style={{
            background: 'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
            boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background =
              'linear-gradient(135deg, #e85a57 0%, #8a6dff 100%)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              'linear-gradient(135deg, #e53935 0%, #c62828 100%)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New API key
        </button>
      </div>

      {/* Keys list */}
      <div
        className="rounded-2xl p-6"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(250,250,250,0.92) 100%)',
          border: '1px solid rgba(0,0,0,0.10)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-white/45 mb-4">
          Your keys
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-white/40 text-sm">
            <span
              className="w-4 h-4 rounded-full border-2 border-current"
              style={{
                borderTopColor: 'transparent',
                animation: 'spin 0.6s linear infinite',
              }}
            />
            Loading...
          </div>
        ) : keys.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-white/55 mb-4">
              No API keys yet. Mint one to start hitting the API
              programmatically.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-semibold text-white transition-all"
              style={{
                background:
                  'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                boxShadow: '0 4px 14px rgba(229,57,53,0.35)',
              }}
            >
              Create your first key
            </button>
          </div>
        ) : (
          <ul className="space-y-2 list-none p-0">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-4 p-4 rounded-xl transition-all"
                style={{
                  background: k.is_active
                    ? 'rgba(255,255,255,0.98)'
                    : 'rgba(250,250,250,0.9)',
                  border: `1px solid ${k.is_active ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.05)'}`,
                  opacity: k.is_active ? 1 : 0.5,
                }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: k.is_active
                      ? 'rgba(229,57,53,0.1)'
                      : 'rgba(0,0,0,0.05)',
                    border: `1px solid ${k.is_active ? 'rgba(229,57,53,0.25)' : 'rgba(0,0,0,0.08)'}`,
                  }}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke={k.is_active ? '#e53935' : '#71717a'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4"
                  >
                    <circle cx="7.5" cy="12.5" r="3.5" />
                    <path d="M10.2 9.8L16 4M14 4l2 2M12.5 6.5l2 2" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {k.name}
                    </span>
                    <span
                      className="text-[0.6rem] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgba(229,57,53,0.12)',
                        color: '#e85a57',
                        border: '1px solid rgba(229,57,53,0.25)',
                      }}
                    >
                      {k.scopes.includes('write') ? 'R/W' : 'Read'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-white/40 font-mono">
                      {k.key_prefix}...
                    </span>
                    <span className="text-xs text-white/40">
                      {k.last_used_at
                        ? `Used ${new Date(k.last_used_at).toLocaleDateString()}`
                        : 'Never used'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-[0.6rem] font-medium uppercase tracking-wider px-2 py-1 rounded-lg"
                    style={{
                      background: k.is_active
                        ? 'rgba(34,197,94,0.1)'
                        : 'rgba(239,68,68,0.1)',
                      color: k.is_active ? '#86efac' : '#f87171',
                      border: `1px solid ${k.is_active ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    }}
                  >
                    {k.is_active ? 'Active' : 'Revoked'}
                  </span>
                  {k.is_active === 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRevokeError('');
                        setRevokeTarget(k);
                      }}
                      className="text-xs text-white/55 hover:text-[#f87171] transition-colors px-2 py-1"
                      style={{ background: 'transparent', border: 'none' }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─────── Create API key modal ─────── */}
      <Modal
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="Create API key"
        description="Name it after the app or environment it'll be used in. You can revoke and rotate any time."
        size="md"
        disableBackdropClose={creating}
      >
        <form onSubmit={handleCreate}>
          <div className="mb-4">
            <label
              htmlFor="key-name"
              className="block text-[0.7rem] text-white/65 mb-1.5 uppercase tracking-wider font-medium"
            >
              Key name
            </label>
            <input
              id="key-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production server, CI pipeline"
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none text-white placeholder-white/40 transition-colors"
              style={{
                background: 'rgba(0,0,0,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#e53935';
                e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
              }}
            />
          </div>

          <div className="mb-5">
            <div className="block text-[0.7rem] text-white/65 mb-2 uppercase tracking-wider font-medium">
              Permissions
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {scopeOptions.map((opt) => {
                const selected = scopes === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScopes(opt.value)}
                    className="text-left p-3 rounded-xl transition-all cursor-pointer"
                    style={{
                      background: selected
                        ? 'rgba(229,57,53,0.08)'
                        : 'rgba(255,255,255,0.98)',
                      border: `1.5px solid ${selected ? 'rgba(229,57,53,0.5)' : 'rgba(0,0,0,0.10)'}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          border: `2px solid ${selected ? '#e53935' : 'rgba(0,0,0,0.25)'}`,
                        }}
                      >
                        {selected && (
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: '#e53935' }}
                          />
                        )}
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: selected ? '#fff' : '#f5f5f4' }}
                      >
                        {opt.label}
                      </span>
                    </div>
                    <p className="text-[0.72rem] text-white/50 ml-6 leading-relaxed">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {createError && (
            <div
              className="mb-4 p-3 rounded-lg text-sm"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#f87171',
              }}
            >
              {createError}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white/85 transition-colors"
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: '1px solid rgba(0,0,0,0.12)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
              style={{
                background:
                  'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
                boxShadow: '0 4px 14px rgba(229,57,53,0.4)',
                opacity: creating || !name.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating...' : 'Create key'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─────── "Save this key once" modal ─────── */}
      <Modal
        open={!!newKey}
        onClose={() => setNewKey(null)}
        title="Your new API key"
        description="Copy this now — we hash it on save and won't show it again."
        size="md"
      >
        <div
          className="p-4 rounded-xl mb-4 font-mono text-sm break-all"
          style={{
            background: 'rgba(0,0,0,0.45)',
            border: '1px solid rgba(229,57,53,0.25)',
            color: '#e8e8ed',
          }}
        >
          {newKey}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => newKey && handleCopy(newKey)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white/85 transition-colors inline-flex items-center gap-2"
            style={{
              background: 'rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.12)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{
              background:
                'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
              boxShadow: '0 4px 14px rgba(229,57,53,0.4)',
            }}
          >
            I&apos;ve saved it
          </button>
        </div>
      </Modal>

      {/* ─────── Revoke confirm ─────── */}
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => {
          if (!revoking) {
            setRevokeError('');
            setRevokeTarget(null);
          }
        }}
        onConfirm={handleRevokeConfirm}
        title={`Revoke "${revokeTarget?.name ?? ''}"?`}
        description="Any app using this key will lose access immediately. This cannot be undone."
        confirmLabel="Revoke key"
        variant="danger"
        loading={revoking}
        error={revokeError}
      />
    </div>
  );
}
