/**
 * Cloudinary image hosting for template media. lixeditor would otherwise inline
 * images as base64 `data:` URLs, which email clients strip and which bloat the
 * document. We host them instead and serve an `f_auto,q_auto` (auto format +
 * quality, width-capped) delivery URL so emails ship small, optimized images.
 *
 * Uploads are signed server-side (api_secret never reaches the client). Assets
 * land under a `mail-elixpo/<tenant>` folder so they're identifiable as coming
 * from the mail service. Edge-safe (Web Crypto, FormData, fetch).
 */

import type { D1Database } from "@cloudflare/workers-types";
import { toHex } from "./crypto";
import { getEnv } from "./env";

export interface CloudinaryConfig {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
}

/** Resolve Cloudinary creds from env, or null if not configured. */
export async function cloudinaryConfig(): Promise<CloudinaryConfig | null> {
    const [cloudName, apiKey, apiSecret] = await Promise.all([
        getEnv("CLOUDINARY_CLOUD_NAME"),
        getEnv("CLOUDINARY_API_KEY"),
        getEnv("CLOUDINARY_API_SECRET"),
    ]);
    if (!cloudName || !apiKey || !apiSecret) return null;
    return { cloudName, apiKey, apiSecret };
}

async function sha1Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
    return toHex(digest);
}

/**
 * Insert delivery transformations into a Cloudinary secure URL: auto format +
 * quality, capped to a sane email width (never upscales).
 */
export function compressedUrl(
    secureUrl: string,
    transform = "f_auto,q_auto,w_1400,c_limit",
): string {
    return secureUrl.replace("/image/upload/", `/image/upload/${transform}/`);
}

export interface UploadResult {
    url: string; // transformed (compressed) delivery URL — use this in emails
    secureUrl: string; // original Cloudinary URL
    publicId: string;
    bytes: number;
    format: string;
}

/** Signed upload of an image File to Cloudinary under the given folder. */
export async function uploadImage(
    cfg: CloudinaryConfig,
    file: File,
    folder: string,
): Promise<UploadResult> {
    const timestamp = Math.floor(Date.now() / 1000);
    // Prefix every asset with ml_lix_ so mail-service uploads are identifiable
    // in the Cloudinary account.
    const publicId = `ml_lix_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    // Cloudinary signs every param except file/api_key/cloud_name/resource_type,
    // sorted alphabetically, joined with `&`, then the api_secret appended.
    const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
    const signature = await sha1Hex(`${toSign}${cfg.apiSecret}`);

    const form = new FormData();
    form.append("file", file, file.name || "upload");
    form.append("api_key", cfg.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("folder", folder);
    form.append("public_id", publicId);
    form.append("signature", signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
        method: "POST",
        body: form,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !data?.secure_url) {
        throw new Error(data?.error?.message || `cloudinary upload failed (${res.status})`);
    }
    return {
        url: compressedUrl(data.secure_url),
        secureUrl: data.secure_url,
        publicId: data.public_id,
        bytes: Number(data.bytes) || 0,
        format: data.format,
    };
}

// ─── Orphan cleanup (delete unreferenced images to keep storage tight) ───────

const CLOUDINARY_URL_RE = /https?:\/\/res\.cloudinary\.com\/[^\s"'()<>]+/g;

/**
 * Recover the Cloudinary public_id from a delivery URL, stripping the
 * transformation segment, version, and file extension. Returns null for
 * non-Cloudinary URLs.
 */
export function publicIdFromUrl(url: string): string | null {
    const m = url.match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(.+)$/);
    if (!m) return null;
    const path = m[1].split(/[?#]/)[0];
    const segs = path.split("/");
    // Drop leading transformation (has a comma or looks like key_value) and
    // version (vNNN) segments until we reach the real folder path.
    while (segs.length > 1) {
        const s = segs[0];
        if (/^v\d+$/.test(s) || s.includes(",") || /^[a-z]+_[^/]+$/.test(s)) segs.shift();
        else break;
    }
    const id = segs.join("/").replace(/\.[A-Za-z0-9]+$/, "");
    return id || null;
}

/** Public_ids of OUR uploaded images (ml_lix_ prefix) referenced in some HTML. */
export function extractCloudinaryPublicIds(html: string | null | undefined): string[] {
    if (!html) return [];
    const ids = new Set<string>();
    for (const url of html.match(CLOUDINARY_URL_RE) || []) {
        const id = publicIdFromUrl(url);
        // Only ever consider assets we created — never a foreign Cloudinary URL
        // a user may have embedded.
        if (id?.includes("ml_lix_")) ids.add(id);
    }
    return [...ids];
}

/** Delete one asset from Cloudinary (signed). Treats "not found" as success. */
export async function destroyImage(cfg: CloudinaryConfig, publicId: string): Promise<boolean> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sha1Hex(`public_id=${publicId}&timestamp=${timestamp}${cfg.apiSecret}`);
    const form = new FormData();
    form.append("public_id", publicId);
    form.append("timestamp", String(timestamp));
    form.append("api_key", cfg.apiKey);
    form.append("signature", signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/destroy`, {
        method: "POST",
        body: form,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    return data?.result === "ok" || data?.result === "not found";
}

/**
 * Delete a single image by its delivery URL (e.g. a replaced/removed product
 * logo). Only touches our own `ml_lix_` assets; no-ops when not configured.
 */
export async function destroyImageByUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const id = publicIdFromUrl(url);
    if (!id || !id.includes("ml_lix_")) return;
    const cfg = await cloudinaryConfig();
    if (!cfg) return;
    try {
        await destroyImage(cfg, id);
    } catch {
        /* never fail the caller for a cleanup hiccup */
    }
}

export interface CleanupOpts {
    /** HTML before the change (the previously-saved content). */
    previousHtml?: string | null;
    /** HTML after the change (what we just saved). */
    newHtml?: string | null;
    /** URLs uploaded during this edit session (catches upload-then-remove). */
    sessionUrls?: string[];
    /** Template being saved/deleted — excluded from the "referenced elsewhere" guard. */
    keepTemplateId?: string | null;
}

/**
 * Delete images that were referenced before (or uploaded this session) but are
 * NOT in the new content — unless another template still references them. Safe
 * to call on every save/delete; no-ops when Cloudinary isn't configured.
 * Returns the number of assets deleted.
 */
export async function cleanupOrphanImages(
    db: D1Database,
    tenantId: string,
    opts: CleanupOpts,
): Promise<number> {
    const cfg = await cloudinaryConfig();
    if (!cfg) return 0;

    const candidates = new Set<string>(extractCloudinaryPublicIds(opts.previousHtml));
    for (const url of opts.sessionUrls || []) {
        const id = publicIdFromUrl(url);
        if (id?.includes("ml_lix_")) candidates.add(id);
    }
    const keep = new Set(extractCloudinaryPublicIds(opts.newHtml));
    const removed = [...candidates].filter((id) => !keep.has(id));
    if (removed.length === 0) return 0;

    let deleted = 0;
    for (const id of removed) {
        // Never delete an asset another of the tenant's templates still uses.
        const sql = opts.keepTemplateId
            ? "SELECT 1 FROM templates WHERE tenant_id = ? AND id != ? AND content_html LIKE ? LIMIT 1"
            : "SELECT 1 FROM templates WHERE tenant_id = ? AND content_html LIKE ? LIMIT 1";
        const binds = opts.keepTemplateId
            ? [tenantId, opts.keepTemplateId, `%${id}%`]
            : [tenantId, `%${id}%`];
        const ref = await db
            .prepare(sql)
            .bind(...binds)
            .first();
        if (ref) continue;
        try {
            if (await destroyImage(cfg, id)) deleted++;
        } catch {
            /* a Cloudinary hiccup must never fail the save */
        }
    }
    return deleted;
}
