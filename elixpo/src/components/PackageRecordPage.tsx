import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bot, Github, PackageCheck, Terminal } from "lucide-react";
import type { DirectoryEntry } from "@/lib/directory";
import { familyPath } from "@/lib/directory";
import type { PackageRecord } from "@/lib/packages";
import { PACKAGES_LAST_VERIFIED } from "@/lib/packages";
import { serializeJsonLd } from "@/lib/seo";

export function PackageRecordPage({ record, related }: { record: PackageRecord; related: DirectoryEntry }) {
  const canonicalUrl = `https://elixpo.com/packages/${record.slug}`;
  const relatedUrl = `${familyPath(related.family)}/${related.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": record.kind === "linux" ? "SoftwareApplication" : "SoftwareSourceCode",
        name: record.name,
        description: record.description,
        url: canonicalUrl,
        codeRepository: record.source,
        softwareVersion: record.version,
        license: record.license === "MIT" ? "https://opensource.org/license/mit" : record.license,
        maintainer: { "@type": "Organization", name: record.maintainer, url: "https://elixpo.com" },
        operatingSystem: record.kind === "linux" ? "Linux" : record.kind === "native" ? record.platform : undefined,
        applicationCategory: record.kind === "linux" ? "UtilitiesApplication" : record.kind === "native" ? "DeveloperApplication" : undefined,
        isPartOf: { "@type": "CreativeWork", name: related.name, url: `https://elixpo.com${relatedUrl}` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Elixpo", item: "https://elixpo.com" },
          { "@type": "ListItem", position: 2, name: "Packages", item: "https://elixpo.com/packages" },
          { "@type": "ListItem", position: 3, name: record.name, item: canonicalUrl },
        ],
      },
    ],
  };

  return <main className="page-shell package-record-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
    <Link className="back-link" href="/packages"><ArrowLeft size={15}/> Back to packages</Link>
    <article>
      <header className="package-record-hero">
        <div className={`package-record-mark package-record-mark-${record.kind}`} aria-hidden="true">
          {record.kind === "npm" ? <span>npm</span> : record.kind === "native" ? <Bot size={46}/> : <PackageCheck size={46}/>}
        </div>
        <div className="package-record-heading">
          <p className="eyebrow">{record.kind === "npm" ? "npm package" : record.kind === "native" ? "Native tool" : "Linux application"} · {record.type}</p>
          <h1>{record.name}</h1>
          <p>{record.description}</p>
        </div>
        <dl className="package-record-facts">
          <div><dt>Current version</dt><dd>{record.version}</dd></div>
          <div><dt>Release status</dt><dd><span className={`status-pill status-${record.status === "maintained" ? "active" : record.status}`}>{record.status}</span></dd></div>
          <div><dt>License</dt><dd>{record.license}</dd></div>
          <div><dt>Maintainer</dt><dd>{record.maintainer}</dd></div>
        </dl>
      </header>

      {record.status !== "maintained" && <section className={`package-lifecycle-notice package-lifecycle-${record.status}`} role="status">
        <p className="eyebrow">Release lifecycle</p>
        <h2>This package is {record.status}.</h2>
        <p>{record.status === "deprecated" ? "Existing releases remain documented, but new adoption is discouraged. Review the source and release record for migration guidance before installing it." : record.status === "unsupported" ? "No support or maintenance response is promised. Existing artifacts remain visible for reproducibility and historical use." : "This package is preserved as a historical release and is not presented as currently supported software."}</p>
      </section>}

      <section className="package-install-section">
        <div><p className="eyebrow">Installation</p><h2>Install the published release.</h2><p>The command below comes from the verified Elixpo package registry. Review the linked package and source records before installing software in a sensitive environment.</p></div>
        <div className="package-command">
          {record.aptInstall && <><span><PackageCheck size={16}/> Debian and Ubuntu via Elixpo APT</span><code>{record.aptInstall}</code></>}
          <span><Terminal size={16}/> {record.aptInstall ? "Direct install · Linux and macOS" : "Linux and macOS"}</span><code>{record.install}</code>
          {record.secondaryInstall && <><span><Terminal size={16}/> Windows PowerShell</span><code>{record.secondaryInstall}</code></>}
        </div>
      </section>

      <section className="package-record-grid">
        <article><p className="eyebrow">Supported environment</p><h2>{record.platform}</h2><ul>{record.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul></article>
        <article><p className="eyebrow">Release records</p><h2>Inspect the package at its source.</h2><div className="package-record-links"><a href={record.externalPage} target="_blank" rel="noreferrer">Official package page <ArrowUpRight size={15}/></a><a href={record.source} target="_blank" rel="noreferrer"><Github size={15}/> Source repository</a><a href={record.releaseUrl} target="_blank" rel="noreferrer">Release record <ArrowUpRight size={15}/></a></div></article>
      </section>

      <section className="package-related-record">
        <div><p className="eyebrow">Connected Elixpo record</p><h2>{related.name}</h2><p>{related.description}</p></div>
        <Link className="button primary" href={relatedUrl}>Open {related.family} dossier <ArrowRight size={15}/></Link>
      </section>
      <p className="registry-date">Package metadata last verified {PACKAGES_LAST_VERIFIED}.</p>
    </article>
  </main>;
}
