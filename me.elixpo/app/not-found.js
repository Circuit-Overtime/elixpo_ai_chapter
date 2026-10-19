import Link from "next/link";

export default function NotFound() {
  return <main className="portfolio-not-found">
    <div className="portfolio-geometry" aria-hidden="true"><i /><i /><i /><i /></div>
    <div><p className="portfolio-eyebrow">404 / outside the record</p><strong>404</strong><h1>This portfolio page does not exist.</h1><p>Return to the Elixpo member directory or report a missing public record.</p><div className="portfolio-actions"><Link className="portfolio-button portfolio-button-dark" href="/">Member directory</Link><a className="portfolio-button portfolio-button-outline" href="https://github.com/elixpo/me.elixpo/issues">Report the issue ↗</a></div></div>
  </main>;
}
