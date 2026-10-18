export default function Footer({ profile, person }) {
  const year = new Date().getFullYear();

  return (
    <footer className="portfolio-footer">
      <div className="portfolio-footer-top">
        <div>
          <p className="portfolio-eyebrow">Open-source work, recorded in public</p>
          <h2>Build carefully. <em>Explain clearly.</em></h2>
        </div>
        <a className="portfolio-button portfolio-button-light" href={`mailto:${profile.email}`}>
          Start a conversation <span aria-hidden="true">↗</span>
        </a>
      </div>

      <section className="portfolio-footer-community" aria-labelledby="portfolio-community-title">
        <div>
          <p className="portfolio-eyebrow">The portfolio system is open source</p>
          <h3 id="portfolio-community-title">Support the project—or make it <em>your own.</em></h3>
          <p>
            If this format is useful, star the repository. To publish your own version,
            fork it, replace the JSON content and portraits, then deploy the static export.
          </p>
        </div>
        <div className="portfolio-footer-actions">
          <a
            className="portfolio-button portfolio-button-light"
            href="https://github.com/elixpo/me.elixpo"
            target="_blank"
            rel="noreferrer"
          >
            Star on GitHub <span aria-hidden="true">★</span>
          </a>
          <a
            className="portfolio-button portfolio-button-ghost"
            href="https://github.com/elixpo/me.elixpo/fork"
            target="_blank"
            rel="noreferrer"
          >
            Fork your portfolio <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <div className="portfolio-footer-grid">
        <div>
          <strong>{profile.name || profile.siteName}</strong>
          <p>{profile.siteDescription}</p>
          <small>{profile.location}</small>
        </div>
        <nav aria-label="Portfolio links">
          {(profile.menuItems || []).map((item) => (
            <a key={item} href={item === "Home" ? `/${person}` : `/${person}/${item.toLowerCase()}`}>
              {item === "Publications" ? "Research" : item}
            </a>
          ))}
        </nav>
        <nav aria-label="Social profiles">
          {profile.socials?.map((social) => (
            <a key={social.platform} href={social.url} target="_blank" rel="noreferrer">
              {social.platform} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
      </div>
      <div className="portfolio-footer-bottom">
        <span>© {year} {profile.name || profile.siteName}</span>
        <span>Published through <a href="https://elixpo.com">Elixpo</a> · <a href="https://github.com/elixpo/me.elixpo">View source</a></span>
      </div>
    </footer>
  );
}
