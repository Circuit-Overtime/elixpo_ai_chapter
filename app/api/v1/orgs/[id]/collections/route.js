export const runtime = "edge";
export const dynamic = "force-dynamic";

import { authorizeApiRequest } from "../../../../../../lib/api/v1/authorize";
import { recordApiAudit } from "../../../../../../lib/api/v1/operations";
import {
    apiError,
    apiSuccess,
    requestContext,
} from "../../../../../../lib/api/v1/responses";
const READ_SCOPE = "lixblogs:organizations:read";

function serializeCollection(row) {
    return {
        id: row.id,
        orgId: row.org_id,
        slug: row.slug,
        name: row.name,
        description: row.description || "",
        coverUrl: row.cover_r2_key || null,
        createdBy: row.created_by,
        blogCount: Number(row.blog_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function GET(request, { params }) {
    const context = requestContext();
    const authorized = await authorizeApiRequest(
        request,
        context,
        [READ_SCOPE],
        "orgs.collections.list",
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
            .prepare(
                "SELECT id, owner_id, visibility FROM orgs WHERE id = ? OR slug = ? LIMIT 1",
            )
            .bind(id, id)
            .first();
        if (!org)
            return apiError(
                context,
                "org_not_found",
                "The organization was not found.",
                404,
                { headers: rateHeaders },
            );

        const isOwner = org.owner_id === auth.userId;
        const member = await db
            .prepare(
                "SELECT role FROM org_members WHERE org_id = ? AND user_id = ?",
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

        const rows = await db
            .prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM blogs WHERE collection_id = c.id AND deleted_at IS NULL) as blog_count
      FROM collections c
      WHERE c.org_id = ?
      ORDER BY c.created_at DESC
    `)
            .bind(org.id)
            .all();

        const collections = (rows?.results || []).map(serializeCollection);

        await recordApiAudit(db, {
            requestId: context.requestId,
            userId: auth.userId,
            clientId: auth.clientId,
            action: "orgs.collections.list",
            resourceType: "org",
            resourceId: org.id,
        });

        return apiSuccess(context, collections, { headers: rateHeaders });
    } catch (error) {
        console.error(
            "[api/v1/orgs] collections list failed:",
            error?.message || error,
        );
        return apiError(
            context,
            "internal_error",
            "Collections could not be listed.",
            500,
            { headers: rateHeaders },
        );
    }
}
