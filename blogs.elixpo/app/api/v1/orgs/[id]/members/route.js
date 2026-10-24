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

function serializeMember(row) {
    return {
        userId: row.id,
        username: row.username,
        displayName: row.display_name || row.username,
        role: row.is_owner ? "admin" : row.role,
        isOwner: Boolean(row.is_owner),
        avatarUrl: row.avatar_url || null,
        joinedAt: row.joined_at,
    };
}

export async function GET(request, { params }) {
    const context = requestContext();
    const authorized = await authorizeApiRequest(
        request,
        context,
        [READ_SCOPE],
        "orgs.members.list",
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
      SELECT u.id, u.username, u.display_name, u.avatar_url, om.role, om.joined_at,
        CASE WHEN o.owner_id = u.id THEN 1 ELSE 0 END as is_owner
      FROM org_members om
      JOIN users u ON u.id = om.user_id
      JOIN orgs o ON o.id = om.org_id
      WHERE om.org_id = ?
      ORDER BY is_owner DESC, om.joined_at ASC
    `)
            .bind(org.id)
            .all();

        const members = (rows?.results || []).map(serializeMember);

        await recordApiAudit(db, {
            requestId: context.requestId,
            userId: auth.userId,
            clientId: auth.clientId,
            action: "orgs.members.list",
            resourceType: "org",
            resourceId: org.id,
        });

        return apiSuccess(context, members, { headers: rateHeaders });
    } catch (error) {
        console.error(
            "[api/v1/orgs] members list failed:",
            error?.message || error,
        );
        return apiError(
            context,
            "internal_error",
            "Members could not be listed.",
            500,
            { headers: rateHeaders },
        );
    }
}
