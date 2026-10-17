import { createPageMetadata } from "@/lib/seo";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";
import { PageStructuredData } from "@/components/PageStructuredData";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description: "How Elixpo handles your data—a privacy-first approach to accounts, hosted services, open-source tools, and third-party integrations.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <main className="page-shell legal-page">
      <PageStructuredData name="Elixpo privacy policy" description="The portal-level privacy boundary for Elixpo accounts, hosted services, open-source tools, analytics, and third-party integrations." path="/privacy" />
      <header className="page-intro"><p className="eyebrow">Policy / last reviewed October 2026</p><h1>Privacy policy</h1><p className="lede">This portal-level notice describes Elixpo’s general approach. A hosted service may process different data and should publish a service-specific notice where its behavior differs.</p></header>
      <article className="prose prose-lg max-w-3xl prose-headings:tracking-tight prose-a:text-[#0b623c] prose-a:no-underline hover:prose-a:underline">
        <h2>Our approach</h2>
        <p>
          Elixpo aims to collect only the information needed to operate each
          service. The exact data flow depends on the service, its account
          requirements, infrastructure, and any third-party integration.
        </p>

        <h2>What we don&rsquo;t collect</h2>
        <ul>
          <li>We do not sell or share personal data with advertisers.</li>
          <li>This portal does not require an account for public browsing.</li>
          <li>We do not describe every Elixpo project as having the same data practices.</li>
        </ul>

        <h2>What we may process</h2>
        <p>
          To deliver features, minimal technical data (such as a request being
          proxied to an AI provider, or basic, aggregate usage needed to keep
          public APIs stable) may be processed transiently. Where you choose to
          create an Elixpo Account, we store only what&rsquo;s needed to provide
          that account.
        </p>

        <h2>Third-party services</h2>
        <p>
          Individual services may rely on third-party infrastructure. When data
          is routed to a provider to fulfil a feature, that provider&rsquo;s terms
          may apply. The relevant service should identify material providers in
          its own documentation or notice.
        </p>

        <h2>Cookies &amp; analytics</h2>
        <p>
          The portal records a small set of public-action categories—such as
          opening a project, package, research artifact, discussion, or task—to
          understand whether its directories are useful. These events contain
          the current route, destination host, and action category only. They do
          not contain a profile handle, query string, free-form field, persistent
          identifier, or cross-site advertising cookie. Do Not Track and Global
          Privacy Control disable this collection. Individual operated services
          document any additional functional cookies in their own notices.
        </p>

        <h2>Your rights</h2>
        <p>
          If you hold an Elixpo Account, you can request access to or deletion of
          your account data at any time by contacting us.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy; the &ldquo;last updated&rdquo; date above
          always reflects the current version.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions? Email{" "}
          <a href={`mailto:${ELIXPO_LINKS.email}`}>{ELIXPO_LINKS.email}</a> or reach
          us in{" "}
          <a href={ELIXPO_LINKS.discussions}>GitHub Discussions</a>.
        </p>
      </article>
    </main>
  );
}
