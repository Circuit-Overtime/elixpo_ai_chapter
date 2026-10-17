import Image from "next/image";
import { ArrowUpRight, Mail } from "lucide-react";
import { PartnershipImpact } from "@/components/PartnershipImpact";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Community event partnerships and sticker support",
  description:
    "Review Elixpo's community partnership record, including more than 3,500 stickers distributed, and the terms for transparent non-monetary event support.",
  path: "/partnerships",
});

const contactEmail = "hello@elixpo.com";

const tiers = [
  {
    quantity: "Up to 100 stickers",
    title: "Community pack",
    offer:
      "Elixpo provides an agreed sticker pack or print-ready artwork for free community distribution.",
    exchange:
      "The event credits Elixpo as a community partner and publishes a clear social mention linked to the Elixpo website or account.",
    subject: "Community pack partnership request",
  },
  {
    quantity: "More than 100 stickers",
    title: "Event presence",
    offer:
      "Elixpo provides the larger agreed sticker quantity for free distribution at the event.",
    exchange:
      "The community-partner credit and social mention remain, and the event provides an on-stage slot of no more than ten minutes to introduce Elixpo and its open-source work.",
    subject: "Event presence partnership request",
  },
  {
    quantity: "Around 200 or more",
    title: "Custom agreement",
    offer:
      "A larger run is possible after the print, delivery, audience, and distribution details have been reviewed.",
    exchange:
      "The ten-minute slot remains. Any additional visibility or on-site space is agreed in writing before production rather than treated as an automatic entitlement.",
    subject: "Large event partnership request",
  },
];

const collaborators = [
  {
    name: "GDG on Campus JIS University",
    year: "2025",
    type: "Developer community collaboration",
    logo: "/partners/gdg-jis-university.webp",
    width: 460,
    height: 460,
    href: "https://gdg.community.dev/gdg-on-campus-jis-university-kolkata-india/",
  },
  {
    name: "OWASP JIS University Student Chapter",
    year: "2025",
    type: "Security community collaboration",
    logo: "/partners/owasp-jis-university.webp",
    width: 171,
    height: 171,
    href: "https://owasp.org/www-chapter-jis-university-student-chapter/",
  },
  {
    name: "ByteMonk",
    year: "2026",
    type: "Open-source event partnership",
    logo: "/partners/bytemonk.webp",
    width: 200,
    height: 200,
    href: "https://bytemonk.gcect.org.in/",
  },
  {
    name: "SCEE, Academy of Technology",
    year: "2026",
    type: "Engineering community collaboration",
    logo: "/partners/scee.webp",
    width: 427,
    height: 166,
    logoTone: "dark",
    href: "https://sceeaot.vercel.app/",
  },
  {
    name: "InnovateX Engineers Community",
    year: "2026",
    type: "Technology community collaboration",
    logo: "/partners/innovatex-engineers-community.webp",
    width: 200,
    height: 200,
    href: "https://www.linkedin.com/company/innovatex-coders",
  },
];

function mailto(subject: string) {
  const body =
    "Event name:\nEvent date and venue:\nExpected attendance:\nRequested sticker quantity:\nPublic event link:\nOrganizer name and contact:\n\nHow we would like to work with Elixpo:";
  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function PartnershipsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Elixpo community partnerships",
    description: metadata.description,
    mainEntity: {
      "@type": "ItemList",
      name: "Past Elixpo community collaborations",
      itemListElement: collaborators.map((collaborator, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Organization",
          name: collaborator.name,
          url: collaborator.href,
        },
      })),
    },
  };

  return (
    <main className="partnership-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <header className="partnership-hero">
        <div className="partnership-hero-geometry" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="partnership-hero-copy">
          <p className="eyebrow">Community partnerships / in-kind support</p>
          <h1>Elixpo works with communities that help people build in public.</h1>
          <p className="lede">
            We support aligned events with speakers and approved sticker
            material. Public sticker images are watermarked previews; physical
            packs or print-ready artwork are released only after an event request
            is approved in writing. Each arrangement is a transparent in-kind
            exchange, not a payment or endorsement sale.
          </p>
          <a className="button partnership-primary" href={mailto("Elixpo community partnership proposal")}>
            Email a proposal <Mail size={16} />
          </a>
        </div>
        <aside className="partnership-hero-record" aria-label="Partnership record summary">
          <span>PUBLIC RECORD</span>
          <strong>5</strong>
          <p>community collaborations recorded across 2025 and 2026</p>
          <small>Support is reviewed for every event. Past work does not imply a standing endorsement.</small>
        </aside>
      </header>

      <PartnershipImpact />

      <section className="collaboration-section section-wrap" aria-labelledby="past-collaborations">
        <div className="section-heading split">
          <div>
            <p className="eyebrow">Past collaborations</p>
            <h2 id="past-collaborations">Elixpo has supported community events before.</h2>
          </div>
          <p>
            These organizations and student communities have previously worked
            with Elixpo on public technical programming or event support. The
            year identifies the collaboration period in our record.
          </p>
        </div>
        <div className="collaborator-grid">
          {collaborators.map((collaborator) => (
            <a
              className="collaborator-card"
              href={collaborator.href}
              key={collaborator.name}
              target="_blank"
              rel="noreferrer"
              aria-label={`Visit ${collaborator.name}`}
            >
              <div className={`collaborator-logo${collaborator.logoTone === "dark" ? " dark" : ""}`}>
                <Image
                  src={collaborator.logo}
                  alt={`${collaborator.name} logo`}
                  width={collaborator.width}
                  height={collaborator.height}
                  sizes="(max-width: 620px) 42vw, (max-width: 900px) 28vw, 180px"
                />
              </div>
              <div className="collaborator-meta">
                <span>{collaborator.year}</span>
                <ArrowUpRight size={16} />
              </div>
              <h3>{collaborator.name}</h3>
              <p>{collaborator.type}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="partnership-options section-wrap" aria-labelledby="partnership-options">
        <div className="section-heading split">
          <div>
            <p className="eyebrow">Current support options</p>
            <h2 id="partnership-options">Choose the scale that matches your event.</h2>
          </div>
          <p>
            Every request is reviewed against the audience, delivery timeline,
            available inventory, and the public value of the event. Emailing a
            request begins a conversation; it does not guarantee support.
          </p>
        </div>
        <div className="tier-grid">
          {tiers.map((tier, index) => (
            <article key={tier.quantity}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p className="eyebrow">{tier.quantity}</p>
              <h2>{tier.title}</h2>
              <h3>Elixpo provides</h3>
              <p>{tier.offer}</p>
              <h3>The event provides</h3>
              <p>{tier.exchange}</p>
              <a className="tier-email" href={mailto(tier.subject)}>
                Email about this option <Mail size={15} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="partnership-rules section-wrap">
        <div>
          <p className="eyebrow">What we need in a request</p>
          <h2>Provide enough detail for us to make a responsible commitment.</h2>
        </div>
        <ul>
          <li>Event name, date, venue, organizers, and public event page</li>
          <li>Expected attendance and the requested sticker quantity</li>
          <li>Delivery city, deadline, and whether Elixpo prints or supplies artwork</li>
          <li>Where and how the stickers will be distributed</li>
          <li>The proposed social credit, brand placement, and speaking arrangement</li>
          <li>A named organizer responsible for confirming delivery and outcomes</li>
        </ul>
      </section>

      <section className="method-panel partnership-method section-wrap">
        <p className="eyebrow">Independence</p>
        <h2>Visibility does not purchase authority inside Elixpo.</h2>
        <p>
          Event support does not purchase Chapter selection, Member Project
          status, contributor credit, research outcomes, editorial treatment,
          or an exception to Elixpo standards. Monetary organization sponsorship
          remains closed until a legal recipient and accountable reporting
          process exist.
        </p>
        <a className="text-link" href={mailto("Elixpo event partnership proposal")}>
          Propose an event partnership <ArrowUpRight size={15} />
        </a>
      </section>
    </main>
  );
}
