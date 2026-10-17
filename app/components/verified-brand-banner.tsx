"use client";

import { useEffect, useState } from "react";
import { getContrastColor } from "@/lib/branding-validation";

export type VerifiedBranding = {
    displayName: string;
    domain: string;
    logoUrl: string | null;
    primaryColor: string;
};

function getTrustedTarget(next: string): URL | null {
    try {
        const target = new URL(next, window.location.origin);
        return target.origin === window.location.origin ? target : null;
    } catch {
        return null;
    }
}

export function useVerifiedBranding(
    next: string | null,
): VerifiedBranding | null {
    const [branding, setBranding] = useState<VerifiedBranding | null>(null);

    useEffect(() => {
        if (!next) return;
        const target = getTrustedTarget(next);
        if (!target) return;

        const controller = new AbortController();
        const load = async () => {
            let endpoint: string | null = null;
            if (target.pathname === "/authorize") {
                const clientId = target.searchParams.get("client_id");
                if (clientId) {
                    endpoint = `/api/auth/oauth-clients?client_id=${encodeURIComponent(clientId)}`;
                }
            } else if (target.pathname === "/device") {
                const userCode = target.searchParams.get("user_code");
                if (userCode) {
                    endpoint = `/api/auth/device/lookup?user_code=${encodeURIComponent(userCode)}`;
                }
            }
            if (!endpoint) return;

            try {
                const response = await fetch(endpoint, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!response.ok) return;
                const data = (await response.json()) as Record<string, unknown>;
                if (data.is_branding_verified !== true) return;

                const displayName =
                    typeof data.branding_display_name === "string"
                        ? data.branding_display_name
                        : typeof data.name === "string"
                          ? data.name
                          : typeof data.client_name === "string"
                            ? data.client_name
                            : null;
                const domain =
                    typeof data.branding_verified_domain === "string"
                        ? data.branding_verified_domain
                        : null;
                if (!displayName || !domain) return;

                setBranding({
                    displayName,
                    domain,
                    logoUrl:
                        typeof data.logo_url === "string"
                            ? data.logo_url
                            : null,
                    primaryColor:
                        typeof data.branding_primary_color === "string"
                            ? data.branding_primary_color
                            : "#ff7759",
                });
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    setBranding(null);
                }
            }
        };

        void load();
        return () => controller.abort();
    }, [next]);

    return branding;
}

export function VerifiedBrandBanner({
    branding,
}: {
    branding: VerifiedBranding | null;
}) {
    if (!branding) return null;

    return (
        <div
            className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
            style={{ borderTop: `4px solid ${branding.primaryColor}` }}
        >
            <div className="flex items-center gap-3">
                {branding.logoUrl ? (
                    <img
                        src={branding.logoUrl}
                        alt={`${branding.displayName} logo`}
                        className="h-11 w-11 rounded-lg border border-[var(--border)] object-contain"
                    />
                ) : (
                    <div
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold"
                        style={{
                            background: branding.primaryColor,
                            color: getContrastColor(branding.primaryColor),
                        }}
                    >
                        {branding.displayName.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--fg)]">
                        Continue to {branding.displayName}
                    </p>
                    <p className="truncate font-mono text-xs text-[var(--fg-muted)]">
                        Verified for {branding.domain}
                    </p>
                </div>
            </div>
            <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-faint)]">
                Secured by Elixpo Accounts
            </p>
        </div>
    );
}
