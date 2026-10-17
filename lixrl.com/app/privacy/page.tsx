import type { Metadata } from 'next';
import { LegalNote, LegalPage, LegalSection } from '../components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'A plain-language explanation of what LixRL collects, why, and how long it is kept.',
  alternates: { canonical: '/privacy' },
};

const UPDATED = '25 August 2026';
const EMAIL = 'hello@elixpo.com';

const navigation = [
  { id: 'data-at-a-glance', label: 'Data at a glance' },
  { id: 'link-visitors', label: 'Link visitors' },
  { id: 'guest-shortening', label: 'Guest shortening' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'use-and-sharing', label: 'Use & sharing' },
  { id: 'retention-and-security', label: 'Retention & security' },
  { id: 'your-choices', label: 'Your choices' },
  { id: 'changes-and-contact', label: 'Changes & contact' },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow={`Privacy · updated ${UPDATED}`}
      title="Useful analytics, less personal data."
      intro="This policy explains the information LixRL processes for redirects, account features, analytics, abuse prevention, and billing—without ad tracking or visitor cookies."
      summaries={[
        { title: 'No ad profiles', detail: 'We do not sell personal data, run behavioural advertising, or track visitors across unrelated links.' },
        { title: 'Raw IPs are not stored', detail: 'Coarse network data is transformed in memory into keyed, pseudonymous signals.' },
        { title: 'You can delete or export', detail: 'Link owners can export links, delete links and click history, revoke API keys, or request account deletion.' },
      ]}
      navigation={navigation}
    >
      <LegalSection id="data-at-a-glance" title="1. Data at a glance">
        <p>LixRL processes only the data needed to create and resolve short links, authenticate accounts, show link analytics, prevent abuse, and operate paid subscriptions. We do not place tracking cookies on people who open a short link.</p>
        <LegalNote>A short-link destination belongs to the link owner, not LixRL. Visiting it may expose you to the destination site’s separate privacy practices.</LegalNote>
      </LegalSection>

      <LegalSection id="link-visitors" title="2. When someone opens a short link">
        <p>For each redirect, we may record:</p>
        <ul>
          <li>The time of the click and the short link that was opened.</li>
          <li>Country, region, and city supplied by Cloudflare edge metadata—not GPS or precise location.</li>
          <li>Device category, browser, and operating system inferred from the User-Agent header.</li>
          <li>The referring site’s origin, with its path and query string removed.</li>
          <li>A bot classification used to keep automated traffic out of human analytics.</li>
          <li>A keyed daily hash of a coarse IPv4 /16 or IPv6 /64 prefix for approximate unique counts.</li>
        </ul>
        <p>The readable IP address and network prefix are not written to LixRL’s database. The daily visitor signal rotates and is not designed to identify a person across days or unrelated links.</p>
      </LegalSection>

      <LegalSection id="guest-shortening" title="3. Guest shortening and risk controls">
        <p>Guest users can create one link with 24-hour validity. To enforce that allowance and detect obvious automation, we process the request IP together with coarse browser, device, operating-system, and language categories. We store a keyed HMAC, a risk score, and quota timing—not the raw inputs.</p>
        <p>Signed-in Free accounts have a separate daily creation allowance. Pseudonymous request metadata may be used to enforce it and investigate attempts to evade limits.</p>
      </LegalSection>

      <LegalSection id="accounts" title="4. Accounts, links, and billing">
        <p>Elixpo Accounts provides authentication. We receive and store an opaque Elixpo account ID, email address, display name, avatar URL when available, account role, tier, and session records. We do not receive or store your password.</p>
        <p>We store the destinations, short codes, titles, campaign labels, tags, expiry settings, branded subdomain claims and mappings, and active state you choose. API keys are stored as hashes; the full key is shown only when created. For paid plans, we retain subscription identifiers and billing status needed to apply entitlements. Payment details are handled by the checkout provider and are not stored in LixRL’s database.</p>
      </LegalSection>

      <LegalSection id="use-and-sharing" title="5. How data is used and shared">
        <p>We use data to provide redirects and dashboards, calculate analytics, enforce plan limits, secure accounts, respond to abuse, troubleshoot failures, and meet legal obligations.</p>
        <p>Service providers process limited data on our behalf:</p>
        <ul>
          <li><strong>Cloudflare Pages, D1, and KV</strong> host the application, database, cache, and edge request metadata.</li>
          <li><strong>Google Safe Browsing</strong> receives destination URLs submitted for reputation checks.</li>
          <li><strong>Elixpo Accounts</strong> authenticates users, and <strong>Elixpo Pay</strong> handles hosted checkout and subscription events.</li>
        </ul>
        <p>We do not sell personal data or share it for behavioural advertising. We may disclose information when legally required, to investigate abuse or security incidents, or during an organizational transaction subject to appropriate protections.</p>
      </LegalSection>

      <LegalSection id="retention-and-security" title="6. Retention and security">
        <ul>
          <li>Guest links expire after 24 hours and are removed by scheduled or activity-triggered cleanup.</li>
          <li>Click-event access and retention follow the account plan: 7 days on Free, 30 days on Pro, and 365 days on Business.</li>
          <li>Deleting a link removes its associated click history. Account data is retained while the account is active and as needed for security, disputes, or legal compliance.</li>
          <li>Abuse reports and audit records are retained as needed to investigate incidents and protect the service.</li>
        </ul>
        <p>We use access controls, scoped API keys, keyed hashing, encrypted transport, secret management, and provider security controls. No internet service can guarantee absolute security; report suspected issues to <a href={`mailto:${EMAIL}?subject=LixRL%20security%20report`}>{EMAIL}</a>.</p>
      </LegalSection>

      <LegalSection id="your-choices" title="7. Your choices and rights">
        <p>From LixRL you can export links as CSV, delete individual links and their analytics, revoke API keys, and cancel paid renewal. You can request access, correction, or deletion of account data by emailing <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. We may need to verify the request and may retain limited records where law or security requires it.</p>
        <p>Depending on where you live, local law may provide additional rights such as objection, restriction, portability, or a complaint to a data-protection authority.</p>
      </LegalSection>

      <LegalSection id="changes-and-contact" title="8. Changes and contact">
        <p>We may update this policy as the product or its providers change. The current revision date appears at the top, and material changes will be announced through an appropriate product or repository channel.</p>
        <p>Privacy questions and requests can be sent to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
