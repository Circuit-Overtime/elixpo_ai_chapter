"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

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
    { label: "Developer SDK", href: "/docs/lixaccounts" },
    { label: "Pricing", href: "/pricing" },
    { label: "Profile", href: "/dashboard/profile" },
];

export default function Navbar() {
    const [me, setMe] = useState<any>(undefined);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d: any) => {
                if (cancelled) return;
                setMe(d?.email ? d : null);
            })
            .catch(() => {
                if (!cancelled) setMe(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const authed = !!me?.email;

    return (
        <header className="w-full max-w-[1280px] mx-auto px-5 sm:px-8 py-4 sm:py-5 flex items-center justify-between z-50 relative bg-transparent text-[var(--fg)] font-body">
            {/* Left: Panda Mascot Logo + App Title */}
            <Link href="/" className="flex items-center gap-3">
                <img
                    src="/LOGO/logo.png"
                    alt="Elixpo Mascot"
                    className="w-8 h-8 rounded-lg object-contain bg-[var(--surface)]/80 p-0.5"
                />
                <span className="font-heading text-xl font-bold tracking-tight text-[var(--fg)]">
                    Elixpo <span className="text-[#ff7759]">Accounts</span>
                </span>
            </Link>

            {/* Center: Marketing / App Links (Desktop Only) */}
            <nav className="hidden md:flex items-center gap-8">
                {(authed ? APP_LINKS : MARKETING_LINKS).map((link) => (
                    <Link
                        key={link.label}
                        href={link.href}
                        className="text-sm font-semibold tracking-wide hover:opacity-70 transition-opacity text-[var(--fg)]"
                    >
                        {link.label}
                    </Link>
                ))}
            </nav>

            {/* Right: Call to Actions (Desktop Only) */}
            <div className="hidden md:flex items-center gap-3">
                {me === undefined ? (
                    // Loading placeholder
                    <div className="w-[104px] h-[38px]" />
                ) : authed ? (
                    <>
                        <Link
                            href="/dashboard/oauth-apps"
                            className="bg-[#ff7759] text-white px-6 py-2.5 rounded-full font-semibold text-sm hover:scale-[1.04] hover:brightness-110 active:scale-[0.96] transition-all duration-200 shadow-[0_4px_14px_rgba(255, 119, 89,0.22)]"
                        >
                            Dashboard
                        </Link>
                        <Link
                            href="/dashboard/profile"
                            className="bg-[var(--bg)] text-[var(--fg)] px-6 py-2.5 rounded-full font-semibold text-sm hover:scale-[1.04] hover:brightness-110 active:scale-[0.96] transition-all duration-200 border border-[var(--border)]"
                        >
                            Profile
                        </Link>
                    </>
                ) : (
                    <>
                        <Link
                            href="/login"
                            className="bg-[#ff7759] text-white px-6 py-2.5 rounded-full font-semibold text-sm hover:scale-[1.04] hover:brightness-110 active:scale-[0.96] transition-all duration-200 shadow-[0_4px_14px_rgba(255, 119, 89,0.22)]"
                        >
                            Start For Free
                        </Link>
                        <Link
                            href="/login"
                            className="bg-[var(--bg)] text-[var(--fg)] px-6 py-2.5 rounded-full font-semibold text-sm hover:scale-[1.04] hover:brightness-110 active:scale-[0.96] transition-all duration-200 border border-[var(--border)]"
                        >
                            Sign In
                        </Link>
                    </>
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

            {/* Mobile Drawer Sheet */}
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
                            className="fixed right-0 top-0 w-[min(88vw,360px)] h-[100dvh] bg-[var(--surface-2)] shadow-[-12px_0_48px_rgba(25,40,55,0.18)] z-50 flex flex-col p-6 text-[var(--fg)]"
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
                                        className="w-8 h-8 rounded-lg object-contain bg-[var(--surface)]/80 p-0.5"
                                    />
                                    <span className="font-heading text-lg font-bold text-[var(--fg)]">
                                        Elixpo
                                    </span>
                                </Link>
                                <button
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="p-1 hover:bg-[var(--overlay)] rounded-full transition-colors text-[var(--fg)]"
                                    aria-label="Close menu"
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
                                {me === undefined ? null : authed ? (
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
                                            className="w-full bg-[var(--bg)] text-[var(--fg)] py-3 rounded-full font-semibold text-center hover:brightness-110 active:scale-[0.98] transition-all border border-[var(--border)]"
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
                                            Start For Free
                                        </Link>
                                        <Link
                                            href="/login"
                                            onClick={() =>
                                                setIsMobileMenuOpen(false)
                                            }
                                            className="w-full bg-[var(--bg)] text-[var(--fg)] py-3 rounded-full font-semibold text-center hover:brightness-110 active:scale-[0.98] transition-all border border-[var(--border)]"
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
        </header>
    );
}
