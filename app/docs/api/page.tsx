import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

const H1 =
  'text-[2.1rem] md:text-[2.4rem] font-extrabold tracking-tight text-[#111] mb-4 leading-tight';
const LEDE =
  'text-[#555] text-base md:text-[1.05rem] leading-relaxed mb-8 max-w-4xl';
const H2 =
  'text-[1.4rem] font-bold text-[#111] tracking-tight mt-12 mb-3 scroll-mt-24';
const H3 =
  'text-[1.05rem] font-bold text-[#222] tracking-tight mt-7 mb-2 scroll-mt-24';
const P = 'text-[#555] text-[0.96rem] leading-relaxed mb-4';
const INLINE_CODE =
  'font-mono text-[0.88em] text-[#9f211e] bg-[#fff1f0] border border-[#ffd4d1] rounded px-1.5 py-0.5';
const PRE =
  'p-4 md:p-5 rounded-xl text-[0.84rem] leading-[1.65] overflow-x-auto mb-5 font-mono';
const PRE_STYLE: CSSProperties = {
  background: '#171717',
  border: '1px solid #2f2f2f',
  color: '#f5f5f4',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
};
const CALLOUT_STYLE: CSSProperties = {
  background: '#fff8f7',
  border: '1px solid #ffd4d1',
};

const METHOD_STYLE: Record<string, CSSProperties> = {
  POST: {
    background: '#fff1f0',
    color: '#b42318',
    border: '1px solid #ffc9c5',
  },
  GET: {
    background: '#eaf7ff',
    color: '#075985',
    border: '1px solid #bae6fd',
  },
  PATCH: {
    background: '#fff8db',
    color: '#854d0e',
    border: '1px solid #fde68a',
  },
  DELETE: {
    background: '#fff0f0',
    color: '#b91c1c',
    border: '1px solid #fecaca',
  },
};

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      data-toc-ignore
      aria-hidden="true"
      className="inline-flex align-middle items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase mr-2 font-mono"
      style={METHOD_STYLE[method]}
    >
      {method}
    </span>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="mb-5">
      {label && (
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#777]">
          {label}
        </div>
      )}
      <pre className={`${PRE} mb-0`} style={PRE_STYLE}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function FieldTable({
  rows,
}: {
  rows: Array<[string, string, string, ReactNode]>;
}) {
  return (
    <div className="rounded-xl overflow-x-auto mb-6 border border-[#e2e2e2]">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-[#f7f7f6] text-[#444]">
          <tr>
            <th className="text-left px-4 py-2.5 font-semibold">Field</th>
            <th className="text-left px-4 py-2.5 font-semibold">Type</th>
            <th className="text-left px-4 py-2.5 font-semibold">Required</th>
            <th className="text-left px-4 py-2.5 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([field, type, required, description]) => (
            <tr key={field} className="border-t border-[#ececec] text-[#555]">
              <td className="px-4 py-3 font-mono text-[#9f211e]">{field}</td>
              <td className="px-4 py-3 font-mono text-[#333]">{type}</td>
              <td className="px-4 py-3">{required}</td>
              <td className="px-4 py-3 leading-relaxed">{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({
  method,
  path,
  children,
}: {
  method: Method;
  path: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e2e2e2] bg-[#fafafa] px-4 py-3">
        <MethodBadge method={method} />
        <code className="font-mono text-[0.92rem] text-[#222]">{path}</code>
      </div>
      {children}
    </div>
  );
}

export default function ApiPage() {
  return (
    <article>
      <h1 className={H1}>Shortening API</h1>
      <p className={LEDE}>
        Create and manage account-owned short links, or use the browser-only
        guest flow for one temporary link. This reference documents request
        fields, response bodies, tier restrictions, pagination, expiry, and
        failure behavior as implemented by the edge routes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
        {[
          ['Base URL', 'https://lixrl.com'],
          ['Content type', 'application/json'],
          ['Authentication', 'Bearer API key'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#e2e2e2] bg-[#fafafa] p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#777] mb-1">
              {label}
            </div>
            <div className="font-mono text-[0.82rem] text-[#222] break-all">
              {value}
            </div>
          </div>
        ))}
      </div>

      <h2 id="authentication" className={H2}>Authentication</h2>
      <p className={P}>
        Account endpoints accept a scoped API key in the standard Bearer
        header. Create a key under{' '}
        <Link href="/profile/keys" className="text-[#b42318] underline">
          Profile → API Keys
        </Link>
        . Never place API keys in URLs or browser-delivered JavaScript.
      </p>
      <CodeBlock label="Request header">
        Authorization: Bearer elu_YOUR_API_KEY
      </CodeBlock>
      <div className="rounded-xl p-4 text-sm text-[#555] leading-relaxed" style={CALLOUT_STYLE}>
        The guest endpoint does not accept an API key. It is protected by a
        same-origin browser check, risk scoring, and a 24-hour D1 quota, so it
        is not a replacement for the authenticated integration API.
      </div>

      <h2 id="guest-shortening" className={H2}>Guest shortening</h2>
      <Endpoint method="POST" path="/api/guest/urls" />
      <p className={P}>
        Creates one temporary short link from the public landing page. The
        service fixes the expiry at 24 hours, generates the code, stores no
        click analytics, and returns <code className={INLINE_CODE}>429</code>{' '}
        while the derived guest identity is still inside its quota window.
      </p>
      <FieldTable rows={[
        ['url', 'string', 'Yes', 'Absolute HTTP or HTTPS destination, maximum 2,048 characters. Private, loopback, unsafe, and denylisted hosts are rejected.'],
      ]} />
      <CodeBlock label="Same-origin browser request">{`fetch('/api/guest/urls', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com/article' })
})`}</CodeBlock>
      <CodeBlock label="201 Created">{`{
  "short_url": "https://lixrl.com/gA1b2C3",
  "short_code": "gA1b2C3",
  "original_url": "https://example.com/article",
  "expires_at": "2026-08-02T10:30:00.000Z",
  "guest": true
}`}</CodeBlock>
      <h3 id="guest-limit-response" className={H3}>Guest quota response</h3>
      <CodeBlock label="429 Too Many Requests">{`{
  "error": "Your guest link has already been used. Sign in for persistent links.",
  "account_required": true,
  "available_at": "2026-08-02T10:30:00.000Z"
}`}</CodeBlock>
      <p className={P}>
        The response includes <code className={INLINE_CODE}>Retry-After</code>{' '}
        in seconds. Guest links cannot be listed, edited, recovered, or
        converted into account links after creation.
      </p>

      <h2 id="create-a-short-link" className={H2}>Create an account link</h2>
      <Endpoint method="POST" path="/api/urls" />
      <FieldTable rows={[
        ['url', 'string', 'Yes', 'Absolute HTTP or HTTPS destination. The same private-network and safe-content checks used by guest shortening apply.'],
        ['title', 'string', 'No', 'Human-readable label between 1 and 255 characters.'],
        ['custom_code', 'string', 'No', 'Pro or higher. A unique 3–32 character slug containing letters, digits, hyphens, or underscores.'],
        ['expires_at', 'ISO 8601', 'No', 'Pro or higher. A future timestamp; null/omitted links do not expire.'],
        ['campaign', 'string', 'No', 'A campaign label between 1 and 64 characters.'],
        ['tags', 'string[]', 'No', 'Up to 10 normalized tags, each no longer than 24 characters.'],
        ['utm', 'object', 'No', 'Optional source, medium, campaign, term, and content values appended as UTM parameters.'],
      ]} />
      <CodeBlock label="cURL">{`curl -X POST https://lixrl.com/api/urls \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/long-url",
    "title": "Launch announcement",
    "custom_code": "launch",
    "expires_at": "2026-12-31T23:59:59.000Z"
  }'`}</CodeBlock>
      <CodeBlock label="201 Created">{`{
  "short_url": "https://lixrl.com/launch",
  "short_code": "launch",
  "original_url": "https://example.com/long-url",
  "title": "Launch announcement",
  "created_at": "2026-08-01 10:30:00",
  "expires_at": "2026-12-31T23:59:59.000Z"
}`}</CodeBlock>
      <p className={P}>
        Free accounts can own up to 25 links. A duplicate custom code returns{' '}
        <code className={INLINE_CODE}>409</code>; unavailable tier features and
        exhausted account quotas return <code className={INLINE_CODE}>403</code>.
      </p>

      <h2 id="bulk-create" className={H2}>Bulk create account links</h2>
      <Endpoint method="POST" path="/api/urls/bulk-create" />
      <p className={P}>
        Submit up to 25 ordinary create-link payloads. Each item is validated,
        safety checked, quota checked, and returned with its own HTTP-style
        status. A fully successful batch returns 201; a partial batch returns
        207 so callers can retry only failed rows.
      </p>
      <CodeBlock label="Request">{`{
  "links": [
    {"url":"https://example.com/a","campaign":"launch","tags":["email"]},
    {"url":"https://example.com/b","utm":{"source":"newsletter","medium":"email"}}
  ]
}`}</CodeBlock>

      <h2 id="list-your-links" className={H2}>List account links</h2>
      <Endpoint method="GET" path="/api/urls" />
      <FieldTable rows={[
        ['limit', 'integer', 'No', 'Page size from 1–100. Defaults to 50.'],
        ['offset', 'integer', 'No', 'Number of matching records to skip. Defaults to 0; maximum 100,000.'],
        ['search', 'string', 'No', 'Case-insensitive match against short code, destination, or title. Input is capped at 100 characters.'],
      ]} />
      <CodeBlock label="cURL">{`curl 'https://lixrl.com/api/urls?limit=20&offset=0&search=example' \\
  -H "Authorization: Bearer elu_YOUR_KEY"`}</CodeBlock>
      <CodeBlock label="200 OK">{`{
  "urls": [
    {
      "id": 42,
      "user_id": 7,
      "short_code": "launch",
      "original_url": "https://example.com/long-url",
      "title": "Launch announcement",
      "is_active": 1,
      "clicks": 18,
      "created_at": "2026-08-01 10:30:00",
      "updated_at": "2026-08-01 10:30:00",
      "expires_at": null
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}`}</CodeBlock>

      <h2 id="get-a-link" className={H2}>Get an account link</h2>
      <Endpoint method="GET" path="/api/urls/{code}" />
      <p className={P}>
        Returns the complete URL record shown in the list response. Ownership
        is enforced: an unknown code or a code belonging to another account
        returns <code className={INLINE_CODE}>404</code>.
      </p>
      <CodeBlock label="cURL">{`curl https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY"`}</CodeBlock>

      <h2 id="update-a-link" className={H2}>Update an account link</h2>
      <Endpoint method="PATCH" path="/api/urls/{code}" />
      <p className={P}>Send at least one mutable field. The short code itself cannot be changed.</p>
      <FieldTable rows={[
        ['url', 'string', 'No', 'New validated HTTP or HTTPS destination.'],
        ['title', 'string | null', 'No', 'New 1–255 character title, or null to remove it.'],
        ['is_active', 'boolean', 'No', 'False disables redirects without deleting the record or analytics.'],
        ['expires_at', 'ISO 8601 | null', 'No', 'Future timestamp, or null to remove expiry.'],
      ]} />
      <CodeBlock label="cURL">{`curl -X PATCH https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/new","title":null,"is_active":true}'`}</CodeBlock>
      <CodeBlock label="200 OK">{`{
  "success": true
}`}</CodeBlock>

      <h2 id="delete-a-link" className={H2}>Delete an account link</h2>
      <Endpoint method="DELETE" path="/api/urls/{code}" />
      <p className={P}>
        Permanently removes the link and its click records. This operation is
        irreversible; use <code className={INLINE_CODE}>is_active: false</code>{' '}
        when you may need to restore the redirect later.
      </p>
      <CodeBlock label="cURL">{`curl -X DELETE https://lixrl.com/api/urls/launch \\
  -H "Authorization: Bearer elu_YOUR_KEY"`}</CodeBlock>
      <CodeBlock label="200 OK">{`{
  "success": true
}`}</CodeBlock>

      <h2 id="status-codes" className={H2}>Status codes and retries</h2>
      <div className="rounded-xl overflow-x-auto mb-6 border border-[#e2e2e2]">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-[#f7f7f6] text-[#444]">
            <tr>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Meaning</th>
              <th className="text-left px-4 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody className="text-[#555]">
            {[
              ['400', 'Malformed input or unsupported field value.', 'Correct the request before retrying.'],
              ['401', 'Missing, invalid, expired, or revoked credentials.', 'Replace the API key.'],
              ['403', 'Tier restriction, quota, risk rejection, or CSRF failure.', 'Read the error string; signing in or upgrading may be required.'],
              ['404', 'The account does not own a matching short code.', 'Verify the code and credentials.'],
              ['409', 'Requested custom code is already taken.', 'Choose another code or omit custom_code.'],
              ['422', 'Safe Browsing rejected the destination.', 'Use a safe destination; do not retry unchanged.'],
              ['429', 'Rate or guest quota exceeded.', 'Wait for Retry-After before retrying.'],
              ['500/503', 'Transient service or configuration failure.', 'Retry with capped exponential backoff.'],
            ].map(([status, meaning, action]) => (
              <tr key={status} className="border-t border-[#ececec]">
                <td className="px-4 py-3 font-mono font-semibold text-[#222]">{status}</td>
                <td className="px-4 py-3">{meaning}</td>
                <td className="px-4 py-3">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={P}>
        See the dedicated{' '}
        <Link href="/docs/errors" className="text-[#b42318] underline">
          error reference
        </Link>{' '}
        for response conventions and retry guidance.
      </p>
    </article>
  );
}
