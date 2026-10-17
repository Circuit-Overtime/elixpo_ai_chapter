"use client";

import { ArrowUpRight, Check, Copy, Mail, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeToggle from "./theme-toggle";

/* ──────────────────────────────────────────────────────────────────────────
 * Elixpo — foundational footer
 *
 * One branded footer the whole Elixpo suite shares. To reuse it in another
 * product, copy this file and edit only the PRODUCT + COLUMNS blocks below
 * (name, accent, description, repo, link columns). Everything else — the brand
 * lockup, the GitHub-stars CTA, the "Built in the Open" bar, the cream theme —
 * stays identical so every Elixpo product reads as one family.
 * ────────────────────────────────────────────────────────────────────────── */

const PRODUCT = {
    name: "Accounts",
    accent: "#ff7759",
    description:
        "Complete sign-in, sign-out, single sign-on, and user management for your product. Choose the providers and branding; we run the identity infrastructure behind them.",
    repo: "elixpo/accounts.elixpo",
    email: "hello@elixpo.com",
};

const COLUMNS: {
    title: string;
    links: { label: string; href: string; external?: boolean }[];
}[] = [
    {
        title: "Navigate",
        links: [
            { label: "Sign in", href: "/login" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "OAuth apps", href: "/dashboard/oauth-apps" },
        ],
    },
    {
        title: "Developers",
        links: [
            { label: "Documentation", href: "/docs" },
            { label: "Quickstart", href: "/docs/quickstart" },
            { label: "Developer SDK", href: "/docs/lixaccounts" },
            { label: "OAuth 2.0", href: "/docs/oauth" },
            { label: "Webhooks", href: "/docs/webhooks" },
            { label: "Pricing", href: "/pricing" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
        ],
    },
];

const SUITE_URL = "https://elixpo.com";

const Github = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <title>GitHub</title>
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
);

function formatStars(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** GitHub CTA — always paired with the live star count. */
function GithubStarsButton({ repo }: { repo: string }) {
    const [stars, setStars] = useState<number | null>(null);
    useEffect(() => {
        let alive = true;
        fetch(`https://api.github.com/repos/${repo}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((raw) => {
                const d = raw as { stargazers_count?: number } | null;
                if (alive && d && typeof d.stargazers_count === "number")
                    setStars(d.stargazers_count);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [repo]);

    return (
        <a
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--fg)] transition-all hover:border-[var(--border)] hover:shadow-sm active:scale-[0.98]"
            aria-label={`Star ${repo} on GitHub`}
        >
            <Github className="h-[18px] w-[18px]" />
            <span>Star</span>
            <span className="flex items-center gap-1 rounded-md bg-[var(--overlay)] px-1.5 py-0.5 text-xs font-bold tabular-nums">
                <Star className="h-3 w-3 fill-[#fbbf24] text-[#fbbf24]" />
                {stars === null ? "—" : formatStars(stars)}
            </span>
        </a>
    );
}

function EmailButton({ email }: { email: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(email);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            window.location.href = `mailto:${email}`;
        }
    };
    return (
        <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--fg)] transition-all hover:border-[var(--border)] hover:shadow-sm active:scale-[0.98]"
        >
            {copied ? (
                <>
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-green-600">Copied</span>
                </>
            ) : (
                <>
                    <Mail className="h-4 w-4" />
                    <span>{email}</span>
                    <Copy className="ml-1 h-3.5 w-3.5 opacity-60" />
                </>
            )}
        </button>
    );
}

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="relative z-10 w-full border-t border-[var(--border)] bg-[var(--bg)] font-body text-[var(--fg)]">
            <div className="mx-auto max-w-[1280px] px-5 py-16 sm:px-8">
                {/* Top: brand + link columns */}
                <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
                    {/* Brand */}
                    <div className="max-w-sm">
                        <Link
                            href="/"
                            className="mb-4 flex items-center gap-2.5"
                        >
                            <img
                                src="/LOGO/logo.png"
                                alt="Elixpo"
                                className="h-8 w-8 rounded-lg bg-white/85 object-contain p-0.5"
                            />
                            <span className="font-heading text-xl font-bold">
                                Elixpo{" "}
                                <span style={{ color: PRODUCT.accent }}>
                                    {PRODUCT.name}
                                </span>
                            </span>
                        </Link>
                        <p className="text-sm leading-relaxed opacity-80">
                            {PRODUCT.description}
                        </p>

                        {/* Email, then the GitHub-stars CTA stacked beneath it */}
                        <div className="mt-6 flex flex-col items-start gap-3">
                            <EmailButton email={PRODUCT.email} />
                            <GithubStarsButton repo={PRODUCT.repo} />
                        </div>
                    </div>

                    {/* Link columns */}
                    <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-16">
                        {COLUMNS.map((col) => (
                            <div key={col.title}>
                                <h4 className="mb-4 text-[10px] font-bold uppercase tracking-widest opacity-50">
                                    {col.title}
                                </h4>
                                <ul className="flex flex-col gap-3 text-sm font-semibold">
                                    {col.links.map((link) => (
                                        <li key={link.label}>
                                            <Link
                                                href={link.href}
                                                className="inline-flex items-center gap-1 opacity-90 transition-opacity hover:opacity-60"
                                            >
                                                {link.label}
                                                {link.external && (
                                                    <ArrowUpRight className="h-3 w-3" />
                                                )}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] pt-8 text-sm font-medium opacity-70 sm:flex-row">
                    <div>
                        © {year} Elixpo ·{" "}
                        <span className="font-semibold opacity-100">
                            Built in the Open
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a
                            href={SUITE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 transition-opacity hover:opacity-100"
                        >
                            Part of the Elixpo suite
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                        <ThemeToggle size={16} />
                    </div>
                </div>
            </div>
        </footer>
    );
}
