"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { CustomOAuthScope } from "@/lib/oauth-scope-registry";
import { generatePixelAvatar } from "@/lib/pixel-avatar";
import {
    AccountSelector,
    OAuthScopeList,
} from "../../components/oauth-consent";

interface AuthorizationRequest {
    clientId: string;
    clientName: string;
    clientDescription?: string;
    homepageUrl?: string;
    redirectUri: string;
    scopes: string[];
    customScopes: CustomOAuthScope[];
    state: string;
    logoUrl?: string | null;
    brandingDisplayName?: string | null;
    brandingPrimaryColor?: string | null;
    brandingAccentColor?: string | null;
    privacyPolicyUrl?: string | null;
    termsOfServiceUrl?: string | null;
    isBrandingVerified?: boolean;
    brandingVerifiedDomain?: string | null;
}

type Account = {
    id: string;
    email: string;
    displayName: string | null;
    username: string | null;
    avatar: string | null;
};

function ClientIcon({
    name,
    homepageUrl,
    clientId,
    logoUrl,
    size = 44,
}: {
    name: string;
    homepageUrl?: string;
    clientId: string;
    logoUrl?: string | null;
    size?: number;
}) {
    const [stage, setStage] = useState(0);
    // Try custom logo URL first, then the app's OWN /favicon.ico, then Google's
    // favicon service, then fall back to a generated pixel avatar.
    const sources = (() => {
        const list: string[] = [];
        if (logoUrl) {
            list.push(logoUrl);
        }
        if (homepageUrl) {
            try {
                const u = new URL(homepageUrl);
                list.push(`${u.origin}/favicon.ico`);
                list.push(
                    `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`,
                );
            } catch {}
        }
        return list;
    })();

    if (stage < sources.length) {
        return (
            <img
                src={sources[stage]}
                alt=""
                width={size}
                height={size}
                style={{
                    borderRadius: 10,
                    flexShrink: 0,
                    background: "var(--overlay)",
                }}
                onError={() => setStage((s) => s + 1)}
            />
        );
    }

    return (
        <img
            src={generatePixelAvatar(clientId + name, size)}
            alt=""
            width={size}
            height={size}
            style={{
                borderRadius: 10,
                flexShrink: 0,
                background: "var(--overlay)",
            }}
        />
    );
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

function AuthorizeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [authRequest, setAuthRequest] = useState<AuthorizationRequest | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number>(600);
    const [hasTimedOut, setHasTimedOut] = useState(false);
    // The signed-in user this authorization is for — shown so the person can
    // confirm which account they're authorizing with.
    const [account, setAccount] = useState<Account | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isSwitching, setIsSwitching] = useState(false);

    useEffect(() => {
        const load = async () => {
            const state = searchParams.get("state");
            const clientId = searchParams.get("client_id");
            const redirectUri = searchParams.get("redirect_uri");
            const scope = searchParams.get("scope") || "openid profile email";
            const scopes = scope.split(" ").filter(Boolean);

            if (!state || !clientId || !redirectUri) {
                setError("Invalid authorization request");
                return;
            }

            // 1. Check if user is logged in
            const meRes = await fetch("/api/auth/me", {
                credentials: "include",
            });
            if (!meRes.ok) {
                // Not logged in — redirect to login with ?next= pointing back here
                const currentUrl = `/authorize?${searchParams.toString()}`;
                window.location.href = `/login?next=${encodeURIComponent(currentUrl)}`;
                return;
            }
            try {
                const meData: any = await meRes.clone().json();
                if (meData?.email) {
                    if (!meData.username) {
                        const currentUrl = `/authorize?${searchParams.toString()}`;
                        window.location.href = `/setup-name?next=${encodeURIComponent(currentUrl)}`;
                        return;
                    }
                    setAccount({
                        id: meData.id,
                        email: meData.email,
                        displayName: meData.displayName ?? null,
                        username: meData.username ?? null,
                        avatar: meData.avatar ?? null,
                    });
                }
            } catch {
                // non-fatal — header just won't show the account line
            }

            const accountsRes = await fetch("/api/auth/accounts", {
                credentials: "include",
                cache: "no-store",
            });
            if (accountsRes.ok) {
                const accountData: any = await accountsRes.json();
                setAccounts(accountData.accounts || []);
            }

            try {
                // 2. Fetch client info (public endpoint, no auth needed)
                const [configRes, clientRes] = await Promise.all([
                    fetch("/api/auth/config"),
                    fetch(
                        `/api/auth/oauth-clients?client_id=${encodeURIComponent(clientId)}`,
                    ),
                ]);

                if (configRes.ok) {
                    const config = await configRes.json();
                    setTimeRemaining(
                        (config as any).authorizationTimeoutSeconds || 600,
                    );
                }

                if (!clientRes.ok) {
                    const err: any = await clientRes.json();
                    setError(err.error || "Application not found");
                    return;
                }

                const client: any = await clientRes.json();

                // 3. Validate redirect URI is registered
                const registeredUris: string[] = client.redirect_uris || [];
                if (!registeredUris.includes(redirectUri)) {
                    setError(
                        "Redirect URI is not registered for this application",
                    );
                    return;
                }

                setAuthRequest({
                    clientId,
                    clientName: client.name || "Unknown App",
                    clientDescription: client.description || null,
                    homepageUrl: client.homepage_url || null,
                    redirectUri,
                    scopes: scopes.length > 0 ? scopes : client.scopes || [],
                    customScopes: client.custom_scopes || [],
                    state,
                    logoUrl: client.logo_url || null,
                    brandingDisplayName: client.branding_display_name || null,
                    brandingPrimaryColor: client.branding_primary_color || null,
                    brandingAccentColor: client.branding_accent_color || null,
                    privacyPolicyUrl: client.privacy_policy_url || null,
                    termsOfServiceUrl: client.terms_of_service_url || null,
                    isBrandingVerified: client.is_branding_verified || false,
                    brandingVerifiedDomain:
                        client.branding_verified_domain || null,
                });
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load authorization request",
                );
            }
        };
        load();
    }, [searchParams]);

    useEffect(() => {
        if (!authRequest || hasTimedOut) return;
        const timer = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setHasTimedOut(true);
                    setError("Authorization request expired.");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [authRequest, hasTimedOut]);

    const handleAuthorize = async () => {
        if (!authRequest || hasTimedOut) return;
        setIsLoading(true);
        try {
            const res = await fetch("/api/auth/authorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    state: authRequest.state,
                    clientId: authRequest.clientId,
                    redirectUri: authRequest.redirectUri,
                    scopes: authRequest.scopes,
                    approved: true,
                }),
            });
            if (!res.ok) throw new Error("Authorization failed");
            const data: any = await res.json();
            window.location.href = data.redirect_uri;
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Authorization failed",
            );
            setIsLoading(false);
        }
    };

    const handleSwitchAccount = async (userId: string) => {
        if (userId === account?.id || isSwitching) return;
        setIsSwitching(true);
        setError(null);
        try {
            const response = await fetch("/api/auth/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            if (!response.ok) {
                const data: any = await response.json();
                throw new Error(data.error || "Unable to switch account");
            }
            window.location.reload();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to switch account",
            );
            setIsSwitching(false);
        }
    };

    const handleDeny = () => {
        if (!authRequest || hasTimedOut) return;
        const url = new URL(authRequest.redirectUri);
        url.searchParams.set("error", "access_denied");
        url.searchParams.set("state", authRequest.state);
        window.location.href = url.toString();
    };

    const formatTime = (s: number) =>
        `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    const hostname = authRequest?.isBrandingVerified
        ? (() => {
              if (authRequest.brandingVerifiedDomain) {
                  return authRequest.brandingVerifiedDomain;
              }
              if (!authRequest.homepageUrl) return "";
              try {
                  return new URL(authRequest.homepageUrl).hostname;
              } catch {
                  return "";
              }
          })()
        : "";

    // --- Error state ---
    if (error) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    padding: 16,
                }}
            >
                <div
                    style={{
                        maxWidth: 380,
                        width: "100%",
                        textAlign: "center",
                        background: "var(--surface)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: 16,
                        padding: 32,
                    }}
                >
                    <div
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: "50%",
                            background: "rgba(239,68,68,0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 16px",
                            fontSize: 24,
                        }}
                    >
                        !
                    </div>
                    <p
                        style={{
                            color: "#b91c1c",
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                        }}
                    >
                        Authorization Error
                    </p>
                    <p
                        style={{
                            color: "var(--fg-faint)",
                            fontSize: 14,
                            marginBottom: 24,
                            lineHeight: 1.5,
                        }}
                    >
                        {error}
                    </p>
                    <button
                        onClick={() => router.push("/login")}
                        style={{
                            background: "var(--overlay)",
                            color: "var(--fg-faint)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            padding: "10px 24px",
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: 14,
                        }}
                    >
                        Return to Login
                    </button>
                </div>
            </div>
        );
    }

    // --- Loading state ---
    if (!authRequest) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                }}
            >
                <div style={{ textAlign: "center" }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            border: "3px solid rgba(255, 119, 89,0.2)",
                            borderTopColor: "#ff7759",
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite",
                            margin: "0 auto 16px",
                        }}
                    />
                    <p style={{ color: "var(--fg-faint)", fontSize: 14 }}>
                        Loading...
                    </p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    // --- Consent screen ---
    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg)",
                padding: 16,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    width: 520,
                    height: 520,
                    left: "-18%",
                    top: "-22%",
                    borderRadius: "42% 58% 64% 36%",
                    background: `radial-gradient(circle, ${
                        authRequest.isBrandingVerified &&
                        authRequest.brandingPrimaryColor
                            ? authRequest.brandingPrimaryColor
                            : "#ff7759"
                    } 0%, transparent 68%)`,
                    filter: "blur(70px)",
                    opacity: 0.18,
                    transform: "rotate(18deg)",
                }}
            />
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    width: 440,
                    height: 440,
                    right: "-14%",
                    bottom: "-24%",
                    borderRadius: "60% 40% 38% 62%",
                    background: `radial-gradient(circle, ${
                        authRequest.isBrandingVerified &&
                        authRequest.brandingAccentColor
                            ? authRequest.brandingAccentColor
                            : authRequest.brandingPrimaryColor || "#ff9b85"
                    } 0%, transparent 68%)`,
                    filter: "blur(70px)",
                    opacity: 0.16,
                    transform: "rotate(-22deg)",
                }}
            />
            <div
                style={{
                    maxWidth: 420,
                    width: "100%",
                    position: "relative",
                    zIndex: 1,
                }}
            >
                {/* Main Card */}
                <div
                    style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 20,
                        overflow: "hidden",
                    }}
                >
                    {/* Header — App handshake */}
                    <div
                        style={{
                            padding: "24px 24px 20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 16,
                        }}
                    >
                        {/* Verified application logo */}
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 12,
                                overflow: "hidden",
                                flexShrink: 0,
                                border: "2px solid var(--border)",
                            }}
                        >
                            <ClientIcon
                                name={authRequest.clientName}
                                homepageUrl={
                                    authRequest.isBrandingVerified
                                        ? authRequest.homepageUrl
                                        : undefined
                                }
                                clientId={authRequest.clientId}
                                logoUrl={
                                    authRequest.isBrandingVerified
                                        ? authRequest.logoUrl
                                        : null
                                }
                                size={44}
                            />
                        </div>

                        {/* Connector */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                flex: "0 0 auto",
                            }}
                        >
                            <div
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background:
                                        authRequest.brandingPrimaryColor ||
                                        "#ff7759",
                                    opacity: 0.6,
                                }}
                            />
                            <div
                                style={{
                                    width: 24,
                                    height: 2,
                                    background: `linear-gradient(90deg, ${authRequest.brandingPrimaryColor || "#ff7759"}, ${authRequest.brandingAccentColor || authRequest.brandingPrimaryColor || "#ff9b85"})`,
                                }}
                            />
                            <div
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background:
                                        authRequest.brandingAccentColor ||
                                        authRequest.brandingPrimaryColor ||
                                        "#ff7759",
                                    opacity: 0.6,
                                }}
                            />
                        </div>

                        {/* Elixpo Accounts network icon */}
                        <div
                            style={{
                                flexShrink: 0,
                                border: "2px solid var(--border)",
                                borderRadius: 12,
                                overflow: "hidden",
                            }}
                        >
                            <img
                                src="/LOGO/logo.png"
                                alt="Elixpo Accounts"
                                width={44}
                                height={44}
                                style={{ display: "block" }}
                            />
                        </div>
                    </div>

                    <p
                        style={{
                            color: "var(--fg)",
                            fontSize: 15,
                            fontWeight: 700,
                            textAlign: "center",
                            margin: "-8px 16px 2px",
                        }}
                    >
                        Continue to{" "}
                        {authRequest.isBrandingVerified &&
                        authRequest.brandingDisplayName
                            ? authRequest.brandingDisplayName
                            : authRequest.clientName}
                    </p>
                    {hostname && (
                        <p
                            style={{
                                color: "var(--fg-faint)",
                                fontFamily: "monospace",
                                fontSize: 12,
                                textAlign: "center",
                                margin: "0 16px 4px",
                            }}
                        >
                            {hostname}
                        </p>
                    )}
                    <p
                        style={{
                            color: "var(--fg-faint)",
                            fontSize: 12,
                            textAlign: "center",
                            margin: "0 16px 16px",
                        }}
                    >
                        via global secured Elixpo Accounts Network
                    </p>

                    {/* Which account this authorization is for */}
                    {account && (
                        <AccountSelector
                            account={account}
                            accounts={accounts}
                            disabled={isSwitching}
                            onSwitch={handleSwitchAccount}
                            addHref={`/login?add_account=1&next=${encodeURIComponent(`/authorize?${searchParams.toString()}`)}`}
                        />
                    )}

                    {/* Bento grid */}
                    <div
                        style={{
                            padding: "0 16px 16px",
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10,
                        }}
                    >
                        {/* Scopes card — spans full width */}
                        <div
                            style={{
                                gridColumn: "1 / -1",
                                background: "rgba(255, 119, 89,0.04)",
                                border: "1px solid rgba(255, 119, 89,0.1)",
                                borderRadius: 12,
                                padding: 16,
                            }}
                        >
                            <p
                                style={{
                                    color: "var(--fg-faint)",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    margin: "0 0 10px",
                                }}
                            >
                                {authRequest.isBrandingVerified &&
                                authRequest.brandingDisplayName
                                    ? authRequest.brandingDisplayName
                                    : authRequest.clientName}{" "}
                                will be able to
                            </p>
                            <OAuthScopeList
                                scopes={authRequest.scopes}
                                customScopes={authRequest.customScopes}
                                accentColor={
                                    authRequest.brandingPrimaryColor ||
                                    "#ff7759"
                                }
                            />
                        </div>

                        {/* Security and expiry chip */}
                        <div
                            style={{
                                gridColumn: "1 / -1",
                                background:
                                    timeRemaining < 60
                                        ? "rgba(239,68,68,0.06)"
                                        : "var(--overlay)",
                                border: `1px solid ${timeRemaining < 60 ? "rgba(239,68,68,0.15)" : "var(--border)"}`,
                                borderRadius: 12,
                                padding: 14,
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                            }}
                        >
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <p
                                    style={{
                                        color: "var(--fg-faint)",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        margin: "0 0 4px",
                                    }}
                                >
                                    Security
                                </p>
                                <p
                                    style={{
                                        color: "var(--fg-faint)",
                                        fontSize: 11.5,
                                        lineHeight: 1.45,
                                        margin: 0,
                                    }}
                                >
                                    Renewable access. Revoke it anytime from
                                    connected services.
                                </p>
                            </div>
                            <div
                                style={{
                                    flexShrink: 0,
                                    minWidth: 78,
                                    paddingLeft: 14,
                                    borderLeft: "1px solid var(--border)",
                                    textAlign: "center",
                                }}
                            >
                                <p
                                    style={{
                                        color: "var(--fg-faint)",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        margin: "0 0 4px",
                                    }}
                                >
                                    Expires in
                                </p>
                                <p
                                    style={{
                                        fontFamily: "monospace",
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color:
                                            timeRemaining < 60
                                                ? "#b91c1c"
                                                : "#ff7759",
                                        margin: 0,
                                    }}
                                >
                                    {formatTime(timeRemaining)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div
                        style={{
                            padding: "12px 16px 16px",
                            display: "flex",
                            gap: 10,
                        }}
                    >
                        <button
                            onClick={handleDeny}
                            disabled={isLoading || hasTimedOut}
                            style={{
                                flex: 1,
                                padding: "12px 16px",
                                borderRadius: 10,
                                border: "1px solid var(--border)",
                                background: "var(--overlay)",
                                color: "var(--fg-faint)",
                                fontSize: 14,
                                fontWeight: 600,
                                cursor:
                                    isLoading || hasTimedOut
                                        ? "not-allowed"
                                        : "pointer",
                                opacity: isLoading || hasTimedOut ? 0.5 : 1,
                            }}
                        >
                            Deny
                        </button>
                        <button
                            onClick={handleAuthorize}
                            disabled={isLoading || hasTimedOut}
                            style={{
                                flex: 1,
                                padding: "12px 16px",
                                borderRadius: 10,
                                border: `1px solid ${
                                    authRequest.isBrandingVerified &&
                                    authRequest.brandingPrimaryColor
                                        ? authRequest.brandingPrimaryColor
                                        : "#ff7759"
                                }`,
                                background:
                                    authRequest.isBrandingVerified &&
                                    authRequest.brandingPrimaryColor
                                        ? authRequest.brandingPrimaryColor
                                        : "#ff7759",
                                color:
                                    authRequest.isBrandingVerified &&
                                    authRequest.brandingPrimaryColor
                                        ? getContrastColorLocal(
                                              authRequest.brandingPrimaryColor,
                                          )
                                        : "#fff",
                                fontSize: 14,
                                fontWeight: 700,
                                cursor:
                                    isLoading || hasTimedOut
                                        ? "not-allowed"
                                        : "pointer",
                                opacity: isLoading || hasTimedOut ? 0.5 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                            }}
                        >
                            {isLoading ? (
                                <>
                                    <div
                                        style={{
                                            width: 16,
                                            height: 16,
                                            border: "2px solid rgba(255,255,255,0.4)",
                                            borderTopColor: "#fff",
                                            borderRadius: "50%",
                                            animation:
                                                "spin 0.8s linear infinite",
                                        }}
                                    />
                                    Authorizing...
                                </>
                            ) : (
                                <>
                                    <svg
                                        width="16"
                                        height="16"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2.5}
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                    Authorize
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 20,
                    }}
                >
                    <p
                        style={{
                            textAlign: "center",
                            fontSize: 12,
                            color: "var(--fg-faint)",
                            margin: 0,
                        }}
                    >
                        Don&apos;t recognize this app?{" "}
                        <button
                            onClick={() => router.push("/login")}
                            style={{
                                color: "#ff7759",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontWeight: 600,
                                fontSize: 12,
                            }}
                        >
                            Go back to safety
                        </button>
                    </p>

                    <p
                        style={{
                            textAlign: "center",
                            fontSize: 11,
                            color: "var(--fg-faint)",
                            margin: 0,
                        }}
                    >
                        🛡️ Secured by Elixpo Accounts
                    </p>

                    {authRequest.isBrandingVerified &&
                        (authRequest.privacyPolicyUrl ||
                            authRequest.termsOfServiceUrl) && (
                            <div
                                style={{
                                    display: "flex",
                                    gap: 12,
                                    fontSize: 11,
                                    color: "var(--fg-faint)",
                                }}
                            >
                                {authRequest.privacyPolicyUrl && (
                                    <a
                                        href={authRequest.privacyPolicyUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            color: "var(--fg-faint)",
                                            textDecoration: "underline",
                                        }}
                                    >
                                        Privacy Policy
                                    </a>
                                )}
                                {authRequest.termsOfServiceUrl && (
                                    <a
                                        href={authRequest.termsOfServiceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            color: "var(--fg-faint)",
                                            textDecoration: "underline",
                                        }}
                                    >
                                        Terms of Service
                                    </a>
                                )}
                            </div>
                        )}
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
}

export default function AuthorizePage() {
    return (
        <Suspense>
            <AuthorizeContent />
        </Suspense>
    );
}
