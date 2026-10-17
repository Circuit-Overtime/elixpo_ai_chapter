"use client";

import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Copy,
    LayoutDashboard,
    Menu,
    Search,
    X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PRODUCT_DOCS_NAV = [
    { label: "Overview", href: "/docs" },
    { label: "Quickstart", href: "/docs/quickstart" },
    { label: "OAuth Flow", href: "/docs/oauth" },
    { label: "Users API", href: "/docs/users-api" },
    { label: "Webhooks", href: "/docs/webhooks" },
    { label: "API Keys", href: "/docs/api-keys" },
    { label: "Error Reference", href: "/docs/errors" },
    { label: "Self-Hosting", href: "/docs/self-hosting" },
];

const DEVELOPER_SDK_NAV = [
    { label: "@elixpo/accounts", href: "/docs/lixaccounts" },
];

const DOCS_NAV = [...PRODUCT_DOCS_NAV, ...DEVELOPER_SDK_NAV];

interface HeadingItem {
    id: string;
    text: string;
    level: number;
}

const Github = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
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

export default function DocsClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [search, setSearch] = useState("");
    const [mobileOpen, setMobileOpen] = useState(false);
    const [headings, setHeadings] = useState<HeadingItem[]>([]);
    const [activeHeadingId, setActiveHeadingId] = useState("");
    const [copied, setCopied] = useState(false);
    const [authed, setAuthed] = useState<boolean | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Resolve sign-in state so the brand mark routes to the dashboard or landing.
    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((raw) => {
                const d = raw as { email?: string } | null;
                if (!cancelled) setAuthed(!!d?.email);
            })
            .catch(() => {
                if (!cancelled) setAuthed(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // GSAP page content fade-in animation on pathname change
    useEffect(() => {
        gsap.fromTo(
            "#docs-content-container",
            { opacity: 0, y: 15 },
            { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
        );
    }, []);

    // Convert the current reference page into portable Markdown with enough
    // protocol context for coding assistants to use it safely.
    const buildLlmPayload = (): string => {
        const root = document.getElementById("docs-content");
        if (!root) return "";

        const lines: string[] = [];
        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) return;
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as HTMLElement;
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || "").trim();
            if (!text && tag !== "pre" && tag !== "code") {
                el.childNodes.forEach(walk);
                return;
            }
            switch (tag) {
                case "h1":
                    lines.push(`# ${text}`, "");
                    return;
                case "h2":
                    lines.push("", `## ${text}`, "");
                    return;
                case "h3":
                    lines.push("", `### ${text}`, "");
                    return;
                case "h4":
                    lines.push("", `#### ${text}`, "");
                    return;
                case "li":
                    lines.push(`- ${text}`);
                    return;
                case "pre": {
                    const code = el.textContent || "";
                    lines.push("", "```", code.trim(), "```", "");
                    return;
                }
                case "code":
                    if (
                        el.parentElement &&
                        el.parentElement.tagName.toLowerCase() !== "pre"
                    ) {
                        return;
                    }
                    return;
                case "p":
                    lines.push(text, "");
                    return;
                default:
                    el.childNodes.forEach(walk);
            }
        };
        root.childNodes.forEach(walk);

        const pageTitle =
            DOCS_NAV.find((n) => n.href === pathname)?.label || "Overview";
        const url =
            typeof window !== "undefined"
                ? `${window.location.origin}${pathname}`
                : pathname;

        const header = [
            `# Elixpo Accounts Docs — ${pageTitle}`,
            "",
            `Source: ${url}`,
            "",
            "Elixpo Accounts is an OAuth 2.0 and OpenID Connect identity provider running on Cloudflare's edge.",
            "Treat this page and the discovery endpoints as authoritative. Use authorization code flow with S256 PKCE, state, and nonce. Keep secrets and tokens server-side.",
            "Developer SDK: @elixpo/accounts. Discovery: /.well-known/oauth-authorization-server and /.well-known/openid-configuration.",
            "",
            "---",
            "",
        ].join("\n");

        return (
            header +
            lines
                .join("\n")
                .replace(/\n{3,}/g, "\n\n")
                .trim() +
            "\n"
        );
    };

    const handleCopyForLlm = async () => {
        const payload = buildLlmPayload();
        if (!payload) return;
        try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = payload;
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch {
                // Ignore
            }
            document.body.removeChild(ta);
        }
    };

    const currentPageIndex = DOCS_NAV.findIndex(
        (item) => item.href === pathname,
    );
    const prevPage =
        currentPageIndex > 0 ? DOCS_NAV[currentPageIndex - 1] : null;
    const nextPage =
        currentPageIndex < DOCS_NAV.length - 1
            ? DOCS_NAV[currentPageIndex + 1]
            : null;

    const filteredProductNav = PRODUCT_DOCS_NAV.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase()),
    );
    const filteredSdkNav = DEVELOPER_SDK_NAV.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase()),
    );

    // Parse subheadings for table of contents
    useEffect(() => {
        const contentEl = document.getElementById("docs-content");
        if (!contentEl) return;

        const headingElements = contentEl.querySelectorAll("h2, h3");
        const list: HeadingItem[] = [];

        headingElements.forEach((el) => {
            const level = Number.parseInt(el.tagName.substring(1), 10);
            const text = el.textContent || "";
            let id = el.id;
            if (!id) {
                id = text
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, "");
                el.id = id;
            }
            list.push({ id, text, level });
        });

        setHeadings(list);
    }, []);

    // Active subheadings highlighting on scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting);
                if (visible.length > 0) {
                    const sorted = visible.sort(
                        (a, b) =>
                            a.boundingClientRect.top - b.boundingClientRect.top,
                    );
                    setActiveHeadingId(sorted[0].target.id);
                }
            },
            { rootMargin: "-80px 0px -60% 0px" },
        );

        const contentEl = document.getElementById("docs-content");
        if (contentEl) {
            const targets = contentEl.querySelectorAll("h2, h3");
            targets.forEach((target) => {
                observer.observe(target);
            });
        }

        return () => observer.disconnect();
    }, []);

    const sidebarContent = (
        <div className="flex flex-col h-full text-[var(--fg)] font-body p-4 md:p-0">
            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-faint)]" />
                <input
                    type="text"
                    placeholder="Search docs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-[var(--border)] bg-[var(--surface)] rounded-xl text-sm font-medium focus:outline-none focus:border-[#ff7759] focus:ring-1 focus:ring-[#ff7759]"
                />
            </div>

            {/* List */}
            <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
                {filteredProductNav.map((item) => {
                    const active = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center px-4 py-2 rounded-xl text-sm font-semibold tracking-wide transition-all ${
                                active
                                    ? "bg-[#ff7759]/10 text-[#ff7759]"
                                    : "text-[var(--fg-muted)] hover:bg-[var(--overlay)] hover:text-[var(--fg)]"
                            }`}
                        >
                            {item.label}
                        </Link>
                    );
                })}
                {(search.length === 0 || filteredSdkNav.length > 0) && (
                    <div className="mt-5 border-t border-[var(--border)] pt-5">
                        <span className="mb-2 block px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--fg-faint)]">
                            Developer SDK
                        </span>
                        {filteredSdkNav.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={`flex items-center px-4 py-2 rounded-xl text-sm font-semibold tracking-wide transition-all ${
                                        active
                                            ? "bg-[#ff7759]/10 text-[#ff7759]"
                                            : "text-[var(--fg-muted)] hover:bg-[var(--overlay)] hover:text-[var(--fg)]"
                                    }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                )}
                {filteredProductNav.length === 0 &&
                    filteredSdkNav.length === 0 && (
                        <p className="text-[var(--fg-faint)] text-xs text-center py-4">
                            No results found
                        </p>
                    )}
            </nav>
        </div>
    );

    return (
        <div className="relative w-full min-h-screen font-body text-[var(--fg)] bg-[var(--bg)] selection:bg-[#ff7759] selection:text-white flex flex-col overflow-x-hidden">
            <style>{`
                .font-heading { font-family: var(--font-heading), sans-serif; }
                .font-body { font-family: var(--font-body), sans-serif; }
                #docs-content h1 {
                    font-family: var(--font-heading), sans-serif;
                    font-size: 2.2rem;
                    font-weight: 800;
                    margin-bottom: 1.5rem;
                    color: var(--fg);
                    letter-spacing: -0.02em;
                }
                #docs-content h2 {
                    font-family: var(--font-heading), sans-serif;
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-top: 2.5rem;
                    margin-bottom: 1rem;
                    color: var(--fg);
                    letter-spacing: -0.015em;
                }
                #docs-content h3 {
                    font-family: var(--font-heading), sans-serif;
                    font-size: 1.2rem;
                    font-weight: 700;
                    margin-top: 2rem;
                    margin-bottom: 0.75rem;
                    color: var(--fg);
                }
                #docs-content p {
                    font-family: var(--font-body), sans-serif;
                    line-height: 1.7;
                    margin-bottom: 1.25rem;
                    color: var(--fg-muted);
                }
                #docs-content ul, #docs-content ol {
                    margin-bottom: 1.5rem;
                    padding-left: 1.5rem;
                    list-style-type: disc;
                    color: var(--fg-muted);
                }
                #docs-content li {
                    margin-bottom: 0.5rem;
                    line-height: 1.6;
                }
                #docs-content code {
                    background: var(--overlay);
                    padding: 0.15rem 0.4rem;
                    border-radius: 6px;
                    font-size: 0.9em;
                    font-family: var(--font-geist-mono), monospace;
                }
                #docs-content pre {
                    background: var(--surface-2);
                    color: var(--fg);
                    padding: 1.25rem;
                    border-radius: 14px;
                    overflow-x: auto;
                    margin-bottom: 1.5rem;
                    border: 1px solid var(--border);
                }
                #docs-content pre code {
                    background: transparent;
                    color: inherit;
                    padding: 0;
                    border-radius: 0;
                    font-size: 0.88em;
                }
                #docs-content a {
                    color: #ff7759;
                    font-weight: 650;
                    text-decoration: underline;
                    text-decoration-color: rgba(255, 119, 89, 0.35);
                    text-underline-offset: 3px;
                }
                #docs-content a:hover {
                    text-decoration-color: #ff7759;
                }
            `}</style>

            {/* Header / Navbar */}
            <header className="border-b border-[var(--border)] bg-[var(--surface)]/75 backdrop-blur-md sticky top-0 z-40 w-full text-[var(--fg)]">
                <div className="max-w-[1400px] w-full mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Mobile Menu Icon */}
                        <button
                            onClick={() => setMobileOpen(true)}
                            className="md:hidden p-2 text-[var(--fg)] hover:bg-[var(--overlay)] rounded-full transition-colors"
                            aria-label="Open sidebar"
                        >
                            <Menu className="w-5 h-5" />
                        </button>

                        {/* Title — routes home: dashboard if signed in, else landing */}
                        <Link
                            href={authed ? "/dashboard" : "/"}
                            className="flex items-center gap-2.5"
                        >
                            <img
                                src="/LOGO/logo.png"
                                alt="Elixpo Mascot"
                                className="w-7.5 h-7.5 rounded-lg object-contain bg-[var(--surface)]/80 p-0.5"
                            />
                            <span className="font-heading text-lg font-bold tracking-tight">
                                Elixpo{" "}
                                <span className="text-[#ff7759]">Accounts</span>
                            </span>
                        </Link>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* Copy for LLM */}
                        <button
                            onClick={handleCopyForLlm}
                            className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--overlay)] px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-[0.98]"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-4 h-4 text-green-600" />
                                    <span className="text-green-600">
                                        Copied
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5 text-[var(--fg)]" />
                                    <span>Copy for LLM</span>
                                </>
                            )}
                        </button>

                        {/* Dashboard Link */}
                        <Link
                            href="/dashboard/oauth-apps"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-[var(--overlay)] transition-colors text-[var(--fg-muted)] hover:text-[var(--fg)]"
                        >
                            <LayoutDashboard className="w-3.5 h-3.5" />
                            <span>Dashboard</span>
                        </Link>

                        {/* GitHub Icon */}
                        <a
                            href="https://github.com/elixpo/accounts.elixpo"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--overlay)] rounded-xl transition-all active:scale-[0.96] text-[var(--fg)]"
                            aria-label="View on GitHub"
                        >
                            <Github className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            </header>

            {/* Layout Wrapper */}
            <div className="flex-1 flex max-w-[1400px] w-full mx-auto px-5 sm:px-8 relative">
                {/* Desktop Left Sidebar */}
                <aside className="w-[260px] flex-shrink-0 hidden md:block border-r border-[var(--border)] sticky top-16 h-[calc(100vh-64px)] overflow-y-auto pt-8 pr-6">
                    {sidebarContent}
                </aside>

                {/* Mobile Drawer */}
                <AnimatePresence>
                    {mobileOpen && (
                        <>
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setMobileOpen(false)}
                                className="fixed inset-0 bg-[#192837]/35 backdrop-blur-[4px] z-50 pointer-events-auto"
                            />
                            {/* Drawer Sheet */}
                            <motion.div
                                initial={{ x: "-100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "-100%" }}
                                transition={{
                                    ease: [0.22, 1, 0.36, 1] as const,
                                    duration: 0.45,
                                }}
                                className="fixed left-0 top-0 w-[min(88vw,280px)] h-[100dvh] bg-[var(--surface)] shadow-[12px_0_48px_rgba(25,40,55,0.18)] z-50 flex flex-col p-6 text-[var(--fg)]"
                            >
                                <div className="flex items-center justify-between pb-4 border-b border-[var(--border)] mb-6">
                                    <div className="flex items-center gap-2">
                                        <img
                                            src="/LOGO/logo.png"
                                            alt="Elixpo Mascot"
                                            className="w-7.5 h-7.5 rounded-lg object-contain bg-[var(--surface)]/80 p-0.5"
                                        />
                                        <span className="font-heading text-lg font-bold text-[var(--fg)]">
                                            Elixpo
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setMobileOpen(false)}
                                        className="p-1 hover:bg-[var(--overlay)] rounded-full transition-colors text-[var(--fg)]"
                                        aria-label="Close menu"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {sidebarContent}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Main Content Area */}
                <main className="flex-grow min-w-0 pt-8 pb-16 px-0 md:px-8 lg:px-12 relative flex flex-col justify-between">
                    <div id="docs-content-container">
                        <div id="docs-content" ref={contentRef}>
                            {children}
                        </div>
                    </div>

                    <div>
                        <div className="border-t border-[var(--border)] my-8" />

                        {/* Page Pagination buttons */}
                        <div className="flex justify-between items-center gap-4 flex-wrap">
                            {prevPage ? (
                                <Link
                                    href={prevPage.href}
                                    className="flex items-center gap-2 border border-[#ff7759]/25 hover:border-[#ff7759] bg-[var(--surface)] hover:bg-[#ff7759]/5 text-[#ff7759] px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98]"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    <span>{prevPage.label}</span>
                                </Link>
                            ) : (
                                <div />
                            )}

                            {nextPage ? (
                                <Link
                                    href={nextPage.href}
                                    className="flex items-center gap-2 border border-[#ff7759]/25 hover:border-[#ff7759] bg-[var(--surface)] hover:bg-[#ff7759]/5 text-[#ff7759] px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98]"
                                >
                                    <span>{nextPage.label}</span>
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                            ) : (
                                <div />
                            )}
                        </div>
                    </div>
                </main>

                {/* Desktop Right On-This-Page Navigation Sidebar */}
                {headings.length > 0 && (
                    <aside className="w-[220px] flex-shrink-0 hidden lg:block border-l border-[var(--border)] sticky top-16 h-[calc(100vh-64px)] overflow-y-auto pt-8 pl-6">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--fg-faint)] block mb-4">
                            On this page
                        </span>
                        <ul className="flex flex-col gap-2 text-xs font-semibold leading-relaxed">
                            {headings.map((h) => (
                                <li
                                    key={h.id}
                                    style={{
                                        paddingLeft:
                                            h.level === 3 ? "12px" : "0",
                                    }}
                                >
                                    <a
                                        href={`#${h.id}`}
                                        className={`transition-colors hover:text-[var(--fg)] ${
                                            activeHeadingId === h.id
                                                ? "text-[#ff7759] font-bold"
                                                : "text-[var(--fg-faint)]"
                                        }`}
                                    >
                                        {h.text}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </aside>
                )}
            </div>
        </div>
    );
}
