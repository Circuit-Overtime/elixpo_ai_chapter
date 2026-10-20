'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const messages = ['Ask naturally.', 'Ship confidently.', 'Stay native.']

export function DynamicCta() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setActive(value => (value + 1) % messages.length), 2400)
    return () => window.clearInterval(timer)
  }, [])

  return <section className="cta dynamic-cta">
    <div className="cta-grid" aria-hidden="true" /><div className="cta-orb orb-one" aria-hidden="true" /><div className="cta-orb orb-two" aria-hidden="true" />
    <div className="cta-content"><p className="kicker">Your terminal, intelligently layered</p><h2>Keep your flow.<br /><span key={messages[active]}>{messages[active]}</span></h2><p>Native commands when you know the way. Natural language when you need a hand.</p><div className="cta-actions"><a className="button button-light" href="https://github.com/elixpo/crumb.elixpo">Explore on GitHub</a><Link className="button button-outline-light" href="/profile/connectors">Check Connectors</Link></div></div>
  </section>
}
