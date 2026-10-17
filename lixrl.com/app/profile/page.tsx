import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { TIER_LIMITS } from '@/lib/types';
import Link from 'next/link';
import LogoutButton from './LogoutButton';

export const runtime = 'edge';

export default async function ProfilePage() {
  const user = (await getCurrentUser())!;
  const db = getDB();
  const limits = TIER_LIMITS[user.tier];

  const [urlCount, keyCount, totalClicks, sessionCount] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM urls WHERE user_id = ?').bind(user.id).first<{ count: number }>(),
    db.prepare(
      `SELECT COUNT(*) as count FROM api_keys
       WHERE user_id = ? AND is_active = 1
       AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))`,
    ).bind(user.id).first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) as count FROM clicks c JOIN urls u ON c.url_id = u.id WHERE u.user_id = ? AND c.is_bot = 0')
      .bind(user.id).first<{ count: number }>(),
    db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND expires_at > datetime("now")')
      .bind(user.id).first<{ count: number }>(),
  ]);

  const urlLimit = limits.maxUrls === -1 ? '∞' : limits.maxUrls;

  return (
    <div>
      <h1 className="text-2xl font-sans font-bold text-text-primary mb-6">Profile</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Account */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-4">Account</h2>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-16 h-16 rounded-full overflow-hidden border border-border-medium shrink-0">
              <img
                src={user.avatar_url || `https://accounts.elixpo.com/api/avatar/${user.elixpo_id}`}
                alt={user.display_name}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="text-lg font-semibold">{user.display_name}</div>
              <div className="text-sm text-text-secondary">{user.email}</div>
              <div className="flex gap-1.5 mt-1">
                <span className="badge bg-accent-dim text-accent-main border border-accent-border capitalize">{user.tier}</span>
                {user.role === 'admin' && (
                  <span className="badge bg-accent-dim text-accent-light border border-accent-border">Admin</span>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Elixpo ID</span>
              <span className="text-text-secondary font-mono text-xs">{user.elixpo_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Provider</span>
              <span className="text-text-secondary">Elixpo Accounts</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Member since</span>
              <span className="text-text-secondary">{new Date(user.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Usage */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-4">Usage</h2>
          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-muted">URLs</span>
                <span>{urlCount?.count || 0} / {urlLimit}</span>
              </div>
              {limits.maxUrls !== -1 && (
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                  <div className="h-full rounded-full bg-accent-main transition-all" style={{ width: `${Math.min(((urlCount?.count || 0) / limits.maxUrls) * 100, 100)}%` }} />
                </div>
              )}
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-muted">API Keys</span>
                <span>{keyCount?.count || 0} / {limits.maxApiKeys}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                <div className="h-full rounded-full bg-accent-light transition-all" style={{ width: `${Math.min(((keyCount?.count || 0) / limits.maxApiKeys) * 100, 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Total Clicks</div>
              <div className="text-2xl font-bold">{totalClicks?.count || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="glass-card p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Settings</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border-light">
            <div>
              <div className="text-sm font-medium">Default redirect type</div>
              <div className="text-xs text-text-muted mt-0.5">HTTP 302 temporary redirect for all short URLs</div>
            </div>
            <span className="text-xs text-text-disabled font-mono px-2.5 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.06)' }}>302</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border-light">
            <div>
              <div className="text-sm font-medium">API Keys</div>
              <div className="text-xs text-text-muted mt-0.5">Manage your API keys for programmatic access</div>
            </div>
            <Link href="/profile/keys" className="btn-glass text-xs no-underline">Manage</Link>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border-light">
            <div>
              <div className="text-sm font-medium">Active sessions</div>
              <div className="text-xs text-text-muted mt-0.5">Sessions expire after 15 days of inactivity</div>
            </div>
            <span className="text-xs text-text-secondary">{sessionCount?.count || 0} active</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="min-w-0 pr-3">
              <div className="text-sm font-medium">Connected account</div>
              <div className="text-xs text-text-muted mt-0.5">
                Profile, email, avatar, and account deletion are all
                managed from Elixpo Accounts — your single sign-on for the
                ecosystem.
              </div>
            </div>
            <a
              href="https://accounts.elixpo.com/dashboard/services"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-glass text-xs no-underline whitespace-nowrap inline-flex items-center gap-1.5"
            >
              Manage on Elixpo
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Account actions */}
      <div className="space-y-3">
        {/* Sign out — this session only */}
        <div
          className="glass-card p-5 flex items-center justify-between gap-3"
          style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">Sign out</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Ends your session on this device only. Your account stays
              intact.
            </p>
          </div>
          <LogoutButton />
        </div>

        {/* Delete account — explicit redirect to Elixpo Accounts */}
        <div
          className="glass-card p-5 flex items-center justify-between gap-3"
          style={{ borderColor: 'rgba(239, 68, 68, 0.18)' }}
        >
          <div className="min-w-0 pr-3">
            <h2 className="text-sm font-semibold text-[#f87171]">
              Delete account
            </h2>
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              Your ElixpoURL account is bound to your Elixpo Account.
              Deleting it has to happen from Elixpo Accounts so your
              identity is removed across the whole ecosystem in one place
              — chat, art, blogs, sketch, and any other service you use.
              Your links and click history here will be deleted alongside
              the Elixpo Account.
            </p>
          </div>
          <a
            href="https://accounts.elixpo.com/dashboard/services"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-glass text-xs no-underline whitespace-nowrap inline-flex items-center gap-1.5"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.4)',
              color: '#f87171',
            }}
          >
            Open Elixpo Accounts
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
