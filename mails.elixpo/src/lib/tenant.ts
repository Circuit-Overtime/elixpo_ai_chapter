/**
 * Tenant resolution for the dashboard. Every SSO user maps to exactly one
 * tenant (their business). The first user matching ELIXPO_MAIL_OWNER_EMAIL
 * claims the seeded first-party Elixpo tenant; everyone else gets a fresh
 * tenant they can onboard senders/templates under — the multi-tenant SaaS path.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { getEnv } from "./env";
import { newId } from "./ids";
import { addMember } from "./workspace";

export interface TenantRow {
    id: string;
    name: string;
    email: string | null;
    owner_uid: string | null;
    status: string;
}

/** Fetch a tenant by id (or null). */
export async function getTenant(db: D1Database, id: string): Promise<TenantRow | null> {
    return (await db
        .prepare("SELECT * FROM tenants WHERE id = ?")
        .bind(id)
        .first()) as TenantRow | null;
}

export async function getOrBootstrapTenant(
    db: D1Database,
    uid: string,
    email: string,
    name?: string,
): Promise<TenantRow> {
    // 1. Already linked?
    const existing = (await db
        .prepare("SELECT * FROM tenants WHERE owner_uid = ?")
        .bind(uid)
        .first()) as TenantRow | null;
    if (existing) return existing;

    // 2. First-party owner claims the seeded Elixpo tenant if it's unclaimed.
    const ownerEmail = (await getEnv("ELIXPO_MAIL_OWNER_EMAIL"))?.toLowerCase();
    if (ownerEmail && email.toLowerCase() === ownerEmail) {
        const elixpo = (await db
            .prepare("SELECT * FROM tenants WHERE id = 'tenant_elixpo'")
            .first()) as TenantRow | null;
        if (elixpo && !elixpo.owner_uid) {
            await db
                .prepare(
                    "UPDATE tenants SET owner_uid = ?, email = COALESCE(email, ?), updated_at = datetime('now') WHERE id = 'tenant_elixpo'",
                )
                .bind(uid, email)
                .run();
            await ensureOwnerMember(db, "tenant_elixpo", uid, email, name);
            return { ...elixpo, owner_uid: uid };
        }
    }

    // 3. Fresh tenant for a new business.
    const id = newId("tenant");
    const tenantName = name || email.split("@")[0] || "New tenant";
    await db
        .prepare(
            "INSERT INTO tenants (id, name, email, owner_uid, status, slug) VALUES (?, ?, ?, ?, 'active', ?)",
        )
        .bind(id, tenantName, email, uid, id)
        .run();
    await ensureOwnerMember(db, id, uid, email, name);
    return { id, name: tenantName, email, owner_uid: uid, status: "active" };
}

/** Make sure the workspace owner has an `owner` membership row (idempotent). */
async function ensureOwnerMember(
    db: D1Database,
    tenantId: string,
    uid: string,
    email: string,
    name?: string,
): Promise<void> {
    await addMember(db, tenantId, {
        email,
        role: "owner",
        status: "active",
        userUid: uid,
        name: name || null,
    });
}
