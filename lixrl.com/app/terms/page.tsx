import type { Metadata } from 'next';
import { LegalNote, LegalPage, LegalSection } from '../components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using LixRL links, accounts, API access, and paid plans.',
  alternates: { canonical: '/terms' },
};

const UPDATED = '25 August 2026';
const EMAIL = 'hello@elixpo.com';
const REPOSITORY = 'https://github.com/elixpo/elixpourl';
const ABUSE_REPORT_URL = 'https://github.com/elixpo/lixrl.com/issues/new?template=abuse-report.yml';

const navigation = [
  { id: 'using-lixrl', label: 'Using LixRL' },
  { id: 'accounts-and-security', label: 'Accounts & security' },
  { id: 'links-and-content', label: 'Links & content' },
  { id: 'plans-and-billing', label: 'Plans & billing' },
  { id: 'service-operation', label: 'Service operation' },
  { id: 'liability', label: 'Liability' },
  { id: 'changes-and-contact', label: 'Changes & contact' },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow={`Terms · updated ${UPDATED}`}
      title="Fair rules for short links."
      intro="These terms explain what you can expect from LixRL and what we expect from everyone who creates, manages, or visits a short link."
      summaries={[
        { title: 'You control your links', detail: 'You keep ownership of your destinations and metadata and can delete links you own.' },
        { title: 'Abuse is not permitted', detail: 'Phishing, malware, scams, illegal content, and attempts to bypass safeguards can be removed.' },
        { title: 'Plans match enforced limits', detail: 'Guest, Free, Pro, and Business allowances are described on the pricing page and enforced by the service.' },
      ]}
      navigation={navigation}
    >
      <LegalSection id="using-lixrl" title="1. Using LixRL">
        <p>
          By using LixRL, including guest shortening, redirects, the dashboard, or the API, you agree to these Terms. If you use LixRL for an organization, you confirm that you can accept these Terms for that organization.
        </p>
        <p>You must be legally able to enter this agreement. Do not use the service if applicable law prohibits you from doing so.</p>
        <LegalNote>
          Guest use creates one short link that expires after 24 hours. Persistent links require an account. Signed-in Free accounts can create up to two links per UTC day, subject to their total plan limit.
        </LegalNote>
      </LegalSection>

      <LegalSection id="accounts-and-security" title="2. Accounts, API keys, and security">
        <p>
          Sign-in is provided through Elixpo Accounts. You are responsible for activity under your account and API keys, keeping credentials private, and promptly revoking keys you no longer trust.
        </p>
        <p>
          Do not share access in a way that exceeds your plan or attempt to bypass quotas, authorization checks, rate limits, or account restrictions. Tell us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a> if you believe an account or key has been compromised.
        </p>
      </LegalSection>

      <LegalSection id="links-and-content" title="3. Your links and acceptable use">
        <p>
          You retain ownership of destination URLs, titles, campaign labels, tags, and eligible subdomain labels you submit. You give us the limited permission needed to store that information, resolve the short link, provide analytics, and operate the service.
        </p>
        <p>You must not use LixRL to:</p>
        <ul>
          <li>Distribute malware, phishing, credential theft, scams, spam, or deceptive impersonation.</li>
          <li>Link to child sexual abuse material or content that is unlawful where the service operates.</li>
          <li>Harass people, infringe rights, or conceal a destination to cause harm.</li>
          <li>Probe internal networks, scrape or overload endpoints, automate abusive traffic, or evade safeguards.</li>
        </ul>
        <p>
          Destinations may be checked with Google Safe Browsing. We may reject, disable, quarantine, or delete links and suspend accounts when reasonably necessary to address abuse, legal requests, security risk, or service integrity. Reports can be submitted through <a href={ABUSE_REPORT_URL} target="_blank" rel="noopener noreferrer">GitHub Issues</a>.
        </p>
      </LegalSection>

      <LegalSection id="plans-and-billing" title="4. Plans, quotas, and billing">
        <p>Current prices and enforced feature limits appear on the <a href="/pricing">Pricing page</a>. Limits can include stored links, daily creation, analytics retention, API keys, branded lixrl.com subdomains, custom slugs, expiring links, and QR options.</p>
        <ul>
          <li>Paid subscriptions renew for the selected monthly or annual period until cancelled.</li>
          <li>Cancellation stops the next renewal; access continues through the paid period unless otherwise stated at checkout.</li>
          <li>Taxes, supported payment methods, final charges, and any refund terms are shown during checkout.</li>
          <li>A failed or reversed payment may pause paid features or return the account to available Free limits.</li>
        </ul>
        <p>We may change plans or prices prospectively. Material changes affecting an active subscription will be communicated before they take effect where practical.</p>
      </LegalSection>

      <LegalSection id="service-operation" title="5. Availability, changes, and termination">
        <p>You can stop using LixRL or request account deletion at any time. We may limit or terminate access for violations, security threats, non-payment, legal obligations, or material risk to the service or its users.</p>
        <p>We may modify or discontinue features. We aim to communicate material changes, but we do not promise uninterrupted availability, permanent storage, or that every destination will remain reachable.</p>
        <p>The source code is available under the licenses and trademark exceptions in the repository <a href={`${REPOSITORY}/blob/main/LICENSE`}>license</a>. Those licenses do not grant rights to reserved Elixpo names, mascots, or brand assets.</p>
      </LegalSection>

      <LegalSection id="liability" title="6. Disclaimers and liability">
        <p>LixRL is provided “as is” and “as available,” without warranties of merchantability, fitness for a particular purpose, non-infringement, uptime, or data durability, to the extent permitted by law.</p>
        <p>To the fullest extent permitted by law, Elixpo, its maintainers, and contributors will not be liable for indirect, incidental, special, consequential, or punitive damages, lost profits, lost data, or losses caused by destinations operated by third parties.</p>
        <p>Nothing in these Terms excludes rights or liability that applicable law does not allow us to exclude.</p>
      </LegalSection>

      <LegalSection id="changes-and-contact" title="7. Changes and contact">
        <p>We may update these Terms as LixRL changes. The date at the top identifies the current version. Material changes will be announced through an appropriate product or repository channel; continued use after the effective date means you accept the revised Terms.</p>
        <p>Questions about these Terms can be sent to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
