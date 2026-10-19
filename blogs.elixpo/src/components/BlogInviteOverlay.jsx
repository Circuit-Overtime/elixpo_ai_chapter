"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// Renders an accept/decline modal over a blurred backdrop when the URL carries
// ?invite=<blogId> (set on blog_invite notifications). The reader page behind
// it stays mounted and is blurred by the backdrop. See GitHub issue #6 / #8.
export default function BlogInviteOverlay() {
    const { user } = useAuth();
    const [invite, setInvite] = useState(null); // { blogId, slug, title, role, status }
    const [busy, setBusy] = useState(false);
    const [showOnProfile, setShowOnProfile] = useState(true);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const blogId = new URLSearchParams(window.location.search).get(
            "invite",
        );
        if (!blogId) return;
        let active = true;
        fetch(
            `/api/blogs/draft?slugid=${encodeURIComponent(blogId)}&_t=${Date.now()}`,
        )
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!active) return;
                if (res.ok) {
                    // Already has access — drop the param, let them read/edit normally.
                    clearParam();
                } else if (data?.invite) {
                    setInvite(data.invite);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    function clearParam() {
        if (typeof window === "undefined") return;
        window.history.replaceState({}, "", window.location.pathname);
        setInvite(null);
    }

    async function accept() {
        if (!invite || busy) return;
        setBusy(true);
        try {
            const res = await fetch("/api/blogs/invite", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slugid: invite.blogId,
                    accept: true,
                    showOnProfile,
                }),
            });
            if (!res.ok) throw new Error();
            // Editors/admins go to the editor; viewers just read (now cross-posted).
            if (invite.role === "editor" || invite.role === "admin") {
                window.location.href = `/edit/${invite.slug || invite.blogId}`;
            } else {
                clearParam();
                window.location.reload();
            }
        } catch {
            setBusy(false);
        }
    }

    async function decline() {
        if (!invite || busy) return;
        setBusy(true);
        try {
            await fetch("/api/blogs/invite", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slugid: invite.blogId,
                    userId: user?.id,
                }),
            });
        } catch {
            /* best effort */
        }
        window.location.href = "/";
    }

    if (!invite) return null;
    const isPending = invite.status !== "accepted";
    const roleLabel =
        invite.role === "admin"
            ? "Admin"
            : invite.role === "editor"
              ? "Editor"
              : "Viewer";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6 bg-black/40 backdrop-blur-md">
            <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-8 text-center shadow-2xl">
                <div
                    className="w-12 h-12 mx-auto mb-5 rounded-full flex items-center justify-center"
                    style={{
                        background: "#9b7bf718",
                        border: "1px solid #9b7bf733",
                    }}
                >
                    <ion-icon
                        name="people-outline"
                        style={{ fontSize: "24px", color: "#9b7bf7" }}
                    />
                </div>
                {isPending ? (
                    <>
                        <h1 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                            Collaboration invite
                        </h1>
                        <p className="text-[var(--text-muted)] text-[14px] mb-1">
                            You've been invited to collaborate on
                        </p>
                        <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-3">
                            “{invite.title || "Untitled blog"}”
                        </p>
                        <p className="text-[var(--text-faint)] text-[13px] mb-4">
                            Role:{" "}
                            <span className="text-[#9b7bf7] font-medium">
                                {roleLabel}
                            </span>
                        </p>
                        <label className="flex items-center gap-2.5 justify-center mb-6 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showOnProfile}
                                onChange={(e) =>
                                    setShowOnProfile(e.target.checked)
                                }
                                className="w-4 h-4 accent-[#9b7bf7] cursor-pointer"
                            />
                            <span className="text-[13px] text-[var(--text-body)]">
                                Show this post on my profile
                            </span>
                        </label>
                        <div className="flex items-center gap-3 justify-center">
                            <button
                                onClick={decline}
                                disabled={busy}
                                className="px-5 py-2 rounded-full text-[13px] font-medium border border-[var(--border-default)] text-[var(--text-body)] hover:border-[var(--border-hover)] transition-colors disabled:opacity-50"
                            >
                                Decline
                            </button>
                            <button
                                onClick={accept}
                                disabled={busy}
                                className="px-5 py-2 rounded-full text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #9b7bf7 0%, #8b6ae6 100%)",
                                }}
                            >
                                {busy ? "Accepting…" : "Accept invite"}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h1 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                            View-only access
                        </h1>
                        <p className="text-[var(--text-muted)] text-[14px] mb-6">
                            You're a viewer on “{invite.title || "this blog"}”
                            and can't edit it.
                        </p>
                        <button
                            onClick={clearParam}
                            className="px-5 py-2 rounded-full text-[13px] font-semibold text-white"
                            style={{
                                background:
                                    "linear-gradient(135deg, #9b7bf7 0%, #8b6ae6 100%)",
                            }}
                        >
                            Continue reading
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
