"use client";

import gsap from "gsap";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import Footer from "../components/footer";
import Navbar from "../components/navbar";

interface Tier {
    id: "hobby" | "indie" | "studio";
    name: string;
    priceLabel: string;
    priceCaption: string;
    accent: string;
    description: string;
    features: string[];
    cta: string;
    highlight?: boolean;
}

const TIERS: Tier[] = [
    {
        id: "hobby",
        name: "Hobby",
        priceLabel: "₹0",
        priceCaption: "Forever free",
        accent: "#192837",
        description:
            "Get started with personal OAuth apps and a Studio's worth of fun.",
        features: [
            "Up to 1,000 MAU per app",
            "3 OAuth apps",
            "1 webhook endpoint per app",
            "7-day retry on failed webhooks",
            "Community support",
        ],
        cta: "Current plan",
    },
    {
        id: "indie",
        name: "Indie",
        priceLabel: "₹1,599",
        priceCaption: "per month · billed in INR",
        accent: "#ff7759",
        description:
            "Ship real products to real users. Lift the small-app caps.",
        features: [
            "Up to 10,000 MAU per app",
            "10 OAuth apps",
            "5 webhook endpoints per app",
            "30-day retry on failed webhooks",
            "Email support",
        ],
        cta: "Start Indie",
        highlight: true,
    },
    {
        id: "studio",
        name: "Studio",
        priceLabel: "₹8,299",
        priceCaption: "per month · billed in INR",
        accent: "#3B82F6",
        description:
            "For studios shipping at scale. Audit logs and unlimited apps.",
        features: [
            "Up to 100,000 MAU per app",
            "Unlimited OAuth apps",
            "Unlimited webhook endpoints",
            "Audit log export",
            "Priority support",
        ],
        cta: "Start Studio",
    },
];

interface Me {
    id?: string;
    tier?: string;
    is_internal?: boolean;
}

export default function PricingClient() {
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyTier, setBusyTier] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/auth/me", { credentials: "include" })
            .then(async (r) => (r.ok ? ((await r.json()) as any) : null))
            .then((d) => setMe((d?.user ?? d) as Me | null))
            .catch(() => setMe(null))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        // GSAP entrance animations
        gsap.fromTo(
            ".gsap-pricing-hero",
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
            ".gsap-pricing-card",
            { opacity: 0, y: 35 },
            {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.1,
                ease: "power3.out",
                delay: 0.3,
            },
        );
    }, []);

    const startCheckout = async (tierId: "indie" | "studio") => {
        setError(null);
        if (!me?.id) {
            window.location.href = `/login?next=${encodeURIComponent("/pricing")}`;
            return;
        }
        setBusyTier(tierId);
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tier: tierId,
                    return_to: `${window.location.origin}/pricing`,
                }),
            });
            const text = await res.text();
            let data: any = {};
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                /* non-json */
            }
            if (!res.ok || !data.url) {
                setError(
                    data.error ||
                        `Couldn't start checkout (HTTP ${res.status}). Try again.`,
                );
                return;
            }
            window.location.href = data.url;
        } catch (err: any) {
            setError(err?.message || "Network error — please try again.");
        } finally {
            setBusyTier(null);
        }
    };

    return (
        <div className="relative w-full min-h-screen font-body text-[var(--fg)] bg-[var(--bg)] selection:bg-[#ff7759] selection:text-white overflow-x-hidden">
            <style>{`
                .font-heading { font-family: var(--font-heading), sans-serif; }
                .font-body { font-family: var(--font-body), sans-serif; }
            `}</style>

            <Navbar />

            <main className="w-full max-w-[1280px] mx-auto px-5 sm:px-8 py-8 sm:py-16 relative z-10">
                {/* Header */}
                <div className="flex flex-col items-center text-center gap-4 mb-16 max-w-[700px] mx-auto">
                    <h1 className="font-heading text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] gsap-pricing-hero">
                        Pricing built for indie devs{" "}
                        <span className="text-[#ff7759]">and studios.</span>
                    </h1>
                    <p className="font-body text-base sm:text-lg text-[var(--fg)] opacity-80 leading-relaxed gsap-pricing-hero">
                        Start free. Scale only when your apps actually have
                        users. No per-seat tax — pricing tracks monthly active
                        users so we win when you do.
                    </p>

                    {loading ? null : me?.is_internal ? (
                        <div className="mt-4 px-4 py-1.5 rounded-full bg-[#ff7759]/10 border border-[#ff7759]/30 text-xs font-semibold text-[#ff7759] gsap-pricing-hero">
                            You're on an internal account — billing is bypassed.
                        </div>
                    ) : null}
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="mb-8 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold max-w-[800px] mx-auto text-center">
                        {error}
                    </div>
                )}

                {/* Tiers Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-[1100px] mx-auto mb-16">
                    {TIERS.map((tier) => {
                        const isCurrent =
                            (me?.tier ?? "hobby") === tier.id ||
                            (me?.is_internal && tier.id === "studio");
                        const isBusy = busyTier === tier.id;
                        return (
                            <div
                                key={tier.id}
                                className={`bg-[var(--surface)] border rounded-2xl p-6 sm:p-8 flex flex-col justify-between min-h-[480px] relative transition-all gsap-pricing-card ${
                                    tier.highlight
                                        ? "border-2 border-[#ff7759] shadow-[0_14px_60px_-20px_rgba(255, 119, 89,0.22)]"
                                        : "border-[var(--border)] shadow-[0_4px_24px_rgba(25,40,55,0.015)] hover:shadow-[0_12px_32px_rgba(255, 119, 89,0.04)]"
                                }`}
                            >
                                {tier.highlight && (
                                    <span className="absolute top-4 right-4 bg-[#ff7759]/10 border border-[#ff7759]/35 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full text-[#ff7759]">
                                        Most Popular
                                    </span>
                                )}

                                <div>
                                    <h3
                                        className="font-heading text-lg font-bold mb-4"
                                        style={{ color: tier.accent }}
                                    >
                                        {tier.name}
                                    </h3>

                                    <div className="flex items-baseline gap-1 mb-2">
                                        <span className="font-heading text-4xl font-extrabold tracking-tight">
                                            {tier.priceLabel}
                                        </span>
                                    </div>
                                    <p className="font-body text-xs text-[var(--fg-faint)] mb-6 font-medium">
                                        {tier.priceCaption}
                                    </p>

                                    <p className="font-body text-sm text-[var(--fg-muted)] leading-relaxed mb-8 min-h-[44px]">
                                        {tier.description}
                                    </p>

                                    <ul className="flex flex-col gap-3.5 mb-8">
                                        {tier.features.map((feature) => (
                                            <li
                                                key={feature}
                                                className="flex gap-2.5 items-start text-sm"
                                            >
                                                <div
                                                    className="p-0.5 rounded-full flex-shrink-0 mt-0.5"
                                                    style={{
                                                        backgroundColor: `${tier.accent}15`,
                                                    }}
                                                >
                                                    <Check
                                                        className="w-3.5 h-3.5"
                                                        style={{
                                                            color: tier.accent,
                                                        }}
                                                    />
                                                </div>
                                                <span className="font-body text-[var(--fg)] leading-normal font-medium">
                                                    {feature}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <button
                                    disabled={
                                        loading ||
                                        isBusy ||
                                        isCurrent ||
                                        tier.id === "hobby"
                                    }
                                    onClick={() => {
                                        if (tier.id === "hobby") return;
                                        startCheckout(tier.id);
                                    }}
                                    className={`w-full py-3.5 rounded-xl font-body font-bold text-sm tracking-wide transition-all select-none flex items-center justify-center ${
                                        tier.id === "hobby"
                                            ? "bg-[var(--overlay)] text-[var(--fg-faint)] border border-[var(--border)]"
                                            : isCurrent
                                              ? "bg-[#ff7759]/10 text-[#ff7759] border border-[#ff7759]/25 cursor-default"
                                              : tier.highlight
                                                ? "bg-[#ff7759] hover:brightness-110 text-white shadow-md active:scale-[0.98]"
                                                : "bg-[var(--overlay)] hover:bg-[#192837]/10 border border-[var(--border)] text-[var(--fg)] active:scale-[0.98]"
                                    }`}
                                >
                                    {isBusy ? (
                                        <svg
                                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            />
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            />
                                        </svg>
                                    ) : null}
                                    <span>
                                        {isCurrent ? "Current Plan" : tier.cta}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Sub-note */}
                <p className="text-center text-xs opacity-60 font-body leading-relaxed max-w-md mx-auto">
                    Charged in INR via Razorpay. Cancel any time — you keep
                    access through the period you've paid for. No hidden fees,
                    no per-seat tax.
                </p>
            </main>

            <Footer />
        </div>
    );
}
