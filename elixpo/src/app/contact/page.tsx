import Link from "next/link";
import { ArrowRight, ArrowUpRight, FlaskConical, Github, Mail, MessageCircle, Settings, ShieldCheck } from "lucide-react";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Contact Elixpo",
  description: "Contact Elixpo about projects, public Chapters, contributor records, research, packages, community partnerships, and repository-specific security reports.",
  path: "/contact",
});

const channels = [
  {
    icon: Mail,
    label: "General enquiries",
    title: "Email Elixpo",
    text: "Use email for organization-level questions, corrections, brand enquiries, and matters that do not belong to one public repository.",
    href: `mailto:${ELIXPO_LINKS.email}`,
    action: ELIXPO_LINKS.email,
  },
  {
    icon: FlaskConical,
    label: "Research",
    title: "Discuss research",
    text: "Use this address for research publications, reproducibility questions, author corrections, and potential research collaboration.",
    href: `mailto:${ELIXPO_LINKS.researchEmail}`,
    action: ELIXPO_LINKS.researchEmail,
  },
  {
    icon: Settings,
    label: "Operations",
    title: "Contact operations",
    text: "Use this address for operational coordination, organization administration, service ownership, and time-sensitive internal routing.",
    href: `mailto:${ELIXPO_LINKS.operationsEmail}`,
    action: ELIXPO_LINKS.operationsEmail,
  },
  {
    icon: MessageCircle,
    label: "Projects and Chapters",
    title: "Start in public",
    text: "Use Discussions to propose a Chapter, ask an organization-wide question, or document an idea that benefits from an open response.",
    href: ELIXPO_LINKS.discussions,
    action: "Open Discussions",
  },
  {
    icon: Github,
    label: "Repository-specific work",
    title: "Contact the maintainer",
    text: "Issues, support requests, and technical proposals should go to the owning repository so its maintainers and evidence remain connected.",
    href: ELIXPO_LINKS.github,
    action: "Browse repositories",
  },
  {
    icon: ShieldCheck,
    label: "Security",
    title: "Report privately",
    text: "Follow the SECURITY.md and private reporting route in the affected repository. Do not disclose an unpatched vulnerability in a public issue.",
    href: `${ELIXPO_LINKS.github}/elixpo/security`,
    action: "Open organization security",
  },
] as const;

export default function ContactPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact Elixpo",
    url: "https://elixpo.com/contact",
    description: metadata.description,
    mainEntity: {
      "@type": "Organization",
      name: "Elixpo",
      url: "https://elixpo.com",
      email: ELIXPO_LINKS.email,
      contactPoint: [
        { "@type": "ContactPoint", contactType: "general enquiries", email: ELIXPO_LINKS.email, availableLanguage: "English" },
        { "@type": "ContactPoint", contactType: "research enquiries", email: ELIXPO_LINKS.researchEmail, availableLanguage: "English" },
        { "@type": "ContactPoint", contactType: "operations", email: ELIXPO_LINKS.operationsEmail, availableLanguage: "English" },
      ],
    },
  };

  return <main className="contact-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <header className="contact-hero">
      <div className="contact-hero-geometry" aria-hidden="true"><span/><span/><span/><span/></div>
      <div><p className="eyebrow">Contact / choose the accountable route</p><h1>Put the question <em>where the work lives.</em></h1><p className="lede">Elixpo uses public discussions for public decisions, repository channels for technical work, and email for organization-level or private enquiries. Choosing the right route keeps context, responsibility, and follow-up visible.</p></div>
      <aside><span>GENERAL CONTACT</span><a href={`mailto:${ELIXPO_LINKS.email}`}>{ELIXPO_LINKS.email}</a><p>No universal response-time guarantee is published. Repository maintainers own project-specific support.</p></aside>
    </header>

    <section className="contact-channels section-wrap">
      <div className="section-heading split"><div><p className="eyebrow">Contact routes</p><h2>One question, one responsible channel.</h2></div><p>Please do not send private security reports, account credentials, or sensitive personal information through public Discussions.</p></div>
      <div className="contact-channel-grid">{channels.map((channel, index) => { const Icon = channel.icon; return <a key={channel.title} href={channel.href} target={channel.href.startsWith("http") ? "_blank" : undefined} rel={channel.href.startsWith("http") ? "noreferrer" : undefined}><span>{String(index + 1).padStart(2,"0")} / {channel.label}</span><Icon size={28}/><h3>{channel.title}</h3><p>{channel.text}</p><b>{channel.action} <ArrowUpRight size={14}/></b></a>; })}</div>
    </section>

    <section className="contact-partnership section-wrap"><div><p className="eyebrow">Events and community support</p><h2>Partnership requests have their own published process.</h2></div><div><p>Sticker quantities, event recognition, venue expectations, artwork access, and the non-monetary support boundary are documented before material is released.</p><Link className="text-link" href="/partnerships">Review community partnerships <ArrowRight size={15}/></Link></div></section>
  </main>;
}
