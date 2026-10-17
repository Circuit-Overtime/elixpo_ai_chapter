import { createPageMetadata } from "@/lib/seo";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";
import { PageStructuredData } from "@/components/PageStructuredData";

export const metadata = createPageMetadata({
  title: "Terms of Service",
  description: "Read the terms governing Elixpo's hosted services, open-source tools, software packages, acceptable use, licensing, and reserved brand rights.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="page-shell legal-page">
      <PageStructuredData name="Elixpo terms of service" description="Portal-level terms for Elixpo public information, hosted services, project licenses, acceptable use, warranties, and brand rights." path="/terms" />
      <header className="page-intro"><p className="eyebrow">Policy / last reviewed October 2026</p><h1>Terms of service</h1><p className="lede">These portal-level terms describe the general boundary between Elixpo’s public information, open-source artifacts, and hosted services. A repository license and a service’s operating terms are separate instruments.</p></header>
      <article className="prose prose-lg max-w-3xl prose-headings:tracking-tight prose-a:text-[#0b623c] prose-a:no-underline hover:prose-a:underline">
        <h2>1. Acceptance of terms</h2>
        <p>
          By using this portal or an operated Elixpo service, you agree to the
          terms that apply to that surface. Archived repositories and third-party
          Member Projects are not automatically operated services.
        </p>

        <h2>2. Open source &amp; licensing</h2>
        <p>
          Licenses vary by project and artifact. The license file in the relevant
          repository controls use of its code, research, hardware, data, or media.
          Elixpo&rsquo;s default-license policy is published separately, and
          copyright permission does not grant a right to imply endorsement or use
          protected names and marks as though a modified work were official.
        </p>

        <h2>3. Acceptable use</h2>
        <p>
          You agree not to misuse the services: no unlawful activity, no attempts
          to disrupt or overload our infrastructure, and no use of generative
          features to produce harmful, infringing, or abusive content. We may
          rate-limit or restrict access to keep public APIs stable for everyone.
        </p>

        <h2>4. User content</h2>
        <p>
          You retain ownership of content you create with our tools. You are
          responsible for ensuring you have the rights to any inputs you provide,
          and for how you use the outputs.
        </p>

        <h2>5. No warranty</h2>
        <p>
          The services are provided <strong>&ldquo;as is&rdquo;</strong>, without
          warranties of any kind. As a community-run, free, open-source project we
          do not guarantee uptime, availability, or fitness for any particular
          purpose.
        </p>

        <h2>6. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, the Elixpo maintainers and
          contributors are not liable for any damages arising from your use of the
          services.
        </p>

        <h2>7. Changes</h2>
        <p>
          We may update these Terms over time. Material changes will be reflected
          by the &ldquo;last updated&rdquo; date above. Continued use after changes
          constitutes acceptance.
        </p>

        <h2>8. Contact</h2>
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
