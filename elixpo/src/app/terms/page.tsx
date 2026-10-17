import { createPageMetadata } from "@/lib/seo";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";
import { PageStructuredData } from "@/components/PageStructuredData";

export const metadata = createPageMetadata({
  title: "Terms of Service",
  description: "Read the terms governing Elixpo's public portal, hosted services, accounts, open-source tools, project records, acceptable use, licensing, and brand rights.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="page-shell legal-page">
      <PageStructuredData name="Elixpo terms of service" description="Portal-level terms for Elixpo public information, hosted services, project licenses, acceptable use, warranties, and brand rights." path="/terms" />
      <header className="page-intro"><p className="eyebrow">Public policy / last reviewed 17 October 2026</p><h1>Terms of service</h1><p className="lede">These terms describe the boundary between Elixpo’s public portal, community records, open-source artifacts, and operated services. A repository license, an artifact license, and a service’s operating terms are separate instruments.</p></header>
      <article className="prose prose-lg max-w-3xl prose-headings:tracking-tight prose-a:text-[#0b623c] prose-a:no-underline hover:prose-a:underline">
        <h2>1. Acceptance of terms</h2>
        <p>
          By accessing this portal or using an operated Elixpo service, you agree
          to these terms and to any additional notice shown by that service. If
          you do not agree, do not use the affected service. Viewing public source
          code or research remains governed by the applicable repository or
          artifact terms, not by an assumption that every listed project is an
          Elixpo-operated service.
        </p>

        <h2>2. What Elixpo operates</h2>
        <p>
          Elixpo is a community-run open-source project foundry, not a guarantee
          that every project, Member Project, archive, external link, or public
          record is continuously hosted or supported by the same people. Each
          project page records its relationship, lifecycle, and available
          evidence. Service-specific notices control where they are more precise.
        </p>

        <h2>3. Open source and licensing</h2>
        <p>
          Licenses vary by project and artifact. The license file in the relevant
          repository controls use of its code, research, hardware, data, or media.
          Elixpo&rsquo;s <a href="/licensing">licensing policy</a> is published on
          this site, and
          copyright permission does not grant a right to imply endorsement or use
          protected names and marks as though a modified work were official.
        </p>

        <h2>4. Accounts and service access</h2>
        <p>
          You are responsible for activity performed through your account and for
          keeping credentials secure. Do not share restricted credentials or try
          to obtain access that was not granted to you. We may rate-limit, suspend,
          or remove access when reasonably necessary to protect users, services,
          project integrity, or the public record.
        </p>

        <h2>5. Acceptable use</h2>
        <p>
          Do not use Elixpo surfaces for unlawful activity, harassment,
          impersonation, credential abuse, malicious automation, unauthorized
          security testing, infringement, deceptive attribution, or attempts to
          disrupt, scrape excessively, bypass limits, or overload infrastructure.
          Participation in community spaces also follows the <a href="/code-of-conduct">Code of Conduct</a>.
        </p>

        <h2>6. Content and contributions</h2>
        <p>
          You retain the rights you hold in content you submit. You are responsible
          for having permission to provide it and for ensuring it does not violate
          law, privacy, confidentiality, or third-party rights. Contributions to a
          repository are governed by that repository&rsquo;s contribution and license
          terms. Public submission does not transfer unrelated ownership to Elixpo.
        </p>

        <h2>7. Public records, research, and external links</h2>
        <p>
          Registry entries, contributor records, research metadata, citations,
          package information, and lifecycle labels are published from the best
          evidence available at the stated verification date. They may contain
          errors or become outdated. External projects and services remain subject
          to their own terms, privacy practices, availability, and security.
        </p>

        <h2>8. Privacy and communications</h2>
        <p>
          Personal information is handled as described in the <a href="/privacy">Privacy Policy</a> and any service-specific notice. Operational, security, or account messages may be sent when necessary to provide or protect a service.
        </p>

        <h2>9. No warranty</h2>
        <p>
          To the extent permitted by applicable law, the portal, records, and
          services are provided <strong>&ldquo;as is&rdquo;</strong> and
          <strong> &ldquo;as available&rdquo;</strong>, without guarantees of uptime,
          preservation, accuracy, security, or fitness for a particular purpose.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          To the extent permitted by applicable law, Elixpo maintainers and
          contributors will not be liable for indirect, incidental, special,
          consequential, or exemplary loss arising from use of, or inability to
          use, the portal or services. Nothing here excludes a right or liability
          that cannot legally be excluded.
        </p>

        <h2>11. Changes and discontinuation</h2>
        <p>
          Services, limits, and these terms may change as the project evolves.
          Material policy changes will update the review date on this page. A
          service may be changed, paused, transferred, or discontinued; its public
          lifecycle record should be updated when that happens.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about these Terms? Reach us at{" "}
          <a href={`mailto:${ELIXPO_LINKS.email}`}>{ELIXPO_LINKS.email}</a> or open
          a thread in our{" "}
          <a href={ELIXPO_LINKS.discussions}>GitHub Discussions</a>.
        </p>
      </article>
    </main>
  );
}
