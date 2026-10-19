import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bot, Github, PackageCheck, ShieldCheck, Terminal } from "lucide-react";
import { ELIXPO_PACKAGES, LINUX_APPLICATIONS, NATIVE_TOOLS, PACKAGE_DISTRIBUTION, PACKAGES_LAST_VERIFIED } from "@/lib/packages";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

const pageMetadata = createPageMetadata({
  title: "Elixpo Packages — native tools, Linux and npm releases",
  description: "Install Crumb from its verified cross-platform release, use Elixpo's signed Debian APT applications, and browse maintained npm libraries and command-line tools.",
  path: "/packages",
});
export const metadata = {
  ...pageMetadata,
  alternates: {
    ...pageMetadata.alternates,
    types: { "application/atom+xml": "/packages/feed.xml" },
  },
};

export default function PackagesPage() {
  const maintainedLinux = LINUX_APPLICATIONS.filter((item) => item.status === "maintained").length;
  const maintainedNative = NATIVE_TOOLS.filter((item) => item.status === "maintained").length;
  const maintainedNpm = ELIXPO_PACKAGES.filter((item) => item.status === "maintained").length;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Elixpo Packages",
        description: metadata.description,
        url: "https://elixpo.com/packages",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: [...NATIVE_TOOLS, ...LINUX_APPLICATIONS].map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: item.page })),
        },
      },
      ...LINUX_APPLICATIONS.map((item) => ({
        "@type": "SoftwareApplication",
        name: item.name,
        description: item.summary,
        url: item.page,
        downloadUrl: item.releases,
        codeRepository: item.source,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Linux",
        softwareVersion: item.version,
        license: item.license === "MIT" ? "https://opensource.org/license/mit" : item.license,
        maintainer: { "@type": "Organization", name: item.maintainer },
      })),
      ...NATIVE_TOOLS.map((item) => ({
        "@type": "SoftwareApplication",
        name: item.name,
        description: item.summary,
        url: item.page,
        downloadUrl: item.releases,
        codeRepository: item.source,
        applicationCategory: "DeveloperApplication",
        operatingSystem: item.support,
        softwareVersion: item.version,
        maintainer: { "@type": "Organization", name: item.maintainer },
      })),
    ],
  };

  return <main className="packages-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

    <header className="packages-hero">
      <div className="packages-hero-copy">
        <p className="eyebrow">Elixpo Packages</p>
        <h1>Packages, from source to <em>signed release.</em></h1>
        <p>Elixpo develops focused desktop utilities, publishes versioned Debian packages, and delivers stable updates through one shared APT source. Each application remains connected to its source, documentation, releases, and support history.</p>
        <div className="hero-actions">
          <a className="button primary" href={PACKAGE_DISTRIBUTION.website} target="_blank" rel="noreferrer">Open packages.elixpo.com <ArrowUpRight size={16} /></a>
          <a className="button secondary" href={PACKAGE_DISTRIBUTION.repository} target="_blank" rel="noreferrer"><Github size={16} /> View the repository</a>
        </div>
      </div>
      <div className="packages-hero-orbits" aria-hidden="true"><span/><span/><span/></div>
      <div className="packages-hero-stack" aria-hidden="true">
        <div className="package-box package-box-back"><span>APT</span><b>signed repository</b></div>
        <div className="package-box package-box-middle"><PackageCheck size={32}/><b>screenbridge</b><span>.deb</span></div>
        <div className="package-box package-box-front"><PackageCheck size={32}/><b>win-dot-panel</b><span>.deb</span></div>
      </div>
      <div className="packages-hero-facts"><span><b>{maintainedNative}</b> cross-platform native tool</span><span><b>{maintainedLinux}</b> maintained Linux applications</span><span><b>{maintainedNpm}</b> maintained npm packages</span></div>
    </header>

    <section className="linux-catalog section-wrap" aria-labelledby="native-tools">
      <div className="section-heading split">
        <div><p className="eyebrow">Native tools</p><h2 id="native-tools">Install a verified tool from its owning project.</h2></div>
        <p>Native tools keep source, versioning, signatures, SBOMs, and release authority in their product repository. Elixpo Packages provides one trusted discovery and installation record.</p>
      </div>
      <div className="package-feature-grid">
        {NATIVE_TOOLS.map((item, index) => <article className="package-feature-card package-lifecycle-maintained" key={item.slug}>
          <div className="package-feature-art"><span>N{String(index + 1).padStart(2, "0")}</span><Image src={item.images[0].src} alt={item.images[0].alt} width={1200} height={630}/></div>
          <div className="package-feature-copy">
            <div className="package-feature-title"><Image src={item.icon} alt="" width={58} height={58}/><div><p className="eyebrow">{item.category} · v{item.version}</p><h3>{item.name}</h3><span className="status-pill status-active">maintained</span></div></div>
            <p>{item.summary}</p>
            <ul>{item.capabilities.slice(0,3).map((capability) => <li key={capability}>{capability}</li>)}</ul>
            <div className="package-feature-install"><span><Terminal size={14}/> Linux and macOS</span><code>{item.install}</code></div>
            <div className="space-actions"><Link href={`/packages/${item.slug}`}>Release record <ArrowRight size={15}/></Link><a href={item.page} target="_blank" rel="noreferrer"><Bot size={15}/> Open {item.name} <ArrowUpRight size={15}/></a></div>
          </div>
        </article>)}
      </div>
    </section>

    <section className="linux-catalog section-wrap" aria-labelledby="linux-applications">
      <div className="section-heading split">
        <div><p className="eyebrow">Maintained applications</p><h2 id="linux-applications">Install a documented Linux release.</h2></div>
        <p>The installers verify Elixpo’s repository key, register the shared APT source, and install the selected package. Normal system updates can then deliver later stable releases.</p>
      </div>
      <div className="package-feature-grid">
        {LINUX_APPLICATIONS.map((item, index) => <article className={`package-feature-card package-feature-${index + 1} package-lifecycle-${item.status}`} key={item.slug}>
          <div className="package-feature-art">
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.images[0] ? <Image src={item.images[0].src} alt={item.images[0].alt} width={920} height={620} /> : <div className="package-audio-art" aria-hidden="true"><i/><i/><i/><Terminal size={48}/></div>}
          </div>
          <div className="package-feature-copy">
            <div className="package-feature-title"><Image src={item.icon} alt="" width={58} height={58}/><div><p className="eyebrow">{item.category} · v{item.version}</p><h3>{item.name}</h3><span className={`status-pill status-${item.status === "maintained" ? "active" : item.status}`}>{item.status}</span></div></div>
            <p>{item.summary}</p>
            <ul>{item.capabilities.slice(0,3).map((capability) => <li key={capability}>{capability}</li>)}</ul>
            <div className="package-feature-install"><span><Terminal size={14}/> Install</span><code>{item.install}</code></div>
            <div className="space-actions"><Link href={`/packages/${item.slug}`}>Package record <ArrowRight size={15}/></Link><a href={item.page} target="_blank" rel="noreferrer">Open package site <ArrowUpRight size={15}/></a></div>
          </div>
        </article>)}
      </div>
    </section>

    <section className="apt-section section-wrap">
      <div className="apt-copy"><p className="eyebrow">Distribution and trust</p><h2>Both applications use the same signed APT repository.</h2><p>The repository is built from the latest stable, product-prefixed GitHub releases. The deployment workflow verifies package names and checksums, creates one package index, signs it, and deploys the catalog and repository together.</p><a className="text-link" href={PACKAGE_DISTRIBUTION.aptDocumentation} target="_blank" rel="noreferrer">Read the repository documentation <ArrowUpRight size={15}/></a></div>
      <div className="apt-facts">
        <article><ShieldCheck size={22}/><h3>Signed packages</h3><p>Installers verify the official key before configuring the repository.</p></article>
        <article><PackageCheck size={22}/><h3>Versioned releases</h3><p>Each application uses its own release namespace and versioned Debian artifact.</p></article>
        <article><ArrowRight size={22}/><h3>System updates</h3><p>Stable updates arrive through the standard APT workflow after installation.</p></article>
      </div>
    </section>

    <section className="developer-packages section-wrap" aria-labelledby="developer-package-index">
      <div className="section-heading split"><div><p className="eyebrow">JavaScript and command-line tooling</p><h2 id="developer-package-index">Developer packages published separately through npm.</h2><a className="text-link" href="/packages/feed.xml">Subscribe to package releases <ArrowUpRight size={14}/></a></div><p>These libraries and command-line tools support Elixpo’s canvas, publishing, identity, and link services. They are separate from the Linux application repository above.</p></div>
      <div className="developer-package-list">
        {ELIXPO_PACKAGES.map((item, index) => <Link className={`package-lifecycle-${item.status}`} href={`/packages/${item.slug}`} key={item.name}><span>{String(index + 1).padStart(2,"0")}</span><i className="npm-mark">npm</i><div><small>{item.type} · v{item.version} · {item.license}</small><strong>{item.name}</strong><code>{item.install}</code><span className={`status-pill status-${item.status === "maintained" ? "active" : item.status}`}>{item.status}</span></div><ArrowRight size={16}/></Link>)}
      </div>
      <p className="registry-date">Package metadata last verified {PACKAGES_LAST_VERIFIED}.</p>
    </section>
  </main>;
}
