import Link from 'next/link';

export const runtime = 'edge';

const H1 = 'text-3xl md:text-4xl font-extrabold tracking-tight text-[#111]';
const H2 = 'text-2xl font-bold tracking-tight text-[#111] mt-10 mb-4';
const P = 'text-[#555] leading-7 mb-4';
const CODE = 'rounded-xl bg-[#171717] p-4 font-mono text-sm text-[#f5f5f4] overflow-x-auto';

export default function SubdomainsDocsPage() {
  return (
    <div>
      <h1 className={H1}>Branded subdomains</h1>
      <p className="mt-4 text-lg leading-8 text-[#555]">
        Publish paid-plan links at a single-level address such as <code>brand.lixrl.com/go</code> while keeping a canonical <code>lixrl.com</code> fallback.
      </p>

      <h2 id="availability" className={H2}>Availability and limits</h2>
      <ul className="ml-5 list-disc space-y-2 text-[#555]">
        <li>Pro includes one branded subdomain.</li>
        <li>Business includes three; Enterprise limits are arranged separately.</li>
        <li>Free accounts cannot claim or activate subdomains.</li>
        <li>Labels are 3–32 lowercase letters, numbers, or interior hyphens with no additional dots.</li>
      </ul>

      <h2 id="setup" className={H2}>Setup</h2>
      <ol className="ml-5 list-decimal space-y-3 text-[#555]">
        <li>Open <Link href="/dashboard/domains" className="text-[#c62828] underline">Dashboard → Subdomains</Link>.</li>
        <li>Claim an available label. Claims are atomic; another account cannot hold the same live hostname.</li>
        <li>Select <strong>Verify route</strong>. LixRL checks wildcard DNS, TLS, the redirect Worker, and the claim token over HTTPS.</li>
        <li>Make the verified hostname your default or map individual existing links to branded codes.</li>
      </ol>
      <p className={`${P} mt-4`}>No customer DNS changes are required because the hostname remains under lixrl.com.</p>

      <h2 id="api" className={H2}>API workflow</h2>
      <pre className={CODE}>{`# Claim
curl -X POST https://lixrl.com/api/subdomains \\
  -H "Authorization: Bearer elu_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"label":"brand"}'

# Verify wildcard routing and TLS
curl -X POST https://lixrl.com/api/subdomains/42/verify \\
  -H "Authorization: Bearer elu_YOUR_API_KEY"

# Map an owned fallback link to a domain-specific code
curl -X POST https://lixrl.com/api/subdomains/42/links \\
  -H "Authorization: Bearer elu_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url_code":"a1b2c3","short_code":"launch"}'`}</pre>

      <h2 id="routing" className={H2}>Routing and isolation</h2>
      <p className={P}>
        Branded links are resolved by hostname and code. The same code can belong to different verified subdomains. D1 checks ownership, plan status, domain state, and link state before a cached redirect is used; cache keys include both the domain ID and its revision.
      </p>
      <p className={P}>
        Destination safety checks, expiry, bot filtering, click analytics, QR destinations, and API ownership rules remain the same as canonical links.
      </p>

      <h2 id="lifecycle" className={H2}>Removal, downgrade, and recovery</h2>
      <p className={P}>
        Removing a claim or losing the paid entitlement disables branded routing and increments its route revision immediately. Canonical <code>lixrl.com/code</code> links continue to work. A renewed account must verify and reactivate a suspended claim explicitly.
      </p>
      <p className={P}>
        A failed verification normally means wildcard DNS, certificate issuance, or the router deployment is not ready. Wait for propagation, retry verification, and check the production deployment logs. Removed names require a fresh claim and verification before reuse.
      </p>
    </div>
  );
}
