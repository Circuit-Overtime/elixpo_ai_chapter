import type { D1Database } from "@cloudflare/workers-types";

export const BRANDING_REQUIRED_AFTER_SIGN_INS = 20;

export function requiresBrandingVerification(
    signIns: number,
    verified: boolean,
    platformOwned = false,
): boolean {
    return (
        !platformOwned &&
        signIns > BRANDING_REQUIRED_AFTER_SIGN_INS &&
        !verified
    );
}

export function isPlatformHomepage(
    homepageUrl: string | null | undefined,
): boolean {
    if (!homepageUrl) return false;
    try {
        const hostname = new URL(homepageUrl).hostname.toLowerCase();
        return hostname === "elixpo.com" || hostname.endsWith(".elixpo.com");
    } catch {
        return false;
    }
}

export async function getBrandingGate(
    db: D1Database,
    clientId: string,
): Promise<{
    signIns: number;
    verified: boolean;
    verificationRequired: boolean;
}> {
    const result = await db
        .prepare(
            `SELECT oc.is_branding_verified AS verified, oc.homepage_url,
                    COUNT(rt.id) AS sign_ins
             FROM oauth_clients oc
             LEFT JOIN refresh_tokens rt
               ON rt.client_id = oc.client_id
              AND rt.parent_token_hash IS NULL
             WHERE oc.client_id = ?
             GROUP BY oc.client_id, oc.is_branding_verified, oc.homepage_url`,
        )
        .bind(clientId)
        .first<{
            verified: number;
            homepage_url: string | null;
            sign_ins: number;
        }>();
    const signIns = result?.sign_ins ?? 0;
    const verified = result?.verified === 1;
    return {
        signIns,
        verified,
        verificationRequired: requiresBrandingVerification(
            signIns,
            verified,
            isPlatformHomepage(result?.homepage_url),
        ),
    };
}
