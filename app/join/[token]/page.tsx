export const runtime = "edge";

import { getDatabase } from "@/lib/d1-client";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { getInviteByToken, getWorkspaceInfo } from "@/lib/workspace";
import { Box } from "@mui/material";
import { cookies } from "next/headers";
import { JoinInviteClient } from "../../components/join-invite-client";

export default async function JoinInvitePage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;

    const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = await verifySession(sessionToken);
    const signedIn = session !== null;

    const db = await getDatabase();
    const invite = await getInviteByToken(db, token);

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const expired = Boolean(invite?.expires_at && invite.expires_at < now);
    const valid = invite !== null && invite.status === "pending" && !expired;

    let workspaceName: string | null = null;
    let workspaceLogo: string | null = null;

    if (invite && invite.status === "pending") {
        const ws = await getWorkspaceInfo(db, invite.tenant_id);
        workspaceName = ws?.name ?? null;
        workspaceLogo = ws?.logo_url ?? null;
    }

    const role = invite?.role ?? null;
    const isOpenLink = invite ? invite.email === null : false;
    const loginHref = `/login?next=${encodeURIComponent(`/join/${token}`)}`;

    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 3,
            }}
        >
            <JoinInviteClient
                token={token}
                signedIn={signedIn}
                valid={valid}
                workspaceName={workspaceName}
                workspaceLogo={workspaceLogo}
                role={role}
                isOpenLink={isOpenLink}
                loginHref={loginHref}
            />
        </Box>
    );
}
