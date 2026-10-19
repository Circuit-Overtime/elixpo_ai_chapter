export default function ContactBanner({ person }) {
  return (
    <section className="contact-banner">
      <div>
        <p className="portfolio-eyebrow">Continue the conversation</p>
        <h2>Discuss the work, not just the profile.</h2>
      </div>
      <a className="portfolio-button portfolio-button-dark" href={`/${person}/connect`}>Connect <span aria-hidden="true">↗</span></a>
    </section>
  );
}
