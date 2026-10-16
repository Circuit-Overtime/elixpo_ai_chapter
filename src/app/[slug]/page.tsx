import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPackage, LAST_VERIFIED, PACKAGE_RECORDS } from "@/lib/packages";
import { jsonLd, pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return PACKAGE_RECORDS.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = getPackage((await params).slug);
  if (!record) return {};
  return {
    ...pageMetadata(`${record.name} ${record.version}`, record.summary, `/${record.slug}`, record.slug),
    keywords: [record.name, record.category, record.kind === "linux" ? "Debian package" : "npm package", "Elixpo", ...record.capabilities],
    other: {
      "DC.title": record.name,
      "DC.description": record.summary,
      "DC.publisher": "Elixpo",
      "DC.rights": record.license,
      "DC.identifier": record.releaseUrl,
      "software:version": record.version,
      "software:registry": record.kind === "linux" ? "Elixpo signed APT repository" : "npm",
    },
  };
}

export default async function PackagePage({ params }: Props) {
  const record = getPackage((await params).slug);
  if (!record) notFound();
  const canonical = `https://packages.elixpo.com/${record.slug}/`;
  const type = record.kind === "linux" ? "SoftwareApplication" : "SoftwareSourceCode";
  const structured = { "@context": "https://schema.org", "@graph": [
    { "@type": type, "@id": `${canonical}#package`, name: record.name, description: record.summary, url: canonical, version: record.version, codeRepository: record.source, license: record.license === "MIT" ? "https://opensource.org/license/mit" : record.license, dateModified: LAST_VERIFIED, isAccessibleForFree: true, maintainer: { "@id": "https://elixpo.com/#organization" }, publisher: { "@id": "https://elixpo.com/#organization" }, featureList: record.capabilities, ...(record.images.length ? { image: record.images.map((image) => new URL(image.src, canonical).toString()) } : {}), ...(record.kind === "linux" ? { applicationCategory: "UtilitiesApplication", applicationSuite: "Elixpo Packages", operatingSystem: record.platform, downloadUrl: record.releaseUrl, installUrl: canonical, softwareVersion: record.version, softwareRequirements: record.platform } : { programmingLanguage: "TypeScript and JavaScript", runtimePlatform: "npm", targetProduct: { "@type": "SoftwareApplication", name: "npm-compatible JavaScript runtime" } }) },
    { "@type": "WebPage", "@id": `${canonical}#webpage`, url: canonical, name: `${record.name} ${record.version}`, description: record.summary, dateModified: LAST_VERIFIED, mainEntity: { "@id": `${canonical}#package` }, isPartOf: { "@id": "https://packages.elixpo.com/#website" } },
    { "@type": "WebSite", "@id": "https://packages.elixpo.com/#website", name: "Elixpo Packages", url: "https://packages.elixpo.com/", publisher: { "@id": "https://elixpo.com/#organization" } },
    { "@type": "Organization", "@id": "https://elixpo.com/#organization", name: "Elixpo", url: "https://elixpo.com", logo: "https://elixpo.com/logos/logo.png" },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Elixpo", item: "https://elixpo.com/" }, { "@type": "ListItem", position: 2, name: "Elixpo Packages", item: "https://packages.elixpo.com/" }, { "@type": "ListItem", position: 3, name: record.name, item: canonical }] },
  ] };
  return <main className="page-shell"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} /><Link className="back" href="/">← Package catalogue</Link><header className="record-hero"><div className="record-hero-copy"><div className={`record-mark record-mark-${record.kind}`}>{record.kind === "npm" ? "npm" : record.slug === "screenbridge" ? <Image src="/screenbridge/icon.svg" width={76} height={76} alt=""/> : <Image src="/favicon.png" width={76} height={76} alt=""/>}</div><p className="eyebrow">{record.category} / {record.status}</p><h1>{record.name}</h1><p>{record.summary}</p><div className="actions"><a className="button primary" href={record.releaseUrl}>{record.kind === "linux" ? "Open releases" : "Open npm package"} ↗</a><a className="button secondary" href={record.source}>Source code ↗</a></div></div><aside><dl className="record-facts"><div><dt>Version</dt><dd>{record.version}</dd></div><div><dt>Distribution</dt><dd>{record.kind === "linux" ? "Signed APT" : "npm"}</dd></div><div><dt>Platform</dt><dd>{record.platform}</dd></div><div><dt>License</dt><dd>{record.license}</dd></div><div><dt>Maintainer</dt><dd>{record.maintainer}</dd></div><div><dt>Status</dt><dd>{record.status}</dd></div></dl></aside></header>
    <section className="install-section"><div><p className="eyebrow">Installation</p><h2>Install the published release.</h2><p>{record.kind === "linux" ? "The installer verifies the Elixpo signing key before adding the shared package source. Review the script and source repository before running software with system privileges." : "Install from the public npm registry. Review the owning repository for runtime requirements, API documentation, and release notes."}</p></div><div className="install-command"><span>{record.kind === "linux" ? "Terminal · Linux" : "Terminal · npm"}</span><code>{record.install}</code></div></section>
    <section className="detail-grid"><article><p className="eyebrow">Capabilities</p><h2>What this release provides.</h2><ul>{record.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul></article><article><p className="eyebrow">Public record</p><h2>Inspect the package at its source.</h2><div className="record-links"><a href={record.source}>Source repository <span>↗</span></a><a href={record.releaseUrl}>{record.kind === "linux" ? "Release artifacts" : "npm registry"} <span>↗</span></a><a href="https://github.com/elixpo/packages.elixpo/issues">Report a package problem <span>↗</span></a>{record.kind === "linux" && <Link href="/repository">APT repository and signing <span>→</span></Link>}</div></article></section>
    {record.kind === "linux" && <section className="supplement-links"><Link href={`/${record.slug}/docs`}><span className="eyebrow">Documentation</span><b>Install, configure, and get support →</b></Link><Link href={`/${record.slug}/about`}><span className="eyebrow">About this application</span><b>Purpose, scope, and maintenance →</b></Link></section>}
  </main>;
}
