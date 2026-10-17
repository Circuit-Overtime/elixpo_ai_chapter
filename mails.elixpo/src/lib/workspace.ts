/**
 * Workspaces — multi-member tenants with role-based access and invites.
 *
 * A user can belong to several workspaces; the session tracks the *active* one
 * and the user's role in it (see session reshape). Roles, highest → lowest:
 *   owner > admin > writer > viewer
 * A member with status 'pending' is a join request awaiting admin approval.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { base64url } from "./crypto";
import { isoDaysFromNow, newId } from "./ids";

export type Role = "owner" | "admin" | "writer" | "viewer";
export const ROLES: Role[] = ["owner", "admin", "writer", "viewer"];

const RANK: Record<Role, number> = { owner: 3, admin: 2, writer: 1, viewer: 0 };

export function normalizeRole(r: unknown): Role {
    return r === "owner" || r === "admin" || r === "writer" || r === "viewer" ? r : "viewer";
}

/** Is `role` at least `min` in the hierarchy? */
export function roleAtLeast(role: string, min: Role): boolean {
    return (RANK[normalizeRole(role)] ?? 0) >= RANK[min];
}

/** Permission gates keyed to the minimum role required. */
export const can = {
    view: (r: string) => roleAtLeast(r, "viewer"),
    editContent: (r: string) => roleAtLeast(r, "writer"), // senders/products/templates CRUD
    send: (r: string) => roleAtLeast(r, "writer"),
    manageMembers: (r: string) => roleAtLeast(r, "admin"),
    manageWorkspace: (r: string) => roleAtLeast(r, "admin"), // rename, cosmetics, invite-only
    deleteWorkspace: (r: string) => roleAtLeast(r, "owner"),
};

function lc(email: string): string {
    return email.trim().toLowerCase();
}

// ─── Members ─────────────────────────────────────────────────────────────────

export interface MemberRow {
    id: string;
    tenant_id: string;
    user_uid: string | null;
    email: string;
    name: string | null;
    avatar: string | null;
    role: string;
    status: string; // active | pending | removed
    invited_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface MemberPublic {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
    role: string;
    status: string;
    created_at: string;
}

export function memberToPublic(row: MemberRow): MemberPublic {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar ?? null,
        role: row.role,
        status: row.status,
        created_at: row.created_at,
    };
}

/**
 * Refresh a member's cached identity (name + avatar from Elixpo Accounts) from
 * a live session. Idempotent; called on login and on workspace view so the
 * members list shows a real name + photo, not just the email.
 */
export async function syncMemberIdentity(
    db: D1Database,
    tenantId: string,
    uid: string,
    email: string,
    name?: string | null,
    avatar?: string | null,
): Promise<void> {
    await db
        .prepare(
            `UPDATE workspace_members
             SET name = COALESCE(?, name),
                 avatar = COALESCE(?, avatar),
                 user_uid = COALESCE(user_uid, ?),
                 updated_at = datetime('now')
             WHERE tenant_id = ? AND (user_uid = ? OR email = ?)`,
        )
        .bind(name || null, avatar || null, uid, tenantId, uid, lc(email))
        .run();
}

export async function listMembers(db: D1Database, tenantId: string): Promise<MemberRow[]> {
    const res = await db
        .prepare(
            "SELECT * FROM workspace_members WHERE tenant_id = ? AND status != 'removed' ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'writer' THEN 2 ELSE 3 END, created_at ASC",
        )
        .bind(tenantId)
        .all();
    return (res.results || []) as unknown as MemberRow[];
}

export async function getMember(
    db: D1Database,
    tenantId: string,
    id: string,
): Promise<MemberRow | null> {
    return (await db
        .prepare("SELECT * FROM workspace_members WHERE id = ? AND tenant_id = ?")
        .bind(id, tenantId)
        .first()) as MemberRow | null;
}

/** Resolve a user's membership in a workspace (by uid, falling back to email). */
export async function getMembership(
    db: D1Database,
    tenantId: string,
    uid: string | null,
    email: string,
): Promise<MemberRow | null> {
    if (uid) {
        const byUid = (await db
            .prepare("SELECT * FROM workspace_members WHERE tenant_id = ? AND user_uid = ?")
            .bind(tenantId, uid)
            .first()) as MemberRow | null;
        if (byUid) return byUid;
    }
    return (await db
        .prepare("SELECT * FROM workspace_members WHERE tenant_id = ? AND email = ?")
        .bind(tenantId, lc(email))
        .first()) as MemberRow | null;
}

export interface WorkspaceMembership {
    tenant_id: string;
    name: string;
    slug: string | null;
    logo_url: string | null;
    role: string;
    status: string;
    owner_uid: string | null;
}

/** Every workspace a user is an ACTIVE member of (for the switcher + profile). */
export async function listWorkspacesForUser(
    db: D1Database,
    uid: string | null,
    email: string,
): Promise<WorkspaceMembership[]> {
    const res = await db
        .prepare(
            `SELECT t.id AS tenant_id, t.name, t.slug, t.logo_url, t.owner_uid, m.role, m.status
             FROM workspace_members m
             JOIN tenants t ON t.id = m.tenant_id
             WHERE m.status = 'active' AND (m.user_uid = ? OR m.email = ?)
             ORDER BY t.created_at ASC`,
        )
        .bind(uid || "", lc(email))
        .all();
    return (res.results || []) as unknown as WorkspaceMembership[];
}

export interface AddMemberInput {
    email: string;
    role: Role;
    status?: "active" | "pending";
    userUid?: string | null;
    name?: string | null;
    avatar?: string | null;
    invitedBy?: string | null;
}

export async function addMember(
    db: D1Database,
    tenantId: string,
    input: AddMemberInput,
): Promise<MemberRow> {
    const id = newId("member");
    await db
        .prepare(
            `INSERT INTO workspace_members (id, tenant_id, user_uid, email, name, avatar, role, status, invited_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(tenant_id, email) DO UPDATE SET
                role = excluded.role,
                status = excluded.status,
                user_uid = COALESCE(excluded.user_uid, workspace_members.user_uid),
                name = COALESCE(excluded.name, workspace_members.name),
                avatar = COALESCE(excluded.avatar, workspace_members.avatar),
                updated_at = datetime('now')`,
        )
        .bind(
            id,
            tenantId,
            input.userUid || null,
            lc(input.email),
            input.name || null,
            input.avatar || null,
            input.role,
            input.status || "active",
            input.invitedBy || null,
        )
        .run();
    const row = await getMembership(db, tenantId, input.userUid || null, input.email);
    if (!row) throw new Error("member insert failed");
    return row;
}

/** Attach a uid (+ name) to a member row on first sign-in. */
export async function linkMemberUid(
    db: D1Database,
    tenantId: string,
    email: string,
    uid: string,
    name?: string | null,
): Promise<void> {
    await db
        .prepare(
            "UPDATE workspace_members SET user_uid = ?, name = COALESCE(name, ?), updated_at = datetime('now') WHERE tenant_id = ? AND email = ?",
        )
        .bind(uid, name || null, tenantId, lc(email))
        .run();
}

/**
 * On login, attach the signed-in uid to membership rows keyed by email AND
 * refresh the cached name/avatar across every workspace this user belongs to.
 */
export async function linkUserToMemberships(
    db: D1Database,
    uid: string,
    email: string,
    name?: string | null,
    avatar?: string | null,
): Promise<void> {
    await db
        .prepare(
            `UPDATE workspace_members
             SET user_uid = ?,
                 name = COALESCE(?, name),
                 avatar = COALESCE(?, avatar),
                 updated_at = datetime('now')
             WHERE email = ? OR user_uid = ?`,
        )
        .bind(uid, name || null, avatar || null, lc(email), uid)
        .run();
}

export async function updateMemberRole(
    db: D1Database,
    tenantId: string,
    id: string,
    role: Role,
): Promise<void> {
    await db
        .prepare(
            "UPDATE workspace_members SET role = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND role != 'owner'",
        )
        .bind(role, id, tenantId)
        .run();
}

export async function setMemberStatus(
    db: D1Database,
    tenantId: string,
    id: string,
    status: "active" | "removed",
): Promise<void> {
    await db
        .prepare(
            "UPDATE workspace_members SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND role != 'owner'",
        )
        .bind(status, id, tenantId)
        .run();
}

export async function countActiveAdmins(db: D1Database, tenantId: string): Promise<number> {
    const r = (await db
        .prepare(
            "SELECT COUNT(*) AS n FROM workspace_members WHERE tenant_id = ? AND status = 'active' AND role IN ('owner','admin')",
        )
        .bind(tenantId)
        .first()) as { n: number } | null;
    return r?.n ?? 0;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export interface InviteRow {
    id: string;
    tenant_id: string;
    email: string | null;
    role: string;
    token: string;
    status: string;
    invited_by: string | null;
    expires_at: string | null;
    created_at: string;
}

export interface InvitePublic {
    id: string;
    email: string | null;
    role: string;
    token: string;
    status: string;
    expires_at: string | null;
    created_at: string;
}

export function inviteToPublic(row: InviteRow): InvitePublic {
    return {
        id: row.id,
        email: row.email,
        role: row.role,
        token: row.token,
        status: row.status,
        expires_at: row.expires_at,
        created_at: row.created_at,
    };
}

function newInviteToken(): string {
    return base64url(crypto.getRandomValues(new Uint8Array(24)).buffer);
}

export interface CreateInviteInput {
    email?: string | null; // null/empty = open link
    role: Role;
    invitedBy?: string | null;
    expiresDays?: number | null; // null = never expires (default 14 days)
}

export async function createInvite(
    db: D1Database,
    tenantId: string,
    input: CreateInviteInput,
): Promise<InviteRow> {
    const id = newId("invite");
    const token = newInviteToken();
    const expiresAt = input.expiresDays === null ? null : isoDaysFromNow(input.expiresDays ?? 14);
    await db
        .prepare(
            "INSERT INTO workspace_invites (id, tenant_id, email, role, token, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
            id,
            tenantId,
            input.email ? lc(input.email) : null,
            input.role,
            token,
            input.invitedBy || null,
            expiresAt,
        )
        .run();
    const row = (await db
        .prepare("SELECT * FROM workspace_invites WHERE id = ?")
        .bind(id)
        .first()) as InviteRow | null;
    if (!row) throw new Error("invite insert failed");
    return row;
}

export async function getInviteByToken(db: D1Database, token: string): Promise<InviteRow | null> {
    return (await db
        .prepare("SELECT * FROM workspace_invites WHERE token = ?")
        .bind(token)
        .first()) as InviteRow | null;
}

// ─── Single shared workspace invite link ─────────────────────────────────────
// Each workspace has at most ONE active invite link (a non-expiring open link).
// Rotating it revokes the previous token immediately, so the old URL dies.

/** The workspace's current active invite link, or null if none. */
export async function getWorkspaceLink(
    db: D1Database,
    tenantId: string,
): Promise<InviteRow | null> {
    return (await db
        .prepare(
            "SELECT * FROM workspace_invites WHERE tenant_id = ? AND status = 'pending' AND email IS NULL ORDER BY created_at DESC LIMIT 1",
        )
        .bind(tenantId)
        .first()) as InviteRow | null;
}

/** Revoke every pending invite for a workspace — old links stop working at once. */
export async function revokeWorkspaceLinks(db: D1Database, tenantId: string): Promise<void> {
    await db
        .prepare(
            "UPDATE workspace_invites SET status = 'revoked' WHERE tenant_id = ? AND status = 'pending'",
        )
        .bind(tenantId)
        .run();
}

/** Generate a fresh link, invalidating any previous one. */
export async function rotateWorkspaceLink(
    db: D1Database,
    tenantId: string,
    role: Role,
    invitedBy?: string | null,
): Promise<InviteRow> {
    await revokeWorkspaceLinks(db, tenantId);
    return createInvite(db, tenantId, { email: null, role, invitedBy, expiresDays: null });
}

/** Return the active link, creating one (with the given role) if none exists. */
export async function ensureWorkspaceLink(
    db: D1Database,
    tenantId: string,
    role: Role,
    invitedBy?: string | null,
): Promise<InviteRow> {
    const existing = await getWorkspaceLink(db, tenantId);
    if (existing) return existing;
    return createInvite(db, tenantId, { email: null, role, invitedBy, expiresDays: null });
}

/** Change the role granted by the active link, keeping the same token. */
export async function setWorkspaceLinkRole(
    db: D1Database,
    tenantId: string,
    role: Role,
): Promise<void> {
    await db
        .prepare(
            "UPDATE workspace_invites SET role = ? WHERE tenant_id = ? AND status = 'pending' AND email IS NULL",
        )
        .bind(role, tenantId)
        .run();
}

export interface AcceptResult {
    ok: boolean;
    tenantId?: string;
    pending?: boolean; // true → join request awaiting approval
    error?: "invalid" | "expired" | "revoked" | "email_mismatch";
}

/**
 * Accept an invite link. Email-specific invites that match the signed-in email
 * join immediately (active). Open links (no email) create a PENDING member — a
 * join request the admin approves. Returns whether the result is pending.
 */
export async function acceptInvite(
    db: D1Database,
    token: string,
    uid: string,
    email: string,
    name?: string | null,
    avatar?: string | null,
): Promise<AcceptResult> {
    const inv = await getInviteByToken(db, token);
    if (!inv) return { ok: false, error: "invalid" };
    if (inv.status !== "pending") return { ok: false, error: "revoked" };
    if (
        inv.expires_at &&
        inv.expires_at < new Date().toISOString().replace("T", " ").slice(0, 19)
    ) {
        return { ok: false, error: "expired" };
    }
    if (inv.email && inv.email !== lc(email)) {
        return { ok: false, error: "email_mismatch" };
    }

    const role = normalizeRole(inv.role);
    const direct = Boolean(inv.email); // email-specific invite = trusted → active
    await addMember(db, inv.tenant_id, {
        email,
        role,
        status: direct ? "active" : "pending",
        userUid: uid,
        name: name || null,
        avatar: avatar || null,
        invitedBy: inv.invited_by,
    });
    // Email-specific invites are single-use.
    if (inv.email) {
        await db
            .prepare("UPDATE workspace_invites SET status = 'accepted' WHERE id = ?")
            .bind(inv.id)
            .run();
    }
    return { ok: true, tenantId: inv.tenant_id, pending: !direct };
}

// ─── Workspace identity / cosmetics ─────────────────────────────────────────

export interface WorkspaceUpdate {
    name?: string;
    slug?: string;
    description?: string | null;
    logoUrl?: string | null;
}

export async function updateWorkspace(
    db: D1Database,
    tenantId: string,
    update: WorkspaceUpdate,
): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (update.name !== undefined) {
        sets.push("name = ?");
        vals.push(update.name.trim() || "Workspace");
    }
    if (update.slug !== undefined) {
        sets.push("slug = ?");
        vals.push(update.slug);
    }
    if (update.description !== undefined) {
        sets.push("description = ?");
        vals.push(update.description?.trim() || null);
    }
    if (update.logoUrl !== undefined) {
        sets.push("logo_url = ?");
        vals.push(update.logoUrl?.trim() || null);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    vals.push(tenantId);
    await db
        .prepare(`UPDATE tenants SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...vals)
        .run();
}

export function slugifyWorkspace(s: string): string {
    // Collapse every run of non-alphanumerics into a single dash.
    const collapsed = s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // Trim leading/trailing dashes with a linear scan rather than a regex like
    // /^-+|-+$/ — the `-+$` branch backtracks quadratically on long dash runs
    // (CodeQL: polynomial regex on uncontrolled data).
    let start = 0;
    let end = collapsed.length;
    while (start < end && collapsed.charCodeAt(start) === 45 /* '-' */) start++;
    while (end > start && collapsed.charCodeAt(end - 1) === 45) end--;
    return collapsed.slice(start, end).slice(0, 40) || "workspace";
}

export interface WorkspaceInfo {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
    logo_url: string | null;
    owner_uid: string | null;
}

export async function getWorkspaceInfo(
    db: D1Database,
    tenantId: string,
): Promise<WorkspaceInfo | null> {
    return (await db
        .prepare(
            "SELECT id, name, slug, description, logo_url, owner_uid FROM tenants WHERE id = ?",
        )
        .bind(tenantId)
        .first()) as WorkspaceInfo | null;
}

export async function getWorkspaceBySlug(
    db: D1Database,
    slug: string,
): Promise<WorkspaceInfo | null> {
    return (await db
        .prepare(
            "SELECT id, name, slug, description, logo_url, owner_uid FROM tenants WHERE slug = ?",
        )
        .bind(slug)
        .first()) as WorkspaceInfo | null;
}

export async function getTenantBySlug(
    db: D1Database,
    slug: string,
): Promise<{ id: string } | null> {
    return (await db.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first()) as {
        id: string;
    } | null;
}

/** A workspace slug unique across tenants. */
export async function uniqueSlug(db: D1Database, base: string): Promise<string> {
    const root = slugifyWorkspace(base);
    for (let i = 0; i < 5; i++) {
        const candidate = i === 0 ? root : `${root}-${crypto.randomUUID().slice(0, 4)}`;
        const hit = await getTenantBySlug(db, candidate);
        if (!hit) return candidate;
    }
    return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}
