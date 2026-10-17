/**
 * New-device sign-in alert dispatcher.
 *
 * Fires `sign_in_device` mail when a successful login arrives from an
 * (IP, UA) pair we haven't seen for this user in the last 24h. KV holds
 * the fingerprint set per user; entries auto-expire so the throttle
 * self-cleans without a cron.
 *
 * Quiet-by-default policy: legitimate users on a stable network see ONE
 * alert per unique (IP, UA), never spammed on subsequent logins from the
 * same fingerprint. A new device or coffee-shop IP triggers a fresh
 * alert — the signal the user actually cares about.
 *
 * Fire-and-forget: login flows must not 500 if mails.elixpo is
 * unreachable or KV is hiccupping.
 */

import { getRequestContext } from "@cloudflare/next-on-pages";
import { sendMail } from "./mails";

const THROTTLE_SECONDS = 24 * 60 * 60; // 24h per (user, IP, UA)

// Hash the fingerprint so we don't put raw IPs/UAs in KV keys (privacy
// hygiene — KV keys are operational data, not log data).
async function fingerprintKey(
    userId: string,
    ip: string,
    ua: string,
): Promise<string> {
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${ip}|${ua}`),
    );
    const arr = new Uint8Array(buf);
    let hex = "";
    for (const b of arr) hex += b.toString(16).padStart(2, "0");
    return `signin:${userId}:${hex.slice(0, 32)}`;
}

interface NotifyArgs {
    userId: string;
    email: string;
    displayName: string | null;
    ipAddress: string;
    userAgent: string;
    location?: string | null; // optional geo lookup; not gated
}

export async function notifyNewDeviceSignIn(args: NotifyArgs): Promise<void> {
    const { userId, email, displayName, ipAddress, userAgent } = args;
    if (!ipAddress || !userAgent) return; // can't fingerprint, skip silently

    try {
        const ctx = getRequestContext();
        const kv = (ctx.env as any).KV as KVNamespace;

        const key = await fingerprintKey(userId, ipAddress, userAgent);
        const seen = await kv.get(key);
        if (seen) return; // already alerted for this fingerprint in the window

        // Mark BEFORE sending so two parallel logins from the same device
        // don't both fire. Race acceptable here: at worst one duplicate.
        await kv.put(key, "1", { expirationTtl: THROTTLE_SECONDS });

        const APP_URL =
            process.env.NEXT_PUBLIC_APP_URL || "https://accounts.elixpo.com";

        await sendMail("sign_in_device", email, {
            name: displayName || email.split("@")[0],
            device: shortUA(userAgent),
            location: args.location || "Unknown",
            ip_address: ipAddress,
            time: new Date().toUTCString(),
            dashboard_url: `${APP_URL}/dashboard/profile`,
        });
    } catch (err) {
        console.error(
            "[sign-in-alert] notifyNewDeviceSignIn failed:",
            err instanceof Error ? err.message : err,
        );
    }
}

// Best-effort short UA — full strings are useless in an email body.
// Pulls out the browser + OS family if we can spot them, else first 80 chars.
function shortUA(ua: string): string {
    const browsers = [
        ["Edg/", "Edge"],
        ["OPR/", "Opera"],
        ["Chrome/", "Chrome"],
        ["Firefox/", "Firefox"],
        ["Safari/", "Safari"],
    ] as const;
    let browser = "Unknown browser";
    for (const [token, name] of browsers) {
        if (ua.includes(token)) {
            browser = name;
            break;
        }
    }
    let os = "Unknown OS";
    if (/iPhone|iPad/.test(ua)) os = "iOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Linux/.test(ua)) os = "Linux";
    return `${browser} on ${os}`;
}
