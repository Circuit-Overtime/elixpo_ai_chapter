import Image from "next/image";
import { ArrowRight, ArrowUpRight, Github, PackageCheck, ShieldCheck, Terminal } from "lucide-react";
import { ELIXPO_PACKAGES, LINUX_APPLICATIONS, PACKAGE_DISTRIBUTION, PACKAGES_LAST_VERIFIED } from "@/lib/packages";
import { createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Elixpo Packages — signed Linux applications and developer packages",
  description: "Install Win Dot Panel and ScreenBridge from Elixpo's signed Debian APT repository, review supported Linux environments, or browse maintained Elixpo npm libraries and command-line tools.",
  path: "/packages",
});

export default function PackagesPage() {
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
          itemListElement: LINUX_APPLICATIONS.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: item.page })),
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
    ],
  };

  return <main className="packages-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

    <header className="packages-hero">
      <div className="packages-hero-copy">
        <p className="eyebrow">Elixpo Packages</p>
        <h1>Linux applications distributed through a signed package repository.</h1>
        <p>Elixpo develops focused desktop utilities, publishes versioned Debian packages, and delivers stable updates through one shared APT source. Each application remains connected to its source, documentation, releases, and support history.</p>
        <div className="hero-actions">
          <a className="button primary" href={PACKAGE_DISTRIBUTION.website} target="_blank" rel="noreferrer">Open packages.elixpo.com <ArrowUpRight size={16} /></a>
          <a className="button secondary" href={PACKAGE_DISTRIBUTION.repository} target="_blank" rel="noreferrer"><Github size={16} /> View the repository</a>
        </div>
      </div>
      <div className="packages-hero-stack" aria-hidden="true">
        <div className="package-box package-box-back"><span>APT</span><b>signed repository</b></div>
        <div className="package-box package-box-middle"><PackageCheck size={32}/><b>screenbridge</b><span>.deb</span></div>
        <div className="package-box package-box-front"><PackageCheck size={32}/><b>win-dot-panel</b><span>.deb</span></div>
      </div>
      <div className="packages-hero-facts"><span><b>{LINUX_APPLICATIONS.length}</b> maintained applications</span><span><b>{ELIXPO_PACKAGES.length}</b> maintained npm packages</span><span><b>{PACKAGE_DISTRIBUTION.license}</b> open-source software</span></div>
    </header>

    <section className="linux-catalog section-wrap" aria-labelledby="linux-applications">
      <div className="section-heading split">
        <div><p className="eyebrow">Linux application catalog</p><h2 id="linux-applications">Install the application that matches your desktop task.</h2></div>
        <p>The installers verify Elixpo’s repository key, register the shared APT source, and install the selected package. Normal system updates can then deliver later stable releases.</p>
      </div>
      <div className="linux-package-list">
        {LINUX_APPLICATIONS.map((item, index) => <article className={`linux-package linux-package-${item.slug}`} key={item.slug}>
          <div className="linux-package-heading">
            <span className="package-number">{String(index + 1).padStart(2, "0")}</span>
            <Image src={item.icon} alt="" width={80} height={80} />
            <div><p className="eyebrow">{item.category} · v{item.version}</p><h3>{item.name}</h3><p>{item.summary}</p></div>
          </div>
          {item.images.length > 0 ? <div className="package-screenshots">{item.images.map((image) => <Image key={image.src} src={image.src} alt={image.alt} width={920} height={620} />)}</div> : <div className="audio-diagram" aria-label="Illustration of ScreenBridge routing computer audio and microphone input"><span className="audio-source">Computer audio</span><i/><span className="audio-bridge">ScreenBridge</span><i/><span className="audio-target">Call or recording</span></div>}
          <div className="linux-package-details">
            <div><p className="eyebrow">Supported environments</p><p>{item.support}</p><ul>{item.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul></div>
            <div className="install-panel"><p><Terminal size={15}/> Install from Terminal</p><code>{item.install}</code><div><a href={item.page} target="_blank" rel="noreferrer">Package page <ArrowUpRight size={14}/></a><a href={item.source} target="_blank" rel="noreferrer">Source <ArrowUpRight size={14}/></a><a href={item.releases} target="_blank" rel="noreferrer">Releases <ArrowUpRight size={14}/></a></div></div>
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
      <div className="section-heading split"><div><p className="eyebrow">JavaScript and command-line tooling</p><h2 id="developer-package-index">Developer packages published separately through npm.</h2></div><p>These libraries and command-line tools support Elixpo’s canvas, publishing, identity, and link services. They are separate from the Linux application repository above.</p></div>
      <div className="developer-package-list">
        {ELIXPO_PACKAGES.map((item, index) => <a href={item.href} target="_blank" rel="noreferrer" key={item.name}><span>{String(index + 1).padStart(2,"0")}</span><i className="npm-mark">npm</i><div><small>{item.type} · v{item.version} · {item.license}</small><strong>{item.name}</strong><code>{item.install}</code></div><ArrowUpRight size={16}/></a>)}
      </div>
      <p className="registry-date">Package metadata last verified {PACKAGES_LAST_VERIFIED}.</p>
    </section>
  </main>;
}
