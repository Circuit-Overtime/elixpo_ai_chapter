export const runtime = "edge";
export const dynamic = "force-dynamic";

import { authorizeApiRequest } from "../../../../lib/api/v1/authorize";
import { recordApiAudit } from "../../../../lib/api/v1/operations";
import {
    apiError,
    apiSuccess,
    requestContext,
} from "../../../../lib/api/v1/responses";

const READ_SCOPE = "lixblogs:organizations:read";

function serializeOrg(row, role, isOwner) {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        tagline: row.tagline || "",
        description: row.description || "",
        role,
        isOwner: Boolean(isOwner),
        canWrite: ["admin", "maintain", "write"].includes(role),
        memberCount: Number(row.member_count || 0),
        visibility: row.visibility || "public",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function GET(request) {
    const context = requestContext();
    const authorized = await authorizeApiRequest(
        request,
        context,
        [READ_SCOPE],
        "orgs.list",
    );
    if (authorized.response) return authorized.response;
    const { auth, db, rateHeaders } = authorized;

    try {
        const owned = await db
            .prepare(`
      SELECT o.*, 'admin' as role, 1 as is_owner,
        (SELECT COUNT(*) FROM org_members WHERE org_id = o.id) as member_count
      FROM orgs o
      WHERE o.owner_id = ?
      ORDER BY o.updated_at DESC
    `)
            .bind(auth.userId)
            .all();

        const memberships = await db
            .prepare(`
      SELECT o.*, om.role, 0 as is_owner,
        (SELECT COUNT(*) FROM org_members WHERE org_id = o.id) as member_count
      FROM org_members om
      JOIN orgs o ON o.id = om.org_id
      WHERE om.user_id = ? AND o.owner_id != ?
      ORDER BY o.updated_at DESC
    `)
            .bind(auth.userId, auth.userId)
            .all();

        const ownedResults = (owned?.results || []).map((row) =>
            serializeOrg(row, "admin", true),
        );
        const memberResults = (memberships?.results || []).map((row) =>
            serializeOrg(row, row.role, false),
        );

        const orgs = [...ownedResults, ...memberResults].filter(
            (org) =>
                auth.credentialType !== "pat" ||
                auth.resourceType !== "organization" ||
                org.id === auth.organizationId,
        );

        await recordApiAudit(db, {
            requestId: context.requestId,
            userId: auth.userId,
            clientId: auth.clientId,
            action: "orgs.list",
            resourceType: "org",
        });

        return apiSuccess(context, orgs, { headers: rateHeaders });
    } catch (error) {
        console.error("[api/v1/orgs] list failed:", error?.message || error);
        return apiError(
            context,
            "internal_error",
            "Organizations could not be listed.",
            500,
            { headers: rateHeaders },
        );
    }
}
