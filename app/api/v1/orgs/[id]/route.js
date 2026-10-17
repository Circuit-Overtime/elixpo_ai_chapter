export const runtime = "edge";
export const dynamic = "force-dynamic";

import { authorizeApiRequest } from "../../../../../lib/api/v1/authorize";
import { recordApiAudit } from "../../../../../lib/api/v1/operations";
import {
    apiError,
    apiSuccess,
    requestContext,
} from "../../../../../lib/api/v1/responses";

const READ_SCOPE = "lixblogs:organizations:read";

export async function GET(request, { params }) {
    const context = requestContext();
    const authorized = await authorizeApiRequest(
        request,
        context,
        [READ_SCOPE],
        "orgs.get",
    );
    if (authorized.response) return authorized.response;
    const { auth, db, rateHeaders } = authorized;
    const { id } = await params;

    if (!id || id.length > 128) {
        return apiError(
            context,
            "invalid_org_id",
            "The organization ID is invalid.",
            400,
            { headers: rateHeaders },
        );
    }

    try {
        const org = await db
            .prepare(`
      SELECT o.*,
        (SELECT COUNT(*) FROM org_members WHERE org_id = o.id) as member_count,
        (SELECT COUNT(*) FROM collections WHERE org_id = o.id) as collection_count,
        (SELECT COUNT(*) FROM blogs WHERE published_as = 'org:' || o.id AND deleted_at IS NULL) as blog_count
      FROM orgs o
      WHERE o.id = ? OR o.slug = ?
      LIMIT 1
    `)
            .bind(id, id)
            .first();

        if (!org) {
            return apiError(
                context,
                "org_not_found",
                "The organization was not found.",
                404,
                { headers: rateHeaders },
            );
        }

        const isOwner = org.owner_id === auth.userId;
        const member = await db
            .prepare(
                "SELECT role, joined_at FROM org_members WHERE org_id = ? AND user_id = ?",
            )
            .bind(org.id, auth.userId)
            .first();

        const isMember = isOwner || Boolean(member);
        if (!isMember) {
            return apiError(
                context,
                "org_not_found",
                "The organization was not found.",
                404,
                { headers: rateHeaders },
            );
        }

        const role = isOwner ? "admin" : member?.role || "none";

        await recordApiAudit(db, {
            requestId: context.requestId,
            userId: auth.userId,
            clientId: auth.clientId,
            action: "orgs.get",
            resourceType: "org",
            resourceId: org.id,
        });

        return apiSuccess(
            context,
            {
                id: org.id,
                slug: org.slug,
                name: org.name,
                tagline: org.tagline || "",
                description: org.description || "",
                role,
                isOwner: Boolean(isOwner),
                canWrite: ["admin", "maintain", "write"].includes(role),
                memberCount: Number(org.member_count || 0),
                collectionCount: Number(org.collection_count || 0),
                blogCount: Number(org.blog_count || 0),
                visibility: org.visibility || "public",
                createdAt: org.created_at,
                updatedAt: org.updated_at,
            },
            { headers: rateHeaders },
        );
    } catch (error) {
        console.error("[api/v1/orgs] get failed:", error?.message || error);
        return apiError(
            context,
            "internal_error",
            "The organization could not be loaded.",
            500,
            { headers: rateHeaders },
        );
    }
}
