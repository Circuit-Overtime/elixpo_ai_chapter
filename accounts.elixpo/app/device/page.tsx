"use client";

/**
 * accounts.elixpo#80 — device verification/consent page.
 *
 * STYLING ASSUMPTION (flagged, not confirmed): this uses Tailwind utility
 * classes. Nothing in the #79/#80 handoff confirmed the repo's actual
 * styling system — if this codebase uses CSS modules, shadcn/ui
 * components, or something else, swap the JSX below accordingly; the
 * data flow and state logic doesn't depend on Tailwind specifically.
 *
 * Data flow:
 * 1. GET /api/auth/device/lookup?user_code=... (public, rate-limited,
 *    already built by #79) — resolves the code to client/scope/expiry
 *    details, or a collapsed not_found/expired 404.
 * 2. User clicks Approve/Deny -> POST /api/auth/device/{approve,deny}
 *    with { user_code }. These routes require the access_token cookie;
 *    a 401 here means "not logged in", not "bad code" — redirect to
 *    /login preserving this exact URL (including ?user_code=...) as
 *    `next`, so login and account-switching both land back on the same
 *    pending request rather than losing it.
 * 3. The verification link (verification_uri_complete) only ever
 *    prefills the input via ?user_code= — it never calls approve/deny
 *    on its own. Loading this page performs a read-only lookup and
 *    nothing else; approval always requires an explicit, separate click.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CustomOAuthScope } from "@/lib/oauth-scope-registry";
import {
    AccountSelector,
    type ConsentAccount,
    OAuthScopeList,
} from "../components/oauth-consent";

interface LookupResult {
    status: "pending" | "approved" | "denied" | "expired" | "not_found";
    client_id?: string;
    client_name?: string;
    scopes?: string[];
    custom_scopes?: CustomOAuthScope[];
    expires_at?: string;
    logo_url?: string | null;
    branding_display_name?: string | null;
    branding_primary_color?: string | null;
    branding_accent_color?: string | null;
    privacy_policy_url?: string | null;
    terms_of_service_url?: string | null;
    is_branding_verified?: boolean;
    branding_verified_domain?: string | null;
    audience?: string | null;
}

function getContrastColorLocal(hex: string): string {
    if (!hex?.startsWith("#")) return "#FFFFFF";
    let cleanHex = hex.slice(1);
    if (cleanHex.length === 3 || cleanHex.length === 4) {
        cleanHex = cleanHex
            .split("")
            .map((c) => c + c)
            .join("");
    }
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#FFFFFF";

    const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

type ViewState =
    | { phase: "entering" }
    | { phase: "loading" }
    | { phase: "ready"; details: LookupResult }
    | { phase: "error"; message: string }
    | {
          phase: "resolved";
          outcome: "approved" | "denied";
          details: LookupResult;
      };

function currentUrlForNext(userCode: string): string {
    const params = new URLSearchParams();
    if (userCode) params.set("user_code", userCode);
    const qs = params.toString();
    return `/device${qs ? `?${qs}` : ""}`;
}

function DeviceVerificationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const prefill = searchParams.get("user_code") || "";

    const [userCode, setUserCode] = useState(prefill);
    const [view, setView] = useState<ViewState>({ phase: "entering" });
    const [account, setAccount] = useState<ConsentAccount | null>(null);
    const [accounts, setAccounts] = useState<ConsentAccount[]>([]);
    const [isSwitching, setIsSwitching] = useState(false);
    const autoLookupCode = useRef<string | null>(null);

    const doLookup = useCallback(
        async (rawCode: string) => {
            setView({ phase: "loading" });
            try {
                const [res, meResponse, accountsResponse] = await Promise.all([
                    fetch(
                        `/api/auth/device/lookup?user_code=${encodeURIComponent(rawCode)}`,
                        { cache: "no-store" },
                    ),
                    fetch("/api/auth/me", {
                        credentials: "include",
                        cache: "no-store",
                    }),
                    fetch("/api/auth/accounts", {
                        credentials: "include",
                        cache: "no-store",
                    }).catch(() => null),
                ]);
                if (res.status === 404) {
                    setView({
                        phase: "error",
                        message:
                            "That code is incorrect or has expired. Please check your device and try again.",
                    });
                    return;
                }
                if (res.status === 429) {
                    setView({
                        phase: "error",
                        message:
                            "Too many attempts. Please wait a moment and try again.",
                    });
                    return;
                }
                if (!res.ok) {
                    setView({
                        phase: "error",
                        message: "Something went wrong. Please try again.",
                    });
                    return;
                }
                const details: LookupResult = await res.json();
                if (details.status !== "pending") {
                    setView({
                        phase: "error",
                        message: "This code has already been used.",
                    });
                    return;
                }
                const next = currentUrlForNext(rawCode);
                if (!meResponse.ok) {
                    router.push(`/login?next=${encodeURIComponent(next)}`);
                    return;
                }
                const me: any = await meResponse.json();
                if (!me.username) {
                    router.push(`/setup-name?next=${encodeURIComponent(next)}`);
                    return;
                }
                setAccount({
                    id: me.id,
                    email: me.email,
                    displayName: me.displayName ?? null,
                    avatar: me.avatar ?? null,
                });
                if (accountsResponse?.ok) {
                    const saved: any = await accountsResponse.json();
                    setAccounts(saved.accounts || []);
                }
                setView({ phase: "ready", details });
            } catch {
                setView({
                    phase: "error",
                    message: "Couldn't reach the server. Please try again.",
                });
            }
        },
        [router],
    );

    async function switchAccount(userId: string) {
        if (userId === account?.id || isSwitching) return;
        setIsSwitching(true);
        const response = await fetch("/api/auth/accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
        });
        if (response.ok) {
            window.location.reload();
            return;
        }
        setIsSwitching(false);
        setView({
            phase: "error",
            message: "Unable to switch accounts. Please try again.",
        });
    }

    // Auto-lookup when arriving via verification_uri_complete (?user_code=...).
    // Read-only — does not approve or deny anything.
    useEffect(() => {
        if (prefill && autoLookupCode.current !== prefill) {
            autoLookupCode.current = prefill;
            void doLookup(prefill);
        }
    }, [prefill, doLookup]);

    function handleSubmitCode(e: React.FormEvent) {
        e.preventDefault();
        if (userCode.trim().length > 0) {
            void doLookup(userCode.trim());
        }
    }

    async function resolve(action: "approve" | "deny") {
        if (view.phase !== "ready") return;
        const details = view.details;
        setView({ phase: "loading" });
        try {
            const res = await fetch(`/api/auth/device/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_code: userCode }),
            });

            if (res.status === 401) {
                // Not logged in (or session expired mid-flow) — preserve
                // this exact pending request across login/account switch.
                router.push(
                    `/login?next=${encodeURIComponent(currentUrlForNext(userCode))}`,
                );
                return;
            }

            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as {
                    error_description?: string;
                };
                setView({
                    phase: "error",
                    message:
                        body.error_description ||
                        "This request could not be completed.",
                });
                return;
            }

            setView({
                phase: "resolved",
                outcome: action === "approve" ? "approved" : "denied",
                details,
            });
        } catch {
            setView({
                phase: "error",
                message: "Couldn't reach the server. Please try again.",
            });
        }
    }

    const activeBrand =
        (view.phase === "ready" || view.phase === "resolved") &&
        view.details.is_branding_verified
            ? view.details
            : null;

    return (
        <main
            className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-6 py-12"
            style={{
                backgroundImage: `radial-gradient(circle at 15% 18%, color-mix(in srgb, ${activeBrand?.branding_primary_color || "#ff7759"} 16%, transparent), transparent 38%), radial-gradient(circle at 86% 82%, color-mix(in srgb, ${activeBrand?.branding_accent_color || activeBrand?.branding_primary_color || "#ff9b85"} 14%, transparent), transparent 42%)`,
            }}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-2xl"
                style={{
                    borderTop: `4px solid ${activeBrand?.branding_primary_color || "#ff7759"}`,
                }}
            >
                {view.phase === "entering" || view.phase === "loading" ? (
                    <>
                        <p className="text-xs font-mono uppercase tracking-wide text-[var(--fg-faint)] mb-2">
                            Device sign-in
                        </p>
                        <h1 className="text-xl font-semibold text-[var(--fg)] mb-1">
                            Enter the code on your device
                        </h1>
                        <p className="text-sm text-[var(--fg-muted)] mb-6">
                            Look for a code shown in your terminal or on your
                            device&apos;s screen.
                        </p>
                        <form onSubmit={handleSubmitCode}>
                            <input
                                value={userCode}
                                onChange={(e) =>
                                    setUserCode(e.target.value.toUpperCase())
                                }
                                placeholder="XXXX-XXXX"
                                autoComplete="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                maxLength={12}
                                disabled={view.phase === "loading"}
                                className="w-full text-center text-2xl tracking-widest font-mono bg-[var(--field-bg)] border border-[var(--border)] rounded-lg py-4 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                            />
                            <button
                                type="submit"
                                disabled={
                                    view.phase === "loading" ||
                                    userCode.trim().length === 0
                                }
                                className="mt-4 w-full rounded-lg bg-[var(--accent)] py-3 font-semibold text-[var(--accent-contrast)] disabled:opacity-50"
                            >
                                {view.phase === "loading"
                                    ? "Checking…"
                                    : "Continue"}
                            </button>
                        </form>
                    </>
                ) : null}

                {view.phase === "ready" ? (
                    <>
                        <p className="text-xs font-mono uppercase tracking-wide text-[var(--fg-faint)] mb-2">
                            Confirm access
                        </p>
                        <div className="flex items-center justify-center gap-3 mb-4">
                            {view.details.is_branding_verified &&
                            view.details.logo_url ? (
                                <img
                                    src={view.details.logo_url}
                                    alt="App logo"
                                    className="w-10 h-10 rounded-lg object-cover border border-[var(--border)]"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-lg border border-[var(--border)] bg-[var(--overlay)] flex items-center justify-center font-bold text-[var(--fg)]">
                                    {(view.details.client_name || "App")
                                        .charAt(0)
                                        .toUpperCase()}
                                </div>
                            )}
                            <span className="text-lg text-[var(--fg-faint)]">
                                ↔
                            </span>
                            <img
                                src="/LOGO/logo.png"
                                alt="Elixpo Accounts"
                                className="w-10 h-10 rounded-lg border border-[var(--border)]"
                            />
                        </div>
                        <p className="text-sm text-[var(--fg)] mb-1">
                            <strong>
                                {view.details.is_branding_verified &&
                                view.details.branding_display_name
                                    ? view.details.branding_display_name
                                    : view.details.client_name ||
                                      view.details.client_id}
                            </strong>{" "}
                            wants to access your account.
                        </p>
                        {view.details.is_branding_verified &&
                        view.details.branding_verified_domain ? (
                            <p className="mb-3 font-mono text-xs text-[var(--fg-faint)]">
                                Verified for{" "}
                                {view.details.branding_verified_domain}
                            </p>
                        ) : null}
                        {view.details.expires_at ? (
                            <p className="text-xs font-mono text-[var(--fg-faint)] mb-5">
                                Expires{" "}
                                {new Date(
                                    view.details.expires_at,
                                ).toLocaleTimeString()}
                            </p>
                        ) : null}

                        {view.details.audience ? (
                            <p className="text-xs font-mono text-[var(--fg-faint)] mb-4">
                                Audience: {view.details.audience}
                            </p>
                        ) : null}

                        {account && (
                            <AccountSelector
                                account={account}
                                accounts={accounts}
                                disabled={isSwitching}
                                onSwitch={switchAccount}
                                addHref={`/login?add_account=1&next=${encodeURIComponent(currentUrlForNext(userCode))}`}
                            />
                        )}

                        <OAuthScopeList
                            scopes={view.details.scopes || []}
                            customScopes={view.details.custom_scopes || []}
                            accentColor={
                                view.details.branding_primary_color || "#ff7759"
                            }
                        />

                        <div className="mt-6 flex flex-col gap-3">
                            <button
                                onClick={() => resolve("approve")}
                                className="w-full rounded-lg bg-[var(--accent)] py-3 font-semibold text-[var(--accent-contrast)]"
                                style={
                                    view.details.is_branding_verified &&
                                    view.details.branding_primary_color
                                        ? {
                                              backgroundColor:
                                                  view.details
                                                      .branding_primary_color,
                                              color: getContrastColorLocal(
                                                  view.details
                                                      .branding_primary_color,
                                              ),
                                          }
                                        : undefined
                                }
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => resolve("deny")}
                                className="w-full rounded-lg border border-[var(--border)] py-3 font-semibold text-red-500"
                            >
                                Deny
                            </button>
                        </div>
                    </>
                ) : null}

                {view.phase === "resolved" ? (
                    <div className="text-center">
                        <div
                            className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border ${
                                view.outcome === "approved"
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                    : "border-red-500/30 bg-red-500/10 text-red-500"
                            }`}
                        >
                            <span className="text-3xl" aria-hidden="true">
                                {view.outcome === "approved" ? "✓" : "×"}
                            </span>
                        </div>
                        <p className="mb-2 text-xs font-mono uppercase tracking-wide text-[var(--fg-faint)]">
                            Device sign-in
                        </p>
                        <h1 className="text-xl font-semibold text-[var(--fg)] mb-1">
                            {view.outcome === "approved"
                                ? "Connection approved"
                                : "Request denied"}
                        </h1>
                        <p className="mb-4 text-sm text-[var(--fg-muted)]">
                            {view.outcome === "approved"
                                ? `${view.details.branding_display_name || view.details.client_name || "Your app"} can now finish signing in.`
                                : "The device won't be able to sign in."}
                        </p>
                        {view.outcome === "approved" ? (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--overlay)] px-4 py-3">
                                <p className="text-sm font-medium text-[var(--fg)]">
                                    Return to your device
                                </p>
                                <p className="mt-1 text-xs text-[var(--fg-faint)]">
                                    It will continue automatically. You can
                                    safely close this window.
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={() => setView({ phase: "entering" })}
                                className="w-full rounded-lg border border-[var(--border)] py-3 font-semibold text-[var(--fg)]"
                            >
                                Enter another code
                            </button>
                        )}
                    </div>
                ) : null}

                {view.phase === "error" ? (
                    <>
                        <p className="text-xs font-mono uppercase tracking-wide text-[var(--fg-faint)] mb-2">
                            Device sign-in
                        </p>
                        <h1 className="text-xl font-semibold text-[var(--fg)] mb-2">
                            Can&apos;t continue
                        </h1>
                        <p className="text-sm text-red-500 mb-6">
                            {view.message}
                        </p>
                        <button
                            onClick={() => setView({ phase: "entering" })}
                            className="w-full rounded-lg border border-[var(--border)] py-3 font-semibold text-[var(--fg)]"
                        >
                            Enter a new code
                        </button>
                    </>
                ) : null}
                {/* Trust Marker Footer */}
                <div className="mt-8 pt-4 border-t border-[var(--border)] flex flex-col items-center gap-2">
                    <p className="text-[10px] text-[var(--fg-faint)] font-medium">
                        🛡️ Secured by Elixpo Accounts
                    </p>
                    {view.phase === "ready" &&
                        view.details &&
                        view.details.is_branding_verified &&
                        (view.details.privacy_policy_url ||
                            view.details.terms_of_service_url) && (
                            <div className="flex gap-3 text-[10px] text-neutral-500">
                                {view.details.privacy_policy_url && (
                                    <a
                                        href={view.details.privacy_policy_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:text-neutral-300"
                                    >
                                        Privacy Policy
                                    </a>
                                )}
                                {view.details.terms_of_service_url && (
                                    <a
                                        href={view.details.terms_of_service_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline hover:text-neutral-300"
                                    >
                                        Terms of Service
                                    </a>
                                )}
                            </div>
                        )}
                </div>
            </div>
        </main>
    );
}

export default function DeviceVerificationPage() {
    return (
        <Suspense>
            <DeviceVerificationContent />
        </Suspense>
    );
}
