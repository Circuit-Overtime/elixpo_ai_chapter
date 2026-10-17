"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-neutral-950 text-neutral-400 pt-20 pb-10 px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="max-w-6xl mx-auto"
      >
        {/* Top section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <Image src="/images/logo.png" alt="Elixpo" width={36} height={36} className="rounded-lg" />
              <span className="font-[family-name:var(--font-parkinsans)] font-bold text-white text-lg">
                Elixpo Chat
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-neutral-400">
              AI-powered conversations, news, podcasts, and weather. Everything you need to stay informed, in one place.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-5 uppercase tracking-wider">Product</h4>
            <ul className="flex flex-col gap-3">
              <FooterLink href="/chat/new">AI Chat</FooterLink>
              <FooterLink href="/news">Daily News</FooterLink>
              <FooterLink href="/podcast">Podcast</FooterLink>
              <FooterLink href="/discover">Discover</FooterLink>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-5 uppercase tracking-wider">Resources</h4>
            <ul className="flex flex-col gap-3">
              <FooterLink href="/privacy">Privacy Policy</FooterLink>
              <FooterLink href="https://github.com/Circuit-Overtime/elixpochat" external>GitHub</FooterLink>
              <FooterLink href="https://pollinations.ai" external>Pollinations AI</FooterLink>
              <FooterLink href="https://developers.cloudflare.com/d1/" external>Cloudflare D1</FooterLink>
              <FooterLink href="https://nextjs.org" external>Next.js</FooterLink>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-5 uppercase tracking-wider">Connect</h4>
            <ul className="flex flex-col gap-3">
              <FooterLink href="https://twitter.com/elixpo" external>Twitter / X</FooterLink>
              <FooterLink href="https://github.com/Circuit-Overtime" external>GitHub Profile</FooterLink>
              <FooterLink href="mailto:hello@elixpo.com">Contact</FooterLink>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-neutral-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-neutral-500">
            &copy; {new Date().getFullYear()} Elixpo Chat. All rights reserved.
          </p>
          <p className="text-xs text-neutral-600">
            Powered by Pollinations AI &middot; Hosted on Cloudflare
          </p>
        </div>
      </motion.div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const cls = "text-sm text-neutral-500 hover:text-white transition-colors";
  if (external) {
    return (
      <li>
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
          {children}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link href={href} className={cls}>
        {children}
      </Link>
    </li>
  );
}
