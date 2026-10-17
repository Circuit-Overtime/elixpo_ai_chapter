'use client';

import { useAuth } from '../src/context/AuthContext';
import { loadingMessageForProfile } from '../src/utils/siteTips';

export default function Loading() {
  const { user, loading } = useAuth();
  const guidance = loadingMessageForProfile(loading ? null : user);
  const { message } = guidance;
  const externalAction = message.href?.startsWith('http');
  const icon = {
    guest: 'compass-outline',
    newcomer: 'sparkles-outline',
    growing: 'create-outline',
    established: 'stats-chart-outline',
    veteran: 'terminal-outline',
  }[guidance.stage];

  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
        <div className="relative mx-auto mb-6 h-12 w-12">
          <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: 'var(--accent)' }} />
          <div className="absolute inset-1 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <ion-icon name={icon} style={{ fontSize: '20px' }} />
          </div>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--accent)' }}>
          {guidance.label}
        </p>
        <p className="mt-2 text-[14px] leading-6" style={{ color: 'var(--text-muted)' }}>{message.text}</p>
        {message.action && (
          <a
            href={message.href}
            target={externalAction ? '_blank' : undefined}
            rel={externalAction ? 'noopener noreferrer' : undefined}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--border-default))' }}
          >
            <ion-icon name={externalAction ? 'logo-github' : 'arrow-forward-circle-outline'} style={{ fontSize: '14px' }} />
            {message.action}
            <ion-icon name="arrow-forward-outline" style={{ fontSize: '12px' }} />
          </a>
        )}
        <div className="mx-auto mt-6 h-1 w-32 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div className="h-full w-1/2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent)' }} />
        </div>
      </div>
    </main>
  );
}
