import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPackage, LAST_VERIFIED, LINUX_PACKAGES } from "@/lib/packages";
import { jsonLd, pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string; section: string }> };
const sections = ["docs", "about"] as const;
export const dynamicParams = false;
export function generateStaticParams() { return LINUX_PACKAGES.flatMap(({ slug }) => sections.map((section) => ({ slug, section }))); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, section } = await params;
  const record = getPackage(slug);
  if (!record || record.kind !== "linux" || !sections.includes(section as typeof sections[number])) return {};
  const title = section === "docs" ? `${record.name} documentation` : `About ${record.name}`;
  const description = section === "docs" ? `Installation, platform support, capabilities, updates, and support routes for ${record.name}.` : `The purpose, public scope, maintenance record, and licensing of ${record.name}.`;
  return pageMetadata(title, description, `/${slug}/${section}`, slug);
}

export default async function PackageSection({ params }: Props) {
  const { slug, section } = await params;
  const record = getPackage(slug);
  if (!record || record.kind !== "linux" || !sections.includes(section as typeof sections[number])) notFound();
  const docs = section === "docs";
  const canonical = `https://packages.elixpo.com/${slug}/${section}/`;
  const structured = { "@context": "https://schema.org", "@type": "TechArticle", "@id": `${canonical}#article`, headline: docs ? `${record.name} documentation` : `About ${record.name}`, description: docs ? `Installation and support documentation for ${record.name}.` : record.summary, url: canonical, mainEntityOfPage: canonical, dateModified: LAST_VERIFIED, inLanguage: "en", isAccessibleForFree: true, about: { "@type": "SoftwareApplication", name: record.name, url: `https://packages.elixpo.com/${slug}/`, softwareVersion: record.version, operatingSystem: record.platform }, author: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com/" }, publisher: { "@type": "Organization", name: "Elixpo", url: "https://elixpo.com/", logo: { "@type": "ImageObject", url: "https://elixpo.com/logos/logo.png" } }, isPartOf: { "@type": "WebSite", name: "Elixpo Packages", url: "https://packages.elixpo.com/" } };
  return <main className="page-shell supplement"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} /><Link className="back" href={`/${slug}`}>← {record.name}</Link><header className="supplement-intro"><p className="eyebrow">{record.name} / {docs ? "documentation" : "about"}</p><h1>{docs ? "Install and use the public release." : "A focused application with a defined scope."}</h1><p>{docs ? `This page records the supported environment, installation path, capabilities, update model, and public support routes for ${record.name}.` : record.summary}</p></header>{docs ? <section className="prose-grid"><article><p className="eyebrow">Install</p><h2>Use the verified installer.</h2><div className="install-command"><span>Terminal</span><code>{record.install}</code></div><p>The installer retrieves the public signing key, checks its expected fingerprint, configures the shared Elixpo APT source, and installs <code>{record.slug}</code>.</p></article><article><p className="eyebrow">Environment</p><h2>Supported systems.</h2><p>{record.platform}</p><ul>{record.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul><p>For errors, include the distribution, desktop environment, display protocol, application version, and reproduction steps in a <a href="https://github.com/elixpo/packages.elixpo/issues">public issue</a>. Report security problems through the repository’s private security route.</p></article></section> : <section className="prose-grid"><article><p className="eyebrow">Purpose</p><h2>{record.name} solves one bounded Linux problem.</h2><p>{record.summary}</p><p>The project is maintained as open-source software in the Elixpo package monorepo. Its source, packaging definitions, tests, and release workflow are public.</p></article><article><p className="eyebrow">Maintenance record</p><h2>Scope remains visible.</h2><p>Current lifecycle: <strong>{record.status}</strong>. Current release: <strong>{record.version}</strong>. License: <strong>{record.license}</strong>.</p><p>The application does not require an Elixpo account. Package installation and updates use the signed APT repository described in the public operations documentation.</p><div className="record-links"><a href={record.source}>Inspect source <span>↗</span></a><a href={record.releaseUrl}>Inspect releases <span>↗</span></a><Link href="/repository">Repository trust model <span>→</span></Link></div></article></section>}</main>;
}
