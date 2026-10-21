import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const work = [{ label: "Projects", href: "/projects" }, { label: "Research", href: "/research" }, { label: "Services", href: "/services" }, { label: "Developer packages", href: "/packages" }, { label: "Linux package hub", href: "https://packages.elixpo.com" }];
const commons = [{ label: "About the foundry", href: "/about" }, { label: "Contributors", href: "/contributors" }, { label: "Recognition records", href: "/recognition" }, { label: "History", href: "/history" }, { label: "Contributing", href: "/contributing" }, { label: "Contact", href: "/contact" }];
const standards = [{ label: "Branding", href: "/branding" }, { label: "Architecture", href: "/architecture" }, { label: "Event partnerships", href: "/partnerships" }, { label: "Licensing", href: "/licensing" }, { label: "Code of conduct", href: "/code-of-conduct" }, { label: "Terms of service", href: "/terms" }, { label: "Privacy", href: "/privacy" }];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-lead">
        <h2>Open work deserves<br />a legible public life.</h2>
        <div><p>Elixpo is a project foundry for active software, reproducible research, and openly operated services. We build in public, credit the people who move the work, and preserve the release record.</p><a className="text-link" href="https://github.com/orgs/elixpo/discussions" target="_blank" rel="noreferrer">Open a discussion <ArrowUpRight size={14} /></a></div>
      </div>
      <div className="footer-links">
        <div><h3>Elixpo</h3><p>Build in public.<br />Release as a project.</p></div>
        <div><h3>Work</h3>{work.map((item) => item.href.startsWith("http") ? <a key={item.href} href={item.href} target="_blank" rel="noreferrer">{item.label}</a> : <Link key={item.href} href={item.href}>{item.label}</Link>)}</div>
        <div><h3>Commons</h3>{commons.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</div>
        <div><h3>Standards</h3>{standards.map((item) => item.href.startsWith("http") ? <a key={item.href} href={item.href} target="_blank" rel="noreferrer">{item.label}</a> : <Link key={item.href} href={item.href}>{item.label}</Link>)}</div>
      </div>
      <div className="footer-meta"><span>© 2023–2026 Elixpo · Licenses vary by artifact</span><span>Registry verified 16 October 2026</span></div>
    </footer>
  );
}
