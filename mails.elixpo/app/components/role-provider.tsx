"use client";

import { type ReactNode, createContext, useContext } from "react";

/**
 * Active-workspace role made available to every dashboard client component, so
 * write actions can be hidden from viewers. The role is resolved live from the
 * DB in the dashboard layout (server) and passed in — it mirrors the same
 * source the API guards use, so the UI and the 403 boundary never disagree.
 */

const RANK: Record<string, number> = { owner: 3, admin: 2, writer: 1, viewer: 0 };

export interface RoleContextValue {
    role: string;
    /** writer+ — may create/edit/delete content and send. */
    canWrite: boolean;
    /** admin+ — may manage members, invites, and workspace cosmetics. */
    canManage: boolean;
    isViewer: boolean;
}

const RoleContext = createContext<RoleContextValue>({
    role: "viewer",
    canWrite: false,
    canManage: false,
    isViewer: true,
});

export function RoleProvider({ role, children }: { role: string; children: ReactNode }) {
    const rank = RANK[role] ?? 0;
    const value: RoleContextValue = {
        role,
        canWrite: rank >= RANK.writer,
        canManage: rank >= RANK.admin,
        isViewer: rank <= RANK.viewer,
    };
    return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
    return useContext(RoleContext);
}
