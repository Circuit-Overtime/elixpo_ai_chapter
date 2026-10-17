"use client";

import gsap from "gsap";
import { Activity, Code, Cpu, Lock, Network, Shield } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import Footer from "../components/footer";
import Navbar from "../components/navbar";

const REPO_URL = "https://github.com/elixpo/accounts.elixpo";

const FEATURES = [
    {
        icon: Lock,
        title: "OAuth 2.0 Provider",
        desc: "Industry-standard authorization code flow with PKCE. Let users sign in to any app with an Elixpo account.",
    },
    {
        icon: Cpu,
        title: "Edge-first architecture",
        desc: "Runs on Cloudflare Workers + D1 — globally distributed, sub-50ms latency, zero cold starts.",
    },
    {
        icon: Shield,
        title: "Secure by default",
        desc: "EdDSA JWTs, HMAC-SHA256 webhook signatures, httpOnly cookies, Web Crypto API — no Node crypto dependencies.",
    },
    {
        icon: Network,
        title: "Multi-provider SSO",
        desc: "Email + password, Google, or GitHub — with automatic account linking across providers.",
    },
    {
        icon: Code,
        title: "Developer portal",
        desc: "Register OAuth apps, manage redirect URIs, view usage stats, and configure webhooks from your dashboard.",
    },
    {
        icon: Activity,
        title: "Webhooks",
        desc: "Real-time HTTP notifications for platform events — signups, OAuth authorizations, token revocations.",
    },
];

const Github = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <title>GitHub Logo</title>
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
);

export default function AboutClient() {
    useEffect(() => {
        // GSAP transition page animation
        gsap.fromTo(
            ".gsap-about-hero",
            { opacity: 0, y: 30 },
            {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.12,
                ease: "power3.out",
            },
        );

        gsap.fromTo(
            ".gsap-about-card",
            { opacity: 0, y: 35 },
            {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.08,
                ease: "power3.out",
                delay: 0.3,
            },
        );
    }, []);

    return (
        <div className="relative w-full min-h-screen font-body text-[var(--fg)] bg-[var(--bg)] selection:bg-[#ff7759] selection:text-white overflow-x-hidden">
            <style>{`
                .font-heading { font-family: var(--font-heading), sans-serif; }
                .font-body { font-family: var(--font-body), sans-serif; }
            `}</style>

            <Navbar />

            <main className="w-full max-w-[1100px] mx-auto px-5 sm:px-8 pt-8 sm:pt-16 pb-16 relative z-10">
                {/* Hero Section */}
                <div className="max-w-[780px] mx-auto flex flex-col items-center text-center gap-6 mb-16 sm:mb-24">
                    <div className="flex items-center gap-3 gsap-about-hero">
                        <img
                            src="/LOGO/logo.png"
                            alt="Elixpo Mascot"
                            className="w-10 h-10 rounded-lg object-contain bg-white/80 p-0.5"
                        />
                        <span className="bg-[#ff7759]/10 text-[#ff7759] border border-[#ff7759]/25 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                            About
                        </span>
                    </div>

                    <h1 className="font-heading text-3xl sm:text-5xl font-bold tracking-tight text-[var(--fg)] leading-[1.1] gsap-about-hero">
                        A modern identity layer{" "}
                        <span className="text-[#ff7759]">for any app.</span>
                    </h1>

                    <p className="font-body text-base sm:text-lg text-[var(--fg)] opacity-80 leading-relaxed max-w-[620px] gsap-about-hero">
                        Elixpo Accounts is an open OAuth 2.0 identity provider
                        built on the edge. Authenticate users across your
                        services with a single, secure account — yours or
                        anyone's.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 gsap-about-hero">
                        <Link
                            href="/login"
                            className="bg-[#ff7759] text-white px-8 py-3 rounded-full font-semibold hover:scale-[1.04] hover:brightness-110 active:scale-[0.96] transition-all duration-200 shadow-md text-center min-w-[160px]"
                        >
                            Get started
                        </Link>
                        <a
                            href={REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] px-8 py-3 rounded-full font-semibold hover:scale-[1.04] active:scale-[0.96] transition-all duration-200 min-w-[160px]"
                        >
                            <Github className="w-5 h-5 text-[var(--fg)]" />
                            <span>View source</span>
                        </a>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-16 sm:mb-24">
                    {FEATURES.map(({ icon: Icon, title, desc }) => (
                        <div
                            key={title}
                            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-[0_4px_20px_rgba(25,40,55,0.015)] transition-all hover:shadow-[0_12px_32px_rgba(255, 119, 89,0.05)] hover:border-[#ff7759]/30 flex flex-col items-start gsap-about-card"
                        >
                            <div className="p-3 bg-[#ff7759]/10 border border-[#ff7759]/25 rounded-xl text-[#ff7759] mb-6">
                                <Icon className="w-5 h-5" />
                            </div>
                            <h3 className="font-heading text-lg font-bold text-[var(--fg)] mb-2">
                                {title}
                            </h3>
                            <p className="font-body text-sm text-[var(--fg-muted)] leading-relaxed">
                                {desc}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Bottom Callout */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-10 shadow-[0_4px_24px_rgba(25,40,55,0.015)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 gsap-about-card">
                    <div>
                        <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-[var(--fg)] mb-2">
                            Fully open source
                        </h2>
                        <p className="font-body text-sm sm:text-base text-[var(--fg-muted)] leading-relaxed max-w-[560px]">
                            Elixpo Accounts is open source and free to
                            self-host. Inspect the code, contribute to
                            development, or deploy your own custom instance.
                        </p>
                    </div>
                    <a
                        href={REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-[var(--overlay)] hover:bg-[#192837]/10 border border-[var(--border)] text-[var(--fg)] px-6 py-3 rounded-xl font-semibold text-sm transition-all flex-shrink-0 active:scale-[0.98]"
                    >
                        <Github className="w-4 h-4 text-[var(--fg)]" />
                        <span>View on GitHub</span>
                    </a>
                </div>
            </main>

            <Footer />
        </div>
    );
}
