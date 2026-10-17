'use client';

const H1 = 'text-[2.1rem] md:text-[2.4rem] font-extrabold tracking-tight text-white mb-4 leading-tight';
const LEDE = 'text-white/70 text-base md:text-[1.05rem] leading-relaxed mb-8';
const P = 'text-white/70 text-[0.96rem] leading-relaxed mb-4';

export default function WebhooksPage() {
  return (
    <article>
      <h1 className={H1}>Webhooks</h1>
      <p className={LEDE}>
        Get HTTP callbacks when links are created, updated, or clicked.
        Coming on the Growth tier.
      </p>

      <div
        className="p-5 rounded-xl"
        style={{
          background:
            'linear-gradient(135deg, rgba(229,57,53,0.12) 0%, rgba(95,182,255,0.05) 100%)',
          border: '1px solid rgba(229,57,53,0.25)',
        }}
      >
        <div className="text-[11px] font-bold tracking-wider uppercase text-[#c62828] mb-1">
          Coming soon
        </div>
        <p className={`${P} mb-0`}>
          Webhook events will be HMAC-signed and delivered with at-least-once
          semantics. If you have a use case driving this work, drop us a line
          at <code className="font-mono text-white">hello@elixpo.com</code> —
          input from real integrations shapes the API.
        </p>
      </div>
    </article>
  );
}
