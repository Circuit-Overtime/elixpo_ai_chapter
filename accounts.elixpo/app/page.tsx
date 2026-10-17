"use client";

import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import {
    ArrowRightCircle,
    Fingerprint,
    Lock,
    LockKeyhole,
    Menu,
    Network,
    PackageOpen,
    ShieldCheck,
    Terminal,
    X,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Footer from "./components/footer";

// CSS Variables (from prompt specifications):
// --font-heading: 'Helvetica Now Display Bold', sans-serif;
// --font-body: 'Inter', sans-serif;
// --color-text: #192837;
// --color-accent: #ff7759;
// --color-login-bg: #F2F2EE;

const MARKETING_LINKS = [
    { label: "Home", href: "/" },
    { label: "Pricing", href: "/pricing" },
    { label: "Docs", href: "/docs" },
    { label: "Developer SDK", href: "/docs/lixaccounts" },
    { label: "About", href: "/about" },
];

const APP_LINKS = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "OAuth Apps", href: "/dashboard/oauth-apps" },
    { label: "Services", href: "/dashboard/services" },
    { label: "Webhooks", href: "/dashboard/webhooks" },
    { label: "Docs", href: "/docs" },
    { label: "Developer SDK", href: "/docs/lixaccounts" },
    { label: "Pricing", href: "/pricing" },
    { label: "Profile", href: "/dashboard/profile" },
];

const FEATURES = [
    {
        icon: Fingerprint,
        title: "Five providers, one account",
        body: "Offer email and password, Google, GitHub, Microsoft, and Discord from one sign-in screen. Users can also choose a passkey when they want passwordless access.",
        soon: false,
    },
    {
        icon: Zap,
        title: "The whole sign-in lifecycle",
        body: "Sign-in, sign-out, account switching, consent, session refresh, and revocation work together instead of becoming separate features your team must maintain.",
        soon: false,
    },
    {
        icon: Network,
        title: "User management is included",
        body: "Give users one place for profiles, security methods, active sessions, devices, connected apps, notification choices, and account deletion.",
        soon: false,
    },
    {
        icon: Lock,
        title: "Your brand, standard OAuth",
        body: "Show your app name, logo, and domain during the hosted handoff. Underneath, standard OAuth and OpenID Connect keep the integration portable and inspectable.",
        soon: false,
    },
];

const softwareApplicationStructuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://accounts.elixpo.com/#software",
    name: "Elixpo Accounts",
    alternateName: "Elixpo Authentication and User Management",
    url: "https://accounts.elixpo.com",
    applicationCategory: "SecurityApplication",
    applicationSubCategory: "Authentication and identity management",
    operatingSystem: "Web, Node.js, Cloudflare Workers",
    description:
        "Hosted authentication and user management with five sign-in providers, passkeys, single sign-on, account switching, sessions, webhooks, and OAuth/OIDC APIs.",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
        description:
            "Free Hobby plan for up to 1,000 monthly active users per app",
    },
    featureList: [
        "Email, Google, GitHub, Microsoft, and Discord sign-in",
        "WebAuthn passkeys and multi-factor authentication",
        "Single sign-on and multiple account switching",
        "Hosted sign-in, consent, and account management",
        "Session, device, profile, and connected-app management",
        "OAuth 2.0 and OpenID Connect discovery",
        "S256 PKCE, token rotation, revocation, and JWKS verification",
        "Signed webhooks and developer API keys",
        "Edge-safe TypeScript SDK",
    ],
    softwareHelp: "https://accounts.elixpo.com/docs",
    downloadUrl: "https://www.npmjs.com/package/@elixpo/accounts",
    provider: { "@id": "https://elixpo.com/#organization" },
};

export default function LandingPage() {
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: any) => {
                if (!cancelled) setAuthed(!!d?.email);
            })
            .catch(() => {
                if (!cancelled) setAuthed(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // GSAP staggered animation for hero elements and cards on mount
    useEffect(() => {
        gsap.fromTo(
            ".gsap-hero-animate",
            { opacity: 0, y: 35 },
            {
                opacity: 1,
                y: 0,
                duration: 0.9,
                stagger: 0.15,
                ease: "power4.out",
            },
        );

        gsap.fromTo(
            ".gsap-card-animate",
            { opacity: 0, y: 30 },
            {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.1,
                ease: "power3.out",
                delay: 0.4,
            },
        );
    }, []);

    return (
        <div className="relative w-full min-h-screen font-body text-[var(--fg)] bg-[var(--bg)] selection:bg-[#ff7759] selection:text-white overflow-x-hidden">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(
                        softwareApplicationStructuredData,
                    ).replace(/</g, "\\u003c"),
                }}
            />
            <style>{`
                .font-heading { font-family: var(--font-heading), sans-serif; }
                .font-body { font-family: var(--font-body), sans-serif; }
            `}</style>

            {/* HERO SECTION */}
            <section className="relative w-full min-h-screen flex flex-col justify-between overflow-hidden z-0">
                {/* Full-screen Background Video */}
                <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className="absolute inset-0 object-cover w-full h-full -z-10 pointer-events-none select-none"
                    style={{ opacity: 0.6, filter: "saturate(0.92)" }}
                    src="/hero-bg.mp4"
                />

                {/* Cream wash — dims the video so the text leads */}
                <div
                    className="absolute inset-0 -z-10 pointer-events-none opacity-[0.55]"
                    style={{ background: "var(--bg)" }}
                />
                {/* Vignette — darkens the edges toward the centre */}
                <div
                    className="absolute inset-0 -z-10 pointer-events-none"
                    style={{
                        background:
                            "radial-gradient(ellipse at center, rgba(242,242,238,0) 38%, rgba(25,40,55,0.22) 100%)",
                    }}
                />
                {/* Bottom fade — flows the hero into the sections below */}
                <div
                    className="absolute bottom-0 left-0 right-0 h-44 -z-10 pointer-events-none"
                    style={{
                        backgroundImage:
                            "linear-gradient(to bottom, transparent, var(--bg))",
                    }}
                />

                {/* Navbar */}
                <header className="w-full max-w-[1280px] mx-auto px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between z-25">
                    {/* Left: Panda Mascot Logo + App Title */}
                    <Link href="/" className="flex items-center gap-3">
                        <img
                            src="/LOGO/logo.png"
                            alt="Elixpo Mascot"
                            className="w-8 h-8 rounded-lg object-contain bg-white/80 p-0.5"
                        />
                        <span className="font-heading text-xl font-bold tracking-tight text-[var(--fg)]">
                            Elixpo{" "}
                            <span className="text-[#ff7759]">Accounts</span>
                        </span>
                    </Link>

                    {/* Right: CTAs only — brand-minimal navbar */}
                    <div className="hidden md:flex items-center gap-3">
                        {authed === null ? (
                            // Loading state placeholder to prevent layout shifting
                            <div className="w-[104px] h-[38px]" />
                        ) : authed ? (
                            <>
                                <Link
                                    href="/dashboard"
                                    className="bg-[#ff7759] text-white px-6 py-2.5 rounded-full font-semibold text-sm hover:scale-[1.04] hover:brightness-110 active:scale-[0.96] transition-all duration-200 shadow-[0_4px_14px_rgba(255,119,89,0.22)]"
                                >
                                    Dashboard
                                </Link>
                                <Link
                                    href="/dashboard/profile"
                                    className="bg-[var(--surface)] text-[var(--fg)] px-6 py-2.5 rounded-full font-semibold text-sm hover:scale-[1.04] active:scale-[0.96] transition-all duration-200 border border-[var(--border)]"
                                >
                                    Profile
                                </Link>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="bg-[#ff7759] text-white px-6 py-2.5 rounded-full font-semibold text-sm hover:scale-[1.04] hover:brightness-110 active:scale-[0.96] transition-all duration-200 shadow-[0_4px_14px_rgba(255,119,89,0.22)]"
                            >
                                Sign In
                            </Link>
                        )}
                    </div>

                    {/* Mobile Hamburger Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="md:hidden p-2 text-[var(--fg)] hover:bg-[var(--overlay)] rounded-full transition-colors"
                        aria-label="Open menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                </header>

                {/* Hero Content Area — fully centered */}
                <main className="w-full max-w-[1280px] mx-auto px-5 sm:px-8 flex-1 flex flex-col justify-center py-12">
                    <div className="max-w-[720px] mx-auto flex flex-col items-center text-center">
                        <span className="gsap-hero-animate mb-5 inline-flex items-center rounded-full border border-[#ff7759]/25 bg-[#ff7759]/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#d9573b]">
                            Complete authentication for your product
                        </span>
                        {/* Heading */}
                        <h1 className="font-heading text-[clamp(1.9rem,6vw,3.4rem)] leading-[1.05] tracking-[-0.01em] text-[var(--fg)] mb-6 font-bold gsap-hero-animate">
                            5 Providers.
                            <LockKeyhole className="inline-block w-6 h-6 sm:w-8 sm:h-8 text-[var(--fg)] align-middle relative -top-[2px] mx-2" />
                            Single Sign-On.
                            <Fingerprint className="inline-block w-6 h-6 sm:w-8 sm:h-8 text-[var(--fg)] align-middle relative -top-[2px] ml-2" />
                            Two Steps.
                        </h1>

                        {/* Subtext */}
                        <p className="font-body text-[clamp(0.95rem,2.5vw,1.15rem)] leading-[1.65] text-[var(--fg)] opacity-80 mb-9 max-w-[600px] mx-auto gsap-hero-animate">
                            Add sign-in, sign-out, account switching, secure
                            sessions, and complete user management to your app.
                            Choose your providers and branding, register the
                            app, follow the docs, and ship—without building an
                            authentication platform first.
                        </p>

                        {/* CTAs — Dashboard + Docs */}
                        <div className="gsap-hero-animate flex flex-wrap items-center justify-center gap-3">
                            <motion.div
                                whileHover={{
                                    scale: 1.04,
                                    filter: "brightness(1.1)",
                                }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Link
                                    href={authed ? "/dashboard" : "/register"}
                                    className="bg-[#ff7759] text-white rounded-full py-[15px] px-7 font-body font-semibold text-[clamp(0.9rem,2vw,1rem)] shadow-[0_6px_24px_rgba(255,119,89,0.32)] flex items-center gap-2.5 group"
                                >
                                    <span>
                                        {authed
                                            ? "Open your projects"
                                            : "Start building"}
                                    </span>
                                    <ArrowRightCircle className="w-5 h-5 text-white transition-transform group-hover:translate-x-1" />
                                </Link>
                            </motion.div>
                            <motion.div
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Link
                                    href="/docs"
                                    className="bg-[var(--surface)]/85 backdrop-blur-sm text-[var(--fg)] rounded-full py-[15px] px-7 font-body font-semibold text-[clamp(0.9rem,2vw,1rem)] border border-[var(--border)] flex items-center gap-2.5"
                                >
                                    Read the docs
                                </Link>
                            </motion.div>
                            <motion.div
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Link
                                    href="/docs/lixaccounts"
                                    className="text-[var(--fg)] rounded-full py-[15px] px-5 font-body font-semibold text-[clamp(0.9rem,2vw,1rem)] flex items-center gap-2 opacity-80 hover:opacity-100"
                                >
                                    Developer SDK
                                    <ArrowRightCircle className="w-4 h-4" />
                                </Link>
                            </motion.div>
                        </div>
                    </div>
                </main>

                {/* Arrow to scroll down */}
                <button
                    type="button"
                    aria-label="Scroll to features"
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 opacity-60 text-xs font-semibold tracking-widest text-[var(--fg)] cursor-pointer animate-bounce select-none border-0 bg-transparent p-0"
                    onClick={() =>
                        document
                            .getElementById("how-it-works")
                            ?.scrollIntoView({ behavior: "smooth" })
                    }
                >
                    <span>SEE HOW IT WORKS</span>
                    <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                            d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                    </svg>
                </button>
            </section>

            {/* TWO STEPS SECTION */}
            <section
                id="how-it-works"
                className="bg-[var(--bg)] text-[var(--fg)] py-24 relative z-10"
            >
                <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
                    <div className="text-center max-w-[720px] mx-auto mb-16">
                        <span className="inline-block text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff7759] mb-4">
                            Get started
                        </span>
                        <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                            From a new project to working sign-in in two steps
                        </h2>
                        <p className="text-base sm:text-lg opacity-80 leading-relaxed font-body">
                            We host the difficult identity screens and security
                            flows. You choose how your app should look, connect
                            one callback, and keep building your product.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-[940px] mx-auto">
                        {/* Step 1 — account */}
                        <div className="relative bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col gsap-card-animate">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="font-heading text-sm font-bold w-9 h-9 grid place-items-center rounded-full bg-[#ff7759] text-white">
                                    01
                                </span>
                                <div className="p-2.5 bg-[#ff7759]/10 border border-[#ff7759]/25 rounded-xl text-[#ff7759]">
                                    <Fingerprint className="w-5 h-5" />
                                </div>
                            </div>
                            <h3 className="font-heading text-xl font-bold mb-2">
                                Set up your auth project
                            </h3>
                            <p className="text-[var(--fg-muted)] leading-relaxed text-sm sm:text-base font-body mb-6">
                                Create a project, choose the sign-in providers,
                                add your callback URLs, and set the app name,
                                logo, and domain users will recognize.
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-3">
                                <Link
                                    href="/register"
                                    className="inline-flex items-center gap-2 bg-[#ff7759] text-white px-5 py-2.5 rounded-full font-body font-semibold text-sm transition-all hover:brightness-110 active:scale-[0.98]"
                                >
                                    Create a project
                                    <ArrowRightCircle className="w-4 h-4" />
                                </Link>
                                <Link
                                    href={
                                        authed
                                            ? "/dashboard/oauth-apps"
                                            : "/login"
                                    }
                                    className="inline-flex items-center text-sm font-semibold text-[var(--fg)] opacity-80 hover:opacity-100 transition-opacity"
                                >
                                    Open dashboard
                                </Link>
                            </div>
                        </div>

                        {/* Step 2 — register the app */}
                        <div className="relative bg-[var(--bg)] border border-[var(--border)] rounded-2xl p-8 flex flex-col gsap-card-animate">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="font-heading text-sm font-bold w-9 h-9 grid place-items-center rounded-full bg-[#ff7759] text-white">
                                    02
                                </span>
                                <div className="p-2.5 bg-[#ff7759]/10 border border-[#ff7759]/25 rounded-xl text-[#ff7759]">
                                    <Network className="w-5 h-5" />
                                </div>
                            </div>
                            <h3 className="font-heading text-xl font-bold mb-2">
                                Connect your application
                            </h3>
                            <p className="text-[var(--fg-muted)] leading-relaxed text-sm sm:text-base font-body mb-6">
                                Install the Developer SDK or use standard OAuth.
                                Add sign-in and sign-out, then let the hosted
                                account screens handle the rest.
                            </p>
                            <div className="mt-auto flex flex-wrap items-center gap-3">
                                <Link
                                    href="/docs/quickstart"
                                    className="inline-flex items-center gap-2 bg-[#ff7759] text-white px-5 py-2.5 rounded-full font-body font-semibold text-sm transition-all hover:brightness-110 active:scale-[0.98]"
                                >
                                    Read the quickstart
                                    <ArrowRightCircle className="w-4 h-4" />
                                </Link>
                                <Link
                                    href="/docs/lixaccounts"
                                    className="inline-flex items-center text-sm font-semibold text-[var(--fg)] opacity-80 hover:opacity-100 transition-opacity"
                                >
                                    Explore the SDK
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SDK SECTION */}
            <section className="bg-[var(--surface)] text-[var(--fg)] py-24 border-y border-[var(--border)] relative z-10">
                <div className="max-w-[1120px] mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-center">
                    <div>
                        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff7759] mb-4">
                            <PackageOpen className="w-4 h-4" />
                            Developer SDK
                        </span>
                        <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-5">
                            One package for the security-sensitive parts
                        </h2>
                        <p className="text-base sm:text-lg text-[var(--fg-muted)] leading-relaxed font-body mb-7">
                            <code className="font-mono text-[0.9em]">
                                @elixpo/accounts
                            </code>{" "}
                            creates login links, protects callbacks, refreshes
                            access, and verifies user identity. That means less
                            auth code to write, review, and keep patched. It
                            runs in Node.js and edge runtimes, and it stays
                            compatible with standard OAuth if you ever want to
                            integrate without the package.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/docs/lixaccounts"
                                className="inline-flex items-center gap-2 bg-[#ff7759] text-white px-6 py-3 rounded-full font-body font-semibold text-sm transition-all hover:brightness-110 active:scale-[0.98]"
                            >
                                Developer SDK
                                <ArrowRightCircle className="w-4 h-4" />
                            </Link>
                            <a
                                href="https://www.npmjs.com/package/@elixpo/accounts"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 border border-[var(--border)] bg-[var(--bg)] px-6 py-3 rounded-full font-body font-semibold text-sm transition-all hover:border-[#ff7759]/50 active:scale-[0.98]"
                            >
                                View on npm
                            </a>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[#192837] text-white shadow-[0_18px_60px_rgba(25,40,55,0.16)] overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 text-xs text-white/65">
                            <span className="inline-flex items-center gap-2">
                                <Terminal className="w-4 h-4" /> install
                            </span>
                            <span>v1.0.1</span>
                        </div>
                        <pre className="p-5 sm:p-6 overflow-x-auto font-mono text-sm leading-7">
                            <code>
                                <span className="text-[#ff9a82]">$</span> npm
                                install @elixpo/accounts{"\n\n"}
                                <span className="text-white/55">import</span>{" "}
                                {"{ createAccountsClient }"}{" "}
                                <span className="text-white/55">from</span>{" "}
                                <span className="text-[#ff9a82]">
                                    &quot;@elixpo/accounts&quot;
                                </span>
                            </code>
                        </pre>
                        <div className="flex items-center gap-2 px-5 py-3 border-t border-white/10 text-xs text-white/70">
                            <ShieldCheck className="w-4 h-4 text-[#ff9a82]" />
                            PKCE and token verification built in
                        </div>
                    </div>
                </div>
            </section>

            {/* FEATURES LIST SECTION */}
            <section
                id="features"
                className="bg-[var(--bg)] text-[var(--fg)] py-28 border-t border-[var(--border)] relative z-10"
            >
                <div className="max-w-[1280px] mx-auto px-5 sm:px-8">
                    <div className="text-center max-w-[700px] mx-auto mb-20">
                        <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                            Everything your product needs after “Sign in”
                        </h2>
                        <p className="text-base sm:text-lg opacity-80 leading-relaxed font-body">
                            Authentication is more than a login form. Keep the
                            user, session, security, and app lifecycle together
                            from day one.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
                        {FEATURES.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <div
                                    key={feature.title}
                                    className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-[0_4px_24px_rgba(25,40,55,0.015)] transition-all hover:shadow-[0_12px_32px_rgba(255, 119, 89,0.05)] hover:border-[#ff7759]/30 flex flex-col justify-between gsap-card-animate"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="p-3 bg-[#ff7759]/10 border border-[#ff7759]/25 rounded-xl text-[#ff7759]">
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            {feature.soon && (
                                                <span className="bg-[var(--overlay)] text-[var(--fg-muted)] border border-[var(--border)] text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest">
                                                    Coming soon
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-heading text-xl font-bold mb-3">
                                            {feature.title}
                                        </h3>
                                        <p className="text-[var(--fg-muted)] leading-relaxed text-sm sm:text-base font-body">
                                            {feature.body}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* READY WHEN YOU ARE SECTION */}
            <section className="bg-[var(--bg)] text-[var(--fg)] py-24 border-t border-[var(--border)] relative z-10">
                <div className="max-w-[800px] mx-auto px-5 text-center">
                    <h2 className="font-heading text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
                        Stop maintaining auth. Start shipping your product.
                    </h2>
                    <p className="text-base opacity-80 mb-8 max-w-[560px] mx-auto font-body leading-relaxed">
                        Create your auth project, choose the providers and brand
                        your users should see, then follow the quickstart. We
                        handle the account system behind it.
                    </p>
                    <motion.div
                        whileHover={{ scale: 1.04, filter: "brightness(1.1)" }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ duration: 0.2 }}
                        className="inline-block"
                    >
                        <Link
                            href={
                                authed ? "/dashboard/oauth-apps" : "/register"
                            }
                            className="inline-flex items-center gap-3 bg-[#ff7759] text-white px-8 py-4 rounded-full font-body font-semibold transition-all shadow-[0_4px_24px_rgba(255, 119, 89,0.28)]"
                        >
                            <span>
                                {authed
                                    ? "Open your projects"
                                    : "Start building"}
                            </span>
                            <ArrowRightCircle className="w-5 h-5 text-white" />
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* FOOTER */}
            <Footer />

            {/* MOBILE MENU SHEET */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="fixed inset-0 bg-[#192837]/35 backdrop-blur-[4px] z-50 pointer-events-auto"
                        />
                        {/* Drawer Sheet */}
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{
                                ease: [0.22, 1, 0.36, 1] as const,
                                duration: 0.45,
                            }}
                            className="fixed right-0 top-0 w-[min(88vw,360px)] h-[100dvh] bg-[var(--surface)] shadow-[-12px_0_48px_rgba(25,40,55,0.18)] z-50 flex flex-col p-6 text-[var(--fg)]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
                                <Link
                                    href="/"
                                    className="flex items-center gap-2"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                >
                                    <img
                                        src="/LOGO/logo.png"
                                        alt="Elixpo Mascot"
                                        className="w-8 h-8 rounded-lg object-contain bg-white/80 p-0.5"
                                    />
                                    <span className="font-heading text-lg font-bold text-[var(--fg)]">
                                        Elixpo
                                    </span>
                                </Link>
                                <button
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="p-1 hover:bg-[var(--overlay)] rounded-full transition-colors text-[var(--fg)]"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Staggered Navigation Links */}
                            <div className="flex-1 flex flex-col gap-6 py-8">
                                {(authed ? APP_LINKS : MARKETING_LINKS).map(
                                    (link, i) => (
                                        <motion.div
                                            key={link.label}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{
                                                delay: 0.18 + i * 0.07,
                                                ease: [
                                                    0.22, 1, 0.36, 1,
                                                ] as const,
                                                duration: 0.45,
                                            }}
                                        >
                                            <Link
                                                href={link.href}
                                                onClick={() =>
                                                    setIsMobileMenuOpen(false)
                                                }
                                                className="text-lg font-semibold hover:opacity-70 transition-opacity"
                                            >
                                                {link.label}
                                            </Link>
                                        </motion.div>
                                    ),
                                )}
                            </div>

                            {/* Bottom Call to Actions */}
                            <div className="border-t border-[var(--border)] pt-6 flex flex-col gap-3">
                                {authed === null ? null : authed ? (
                                    <>
                                        <Link
                                            href="/dashboard/oauth-apps"
                                            onClick={() =>
                                                setIsMobileMenuOpen(false)
                                            }
                                            className="w-full bg-[#ff7759] text-white py-3 rounded-full font-semibold text-center hover:brightness-110 active:scale-[0.98] transition-all shadow-md"
                                        >
                                            Go to Dashboard
                                        </Link>
                                        <Link
                                            href="/dashboard/profile"
                                            onClick={() =>
                                                setIsMobileMenuOpen(false)
                                            }
                                            className="w-full bg-[var(--surface-2)] text-[var(--fg)] py-3 rounded-full font-semibold text-center hover:brightness-110 active:scale-[0.98] transition-all border border-[var(--border)]"
                                        >
                                            Profile
                                        </Link>
                                    </>
                                ) : (
                                    <>
                                        <Link
                                            href="/login"
                                            onClick={() =>
                                                setIsMobileMenuOpen(false)
                                            }
                                            className="w-full bg-[#ff7759] text-white py-3 rounded-full font-semibold text-center hover:brightness-110 active:scale-[0.98] transition-all shadow-md"
                                        >
                                            Create a project
                                        </Link>
                                        <Link
                                            href="/login"
                                            onClick={() =>
                                                setIsMobileMenuOpen(false)
                                            }
                                            className="w-full bg-[var(--surface-2)] text-[var(--fg)] py-3 rounded-full font-semibold text-center hover:brightness-110 active:scale-[0.98] transition-all border border-[var(--border)]"
                                        >
                                            Sign In
                                        </Link>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
