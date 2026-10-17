"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSeasonalTheme } from "../themes/seasonal/SeasonalThemeProvider";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "../styles/editor/editor.css";
import "../styles/katex-fonts.css";
import { readTimeFromWords } from "../../lib/readTime";
import { useCollaboration } from "../hooks/useCollaboration";
import { IMAGE_ACCEPT_ATTR, isAllowedImage } from "../utils/allowedImageTypes";
import { extractMermaidFences } from "../utils/markdownMermaid";
import {
    createMediaUploadId,
    enqueueMediaUpload,
    MEDIA_UPLOAD_EVENT,
    resumeMediaUpload,
} from "../utils/mediaUploadQueue";
import { generateBlogBanner, generatePixelAvatar } from "../utils/pixelAvatar";
import ContextualTipToast, { emitContextualTip } from "../components/ContextualTipToast";

function escapeExportHtml(value) {
    return String(value || "").replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;",
            })[character],
    );
}

function versionLabel(label) {
    return (
        {
            published: "Published",
            autosave: "Editor save",
            "cli-edit": "CLI edit",
            "pre-restore": "Before restore",
            "pre-cli-restore": "Before CLI restore",
        }[label] || "Saved version"
    );
}

function AvatarImg({ src, name, size = 32 }) {
    const [failed, setFailed] = useState(false);
    const avatarSrc = src && !failed ? src : generatePixelAvatar(name || "lixblogs-user");
    return (
        <img
            src={avatarSrc}
            alt=""
            className="rounded-full object-cover"
            style={{ width: size, height: size }}
            onError={() => setFailed(true)}
        />
    );
}

function BufferedSlugInput({ value, disabled, onCommit, onDraftChange }) {
    const [draft, setDraft] = useState(value || "");
    const timerRef = useRef(null);

    useEffect(() => setDraft(value || ""), [value]);
    useEffect(() => () => clearTimeout(timerRef.current), []);

    const normalize = (next) =>
        next
            .toLowerCase()
            .replace(/[^\w-]+/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 60);
    const commit = (next) => {
        clearTimeout(timerRef.current);
        onCommit(normalize(next));
    };

    return (
        <input
            type="text"
            value={draft}
            disabled={disabled}
            onChange={(event) => {
                const next = normalize(event.target.value);
                setDraft(next);
                onDraftChange?.(next);
                clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => onCommit(next), 250);
            }}
            onBlur={() => commit(draft)}
            className="flex-1 min-w-0 bg-transparent outline-none disabled:cursor-not-allowed"
            style={{ color: "var(--text-primary)" }}
            placeholder="my-post"
        />
    );
}

function BufferedTagInput({ onAdd }) {
    const [value, setValue] = useState("");
    return (
        <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (onAdd(value)) setValue("");
            }}
            placeholder="Add a tag, press Enter..."
            className="w-full rounded-lg px-3 py-2 outline-none text-[13px] transition-colors"
            style={{
                backgroundColor: "var(--input-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--input-border)",
            }}
        />
    );
}

const BlockNoteEditor = dynamic(
    () => import("../components/Editor/BlogEditor"),
    { ssr: false },
);

const BlogPreview = dynamic(() => import("../components/Editor/BlogPreview"), {
    ssr: false,
});

const BlogCodeView = dynamic(
    () => import("../components/Editor/BlogCodeView"),
    { ssr: false },
);

const ImageCropModal = dynamic(() => import("../components/ImageCropModal"), {
    ssr: false,
});

const EmojiPicker = dynamic(() => import("../components/Editor/EmojiPicker"), {
    ssr: false,
});

const KeyboardShortcutsModal = dynamic(
    () => import("../components/Editor/KeyboardShortcutsModal"),
    { ssr: false },
);

const CollaboratorPanel = dynamic(
    () => import("../components/Editor/CollaboratorPanel"),
    { ssr: false },
);

const STORAGE_KEY_PREFIX = "lixblogs_draft_";

function getDraftKey(slugid) {
    return STORAGE_KEY_PREFIX + (slugid || "new");
}

function serializedContentSize(content) {
    if (typeof content === "string") return content.length;
    try {
        return JSON.stringify(content || []).length;
    } catch {
        return 0;
    }
}

function loadDraft(slugid) {
    try {
        const raw = localStorage.getItem(getDraftKey(slugid));
        if (!raw) return null;
        const draft = JSON.parse(raw);
        return { ...draft, coverPreview: persistableCover(draft.coverPreview) };
    } catch {
        return null;
    }
}

function saveDraft(slugid, data) {
    try {
        // Clear any other draft keys to keep only one draft in localStorage
        const currentKey = getDraftKey(slugid);
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (
                key &&
                key.startsWith(STORAGE_KEY_PREFIX) &&
                key !== currentKey
            ) {
                localStorage.removeItem(key);
            }
        }
        localStorage.setItem(
            currentKey,
            JSON.stringify({
                ...data,
                // Object URLs only exist in the current tab. Persisting one makes the
                // cover render as its alt text ("Cover") after the browser reloads.
                coverPreview: persistableCover(data.coverPreview),
                savedAt: Date.now(),
            }),
        );
    } catch {
        /* storage full */
    }
}

function persistableCover(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

function generateBlogId() {
    // Short 8-char alphanumeric ID
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < 8; i++)
        id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function truncateSlug(s, max = 18) {
    return s && s.length > max ? s.slice(0, max) + "..." : s;
}

// Fixed elements inherit transformed ancestors as their containing block. The
// editor uses transforms for transitions, so overlays belong directly in body.
function ViewportPortal({ children }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted ? createPortal(children, document.body) : null;
}

// ── Confirm Modal ──
function EditorConfirmModal({
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    thirdActionLabel,
    onThirdAction,
    onConfirm,
    onCancel,
    destructive = false,
    isConfirmLoading = false,
}) {
    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape" && !isConfirmLoading) onCancel();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onCancel, isConfirmLoading]);

    return (
        <ViewportPortal>
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center px-4 editor-confirm-overlay"
                onClick={() => !isConfirmLoading && onCancel()}
            >
                <div
                    className={`w-full ${thirdActionLabel ? "max-w-lg" : "max-w-sm"} rounded-2xl p-6 editor-confirm-dialog`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-3 mb-3">
                        {destructive ? (
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: "rgba(239,68,68,0.12)" }}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#ef4444"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                            </div>
                        ) : (
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: "rgba(155,123,247,0.12)" }}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#9b7bf7"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                </svg>
                            </div>
                        )}
                        <h3
                            className="text-[15px] font-semibold"
                            style={{ color: "var(--text-primary)" }}
                        >
                            {title}
                        </h3>
                    </div>
                    <p
                        className="text-[13px] leading-relaxed mb-5"
                        style={{
                            color: "var(--text-muted)",
                            paddingLeft: "44px",
                        }}
                    >
                        {description}
                    </p>
                    <div className="flex flex-col sm:flex-row sm:flex-nowrap sm:items-center gap-3 sm:justify-end">
                        {thirdActionLabel && (
                            <button
                                onClick={onThirdAction}
                                disabled={isConfirmLoading}
                                className="w-full sm:w-auto px-4 py-2 rounded-lg text-[13px] font-medium transition-colors editor-confirm-cancel sm:mr-auto hover:text-red-500"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {thirdActionLabel}
                            </button>
                        )}
                        <button
                            onClick={onCancel}
                            disabled={isConfirmLoading}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg text-[13px] font-medium transition-colors editor-confirm-cancel"
                            style={{ opacity: isConfirmLoading ? 0.5 : 1 }}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isConfirmLoading}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2"
                            style={{
                                backgroundColor: destructive
                                    ? "#ef4444"
                                    : "#9b7bf7",
                                opacity: isConfirmLoading ? 0.7 : 1,
                            }}
                        >
                            {isConfirmLoading ? "Saving..." : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </ViewportPortal>
    );
}

// ── Profile Dropdown (header) ──
function HeaderProfileDropdown({ user, logout }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    const initial = (user.display_name ||
        user.username ||
        "?")[0].toUpperCase();

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="rounded-full hover:ring-2 hover:ring-[var(--border-default)] transition-all"
            >
                <AvatarImg
                    src={user.avatar_url}
                    name={user.display_name || user.username}
                    size={32}
                />
            </button>
            {open && (
                <div
                    className="absolute right-0 top-full mt-2 w-[240px] rounded-xl shadow-2xl z-50 overflow-hidden"
                    style={{
                        backgroundColor: "var(--dropdown-bg)",
                        border: "1px solid var(--dropdown-border)",
                    }}
                >
                    <Link
                        href="/profile"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <AvatarImg
                            src={user.avatar_url}
                            name={user.display_name || user.username}
                            size={36}
                        />
                        <div className="min-w-0">
                            <p className="text-[13px] text-[var(--text-primary)] font-semibold truncate">
                                {user.display_name || user.username}
                            </p>
                            <p className="text-[11px] text-[#9b7bf7]">
                                View profile
                            </p>
                        </div>
                    </Link>
                    <div className="h-px bg-[var(--bg-elevated)]" />
                    <div className="py-1">
                        <Link
                            href="/stories"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <ion-icon
                                name="book-outline"
                                style={{ fontSize: "16px", color: "#888" }}
                            />
                            Your Stories
                        </Link>
                        <Link
                            href="/settings/stats"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <ion-icon
                                name="stats-chart-outline"
                                style={{ fontSize: "16px", color: "#888" }}
                            />
                            Stats
                        </Link>
                        <Link
                            href="/settings"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <ion-icon
                                name="settings-outline"
                                style={{ fontSize: "16px", color: "#888" }}
                            />
                            Settings
                        </Link>
                    </div>
                    <div className="h-px bg-[var(--bg-elevated)]" />
                    <div className="py-1">
                        <button
                            onClick={() => {
                                setOpen(false);
                                logout();
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <ion-icon
                                name="log-out-outline"
                                style={{ fontSize: "16px", color: "#888" }}
                            />
                            Sign out
                        </button>
                        <p className="px-4 pb-1.5 text-[10px] text-[var(--text-muted)] truncate">
                            {user.email}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Hamburger Menu ──
function HamburgerMenu({
    onShareDraft,
    onCopyBlogId,
    onChangeCover,
    onChangeTitle,
    onChangeTopics,
    onRevisionHistory,
    onMoreSettings,
    onImport,
    onInvite,
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        function handleClickOutside(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        if (open) document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    const items = [
        {
            label: "Import markdown",
            action: onImport,
            icon: "folder-open-outline",
        },
        {
            label: "Invite collaborators",
            action: onInvite,
            icon: "people-outline",
        },
        {
            label: "Copy publishable link",
            action: onShareDraft,
            icon: "link-outline",
        },
        {
            label: "Copy blog ID",
            action: onCopyBlogId,
            icon: "copy-outline",
        },
        {
            label: "Change featured image",
            action: onChangeCover,
            icon: "image-outline",
        },
        {
            label: "Change display title",
            action: onChangeTitle,
            icon: "text-outline",
        },
        {
            label: "Change topics",
            action: onChangeTopics,
            icon: "pricetags-outline",
        },
        {
            label: "More settings",
            action: onMoreSettings,
            icon: "options-outline",
        },
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="h-8 w-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center hover:border-[var(--border-hover)] transition-colors"
                style={{ color: "var(--text-primary)" }}
                title="More options"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                </svg>
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 w-[260px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl z-50 overflow-hidden">
                    {/* Menu caret */}
                    <div className="absolute -top-[6px] right-3 w-3 h-3 bg-[var(--bg-surface)] border-l border-t border-[var(--border-default)] rotate-45" />
                    <div className="py-1.5 relative">
                        {items.map((item) => (
                            <button
                                key={item.label}
                                onClick={() => {
                                    item.action?.();
                                    setOpen(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                                <ion-icon
                                    name={item.icon}
                                    style={{ fontSize: "15px" }}
                                />
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="h-px bg-[var(--bg-elevated)]" />
                    <div className="py-1.5">
                        <button
                            onClick={() => {
                                setOpen(false);
                                document
                                    .querySelector("[data-shortcuts-btn]")
                                    ?.click();
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <svg
                                width="15"
                                height="15"
                                viewBox="0 0 512 512"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="36"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <rect
                                    x="48"
                                    y="128"
                                    width="416"
                                    height="256"
                                    rx="48"
                                    ry="48"
                                />
                                <path d="M160 304h192" />
                                <path d="M160 240h16m48 0h16m48 0h16m48 0h16" />
                                <path d="M160 176h16m48 0h16m48 0h16m48 0h16" />
                            </svg>
                            Keyboard shortcuts
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Editor Outline with slider (matches preview TOC style) ──
function EditorOutline({ editorContent }) {
    const [activeId, setActiveId] = useState("");
    const listRef = useRef(null);
    const itemRefs = useRef({});
    const [sliderStyle, setSliderStyle] = useState({ top: 0, height: 16 });

    const blocks = useMemo(() => {
        if (Array.isArray(editorContent)) return editorContent;
        try {
            return JSON.parse(editorContent);
        } catch {
            return [];
        }
    }, [editorContent]);

    const headings = useMemo(() => {
        const result = [];
        for (const b of blocks) {
            if (b.type === "heading" && b.content?.length > 0) {
                const level = parseInt(b.props?.level || "1", 10);
                const text = b.content.map((c) => c.text || "").join("");
                if (text.trim())
                    result.push({ id: b.id, level, text: text.trim() });
            }
            if (b.type === "tabsBlock") {
                let tabs = [];
                try {
                    tabs = JSON.parse(b.props?.tabs || "[]");
                } catch {}
                tabs.forEach((t) => {
                    if (t.title)
                        result.push({
                            id: b.id,
                            level: 2,
                            text: t.title,
                            isSubpage: true,
                        });
                });
            }
        }
        return result;
    }, [blocks]);

    // Scroll spy — track which heading is in view
    useEffect(() => {
        if (headings.length === 0) return;
        const onScroll = () => {
            const scrollY = window.scrollY + 150;
            let current = headings[0]?.id || "";
            for (const h of headings) {
                const el = document.querySelector(`[data-id="${h.id}"]`);
                if (el && el.offsetTop <= scrollY) current = h.id;
            }
            setActiveId(current);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener("scroll", onScroll);
    }, [headings]);

    // Update slider position and auto-scroll TOC to keep active item visible
    useEffect(() => {
        if (!activeId || !listRef.current) return;
        const item = itemRefs.current[activeId];
        if (!item) return;
        const listRect = listRef.current.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        setSliderStyle({
            top: itemRect.top - listRect.top,
            height: itemRect.height,
        });
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeId]);

    if (headings.length === 0) return null;

    return (
        <div className="editor-outline-sidebar">
            <p className="editor-outline-title">Outline</p>
            <div className="relative flex">
                {/* Track line + slider */}
                <div
                    className="relative mr-3 flex-shrink-0"
                    style={{ width: "2px" }}
                >
                    <div
                        className="absolute inset-0 rounded-full"
                        style={{ backgroundColor: "var(--border-default)" }}
                    />
                    <div
                        className="absolute left-0 w-full rounded-full transition-all duration-300 ease-out"
                        style={{
                            backgroundColor: "#9b7bf7",
                            top: sliderStyle.top,
                            height: sliderStyle.height,
                        }}
                    />
                </div>
                <ul className="editor-outline-list flex-1" ref={listRef}>
                    {headings.map((h) => (
                        <li
                            key={h.id}
                            ref={(el) => {
                                itemRefs.current[h.id] = el;
                            }}
                            className="editor-outline-item"
                            style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                            onClick={() => {
                                const el = document.querySelector(
                                    `[data-id="${h.id}"]`,
                                );
                                if (el)
                                    el.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                    });
                            }}
                        >
                            <span
                                className="editor-outline-text"
                                style={{
                                    color:
                                        h.id === activeId
                                            ? "var(--text-primary)"
                                            : undefined,
                                    fontWeight:
                                        h.id === activeId ? "600" : undefined,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                }}
                            >
                                {h.isSubpage && (
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ flexShrink: 0 }}
                                    >
                                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                )}
                                {h.text}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

// ── Main WritePage ──
export default function WritePage({ slugid }) {
    const { user, logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { activeTheme } = useSeasonalTheme();
    const editorRef = useRef(null);
    const publishMenuRef = useRef(null);
    const autoSaveTimer = useRef(null);
    const [mode, setMode] = useState("edit");
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [coverPreview, setCoverPreview] = useState(null);
    const [publishAs, setPublishAs] = useState("personal");
    // Secret mode: publish with no author shown. Free to toggle while this is a draft,
    // frozen by the server once the post has been public even once.
    const [secret, setSecret] = useState(false);
    const [memberOnly, setMemberOnly] = useState(false);
    const [ownerCanMarkMemberOnly, setOwnerCanMarkMemberOnly] = useState(null);
    // Sub-pages/canvases already on a post that's being switched to secret. They can't
    // come along, so the author (or a co-author) is told before they publish rather
    // than hitting a server rejection later.
    const [secretBlockers, setSecretBlockers] = useState([]);
    const [tags, setTags] = useState([]);
    const [showPublishPanel, setShowPublishPanel] = useState(() => {
        if (typeof window !== "undefined") {
            return (
                new URLSearchParams(window.location.search).get("panel") ===
                "settings"
            );
        }
        return false;
    });
    const [contestOptions, setContestOptions] = useState([]);
    const [contestSearch, setContestSearch] = useState("");
    const [selectedContest, setSelectedContest] = useState("");
    const [contestLoading, setContestLoading] = useState(false);
    const [contestMessage, setContestMessage] = useState("");
    const [dangerBusy, setDangerBusy] = useState("");
    const [showPublishMenu, setShowPublishMenu] = useState(false);
    const [showCoverModal, setShowCoverModal] = useState(false);
    const [coverCropSrc, setCoverCropSrc] = useState(null); // device image awaiting crop+stylise
    const [coverUploadError, setCoverUploadError] = useState("");
    const [coverUploading, setCoverUploading] = useState(false);
    const [mediaStorageStatus, setMediaStorageStatus] = useState({
        loading: true,
    });
    const [coverUrlMode, setCoverUrlMode] = useState(false);
    const [coverUrlInput, setCoverUrlInput] = useState("");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [pageEmoji, setPageEmoji] = useState(null);
    const [editorContent, setEditorContent] = useState(null);
    // The editor owns its document after mount. Keeping the seed separate prevents
    // every keystroke from being fed back through initialContent and re-sanitized.
    const [editorSeedContent, setEditorSeedContent] = useState(null);
    const [previewHtml, setPreviewHtml] = useState("");
    const [markdown, setMarkdown] = useState("");
    const [wordCount, setWordCount] = useState(0);
    const [lastSaved, setLastSaved] = useState(null);
    const [draftLoading, setDraftLoading] = useState(true);
    const [editorReady, setEditorReady] = useState(false);
    // Co-author invite gate — set when the user lands on /edit/<id> for a blog
    // they were invited to but haven't accepted (or can only view).
    const [inviteGate, setInviteGate] = useState(null);
    const [inviteBusy, setInviteBusy] = useState(false);
    const [aiTitleKey, setAiTitleKey] = useState(0);
    const [blogVersion, setBlogVersion] = useState(null);
    const [lastKnownUpdatedAt, setLastKnownUpdatedAt] = useState(null);
    const [userOrgs, setUserOrgs] = useState([]);
    const [collectionId, setCollectionId] = useState(null); // org collection to file under (null = org root)
    const [orgCollections, setOrgCollections] = useState([]); // collections of the selected org
    const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
    const settingsSnapshotRef = useRef(""); // publish-settings as of load / last publish — for the no-change Update shortcut
    const publishedLocationSnapshotRef = useRef(null); // canonical URL inputs as of load / last publish
    const titleTextareaRef = useRef(null);
    const loadedRef = useRef(false); // true once the initial cloud/local load has populated state
    const hadUserGestureRef = useRef(false);
    const bypassUnloadRef = useRef(false); // set during publish redirect to skip the leave prompt
    const dirtyRef = useRef(false); // true when there are edits not yet flushed to the cloud
    const draftRevisionRef = useRef(0); // prevents an older request clearing newer edits
    const editorSnapshotTimerRef = useRef(null);
    const largeDocumentRef = useRef(false);
    const syncInFlightRef = useRef(null); // serialize saves so publish never races autosave
    const syncRetryRef = useRef({ failures: 0, nextAttemptAt: 0 });
    const subpageSyncInFlightRef = useRef(null);
    const coverUploadRef = useRef(null); // pending upload whose permanent URL must win over blob: preview
    const isPublished = blogVersion?.isPublished;
    const [coverZoom, setCoverZoom] = useState(1);
    const [coverPos, setCoverPos] = useState({ x: 50, y: 50 });
    const [isDraggingCover, setIsDraggingCover] = useState(false);
    const coverDragStart = useRef({ x: 0, y: 0, posX: 50, posY: 50 });

    const [syncStatus, setSyncStatus] = useState("idle"); // idle | local | syncing | synced
    const [showSavedToast, setShowSavedToast] = useState(false);
    const [mediaStorageToast, setMediaStorageToast] = useState("");
    const mediaStorageToastTimerRef = useRef(null);
    const [clipboardToast, setClipboardToast] = useState(null);
    const clipboardToastTimerRef = useRef(null);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showCollabPanel, setShowCollabPanel] = useState(false);
    const [showColorPanel, setShowColorPanel] = useState(false);
    const [pageColor, setPageColor] = useState(null);
    const [slug, setSlug] = useState("");
    const pendingSlugRef = useRef("");
    const [slugManual, setSlugManual] = useState(false); // user typed a custom slug → stop auto-deriving from title
    const [slugAvail, setSlugAvail] = useState({ state: "idle" }); // idle | checking | available | taken
    const [isOwner, setIsOwner] = useState(true); // owner (author / org admin) — only owners may change a slug
    const [slugLockHint, setSlugLockHint] = useState(null);
    const [ownerInfo, setOwnerInfo] = useState(null); // real author {username, display_name, avatar_url} — shown to collaborators
    const [publishing, setPublishing] = useState(false);
    const [publishError, setPublishError] = useState("");
    const [savingDraft, setSavingDraft] = useState(false);
    const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
    const [inviteUsername, setInviteUsername] = useState("");
    const [inviteRole, setInviteRole] = useState("editor");
    const [collaborators, setCollaborators] = useState([]);
    const [inviteError, setInviteError] = useState("");
    const ownerDropdownRef = useRef(null);
    const [collabLock, setCollabLock] = useState(null);
    const [collabLockDismissed, setCollabLockDismissed] = useState(false);
    const [showPublishConfirm, setShowPublishConfirm] = useState(false);

    const titleWords = (title || "").trim().split(/\s+/).filter(Boolean).length;
    const titleValid = titleWords >= 2;
    const bodyValid = wordCount >= 20;
    const canPublishNow = titleValid && bodyValid;

    const [conflict, setConflict] = useState(null); // { message, currentVersion, status }
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [isSavingLeave, setIsSavingLeave] = useState(false);
    const [leaveSaveError, setLeaveSaveError] = useState("");
    const [pendingLeaveUrl, setPendingLeaveUrl] = useState(null);
    const [showMdReplaceConfirm, setShowMdReplaceConfirm] = useState(false);
    const [pendingMdFile, setPendingMdFile] = useState(null);
    const mdUploadRef = useRef(null);

    const username = user?.username || "you";

    const showClipboardToast = useCallback((message, type = "success") => {
        clearTimeout(clipboardToastTimerRef.current);
        setClipboardToast({ message, type });
        clipboardToastTimerRef.current = setTimeout(
            () => setClipboardToast(null),
            2600,
        );
    }, []);

    useEffect(
        () => () => clearTimeout(clipboardToastTimerRef.current),
        [],
    );

    useEffect(() => {
        if (!showPublishMenu) return;

        const dismissOnEscape = (event) => {
            if (event.key === "Escape") setShowPublishMenu(false);
        };
        const dismissOnOutsideClick = (event) => {
            if (!publishMenuRef.current?.contains(event.target)) {
                setShowPublishMenu(false);
            }
        };

        document.addEventListener("keydown", dismissOnEscape);
        document.addEventListener("pointerdown", dismissOnOutsideClick);
        return () => {
            document.removeEventListener("keydown", dismissOnEscape);
            document.removeEventListener("pointerdown", dismissOnOutsideClick);
        };
    }, [showPublishMenu]);

    useEffect(() => {
        pendingSlugRef.current = slug;
    }, [slug]);

    // The URL param (`slugid`) is the human slug or a new-blog id — client-facing.
    // `blogId` is the canonical DB id used for every read/write; it's resolved from
    // the server on load (for slug URLs) and defaults to the param for new blogs.
    const [blogId, setBlogId] = useState(slugid);

    useEffect(() => {
        if (!showPublishPanel || !user) return;
        let active = true;
        setContestLoading(true);
        fetch("/api/contests", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (active)
                    setContestOptions(
                        (data?.contests || []).filter(
                            (contest) => contest.status === "live",
                        ),
                    );
            })
            .catch(() => {})
            .finally(() => active && setContestLoading(false));
        return () => {
            active = false;
        };
    }, [showPublishPanel, user]);

    const refreshMediaStorageStatus = useCallback(async () => {
        try {
            const [usageResponse, cloudinaryResponse] = await Promise.all([
                fetch("/api/tier/usage", { cache: "no-store" }),
                fetch("/api/integrations/cloudinary", { cache: "no-store" }),
            ]);
            if (!usageResponse.ok || !cloudinaryResponse.ok)
                throw new Error("Storage status unavailable");
            const [usage, cloudinary] = await Promise.all([
                usageResponse.json(),
                cloudinaryResponse.json(),
            ]);
            const nextStatus = {
                loading: false,
                tier: usage.tier,
                ...usage.storage,
                connected: cloudinary.connected,
                useForUploads: cloudinary.useForUploads,
                cloudName: cloudinary.cloudName,
            };
            setMediaStorageStatus(nextStatus);
            return nextStatus;
        } catch {
            const unavailable = { loading: false, unavailable: true };
            setMediaStorageStatus(unavailable);
            return unavailable;
        }
    }, []);

    useEffect(() => {
        let active = true;
        refreshMediaStorageStatus();
        const handleUpload = async (event) => {
            if (event.detail?.status !== "complete") return;
            const status = await refreshMediaStorageStatus();
            if (!active) return;
            const result = event.detail?.result || {};
            const personal =
                result.storageProvider === "user_cloudinary" ||
                (status.connected && status.useForUploads);
            const destination = personal
                ? result.storageCloudName || status.cloudName || "personal Cloudinary"
                : "LixBlogs storage";
            const remaining =
                !personal && status.remainingFormatted
                    ? ` · ${status.remainingFormatted} remaining`
                    : "";
            setMediaStorageToast(`Uploaded to ${destination}${remaining}`);
            clearTimeout(mediaStorageToastTimerRef.current);
            mediaStorageToastTimerRef.current = setTimeout(
                () => setMediaStorageToast(""),
                4200,
            );
        };
        window.addEventListener(MEDIA_UPLOAD_EVENT, handleUpload);
        return () => {
            active = false;
            window.removeEventListener(MEDIA_UPLOAD_EVENT, handleUpload);
            clearTimeout(mediaStorageToastTimerRef.current);
        };
    }, [refreshMediaStorageStatus]);

    // Real-time collaboration (enabled when blog has co-authors)
    const hasCollaborators = collaborators.length > 0;
    const {
        collaboration: collabConfig,
        isConnected: collabConnected,
        connectedUsers,
        roomFull,
        error: collabError,
        needsSeed,
        clearSeed,
    } = useCollaboration({
        blogId,
        user,
        enabled: hasCollaborators,
    });

    // Version history (#11 E)
    const [showHistory, setShowHistory] = useState(false);
    const [versions, setVersions] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState("");
    const [historyActionId, setHistoryActionId] = useState("");
    const [versionPreview, setVersionPreview] = useState(null);
    const historyRef = useRef(null);
    useEffect(() => {
        if (!showHistory && !versionPreview) return;
        const closeOnOutsideClick = (event) => {
            if (
                showHistory &&
                !versionPreview &&
                historyRef.current &&
                !historyRef.current.contains(event.target)
            ) {
                setShowHistory(false);
            }
        };
        const closeOnEscape = (event) => {
            if (event.key !== "Escape") return;
            if (versionPreview) setVersionPreview(null);
            else setShowHistory(false);
        };
        document.addEventListener("pointerdown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [showHistory, versionPreview]);

    const openHistory = async () => {
        setShowHistory(true);
        setHistoryLoading(true);
        setHistoryError("");
        try {
            const r = await fetch(`/api/blogs/${blogId}/versions`);
            const data = await r.json().catch(() => ({}));
            if (!r.ok)
                throw new Error(data.error || "Version history is unavailable");
            setVersions(data.versions || []);
        } catch (error) {
            setHistoryError(error.message || "Version history is unavailable");
        } finally {
            setHistoryLoading(false);
        }
    };
    const previewVersion = async (version) => {
        setHistoryActionId(version.id);
        setHistoryError("");
        try {
            const r = await fetch(
                `/api/blogs/${blogId}/versions?version=${encodeURIComponent(version.id)}`,
            );
            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data.version)
                throw new Error(data.error || "This version could not be loaded");
            const editor = editorRef.current?.getEditor?.();
            const versionMarkdown = editor
                ? await editor.blocksToMarkdownLossy(data.version.content)
                : JSON.stringify(data.version.content, null, 2);
            setVersionPreview({ ...data.version, markdown: versionMarkdown });
        } catch (error) {
            setHistoryError(error.message || "This version could not be loaded");
        } finally {
            setHistoryActionId("");
        }
    };
    const restoreVersion = async (versionId) => {
        setHistoryActionId(versionId);
        setHistoryError("");
        try {
            const r = await fetch(`/api/blogs/${blogId}/versions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ versionId }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok)
                throw new Error(d.error || "This version could not be restored");
            const ed = editorRef.current?.getEditor?.();
            if (ed && Array.isArray(d.content)) {
                ed.replaceBlocks(ed.document, d.content);
                draftDataRef.current = {
                    ...draftDataRef.current,
                    editorContent: d.content,
                };
                setEditorContent(d.content);
            }
            dirtyRef.current = false;
            setHasUnsavedEdits(false);
            setLastKnownUpdatedAt(d.updatedAt);
            setLastSaved(Date.now());
            setVersionPreview(null);
            setShowHistory(false);
            showClipboardToast("Version restored");
        } catch (error) {
            setHistoryError(error.message || "This version could not be restored");
        } finally {
            setHistoryActionId("");
        }
    };

    // When another collaborator publishes, follow them to the published view
    // (out of edit) — keeps everyone in the session in sync with the live post.
    useEffect(() => {
        const provider = collabConfig?.provider;
        if (!provider?.awareness) return;
        const myId = provider.awareness.clientID;
        const mountedAt = Date.now();
        const onChange = () => {
            provider.awareness.getStates().forEach((state, clientId) => {
                if (clientId === myId) return;
                const pub = state?.lixPublished;
                if (pub?.url && pub.at >= mountedAt) {
                    bypassUnloadRef.current = true;
                    try {
                        provider.disconnect();
                    } catch {}
                    window.location.replace(pub.url);
                }
            });
        };
        provider.awareness.on("change", onChange);
        return () => provider.awareness.off("change", onChange);
    }, [collabConfig]);

    // Check collab status / lock on mount when collaborators exist
    useEffect(() => {
        if (!blogId || !hasCollaborators) return;
        fetch(`/api/collab/status?blogId=${blogId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (d?.isLocked && d.lockedBy) {
                    setCollabLock({ lockedBy: d.lockedBy, expiresIn: 300 });
                }
            })
            .catch(() => {});
    }, [blogId, hasCollaborators]);

    // Track user gesture so beforeunload dialog only fires after interaction
    useEffect(() => {
        const mark = () => {
            hadUserGestureRef.current = true;
        };
        window.addEventListener("keydown", mark, { once: true });
        window.addEventListener("pointerdown", mark, { once: true });
        return () => {
            window.removeEventListener("keydown", mark);
            window.removeEventListener("pointerdown", mark);
        };
    }, []);

    // Refs to always hold latest draft data (avoids stale closures in intervals/beforeunload)
    const draftDataRef = useRef({
        title,
        subtitle,
        tags,
        publishAs,
        collectionId,
        coverPreview,
        editorContent,
        pageEmoji,
        coverPos,
        coverZoom,
        secret,
        member_only: memberOnly,
    });
    useEffect(() => {
        const latestEditorContent = draftDataRef.current.editorContent;
        draftDataRef.current = {
            title,
            subtitle,
            tags,
            publishAs,
            collectionId,
            coverPreview,
            editorContent: latestEditorContent ?? editorContent,
            pageEmoji,
            coverPos,
            coverZoom,
            secret,
            member_only: memberOnly,
        };
    }, [
        title,
        subtitle,
        tags,
        publishAs,
        collectionId,
        coverPreview,
        editorContent,
        pageEmoji,
        coverPos,
        coverZoom,
        secret,
        memberOnly,
    ]);

    // Sync any buffered subpage drafts from localStorage to cloud
    const syncSubpageDrafts = useCallback(async () => {
        if (subpageSyncInFlightRef.current)
            return subpageSyncInFlightRef.current;
        const request = (async () => {
            try {
                const prefix = "lixblogs_subpage_";
                const pending = [];
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith(prefix)) continue;
                    const raw = localStorage.getItem(key);
                    if (raw) pending.push({ key, raw });
                }

                // Upload sequentially so repeated autosaves cannot retain several
                // large JSON request bodies at the same time.
                for (const { key, raw } of pending) {
                    const draft = JSON.parse(raw);
                    if (!draft.editorContent && !draft.title) continue;
                    const payload = { id: key.slice(prefix.length) };
                    if (draft.title) payload.title = draft.title;
                    if (draft.editorContent)
                        payload.content = draft.editorContent;
                    const response = await fetch("/api/subpages", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });
                    if (response.ok && localStorage.getItem(key) === raw)
                        localStorage.removeItem(key);
                }
            } catch {}
        })();
        subpageSyncInFlightRef.current = request;
        try {
            return await request;
        } finally {
            if (subpageSyncInFlightRef.current === request)
                subpageSyncInFlightRef.current = null;
        }
    }, []);

    // Cloud sync function — saves localStorage then pushes to cloud
    const syncToCloud = useCallback(
        async ({
            showToast = false,
            silent = false,
            liveSnapshot = true,
            persistLocal = true,
            respectBackoff = false,
        } = {}) => {
            // Let an existing autosave finish before taking a new snapshot. If it
            // already saved the latest revision, publishing can reuse its timestamp.
            if (syncInFlightRef.current) {
                const updatedAt = await syncInFlightRef.current;
                if (!dirtyRef.current) return updatedAt;
            }
            // A cropped cover is first displayed with a temporary blob: URL. Wait for
            // its Cloudinary upload before taking the payload snapshot.
            try {
                await coverUploadRef.current;
            } catch {}
            // The cover wait yields, so another caller may have started a save meanwhile.
            if (syncInFlightRef.current) {
                const updatedAt = await syncInFlightRef.current;
                if (!dirtyRef.current) return updatedAt;
            }
            // BlogEditor coalesces document snapshots to avoid serializing a large
            // post on every keystroke. A cloud save must still capture the exact
            // live document when it starts.
            if (liveSnapshot) {
                const liveEditorContent = editorRef.current?.getBlocks?.();
                if (Array.isArray(liveEditorContent)) {
                    draftDataRef.current = {
                        ...draftDataRef.current,
                        editorContent: liveEditorContent,
                    };
                }
            }
            const latest = draftDataRef.current;
            const data = {
                ...latest,
                coverPreview: persistableCover(latest.coverPreview),
            };
            if (!data.title && !data.editorContent) return;
            const revision = draftRevisionRef.current;

            if (persistLocal) {
                saveDraft(blogId, data);
                setLastSaved(Date.now());
            }

            // A failed background upload used to serialize and POST the complete
            // document every ten seconds forever. Back off those automatic retries;
            // explicit Save/Publish calls still bypass this guard.
            if (
                respectBackoff &&
                Date.now() < syncRetryRef.current.nextAttemptAt
            )
                return null;

            if (!silent) setSyncStatus("syncing");

            // Also sync any buffered subpage drafts
            void syncSubpageDrafts();

            const registerSyncFailure = () => {
                const failures = Math.min(
                    syncRetryRef.current.failures + 1,
                    6,
                );
                syncRetryRef.current = {
                    failures,
                    nextAttemptAt:
                        Date.now() +
                        Math.min(5 * 60_000, 15_000 * 2 ** (failures - 1)),
                };
            };

            const request = (async () => {
                try {
                    const res = await fetch("/api/blogs/draft", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ slugid: blogId, ...data }),
                    });

                    if (res.ok) {
                        syncRetryRef.current = {
                            failures: 0,
                            nextAttemptAt: 0,
                        };
                        if (draftRevisionRef.current === revision)
                            dirtyRef.current = false;
                        let updatedAt = null;
                        // Keep our known version current so our own saves aren't seen as a
                        // conflict when we later publish.
                        try {
                            const d = await res.json();
                            if (d?.updatedAt) {
                                updatedAt = d.updatedAt;
                                setLastKnownUpdatedAt(d.updatedAt);
                                setBlogVersion((v) =>
                                    v ? { ...v, updatedAt: d.updatedAt } : v,
                                );
                            }
                        } catch {}
                        if (!silent) {
                            setSyncStatus("synced");
                            if (showToast) {
                                setShowSavedToast(true);
                                emitContextualTip("draft-saved");
                                setTimeout(
                                    () => setShowSavedToast(false),
                                    3000,
                                );
                            }
                            setTimeout(() => setSyncStatus("idle"), 5000);
                        }
                        return updatedAt;
                    } else {
                        registerSyncFailure();
                        if (!silent) {
                            setSyncStatus("local");
                            setTimeout(() => setSyncStatus("idle"), 5000);
                        }
                    }
                } catch {
                    registerSyncFailure();
                    if (!silent) {
                        setSyncStatus("local");
                        setTimeout(() => setSyncStatus("idle"), 5000);
                    }
                }
                return null;
            })();
            syncInFlightRef.current = request;
            try {
                return await request;
            } finally {
                if (syncInFlightRef.current === request)
                    syncInFlightRef.current = null;
            }
        },
        [blogId, syncSubpageDrafts],
    );

    // Catch Save in capture phase: focused BlockNote/custom block editors may
    // stop bubbling, which otherwise lets the browser open its Save As dialog.
    useEffect(() => {
        function handleSaveShortcut(event) {
            if (
                !(event.ctrlKey || event.metaKey) ||
                event.altKey ||
                event.key.toLowerCase() !== "s"
            ) return;
            event.preventDefault();
            if (!event.repeat) void syncToCloud({ showToast: true });
        }
        window.addEventListener("keydown", handleSaveShortcut, true);
        return () =>
            window.removeEventListener("keydown", handleSaveShortcut, true);
    }, [syncToCloud]);

    // Ctrl+O → import markdown, Ctrl+D → insert date
    useEffect(() => {
        function handleKeyDown(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === "o") {
                e.preventDefault();
                mdUploadRef.current?.click();
            }
            if (
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                (e.key === "i" || e.key === "I")
            ) {
                e.preventDefault();
                setShowCollabPanel(true);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "d") {
                e.preventDefault();
                const editor = editorRef.current?.getEditor?.();
                if (editor) {
                    try {
                        editor.insertInlineContent([
                            {
                                type: "dateInline",
                                props: {
                                    date: new Date()
                                        .toISOString()
                                        .split("T")[0],
                                },
                            },
                        ]);
                    } catch {}
                }
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Escape consistently returns focus to the document by closing editor chrome.
    useEffect(() => {
        const closeEditorPanels = (event) => {
            if (event.key !== "Escape") return;
            setShowPublishPanel(false);
            setShowPublishMenu(false);
            setShowOwnerDropdown(false);
            setShowHistory(false);
            setShowEmojiPicker(false);
            setShowShortcuts(false);
            setShowCollabPanel(false);
            setShowColorPanel(false);
            setShowCoverModal(false);
            setCoverUrlMode(false);
            setCoverCropSrc(null);
            setSlugLockHint(null);
            document
                .querySelectorAll(".code-lang-picker")
                .forEach((element) => element.remove());
            requestAnimationFrame(() => {
                try {
                    editorRef.current?.getEditor?.()?.focus?.();
                } catch {}
            });
        };
        window.addEventListener("keydown", closeEditorPanels);
        return () => window.removeEventListener("keydown", closeEditorPanels);
    }, []);

    // Intercept in-app link clicks to show custom unsaved changes modal
    const handleNavigation = useCallback(
        (url) => {
            if (hasUnsavedEdits) {
                setPendingLeaveUrl(url);
                setLeaveSaveError("");
                setShowLeaveConfirm(true);
                return false; // blocked
            }
            return true; // allowed
        },
        [hasUnsavedEdits],
    );

    // Silently flush the draft to localStorage + cloud on unload. We deliberately
    // do NOT call preventDefault/returnValue — the native "Leave site?" dialog is
    // replaced by our own in-app confirm modal (handleNavigation / link intercept).
    useEffect(() => {
        function handleBeforeUnload() {
            if (bypassUnloadRef.current) return;
            const data = draftDataRef.current;
            if (data.title || data.editorContent) {
                saveDraft(blogId, data);
                try {
                    const blob = new Blob(
                        [
                            JSON.stringify({
                                slugid: blogId,
                                ...data,
                                coverPreview: persistableCover(
                                    data.coverPreview,
                                ),
                            }),
                        ],
                        { type: "application/json" },
                    );
                    navigator.sendBeacon("/api/blogs/draft", blob);
                } catch {}
            }
            // Also flush any buffered subpage drafts on unload
            try {
                syncSubpageDrafts();
            } catch {}
        }
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [blogId, syncSubpageDrafts]);

    // Intercept clicks on <a> tags within the editor page to show custom modal
    useEffect(() => {
        function handleClick(e) {
            if (!hasUnsavedEdits) return;
            const anchor = e.target.closest("a[href]");
            if (!anchor) return;
            const href = anchor.getAttribute("href");
            // Only intercept internal navigation links, not external or hash links
            if (
                !href ||
                href.startsWith("#") ||
                href.startsWith("mailto:") ||
                href.startsWith("http")
            )
                return;
            e.preventDefault();
            e.stopPropagation();
            setPendingLeaveUrl(href);
            setLeaveSaveError("");
            setShowLeaveConfirm(true);
        }
        document.addEventListener("click", handleClick, true);
        return () => document.removeEventListener("click", handleClick, true);
    }, [hasUnsavedEdits]);

    useEffect(() => {
        // Re-arm the load guard so that, if the editor ever stays mounted across a
        // slugid change, the next blog's initial load isn't treated as user edits,
        // and the no-change snapshot re-captures for the new blog.
        loadedRef.current = false;
        setDraftLoading(true);
        setEditorContent(null);
        setEditorSeedContent(null);
        largeDocumentRef.current = false;
        draftDataRef.current = {
            ...draftDataRef.current,
            editorContent: null,
        };
        settingsSnapshotRef.current = "";
        publishedLocationSnapshotRef.current = null;
        const timer = setTimeout(async () => {
            // Resolve the URL param (slug or id) against the server, which returns the
            // canonical blog id. localStorage is keyed by that id, so look it up after.
            let cloud = null,
                version = null;
            try {
                const res = await fetch(
                    `/api/blogs/draft?slugid=${encodeURIComponent(slugid)}&_t=${Date.now()}`,
                    { cache: "no-store" },
                );
                if (res.ok) {
                    const data = await res.json();
                    cloud = data.blog || null;
                    version = data.version || null;
                } else if (res.status === 403) {
                    // Invited but not yet accepted (or view-only) — show the invite gate
                    // instead of a blank editor.
                    const data = await res.json().catch(() => ({}));
                    if (data?.invite) {
                        setInviteGate(data.invite);
                        setDraftLoading(false);
                        return;
                    }
                    // 403 with no invite → you can't edit this blog. Don't show a blank
                    // editor; send the reader to the home feed.
                    window.location.href = "/";
                    return;
                } else if (res.status === 401) {
                    // Not signed in (middleware should catch this first) → sign-in, return here after.
                    window.location.href = `/sign-in?next=${encodeURIComponent("/edit/" + slugid)}`;
                    return;
                }
            } catch {
                /* offline or brand-new blog */
            }

            const resolvedId = cloud?.id || slugid;
            if (resolvedId !== blogId) setBlogId(resolvedId);
            const local = loadDraft(resolvedId);

            if (cloud) {
                // Metadata + version always from the server (authoritative).
                if (cloud.title) setTitle(cloud.title);
                if (cloud.slug) {
                    pendingSlugRef.current = cloud.slug;
                    setSlug(cloud.slug);
                    setSlugManual(true);
                }
                setIsOwner(cloud.is_owner !== false);
                if (cloud.owner_username)
                    setOwnerInfo({
                        username: cloud.owner_username,
                        display_name: cloud.owner_display_name,
                        avatar_url: cloud.owner_avatar,
                    });
                if (cloud.subtitle) setSubtitle(cloud.subtitle);
                if (cloud.tags?.length) setTags(cloud.tags);
                if (cloud.published_as) setPublishAs(cloud.published_as);
                setSecret(!!cloud.secret);
                setMemberOnly(!!cloud.member_only);
                setOwnerCanMarkMemberOnly(!!cloud.can_mark_member_only);
                setCollectionId(cloud.collection_id || null);
                if (cloud.status === "published") {
                    publishedLocationSnapshotRef.current = {
                        slug: cloud.slug || resolvedId,
                        publishAs: cloud.published_as || "personal",
                        collectionId: cloud.collection_id || null,
                        url: cloud.canonical_url || "",
                    };
                }
                setCoverPreview(persistableCover(cloud.cover_image_r2_key));
                if (
                    Number.isFinite(cloud.cover_pos_x) &&
                    Number.isFinite(cloud.cover_pos_y)
                )
                    setCoverPos({ x: cloud.cover_pos_x, y: cloud.cover_pos_y });
                if (Number.isFinite(cloud.cover_zoom))
                    setCoverZoom(cloud.cover_zoom);
                if (cloud.page_emoji) setPageEmoji(cloud.page_emoji);
                if (version) {
                    setBlogVersion(version);
                    setLastKnownUpdatedAt(version.updatedAt);
                }

                // Content: use the server copy unless localStorage holds strictly newer
                // unsaved edits (saved after the last cloud sync). This restores published
                // posts (incl. mentions) reliably while still preserving local work.
                // Only prefer the local draft when we have a known cloud timestamp AND the
                // local copy is strictly newer. Without a cloud time, trust the server copy
                // (otherwise a stale localStorage draft hides the real title/tags/subtitle).
                const cloudUpdatedMs = (version?.updatedAt || 0) * 1000;
                const localNewer =
                    local?.editorContent &&
                    cloudUpdatedMs > 0 &&
                    (local.savedAt || 0) > cloudUpdatedMs + 1500;
                if (localNewer) {
                    if (local.title) setTitle(local.title);
                    if (local.subtitle) setSubtitle(local.subtitle);
                    if (local.tags?.length) setTags(local.tags);
                    if (local.coverPreview) setCoverPreview(local.coverPreview);
                    if (local.coverPos) setCoverPos(local.coverPos);
                    if (Number.isFinite(local.coverZoom))
                        setCoverZoom(local.coverZoom);
                    if (local.pageEmoji) setPageEmoji(local.pageEmoji);
                    if (local.savedAt) setLastSaved(local.savedAt);
                    setEditorContent(local.editorContent);
                    setEditorSeedContent(local.editorContent);
                    largeDocumentRef.current =
                        serializedContentSize(local.editorContent) >= 8000;
                } else if (cloud.content) {
                    const initialContent =
                        typeof cloud.content === "string"
                            ? cloud.content
                            : JSON.stringify(cloud.content);
                    setEditorContent(initialContent);
                    setEditorSeedContent(initialContent);
                    largeDocumentRef.current = initialContent.length >= 8000;
                }
            } else if (local?.editorContent) {
                // Brand-new blog not yet on the server — use the local buffer.
                if (local.title) setTitle(local.title);
                if (local.subtitle) setSubtitle(local.subtitle);
                if (local.tags?.length) setTags(local.tags);
                if (local.publishAs) setPublishAs(local.publishAs);
                if (local.collectionId) setCollectionId(local.collectionId);
                if (local.coverPreview) setCoverPreview(local.coverPreview);
                if (local.coverPos) setCoverPos(local.coverPos);
                if (Number.isFinite(local.coverZoom))
                    setCoverZoom(local.coverZoom);
                if (local.pageEmoji) setPageEmoji(local.pageEmoji);
                if (local.savedAt) setLastSaved(local.savedAt);
                setEditorContent(local.editorContent);
                setEditorSeedContent(local.editorContent);
                largeDocumentRef.current =
                    serializedContentSize(local.editorContent) >= 8000;
            }
            setDraftLoading(false);
            // Defer so the state updates above don't trip the autosave effect as "edits".
            setTimeout(() => {
                loadedRef.current = true;
            }, 0);
        }, 80);
        return () => clearTimeout(timer);
    }, [slugid]);

    useEffect(() => {
        // Ignore the state changes from the initial load — only real edits are dirty.
        if (!loadedRef.current) return;
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        setHasUnsavedEdits(true);
        dirtyRef.current = true;
        draftRevisionRef.current += 1;
        autoSaveTimer.current = setTimeout(() => {
            if (title || editorContent) {
                saveDraft(blogId, {
                    title,
                    subtitle,
                    tags,
                    publishAs,
                    collectionId,
                    coverPreview,
                    editorContent,
                    pageEmoji,
                    coverPos,
                    coverZoom,
                    secret,
                    member_only: memberOnly,
                });
                setLastSaved(Date.now());
                void syncToCloud({
                    silent: true,
                    liveSnapshot: false,
                    persistLocal: false,
                    respectBackoff: true,
                });
            }
        }, 1200);
        return () => clearTimeout(autoSaveTimer.current);
    }, [
        title,
        subtitle,
        tags,
        publishAs,
        collectionId,
        coverPreview,
        editorContent,
        pageEmoji,
        coverPos,
        coverZoom,
        secret,
        memberOnly,
        blogId,
        syncToCloud,
    ]);

    // Background cloud flush — localStorage is the instant buffer, but beforeunload/
    // sendBeacon is unreliable, so keep a fallback flush for unsynced edits.
    // This protects against tab crashes and makes drafts available cross-device.
    useEffect(() => {
        if (draftLoading) return;
        const id = setInterval(() => {
            if (dirtyRef.current)
                void syncToCloud({
                    silent: true,
                    liveSnapshot: false,
                    persistLocal: false,
                    respectBackoff: true,
                });
        }, 15000);
        return () => clearInterval(id);
    }, [draftLoading, syncToCloud]);

    const handleCoverSelect = (dataUrl) => {
        setCoverPreview(dataUrl);
        fetch(dataUrl)
            .then((r) => r.blob())
            .then((blob) => uploadCover(blob));
    };

    const removeCover = () => {
        localStorage.removeItem(`lixblogs:cover-upload:${blogId}`);
        draftDataRef.current = { ...draftDataRef.current, coverPreview: null };
        setCoverPreview(null);
    };

    const addTag = useCallback(
        (rawTag) => {
            const trimmed = rawTag.trim().toLowerCase();
            if (!trimmed || tags.includes(trimmed) || tags.length >= 5)
                return false;
            const nextTags = [...tags, trimmed];
            draftDataRef.current = {
                ...draftDataRef.current,
                tags: nextTags,
            };
            setTags(nextTags);
            return true;
        },
        [tags],
    );

    const removeTag = useCallback(
        (tag) =>
            setTags((current) => {
                const nextTags = current.filter((item) => item !== tag);
                draftDataRef.current = {
                    ...draftDataRef.current,
                    tags: nextTags,
                };
                return nextTags;
            }),
        [],
    );

    // Count words from blocks (handles both array and JSON string)
    const computeWordCount = useCallback((content) => {
        let blocks = content;
        if (typeof blocks === "string") {
            try {
                blocks = JSON.parse(blocks);
            } catch {
                return 0;
            }
        }
        if (!Array.isArray(blocks)) return 0;
        const text = blocks
            .map((b) =>
                b.content && Array.isArray(b.content)
                    ? b.content.map((c) => c.text || "").join("")
                    : "",
            )
            .join(" ");
        return text.trim().split(/\s+/).filter(Boolean).length;
    }, []);

    const handleEditorChange = useCallback(
        (blocks) => {
            // Keep crash/unload recovery current without forcing the entire editor,
            // outline and metadata page through React on each ProseMirror transaction.
            draftDataRef.current = {
                ...draftDataRef.current,
                editorContent: blocks,
            };
            if (loadedRef.current) {
                setHasUnsavedEdits(true);
                dirtyRef.current = true;
                draftRevisionRef.current += 1;
            }
            clearTimeout(editorSnapshotTimerRef.current);
            const delay =
                largeDocumentRef.current || blocks.length >= 60 ? 700 : 120;
            editorSnapshotTimerRef.current = setTimeout(() => {
                setEditorContent(blocks);
                setWordCount(computeWordCount(blocks));
            }, delay);
        },
        [computeWordCount],
    );

    useEffect(
        () => () => clearTimeout(editorSnapshotTimerRef.current),
        [],
    );

    // Recompute word count when content loads from server/localStorage
    useEffect(() => {
        if (editorContent && wordCount === 0) {
            setWordCount(computeWordCount(editorContent));
        }
    }, [editorContent, wordCount, computeWordCount]);

    const [previewBlocks, setPreviewBlocks] = useState([]);

    const switchMode = useCallback(async (newMode) => {
        if (newMode !== "edit" && editorRef.current) {
            try {
                const [html, md] = await Promise.all([
                    editorRef.current.getHTML(),
                    editorRef.current.getMarkdown(),
                ]);
                setPreviewHtml(html);
                setMarkdown(md);
                if (editorRef.current.getBlocks) {
                    setPreviewBlocks(editorRef.current.getBlocks());
                }
            } catch {
                /* not ready */
            }
        }
        setMode(newMode);
    }, []);

    // Ctrl+Shift+P → toggle edit/preview
    useEffect(() => {
        function handleKey(e) {
            if (
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                (e.key === "p" || e.key === "P")
            ) {
                e.preventDefault();
                switchMode(mode === "edit" ? "preview" : "edit");
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [switchMode, mode]);

    // Auto-generate slug from title — unless the user set a custom one, or the blog
    // is already published (its slug is locked and can't change).
    useEffect(() => {
        if (slugManual || isPublished) return;
        if (!title.trim()) {
            setSlug("");
            return;
        }
        const generated = title
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 60)
            .replace(/^-|-$/g, "");
        setSlug(generated || slugid);
    }, [title, slugid, slugManual, isPublished]);

    // Live slug-availability check, scoped to the chosen owner. Skipped for
    // already-published blogs (their slug is locked).
    useEffect(() => {
        // Drafts always check; published blogs only when the owner is changing the slug.
        if ((isPublished && !isOwner) || !slug) {
            setSlugAvail({ state: "idle" });
            return;
        }
        setSlugAvail({ state: "checking" });
        const t = setTimeout(async () => {
            try {
                const qs = new URLSearchParams({
                    slug,
                    publishAs,
                    excludeId: blogId,
                });
                const res = await fetch(`/api/blogs/slug-check?${qs}`);
                const d = await res.json();
                setSlugAvail(
                    d.available
                        ? { state: "available" }
                        : { state: "taken", reason: d.reason },
                );
            } catch {
                setSlugAvail({ state: "idle" });
            }
        }, 400);
        return () => clearTimeout(t);
    }, [slug, publishAs, isPublished, isOwner, blogId]);

    // Load collaborators
    useEffect(() => {
        if (!blogId) return;
        fetch(`/api/blogs/invite?slugid=${blogId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (d?.collaborators) setCollaborators(d.collaborators);
            })
            .catch(() => {});
    }, [blogId]);

    // Load user's orgs for owner dropdown
    useEffect(() => {
        fetch("/api/orgs")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (d?.orgs) setUserOrgs(d.orgs);
            })
            .catch(() => {});
    }, []);

    // Load collections for the selected org (publish-destination dropdown). Cleared
    // when publishing personally so a stale org's collections can't be selected.
    useEffect(() => {
        if (!publishAs.startsWith("org:")) {
            setOrgCollections([]);
            return;
        }
        const orgId = publishAs.slice(4);
        let active = true;
        fetch(`/api/orgs/collections?orgId=${encodeURIComponent(orgId)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (active && d?.collections) setOrgCollections(d.collections);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [publishAs]);

    // Close owner dropdown on outside click
    useEffect(() => {
        if (!showOwnerDropdown) return;
        function handleClick(e) {
            if (
                ownerDropdownRef.current &&
                !ownerDropdownRef.current.contains(e.target)
            )
                setShowOwnerDropdown(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showOwnerDropdown]);

    // Upload cover image blob to Cloudinary → set coverPreview to permanent URL
    const uploadCover = useCallback(
        async (blob, { alreadyOptimized = false } = {}) => {
            const uploadJobId = createMediaUploadId();
            const storageKey = `lixblogs:cover-upload:${blogId}`;
            const task = (async () => {
                setCoverUploadError("");
                setCoverUploading(true);
                let compressed = blob;
                if (!alreadyOptimized) {
                    const { compressCoverImage } = await import(
                        "../utils/compressImage"
                    );
                    ({ blob: compressed } = await compressCoverImage(blob));
                }
                localStorage.setItem(storageKey, uploadJobId);
                const data = await enqueueMediaUpload(compressed, {
                    id: uploadJobId,
                    filename: `cover_${blogId}.webp`,
                    blogId,
                    type: "cover",
                });
                if (!data.url)
                    throw new Error("Cover upload did not return a URL");
                localStorage.removeItem(storageKey);
                draftDataRef.current = {
                    ...draftDataRef.current,
                    coverPreview: data.url,
                };
                setCoverPreview(data.url);
                return data.url;
            })();
            coverUploadRef.current = task;
            try {
                return await task;
            } catch (err) {
                console.error("Cover upload failed:", err);
                setCoverUploadError(
                    err?.message || "Cover upload failed. Please try again.",
                );
                return null;
            } finally {
                setCoverUploading(false);
                if (coverUploadRef.current === task)
                    coverUploadRef.current = null;
            }
        },
        [blogId],
    );

    // IndexedDB retains the compressed upload body across navigation/reload.
    // Reattach this editor to the persisted cover job when it mounts again.
    useEffect(() => {
        if (!blogId) return;
        const storageKey = `lixblogs:cover-upload:${blogId}`;
        const uploadJobId = localStorage.getItem(storageKey);
        if (!uploadJobId) return;
        setCoverUploading(true);
        const task = resumeMediaUpload(uploadJobId)
            .then((data) => {
                if (!data?.url) return;
                draftDataRef.current = {
                    ...draftDataRef.current,
                    coverPreview: data.url,
                };
                setCoverPreview(data.url);
                localStorage.removeItem(storageKey);
            })
            .catch((error) =>
                setCoverUploadError(error.message || "Cover upload failed"),
            )
            .finally(() => {
                setCoverUploading(false);
                if (coverUploadRef.current === task)
                    coverUploadRef.current = null;
            });
        coverUploadRef.current = task;
    }, [blogId]);

    // Read a chosen device file into a data URL and open the crop+stylise modal.
    const openCoverCropper = useCallback((file) => {
        if (!file || !isAllowedImage(file)) return;
        const reader = new FileReader();
        reader.onload = (ev) => setCoverCropSrc(ev.target.result);
        reader.readAsDataURL(file);
    }, []);

    // Cropped + stylised cover → optimistic preview, then upload.
    const handleCoverCropSave = useCallback(
        (blob) => {
            setCoverCropSrc(null);
            setShowCoverModal(false);
            if (!blob) return;
            const previousCover = persistableCover(
                draftDataRef.current.coverPreview,
            );
            const previewUrl = URL.createObjectURL(blob);
            setCoverPreview(previewUrl);
            setCoverZoom(1);
            setCoverPos({ x: 50, y: 50 });
            // ImageCropModal already emitted a metadata-free, <=120 KB WebP. Re-decoding
            // it through OffscreenCanvas is redundant and Firefox can reject that second
            // conversion with AbortError/"The operation was aborted".
            uploadCover(blob, { alreadyOptimized: true }).then((url) => {
                URL.revokeObjectURL(previewUrl);
                if (!url) {
                    draftDataRef.current = {
                        ...draftDataRef.current,
                        coverPreview: previousCover,
                    };
                    setCoverPreview(previousCover);
                }
            });
        },
        [uploadCover],
    );

    const handleSaveDraft = async () => {
        if (savingDraft) return;
        setSavingDraft(true);
        try {
            try {
                await coverUploadRef.current;
            } catch {}
            const latestCover = persistableCover(
                draftDataRef.current.coverPreview,
            );
            saveDraft(blogId, {
                title,
                subtitle,
                tags,
                publishAs,
                collectionId,
                coverPreview: latestCover,
                editorContent: draftDataRef.current.editorContent,
                pageEmoji,
                coverPos,
                coverZoom,
                secret,
                member_only: memberOnly,
            });
            setLastSaved(Date.now());
            await syncToCloud({ showToast: true });
            setShowPublishMenu(false);
        } finally {
            setSavingDraft(false);
        }
    };

    const getExportMarkdown = useCallback(async () => {
        const body =
            (await editorRef.current?.getMarkdown?.()) || markdown || "";
        const heading = title.trim() ? `# ${title.trim()}` : "";
        const punchline = subtitle.trim()
            ? `> ${subtitle.trim().replace(/\n/g, "\n> ")}`
            : "";
        return [heading, punchline, body.trim()].filter(Boolean).join("\n\n");
    }, [markdown, subtitle, title]);

    const handleCopyMarkdown = useCallback(async () => {
        setShowPublishMenu(false);
        try {
            await navigator.clipboard.writeText(await getExportMarkdown());
            showClipboardToast("Blog copied as Markdown");
        } catch {
            showClipboardToast("Could not copy the blog", "error");
        }
    }, [getExportMarkdown, showClipboardToast]);

    const handleDownloadPdf = useCallback(async () => {
        setShowPublishMenu(false);
        const printWindow = window.open("", "_blank", "width=960,height=720");
        if (!printWindow) {
            showClipboardToast("Allow pop-ups to download a PDF", "error");
            return;
        }

        printWindow.document.write(
            "<!doctype html><title>Preparing PDF…</title><p style=\"font:16px system-ui;padding:32px\">Preparing your blog…</p>",
        );

        try {
            const articleHtml =
                (await editorRef.current?.getHTML?.()) || previewHtml || "";
            const safeTitle = escapeExportHtml(title || "Untitled blog");
            const safeSubtitle = escapeExportHtml(subtitle);
            const safeTags = tags.map((tag) => escapeExportHtml(tag));
            const printableCover = /^(https?:|data:image\/|blob:|\/)/i.test(
                coverPreview || "",
            )
                ? escapeExportHtml(coverPreview)
                : "";

            printWindow.document.open();
            printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body { margin: 0 auto; max-width: 760px; color: #171717; font: 16px/1.7 Georgia, serif; }
        h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.15; }
        h2, h3, h4 { break-after: avoid; line-height: 1.25; }
        .subtitle { margin: 0 0 22px; color: #555; font-size: 18px; }
        .cover { width: 100%; max-height: 360px; margin: 0 0 24px; border-radius: 12px; object-fit: cover; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 22px; color: #555; font: 12px/1.4 system-ui, sans-serif; }
        .tag { padding: 4px 8px; border: 1px solid #ddd; border-radius: 999px; }
        img, svg { max-width: 100%; height: auto; }
        pre { overflow-wrap: anywhere; white-space: pre-wrap; padding: 14px; border: 1px solid #ddd; border-radius: 8px; background: #f6f6f6; font: 12px/1.5 ui-monospace, monospace; }
        code { font-family: ui-monospace, monospace; }
        blockquote { margin-left: 0; padding-left: 16px; border-left: 3px solid #aaa; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 7px; border: 1px solid #ccc; text-align: left; }
        a { color: inherit; text-decoration: underline; }
        [contenteditable] { outline: none; }
        button, [data-floating-ui-portal] { display: none !important; }
    </style>
</head>
<body>
    ${printableCover ? `<img class="cover" src="${printableCover}" alt="" />` : ""}
    <h1>${safeTitle}</h1>
    ${safeSubtitle ? `<p class="subtitle">${safeSubtitle}</p>` : ""}
    ${safeTags.length ? `<div class="tags">${safeTags.map((tag) => `<span class="tag">#${tag}</span>`).join("")}</div>` : ""}
    <article>${articleHtml}</article>
</body>
</html>`);
            printWindow.document.close();

            const images = Array.from(printWindow.document.images);
            await Promise.all(
                images.map(
                    (image) =>
                        image.complete ||
                        new Promise((resolve) => {
                            image.addEventListener("load", resolve, {
                                once: true,
                            });
                            image.addEventListener("error", resolve, {
                                once: true,
                            });
                        }),
                ),
            );
            await printWindow.document.fonts?.ready;
            printWindow.focus();
            printWindow.onafterprint = () => printWindow.close();
            printWindow.print();
            showClipboardToast("PDF print dialog opened");
        } catch {
            printWindow.close();
            showClipboardToast("Could not prepare the PDF", "error");
        }
    }, [coverPreview, previewHtml, showClipboardToast, subtitle, tags, title]);

    // Handle .md file upload — check for existing content first
    const handleMdUpload = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";

        // Check if editor has content beyond an empty paragraph
        const editor = editorRef.current?.getEditor?.();
        const hasContent =
            editor &&
            editor.document.some((b) => {
                const text = (b.content || [])
                    .map((c) => c.text || "")
                    .join("")
                    .trim();
                return text.length > 0 || (b.type && b.type !== "paragraph");
            });

        if (hasContent) {
            setPendingMdFile(file);
            setShowMdReplaceConfirm(true);
        } else {
            importMdFile(file);
        }
    }, []);

    const importMdFile = useCallback(async (file) => {
        try {
            const text = await file.text();
            const lines = text.split("\n");

            let mdTitle = "";
            let contentStart = 0;
            if (lines[0]?.startsWith("# ")) {
                mdTitle = lines[0].replace(/^#\s+/, "").trim();
                contentStart = 1;
                if (lines[contentStart]?.trim() === "") contentStart++;
            }

            const mdContent = lines.slice(contentStart).join("\n").trim();
            if (mdTitle) setTitle(mdTitle);

            const editor = editorRef.current?.getEditor?.();
            if (editor) {
                try {
                    // Pre-process: extract mermaid fenced blocks
                    // Use placeholder format without double underscores (markdown interprets __ as bold)
                    const extractedMermaid = extractMermaidFences(mdContent);
                    const mermaidBlocks = extractedMermaid.diagrams;
                    let processed = extractedMermaid.content;

                    // Pre-process: extract block LaTeX \[...\]
                    const blockLatex = [];
                    processed = processed.replace(
                        /\\\[([\s\S]*?)\\\]/g,
                        (_, latex) => {
                            const ph = `LATEXBLOCKPLACEHOLDER${blockLatex.length}END`;
                            blockLatex.push(latex.trim());
                            return ph;
                        },
                    );

                    // Pre-process: extract inline LaTeX \(...\)
                    // Markdown parsers strip backslash escapes, so \( becomes ( — extract before parsing
                    const inlineLatex = [];
                    processed = processed.replace(
                        /\\\((.+?)\\\)/g,
                        (_, latex) => {
                            const ph = `LATEXINLINEPLACEHOLDER${inlineLatex.length}END`;
                            inlineLatex.push(latex.trim());
                            return ph;
                        },
                    );

                    let blocks =
                        await editor.tryParseMarkdownToBlocks(processed);

                    // Post-process: replace placeholders with custom blocks + inline LaTeX
                    blocks = blocks.flatMap((block) => {
                        if (!block.content || !Array.isArray(block.content))
                            return [block];
                        const txt = block.content
                            .map((c) => c.text || "")
                            .join("");

                        // Mermaid placeholder → mermaidBlock
                        const mm = txt.match(/^MERMAIDPLACEHOLDER(\d+)END$/);
                        if (mm)
                            return [
                                {
                                    type: "mermaidBlock",
                                    props: {
                                        diagram:
                                            mermaidBlocks[parseInt(mm[1])] ||
                                            "",
                                    },
                                    children: [],
                                },
                            ];

                        // Block LaTeX placeholder → blockEquation
                        const bl = txt.match(/^LATEXBLOCKPLACEHOLDER(\d+)END$/);
                        if (bl)
                            return [
                                {
                                    type: "blockEquation",
                                    props: {
                                        latex:
                                            blockLatex[parseInt(bl[1])] || "",
                                    },
                                    children: [],
                                },
                            ];

                        // Inline LaTeX placeholders → inlineEquation
                        if (/LATEXINLINEPLACEHOLDER\d+END/.test(txt)) {
                            const parts = [];
                            const regex = /LATEXINLINEPLACEHOLDER(\d+)END/g;
                            let lastIdx = 0;
                            let m;
                            while ((m = regex.exec(txt)) !== null) {
                                if (m.index > lastIdx)
                                    parts.push({
                                        type: "text",
                                        text: txt.slice(lastIdx, m.index),
                                    });
                                parts.push({
                                    type: "inlineEquation",
                                    props: {
                                        latex:
                                            inlineLatex[parseInt(m[1])] || "",
                                    },
                                });
                                lastIdx = m.index + m[0].length;
                            }
                            if (lastIdx < txt.length)
                                parts.push({
                                    type: "text",
                                    text: txt.slice(lastIdx),
                                });
                            if (parts.length > 0)
                                return [{ ...block, content: parts }];
                        }

                        return [block];
                    });

                    if (blocks?.length > 0) {
                        editor.replaceBlocks(editor.document, blocks);
                    }
                } catch (err) {
                    console.error("Markdown parse failed:", err);
                    editor.replaceBlocks(editor.document, [
                        {
                            type: "paragraph",
                            content: [{ type: "text", text: mdContent }],
                        },
                    ]);
                }
                setHasUnsavedEdits(true);
            }
        } catch (err) {
            console.error("Failed to import markdown:", err);
        }
    }, []);

    // Grow the title textarea to fit its content. Re-run when the editor becomes
    // visible (draftLoading/editorReady) too — if it runs while hidden, scrollHeight
    // is 0 and the title would otherwise stay clipped to height:0 (invisible).
    useEffect(() => {
        const el = titleTextareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        const h = el.scrollHeight;
        el.style.height = (h > 0 ? h : 0) + "px";
        el.style.minHeight = "1.2em";
    }, [title, draftLoading, editorReady]);

    // Serialized publish-settings, used to detect "nothing changed" on Update.
    const settingsKey = (overrides = {}) =>
        JSON.stringify({
            title,
            subtitle,
            tags,
            publishAs,
            collectionId,
            pageEmoji,
            coverPreview,
            coverPos,
            coverZoom,
            slug: pendingSlugRef.current || slug,
            secret,
            memberOnly,
            ...overrides,
        });
    // Capture a baseline once the blog has finished loading.
    useEffect(() => {
        if (!draftLoading && settingsSnapshotRef.current === "")
            settingsSnapshotRef.current = settingsKey();
    }, [draftLoading]); // eslint-disable-line react-hooks/exhaustive-deps

    const ownerSlug =
        publishAs === "personal"
            ? ownerInfo?.username || username
            : userOrgs.find((o) => `org:${o.id}` === publishAs)?.slug ||
              username;
    // Owner shown in publish settings = the REAL author (not the current collaborator) for personal blogs, or the org for org blogs.
    const ownerOrg =
        publishAs !== "personal"
            ? userOrgs.find((o) => `org:${o.id}` === publishAs)
            : null;
    const ownerName =
        publishAs === "personal"
            ? ownerInfo?.display_name || ownerInfo?.username || username
            : ownerOrg?.name || publishAs.replace("org:", "");
    const ownerAvatar =
        publishAs === "personal"
            ? ownerInfo?.avatar_url || (isOwner ? user?.avatar_url : "")
            : ownerOrg?.logo_url || "";
    const ownerInitial = (ownerName || "?").charAt(0).toUpperCase();
    const selectedCollectionSlug =
        publishAs.startsWith("org:") && collectionId
            ? orgCollections.find((collection) => collection.id === collectionId)
                  ?.slug
            : null;
    const publishSlug = pendingSlugRef.current || slug || blogId;
    const publishedUrl = secret
        ? `/${blogId}`
        : `/${[ownerSlug, selectedCollectionSlug, publishSlug]
              .filter(Boolean)
              .join("/")}`;
    const originalPublishedLocation = publishedLocationSnapshotRef.current;
    const publishUrlWillChange = Boolean(
        isPublished &&
        originalPublishedLocation &&
        (originalPublishedLocation.slug !== publishSlug ||
            originalPublishedLocation.publishAs !== publishAs ||
            (originalPublishedLocation.collectionId || null) !==
                (collectionId || null)),
    );
    const previousPublishedUrl =
        originalPublishedLocation?.url || publishedUrl;
    // Nothing edited (content or settings) since load / last publish.
    const hasNoChanges = () =>
        !hasUnsavedEdits && settingsSnapshotRef.current === settingsKey();

    const toggleSecret = () => {
        if (isPublished) return;
        setSecret((s) => !s);
    };

    const submitBlogToContest = async (contestSlug = selectedContest) => {
        if (!contestSlug || !blogId) return true;
        setContestMessage("Submitting an immutable contest snapshot…");
        try {
            const response = await fetch(
                `/api/contests/${encodeURIComponent(contestSlug)}/submissions`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ blogId }),
                },
            );
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                setContestMessage(
                    result.error || "The contest submission failed.",
                );
                return false;
            }
            setContestMessage("Submitted to the contest successfully.");
            return true;
        } catch {
            setContestMessage(
                "The contest submission failed. Check your connection and retry.",
            );
            return false;
        }
    };

    const manageBlogPublication = async (action) => {
        if (!blogId || dangerBusy) return;
        const label = action === "archive" ? "archive" : "remove from listings";
        if (!window.confirm(`Are you sure you want to ${label} this blog?`))
            return;
        setDangerBusy(action);
        setPublishError("");
        try {
            const response = await fetch(`/api/blogs/${blogId}/manage`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(result.error || "The action failed.");
            bypassUnloadRef.current = true;
            window.location.assign("/profile");
        } catch (error) {
            setPublishError(error.message || "The action failed.");
        } finally {
            setDangerBusy("");
        }
    };

    // Secret posts can't carry sub-pages/canvases. Warn whenever the post is secret
    // and some already exist — covers both toggling it on and reopening a draft that
    // was already secret. Best-effort: the server refuses them regardless.
    useEffect(() => {
        if (!secret) {
            setSecretBlockers([]);
            return;
        }
        if (draftLoading || !blogId) return;
        let cancelled = false;
        fetch(`/api/subpages?blogId=${encodeURIComponent(blogId)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
                if (d && !cancelled) setSecretBlockers(d.subpages || []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [secret, draftLoading, blogId]);

    const doPublish = async (targetStatus) => {
        if (!canPublishNow || publishing) return;
        setPublishing(true);
        setPublishError("");
        setShowPublishMenu(false);
        try {
            await coverUploadRef.current;
        } catch {}
        // Flush any buffered subpage drafts so they ship with the post.
        try {
            await syncSubpageDrafts();
        } catch {}
        // Publish the exact revision we are about to send. This prevents a tag-only
        // edit from being rejected when a background draft save changed updated_at.
        const syncedUpdatedAt =
            dirtyRef.current || syncInFlightRef.current
                ? await syncToCloud({ silent: true })
                : lastKnownUpdatedAt;
        const persistedCover = persistableCover(
            draftDataRef.current.coverPreview,
        );
        // Buffered metadata inputs intentionally avoid re-rendering the large editor
        // on every keypress. Read their live values here so clicking Update during
        // the debounce window cannot publish the previous slug or tag set.
        const publishSlug = pendingSlugRef.current || slug;
        const publishTags = Array.isArray(draftDataRef.current.tags)
            ? draftDataRef.current.tags
            : tags;
        try {
            const res = await fetch("/api/blogs/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slugid: blogId,
                    title,
                    subtitle,
                    tags: publishTags,
                    publishAs,
                    collectionId,
                    editorContent: draftDataRef.current.editorContent,
                    pageEmoji,
                    coverUrl: persistedCover,
                    coverPos,
                    coverZoom,
                    slug: publishSlug,
                    status: targetStatus,
                    lastKnownUpdatedAt: syncedUpdatedAt || lastKnownUpdatedAt,
                    secret,
                    member_only: memberOnly,
                }),
            });

            if (res.status === 409) {
                // Conflict — upstream changed since we loaded. Show a custom modal with
                // a Sync option (adopt the latest version, then this publish wins).
                const data = await res.json();
                setConflict({
                    message:
                        data.message ||
                        "This blog was updated since you last synced.",
                    currentVersion: data.currentVersion,
                    status: targetStatus,
                });
                setPublishing(false);
                return;
            }

            if (res.ok) {
                const data = await res.json();
                // Badge evaluation runs in its own keepalive request so publishing and
                // navigation are never delayed by analytics qualification queries.
                fetch("/api/badges", { method: "POST", keepalive: true }).catch(
                    () => {},
                );
                setLastKnownUpdatedAt(data.updatedAt);
                setBlogVersion((v) =>
                    v
                        ? {
                              ...v,
                              isPublished: true,
                              updatedAt: data.updatedAt,
                              publishedAt: data.updatedAt,
                              isDraftAhead: false,
                          }
                        : v,
                );
                setHasUnsavedEdits(false);
                const finalSlug = data.slug || publishSlug;
                pendingSlugRef.current = finalSlug;
                setSlug(finalSlug);
                settingsSnapshotRef.current = settingsKey({
                    slug: finalSlug,
                    tags: publishTags,
                });
                publishedLocationSnapshotRef.current = {
                    slug: finalSlug,
                    publishAs,
                    collectionId: collectionId || null,
                    url: data.url || publishedUrl,
                };
                if (selectedContest) {
                    const submitted = await submitBlogToContest();
                    if (!submitted) {
                        setPublishError(
                            "The blog is published, but its contest submission failed. Review the contest requirements and retry below.",
                        );
                        setPublishing(false);
                        return;
                    }
                }
                setShowPublishPanel(false);
                // Redirect to published blog. Suppress the beforeunload leave-prompt —
                // state updates above haven't flushed yet, so the handler would still
                // see hasUnsavedEdits=true and prompt. Keep the overlay up through nav.
                const destination = data.url || publishedUrl;
                // In a collab session: signal the other editors that the blog just
                // published so they're synced and taken to the published view too.
                try {
                    collabConfig?.provider?.awareness?.setLocalStateField(
                        "lixPublished",
                        { url: destination, at: Date.now() },
                    );
                } catch {}
                bypassUnloadRef.current = true;
                // Close the cross-origin socket deliberately before leaving the editor.
                // Otherwise the browser reports an interrupted WebSocket while the new
                // published page is loading. Lock release is best-effort and survives
                // the navigation where supported.
                if (collabConfig?.provider) {
                    // Give the awareness update one event-loop turn to reach peers before
                    // intentionally closing this editor's socket.
                    await new Promise((resolve) => setTimeout(resolve, 40));
                    try {
                        collabConfig.provider.disconnect();
                    } catch {}
                }
                fetch("/api/collab/lock", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ blogId }),
                    keepalive: true,
                }).catch(() => {});
                window.location.replace(destination);
                return;
            }

            const data = await res.json().catch(() => ({}));
            setPublishError(
                data.error ||
                    `The blog could not be ${isPublished ? "updated" : "published"}. Please try again.`,
            );
        } catch (error) {
            console.error("Publish request failed:", error);
            setPublishError(
                `The blog could not be ${isPublished ? "updated" : "published"}. Check your connection and try again.`,
            );
        }
        setPublishing(false);
    };

    const handlePublish = () => doPublish("published");

    const handlePublishBeta = async () => {
        if (!title.trim() || publishing) return;
        setPublishing(true);
        setShowPublishMenu(false);
        try {
            await fetch("/api/blogs/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slugid: blogId,
                    title,
                    subtitle,
                    tags,
                    publishAs,
                    collectionId,
                    editorContent: draftDataRef.current.editorContent,
                    pageEmoji,
                    slug,
                    status: "unlisted",
                    lastKnownUpdatedAt,
                }),
            });
            setShowPublishPanel(false);
        } catch {
            /* silent */
        }
        setPublishing(false);
    };

    const handleInvite = async () => {
        if (!inviteUsername.trim()) return;
        setInviteError("");
        try {
            const res = await fetch("/api/blogs/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slugid: blogId,
                    username: inviteUsername.trim(),
                    role: inviteRole,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setCollaborators((prev) => [
                    ...prev.filter((c) => c.username !== inviteUsername.trim()),
                    {
                        username: inviteUsername.trim(),
                        role: inviteRole,
                        display_name: "",
                        avatar_url: "",
                    },
                ]);
                setInviteUsername("");
            } else {
                setInviteError(data.error || "Failed to invite");
            }
        } catch {
            setInviteError("Network error");
        }
    };

    const handleRemoveCollab = async (userId) => {
        try {
            await fetch("/api/blogs/invite", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slugid: blogId, userId }),
            });
            setCollaborators((prev) => prev.filter((c) => c.id !== userId));
        } catch {
            /* silent */
        }
    };

    const readTime = readTimeFromWords(wordCount);

    const formatSavedTime = (ts) => {
        if (!ts) return null;
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 10) return "Just saved";
        if (diff < 60) return `Saved ${diff}s ago`;
        if (diff < 3600) return `Saved ${Math.floor(diff / 60)}m ago`;
        return `Saved ${Math.floor(diff / 3600)}h ago`;
    };

    async function acceptInvite() {
        if (!inviteGate || inviteBusy) return;
        setInviteBusy(true);
        try {
            const res = await fetch("/api/blogs/invite", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slugid: inviteGate.blogId,
                    accept: true,
                }),
            });
            if (!res.ok) throw new Error();
            // Viewers can't edit — once accepted the blog is cross-posted to their
            // profile, so send them to the published reader view.
            if (inviteGate.role === "viewer") {
                window.location.href = `/${inviteGate.slug || inviteGate.blogId}`;
                return;
            }
            // Editor/admin: access is now granted — reload into the editor.
            window.location.reload();
        } catch {
            setInviteBusy(false);
        }
    }

    async function declineInvite() {
        if (!inviteGate || inviteBusy) return;
        setInviteBusy(true);
        try {
            await fetch("/api/blogs/invite", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slugid: inviteGate.blogId,
                    userId: user?.id,
                }),
            });
        } catch {
            /* best effort */
        }
        window.location.href = "/";
    }

    // ── Co-author invite gate ──
    if (inviteGate) {
        const isPending = inviteGate.status !== "accepted";
        const roleLabel =
            inviteGate.role === "admin"
                ? "Admin"
                : inviteGate.role === "editor"
                  ? "Editor"
                  : "Viewer";
        return (
            <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex items-center justify-center px-6">
                <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-8 text-center">
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
                            <h1 className="text-xl font-bold mb-2">
                                Collaboration invite
                            </h1>
                            <p className="text-[var(--text-muted)] text-[14px] mb-1">
                                You've been invited to collaborate on
                            </p>
                            <p className="text-[var(--text-primary)] font-semibold text-[15px] mb-3">
                                “{inviteGate.title || "Untitled blog"}”
                            </p>
                            <p className="text-[var(--text-faint)] text-[13px] mb-6">
                                Role:{" "}
                                <span className="text-[#9b7bf7] font-medium">
                                    {roleLabel}
                                </span>
                            </p>
                            <div className="flex items-center gap-3 justify-center">
                                <button
                                    onClick={declineInvite}
                                    disabled={inviteBusy}
                                    className="px-5 py-2 rounded-full text-[13px] font-medium border border-[var(--border-default)] text-[var(--text-body)] hover:border-[var(--border-hover)] transition-colors disabled:opacity-50"
                                >
                                    Decline
                                </button>
                                <button
                                    onClick={acceptInvite}
                                    disabled={inviteBusy}
                                    className="px-5 py-2 rounded-full text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
                                    style={{
                                        background:
                                            "linear-gradient(135deg, #9b7bf7 0%, #8b6ae6 100%)",
                                    }}
                                >
                                    {inviteBusy
                                        ? "Accepting…"
                                        : "Accept invite"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h1 className="text-xl font-bold mb-2">
                                View-only access
                            </h1>
                            <p className="text-[var(--text-muted)] text-[14px] mb-6">
                                You have viewer access to “
                                {inviteGate.title || "this blog"}” and can't
                                edit it.
                            </p>
                            <a
                                href={`/${inviteGate.slug || inviteGate.blogId}`}
                                className="inline-block px-5 py-2 rounded-full text-[13px] font-semibold text-white"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #9b7bf7 0%, #8b6ae6 100%)",
                                }}
                            >
                                Open blog
                            </a>
                        </>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] edit-page">
            <ContextualTipToast />
            {/* Header */}
            <header className="seasonal-themed-header fixed top-0 left-0 w-full h-14 border-b border-[var(--border-default)] flex items-center justify-between px-5 bg-[var(--bg-app)]/95 backdrop-blur-md z-50">
                {/* Left: Logo + breadcrumb */}
                <div className="flex items-center gap-3 min-w-0">
                    <Link
                        href="/"
                        className="flex items-center gap-2.5 flex-shrink-0"
                    >
                        <img
                            src={activeTheme?.icon || "/logo.png"}
                            alt=""
                            className={`h-7 w-7 rounded-full object-cover${activeTheme ? " seasonal-brand-icon" : ""}`}
                        />
                        <span className="text-lg font-bold font-kanit text-[var(--text-primary)] hidden sm:block">
                            LixBlogs
                        </span>
                    </Link>
                    <span className="text-[var(--text-faint)] text-sm">/</span>
                    <span className="text-[var(--text-muted)] text-[13px] truncate">
                        @{username}/{truncateSlug(slug || slugid)}
                    </span>
                    <span className="text-[var(--text-muted)] text-[11px] hidden md:flex items-center gap-1.5">
                        {isPublished ? (
                            <span
                                className="px-1.5 py-0.5 rounded border text-[10px] font-medium"
                                style={{
                                    backgroundColor: "#4ade8014",
                                    color: "#4ade80",
                                    borderColor: "#4ade8030",
                                }}
                            >
                                {blogVersion?.isDraftAhead
                                    ? "Edited"
                                    : "Published"}
                            </span>
                        ) : (
                            <span className="text-[var(--text-faint)] px-1.5 py-0.5 rounded border border-[var(--border-default)] bg-[var(--bg-surface)] text-[10px] font-medium">
                                Draft
                            </span>
                        )}
                        {lastSaved && <span>{formatSavedTime(lastSaved)}</span>}
                    </span>
                    {/* Sync status dot */}
                    {syncStatus !== "idle" && (
                        <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                                syncStatus === "syncing"
                                    ? "bg-yellow-400 animate-pulse"
                                    : syncStatus === "synced"
                                      ? "bg-green-400"
                                      : syncStatus === "local"
                                        ? "bg-yellow-500"
                                        : ""
                            }`}
                            title={
                                syncStatus === "syncing"
                                    ? "Syncing to cloud..."
                                    : syncStatus === "synced"
                                      ? "Saved to cloud"
                                      : syncStatus === "local"
                                        ? "Saved locally"
                                        : ""
                            }
                        />
                    )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2.5">
                    {/* Live collaborators — avatars of everyone currently editing (#11) */}
                    {collabConnected && connectedUsers.length > 1 && (
                        <div
                            className="flex items-center -space-x-2 mr-1"
                            title={`${connectedUsers.length} editing now`}
                        >
                            {connectedUsers.slice(0, 5).map((u, i) =>
                                u.avatar ? (
                                    <img
                                        key={u.id || i}
                                        src={u.avatar}
                                        alt={u.name}
                                        title={u.name}
                                        className="w-7 h-7 rounded-full object-cover"
                                        style={{
                                            border: `2px solid ${u.color || "#9b7bf7"}`,
                                            boxShadow:
                                                "0 0 0 2px var(--bg-app)",
                                        }}
                                    />
                                ) : (
                                    <div
                                        key={u.id || i}
                                        title={u.name}
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                                        style={{
                                            backgroundColor:
                                                u.color || "#9b7bf7",
                                            border: "2px solid var(--bg-app)",
                                        }}
                                    >
                                        {(u.name || "?")[0].toUpperCase()}
                                    </div>
                                ),
                            )}
                            {connectedUsers.length > 5 && (
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                                    style={{
                                        border: "2px solid var(--bg-app)",
                                    }}
                                >
                                    +{connectedUsers.length - 5}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Version history (#11 E) */}
                    <div ref={historyRef} className="relative">
                        <button
                            onClick={() =>
                                showHistory
                                    ? setShowHistory(false)
                                    : openHistory()
                            }
                            className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[12px] font-medium transition-colors"
                            style={{
                                backgroundColor: "var(--bg-surface)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-muted)",
                            }}
                            title="Version history"
                        >
                            <ion-icon
                                name="time-outline"
                                style={{ fontSize: "15px" }}
                            />
                            <span className="hidden md:inline">History</span>
                        </button>
                        {showHistory && (
                            <div
                                className="absolute right-0 top-10 z-50 w-[22rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl p-1.5"
                                style={{
                                    backgroundColor: "var(--bg-surface)",
                                    border: "1px solid var(--border-default)",
                                    boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                                }}
                            >
                                <p
                                    className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1.5"
                                    style={{ color: "var(--text-faint)" }}
                                >
                                    Version history
                                </p>
                                {historyLoading ? (
                                    <div className="flex items-center gap-2 px-2.5 py-4 text-[12px] text-[var(--text-faint)]">
                                        <span className="h-3.5 w-3.5 rounded-full border-2 border-[#9b7bf7]/25 border-t-[#9b7bf7] animate-spin" />
                                        Loading saved versions…
                                    </div>
                                ) : historyError ? (
                                    <div className="px-2.5 py-3">
                                        <p className="text-[12px] text-red-400">
                                            {historyError}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={openHistory}
                                            className="mt-2 text-[11px] font-semibold text-[#9b7bf7]"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                ) : versions.length === 0 ? (
                                    <p
                                        className="text-[12px] px-2.5 py-3"
                                        style={{ color: "var(--text-faint)" }}
                                    >
                                        No saved versions yet. A history entry
                                        is created as you edit and publish.
                                    </p>
                                ) : (
                                    versions.map((v) => (
                                        <div
                                            key={v.id}
                                            className="flex items-start justify-between gap-3 px-2.5 py-2.5 rounded-lg hover:bg-[var(--bg-active)]"
                                        >
                                            <div className="min-w-0">
                                                <p
                                                    className="text-[12px] font-medium truncate"
                                                    style={{
                                                        color: "var(--text-primary)",
                                                    }}
                                                >
                                                    {versionLabel(v.label)}
                                                </p>
                                                <p
                                                    className="text-[11px] truncate"
                                                    style={{
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    {new Date(
                                                        v.created_at * 1000,
                                                    ).toLocaleString()}
                                                    {v.username
                                                        ? ` · @${v.username}`
                                                        : ""}
                                                </p>
                                                <p
                                                    className="mt-1 text-[11px] line-clamp-2 leading-relaxed"
                                                    style={{
                                                        color: "var(--text-muted)",
                                                    }}
                                                >
                                                    {v.excerpt ||
                                                        "Empty document"}
                                                </p>
                                                <p
                                                    className="mt-1 text-[10px]"
                                                    style={{
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    {v.word_count || 0} words
                                                </p>
                                            </div>
                                            <div className="flex flex-col gap-1 flex-shrink-0">
                                                <button
                                                    type="button"
                                                    disabled={
                                                        historyActionId === v.id
                                                    }
                                                    onClick={() =>
                                                        previewVersion(v)
                                                    }
                                                    className="text-[11px] font-medium px-2 py-1 rounded-md disabled:opacity-50"
                                                    style={{
                                                        color: "var(--text-secondary)",
                                                        border: "1px solid var(--border-default)",
                                                    }}
                                                >
                                                    Preview
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={
                                                        historyActionId === v.id
                                                    }
                                                    onClick={() =>
                                                        restoreVersion(v.id)
                                                    }
                                                    className="text-[11px] font-medium px-2 py-1 rounded-md disabled:opacity-50"
                                                    style={{
                                                        color: "#9b7bf7",
                                                        backgroundColor:
                                                            "rgba(155,123,247,0.1)",
                                                    }}
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Hidden file input for markdown import (triggered from menu) */}
                    <input
                        ref={mdUploadRef}
                        type="file"
                        accept=".md,.markdown,.txt"
                        className="hidden"
                        onChange={handleMdUpload}
                    />

                    {/* Publish / Update split button */}
                    <div
                        ref={publishMenuRef}
                        className="relative group/publish"
                    >
                        {(() => {
                            const titleWords = title
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean).length;
                            const canPublish = titleWords >= 2;
                            return (
                                <>
                                    <div
                                        className="flex items-stretch rounded-full overflow-hidden"
                                        style={{
                                            background:
                                                "linear-gradient(135deg, #9b7bf7 0%, #8b6ae6 100%)",
                                            boxShadow: canPublish
                                                ? "0 2px 8px rgba(155,123,247,0.25)"
                                                : "none",
                                            opacity: canPublish ? 1 : 0.5,
                                        }}
                                    >
                                        <button
                                            onClick={() => {
                                                if (!canPublish) return;
                                                if (isPublished) {
                                                    // No edits since publish → skip the update entirely, just view it.
                                                    // Otherwise open the publish panel; the final confirm happens there.
                                                    if (hasNoChanges()) {
                                                        bypassUnloadRef.current = true;
                                                        window.location.href =
                                                            publishedUrl;
                                                    } else {
                                                        setShowPublishPanel(
                                                            true,
                                                        );
                                                    }
                                                } else {
                                                    setShowPublishPanel(
                                                        !showPublishPanel,
                                                    );
                                                }
                                            }}
                                            disabled={!canPublish}
                                            className="px-4 py-1.5 text-white font-semibold text-[13px] transition-colors flex items-center gap-1.5 disabled:cursor-not-allowed hover:bg-black/10 active:bg-black/20"
                                        >
                                            <ion-icon
                                                name={
                                                    isPublished
                                                        ? "cloud-upload-outline"
                                                        : "send-outline"
                                                }
                                                style={{ fontSize: "14px" }}
                                            />
                                            {isPublished ? "Update" : "Publish"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowPublishMenu(
                                                    !showPublishMenu,
                                                )
                                            }
                                            className="px-2.5 py-1.5 text-white transition-colors border-l border-white/15 flex items-center justify-center hover:bg-black/10 active:bg-black/20"
                                            aria-label="Publishing and export options"
                                            aria-expanded={showPublishMenu}
                                        >
                                            <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Title hint when publish is disabled */}
                                    {!canPublish && !showPublishMenu && (
                                        <div
                                            className="absolute right-0 top-full mt-2 whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-medium z-50 opacity-0 group-hover/publish:opacity-100 transition-opacity pointer-events-none"
                                            style={{
                                                backgroundColor:
                                                    "var(--bg-elevated)",
                                                color: "var(--text-muted)",
                                                border: "1px solid var(--border-default)",
                                                boxShadow: "var(--shadow-sm)",
                                            }}
                                        >
                                            Add a title (at least 2 words) to
                                            publish
                                        </div>
                                    )}

                                    {showPublishMenu && (
                                            <div
                                                className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl z-50 overflow-hidden py-1"
                                                style={{
                                                    backgroundColor:
                                                        "var(--dropdown-bg)",
                                                    border: "1px solid var(--dropdown-border)",
                                                }}
                                            >
                                                <button
                                                    disabled={savingDraft}
                                                    onClick={handleSaveDraft}
                                                    className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)] flex items-center gap-2.5 transition-colors disabled:opacity-60"
                                                    style={{
                                                        color: "var(--text-secondary)",
                                                    }}
                                                >
                                                    {savingDraft ? (
                                                        <span className="h-[15px] w-[15px] rounded-full border-2 border-[#9b7bf7]/30 border-t-[#9b7bf7] animate-spin" />
                                                    ) : (
                                                        <ion-icon
                                                            name="save-outline"
                                                            style={{
                                                                fontSize:
                                                                    "15px",
                                                                color: "var(--text-faint)",
                                                            }}
                                                        />
                                                    )}
                                                    {savingDraft
                                                        ? "Syncing draft…"
                                                        : "Save Draft"}
                                                </button>
                                                <div className="my-1 border-t border-[var(--dropdown-border)]" />
                                                <button
                                                    type="button"
                                                    onClick={handleCopyMarkdown}
                                                    className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)] flex items-center gap-2.5 transition-colors"
                                                    style={{
                                                        color: "var(--text-secondary)",
                                                    }}
                                                >
                                                    <ion-icon
                                                        name="copy-outline"
                                                        style={{
                                                            fontSize: "15px",
                                                            color: "var(--text-faint)",
                                                        }}
                                                    />
                                                    Copy as Markdown
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleDownloadPdf}
                                                    className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)] flex items-center gap-2.5 transition-colors"
                                                    style={{
                                                        color: "var(--text-secondary)",
                                                    }}
                                                >
                                                    <ion-icon
                                                        name="document-outline"
                                                        style={{
                                                            fontSize: "15px",
                                                            color: "var(--text-faint)",
                                                        }}
                                                    />
                                                    Download as PDF
                                                </button>
                                                <div className="my-1 border-t border-[var(--dropdown-border)]" />
                                                {isPublished ? (
                                                    <button
                                                        disabled={!canPublish}
                                                        onClick={handlePublish}
                                                        className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)] flex items-center gap-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                        style={{
                                                            color: "var(--text-secondary)",
                                                        }}
                                                    >
                                                        <ion-icon
                                                            name="cloud-upload-outline"
                                                            style={{
                                                                fontSize:
                                                                    "15px",
                                                                color: "var(--text-faint)",
                                                            }}
                                                        />
                                                        Update Published
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            disabled={!canPublish}
                                                            onClick={
                                                                handlePublish
                                                            }
                                                            className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)] flex items-center gap-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                            style={{
                                                                color: "var(--text-secondary)",
                                                            }}
                                                        >
                                                            <ion-icon
                                                                name="send-outline"
                                                                style={{
                                                                    fontSize:
                                                                        "15px",
                                                                    color: "var(--text-faint)",
                                                                }}
                                                            />
                                                            Publish
                                                        </button>
                                                        <button
                                                            disabled={!canPublish}
                                                            onClick={
                                                                handlePublishBeta
                                                            }
                                                            className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)] flex items-center gap-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                            style={{
                                                                color: "var(--text-muted)",
                                                            }}
                                                        >
                                                            <ion-icon
                                                                name="eye-outline"
                                                                style={{
                                                                    fontSize:
                                                                        "15px",
                                                                    color: "var(--text-faint)",
                                                                }}
                                                            />
                                                            Publish Unlisted
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    {/* Theme toggle */}
                    <button
                        onClick={toggleTheme}
                        className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                        style={{
                            backgroundColor: "var(--bg-surface)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                        }}
                        title={
                            isDark
                                ? "Switch to light mode"
                                : "Switch to dark mode"
                        }
                    >
                        {isDark ? (
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="12" cy="12" r="4" />
                                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                            </svg>
                        ) : (
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        )}
                    </button>

                    {/* Shortcuts help */}
                    <button
                        data-shortcuts-btn
                        onClick={() => setShowShortcuts(true)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors text-sm font-bold"
                        style={{
                            backgroundColor: "var(--bg-surface)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                        }}
                        title="Keyboard shortcuts"
                    >
                        ?
                    </button>

                    {/* Page color (members only) */}
                    {user?.tier === "member" && (
                        <button
                            onClick={() => setShowColorPanel(!showColorPanel)}
                            className="h-8 w-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center hover:border-[var(--border-hover)] transition-colors"
                            title="Page theme color"
                        >
                            <div
                                className="w-4 h-4 rounded-full"
                                style={{
                                    background:
                                        pageColor ||
                                        "linear-gradient(135deg, #9b7bf7, #60a5fa, #4ade80)",
                                    border: "1.5px solid var(--border-default)",
                                }}
                            />
                        </button>
                    )}

                    {/* Hamburger menu */}
                    <HamburgerMenu
                        onImport={() => mdUploadRef.current?.click()}
                        onInvite={() => setShowCollabPanel(true)}
                        onShareDraft={() => {
                            const url = `${window.location.origin}/${username}/${slug || slugid}`;
                            navigator.clipboard.writeText(url).catch(() => {});
                        }}
                        onCopyBlogId={async () => {
                            try {
                                await navigator.clipboard.writeText(blogId);
                                showClipboardToast("Blog ID copied");
                            } catch {
                                showClipboardToast(
                                    "Could not copy the Blog ID",
                                    "error",
                                );
                            }
                        }}
                        onChangeCover={() => setShowCoverModal(true)}
                        onChangeTitle={() =>
                            document
                                .querySelector(
                                    'textarea[placeholder="Blog title..."]',
                                )
                                ?.focus()
                        }
                        onChangeTopics={() => setShowPublishPanel(true)}
                        onRevisionHistory={() => {}}
                        onMoreSettings={() => setShowPublishPanel(true)}
                    />

                    {/* Profile dropdown */}
                    {user && (
                        <HeaderProfileDropdown user={user} logout={logout} />
                    )}
                </div>
            </header>

            {/* Main Content Area */}
            <main
                className="pt-14 flex justify-center editor-texture-bg"
                style={pageColor ? { backgroundColor: pageColor } : undefined}
            >
                <div
                    className={`w-full max-w-[720px] px-6 py-8 ${showPublishPanel ? "mr-[400px]" : ""} transition-all`}
                >
                    {/* Mode icons */}
                    <div className="flex items-center gap-0.5 mb-5">
                        {[
                            {
                                key: "edit",
                                icon: (
                                    <svg
                                        width="15"
                                        height="15"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                ),
                            },
                            {
                                key: "preview",
                                icon: (
                                    <svg
                                        width="15"
                                        height="15"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                ),
                            },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => switchMode(tab.key)}
                                className={`p-1.5 rounded-md transition-all ${
                                    mode === tab.key
                                        ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)]"
                                        : "text-[var(--text-muted)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-surface)]/50"
                                }`}
                                title={
                                    tab.key.charAt(0).toUpperCase() +
                                    tab.key.slice(1)
                                }
                            >
                                {tab.icon}
                            </button>
                        ))}
                    </div>

                    {/* === EDIT MODE (always mounted, hidden when not active so AI can keep typing) === */}
                    <div
                        style={{ display: mode === "edit" ? "block" : "none" }}
                    >
                        <>
                            {/* Skeleton — visible until editor is ready */}
                            {(draftLoading || !editorReady) && (
                                <div className="animate-pulse space-y-4">
                                    <div className="w-full h-[200px] bg-[var(--bg-elevated)] rounded-xl" />
                                    <div className="h-10 bg-[var(--bg-elevated)] rounded-lg w-3/4" />
                                    <div className="space-y-3 mt-6">
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-5/6" />
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-2/3" />
                                        <div className="h-6 bg-[var(--bg-elevated)] rounded w-1/2 mt-5" />
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-4/5" />
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
                                        <div className="h-4 bg-[var(--bg-elevated)] rounded w-3/4" />
                                    </div>
                                </div>
                            )}

                            {/* Editor — rendered hidden until ready, then shown */}
                            {!draftLoading && (
                                <div
                                    style={{
                                        display: editorReady ? "block" : "none",
                                    }}
                                >
                                    <>
                                        {/* Cover banner with emoji overlay */}
                                        <div className="relative mb-2">
                                            {coverPreview && !showCoverModal ? (
                                                <div
                                                    className="relative rounded-xl overflow-hidden group cover-banner-enter"
                                                    style={{
                                                        height: "220px",
                                                        cursor: isDraggingCover
                                                            ? "grabbing"
                                                            : "default",
                                                    }}
                                                    onMouseDown={(e) => {
                                                        if (e.button !== 0)
                                                            return;
                                                        setIsDraggingCover(
                                                            true,
                                                        );
                                                        coverDragStart.current =
                                                            {
                                                                x: e.clientX,
                                                                y: e.clientY,
                                                                posX: coverPos.x,
                                                                posY: coverPos.y,
                                                            };
                                                    }}
                                                    onMouseMove={(e) => {
                                                        if (!isDraggingCover)
                                                            return;
                                                        const dx =
                                                            ((e.clientX -
                                                                coverDragStart
                                                                    .current
                                                                    .x) /
                                                                7) *
                                                            -1;
                                                        const dy =
                                                            ((e.clientY -
                                                                coverDragStart
                                                                    .current
                                                                    .y) /
                                                                3) *
                                                            -1;
                                                        setCoverPos({
                                                            x: Math.max(
                                                                0,
                                                                Math.min(
                                                                    100,
                                                                    coverDragStart
                                                                        .current
                                                                        .posX +
                                                                        dx,
                                                                ),
                                                            ),
                                                            y: Math.max(
                                                                0,
                                                                Math.min(
                                                                    100,
                                                                    coverDragStart
                                                                        .current
                                                                        .posY +
                                                                        dy,
                                                                ),
                                                            ),
                                                        });
                                                    }}
                                                    onMouseUp={() =>
                                                        setIsDraggingCover(
                                                            false,
                                                        )
                                                    }
                                                    onMouseLeave={() =>
                                                        setIsDraggingCover(
                                                            false,
                                                        )
                                                    }
                                                >
                                                    <img
                                                        src={coverPreview}
                                                        alt="Cover"
                                                        className="w-full h-full object-cover select-none"
                                                        draggable={false}
                                                        style={{
                                                            objectPosition: `${coverPos.x}% ${coverPos.y}%`,
                                                            transform: `scale(${coverZoom})`,
                                                            transition:
                                                                isDraggingCover
                                                                    ? "none"
                                                                    : "transform 0.2s ease",
                                                        }}
                                                    />
                                                    {coverUploading && (
                                                        <div
                                                            className="cover-upload-overlay absolute inset-0 z-20 flex items-center justify-center"
                                                            role="status"
                                                            aria-live="polite"
                                                        >
                                                            <div className="cover-upload-status">
                                                                <span
                                                                    className="cover-upload-spinner"
                                                                    aria-hidden="true"
                                                                />
                                                                <span>
                                                                    Uploading
                                                                    cover…
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Hover toolbar — top-right */}
                                                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {/* Zoom out */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCoverZoom(
                                                                    (z) =>
                                                                        Math.max(
                                                                            1,
                                                                            z -
                                                                                0.1,
                                                                        ),
                                                                );
                                                            }}
                                                            className="cover-toolbar-btn"
                                                            title="Zoom out"
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <circle
                                                                    cx="11"
                                                                    cy="11"
                                                                    r="8"
                                                                />
                                                                <line
                                                                    x1="21"
                                                                    y1="21"
                                                                    x2="16.65"
                                                                    y2="16.65"
                                                                />
                                                                <line
                                                                    x1="8"
                                                                    y1="11"
                                                                    x2="14"
                                                                    y2="11"
                                                                />
                                                            </svg>
                                                        </button>
                                                        {/* Zoom in */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCoverZoom(
                                                                    (z) =>
                                                                        Math.min(
                                                                            3,
                                                                            z +
                                                                                0.1,
                                                                        ),
                                                                );
                                                            }}
                                                            className="cover-toolbar-btn"
                                                            title="Zoom in"
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <circle
                                                                    cx="11"
                                                                    cy="11"
                                                                    r="8"
                                                                />
                                                                <line
                                                                    x1="21"
                                                                    y1="21"
                                                                    x2="16.65"
                                                                    y2="16.65"
                                                                />
                                                                <line
                                                                    x1="11"
                                                                    y1="8"
                                                                    x2="11"
                                                                    y2="14"
                                                                />
                                                                <line
                                                                    x1="8"
                                                                    y1="11"
                                                                    x2="14"
                                                                    y2="11"
                                                                />
                                                            </svg>
                                                        </button>
                                                        {/* Reset position */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCoverZoom(1);
                                                                setCoverPos({
                                                                    x: 50,
                                                                    y: 50,
                                                                });
                                                            }}
                                                            className="cover-toolbar-btn"
                                                            title="Reset"
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <polyline points="1 4 1 10 7 10" />
                                                                <path d="M3.51 15a9 9 0 105.64-8.36L1 10" />
                                                            </svg>
                                                        </button>
                                                        {/* Separator */}
                                                        <div className="w-px h-4 bg-white/20 mx-0.5" />
                                                        {/* Replace */}
                                                        <button
                                                            type="button"
                                                            className="cover-toolbar-btn cursor-pointer"
                                                            title="Replace cover"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                setCoverUrlMode(false);
                                                                setCoverUrlInput("");
                                                                setShowCoverModal(true);
                                                            }}
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <rect
                                                                    x="3"
                                                                    y="3"
                                                                    width="18"
                                                                    height="18"
                                                                    rx="2"
                                                                    ry="2"
                                                                />
                                                                <circle
                                                                    cx="8.5"
                                                                    cy="8.5"
                                                                    r="1.5"
                                                                />
                                                                <polyline points="21 15 16 10 5 21" />
                                                            </svg>
                                                        </button>
                                                        {/* Remove */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeCover();
                                                                setCoverZoom(1);
                                                                setCoverPos({
                                                                    x: 50,
                                                                    y: 50,
                                                                });
                                                            }}
                                                            className="cover-toolbar-btn cover-toolbar-btn-danger"
                                                            title="Remove"
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <polyline points="3 6 5 6 21 6" />
                                                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    {/* Drag hint — pill is always dark, so keep the text light in any theme */}
                                                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-white/80 bg-black/40 backdrop-blur rounded-full px-3 py-1 pointer-events-none select-none">
                                                        Drag to reposition
                                                    </div>
                                                </div>
                                            ) : showCoverModal ? (
                                                <div
                                                    className="relative rounded-xl overflow-hidden cover-banner-enter"
                                                    style={{ height: "220px" }}
                                                >
                                                    <div className="absolute inset-0 cover-gradient-blur" />
                                                    <div className="absolute inset-0 flex items-center justify-center gap-6 z-10">
                                                        <label className="cover-source-option flex flex-col items-center gap-2 cursor-pointer">
                                                            <div className="cover-source-icon">
                                                                <svg
                                                                    width="20"
                                                                    height="20"
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    strokeWidth="2"
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                >
                                                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                                                    <polyline points="17 8 12 3 7 8" />
                                                                    <line
                                                                        x1="12"
                                                                        y1="3"
                                                                        x2="12"
                                                                        y2="15"
                                                                    />
                                                                </svg>
                                                            </div>
                                                            <span className="cover-source-label text-xs font-medium">
                                                                From device
                                                            </span>
                                                            <input
                                                                type="file"
                                                                accept={
                                                                    IMAGE_ACCEPT_ATTR
                                                                }
                                                                className="hidden"
                                                                onChange={(
                                                                    e,
                                                                ) => {
                                                                    openCoverCropper(
                                                                        e.target
                                                                            .files?.[0],
                                                                    );
                                                                    e.target.value =
                                                                        "";
                                                                }}
                                                            />
                                                        </label>
                                                        <button
                                                            onClick={() =>
                                                                setCoverUrlMode(
                                                                    true,
                                                                )
                                                            }
                                                            className="cover-source-option flex flex-col items-center gap-2"
                                                        >
                                                            <div className="cover-source-icon">
                                                                <svg
                                                                    width="20"
                                                                    height="20"
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    strokeWidth="2"
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                >
                                                                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                                                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                                                </svg>
                                                            </div>
                                                            <span className="cover-source-label text-xs font-medium">
                                                                From URL
                                                            </span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                // The default is a deterministic cosmetic fallback,
                                                                // not user media. Keep it as a data URL for preview;
                                                                // persistableCover deliberately stores NULL so the
                                                                // reader/feed regenerate it without using storage.
                                                                localStorage.removeItem(
                                                                    `lixblogs:cover-upload:${blogId}`,
                                                                );
                                                                const defaultCover =
                                                                    generateBlogBanner(
                                                                        blogId,
                                                                    );
                                                                draftDataRef.current =
                                                                    {
                                                                        ...draftDataRef.current,
                                                                        coverPreview:
                                                                            defaultCover,
                                                                    };
                                                                setCoverPreview(
                                                                    defaultCover,
                                                                );
                                                                setShowCoverModal(
                                                                    false,
                                                                );
                                                            }}
                                                            className="cover-source-option flex flex-col items-center gap-2"
                                                        >
                                                            <div className="cover-source-icon">
                                                                <svg
                                                                    width="20"
                                                                    height="20"
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    strokeWidth="2"
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                >
                                                                    <rect
                                                                        x="3"
                                                                        y="3"
                                                                        width="7"
                                                                        height="7"
                                                                    />
                                                                    <rect
                                                                        x="14"
                                                                        y="3"
                                                                        width="7"
                                                                        height="7"
                                                                    />
                                                                    <rect
                                                                        x="3"
                                                                        y="14"
                                                                        width="7"
                                                                        height="7"
                                                                    />
                                                                    <rect
                                                                        x="14"
                                                                        y="14"
                                                                        width="7"
                                                                        height="7"
                                                                    />
                                                                </svg>
                                                            </div>
                                                            <span className="cover-source-label text-xs font-medium">
                                                                Use default
                                                            </span>
                                                        </button>
                                                    </div>
                                                    {/* Inline URL input — slides up from bottom */}
                                                    {coverUrlMode && (
                                                        <div
                                                            className="absolute bottom-0 left-0 right-0 z-20 backdrop-blur-md p-4 rounded-b-xl"
                                                            style={{
                                                                backgroundColor:
                                                                    "color-mix(in srgb, var(--bg-surface) 94%, transparent)",
                                                                borderTop:
                                                                    "1px solid var(--border-default)",
                                                            }}
                                                        >
                                                            <div className="flex gap-2">
                                                                <input
                                                                    autoFocus
                                                                    type="url"
                                                                    value={
                                                                        coverUrlInput
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        setCoverUrlInput(
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        )
                                                                    }
                                                                    onKeyDown={(
                                                                        e,
                                                                    ) => {
                                                                        if (
                                                                            e.key ===
                                                                                "Enter" &&
                                                                            coverUrlInput.trim()
                                                                        ) {
                                                                            const url =
                                                                                coverUrlInput.trim();
                                                                            setCoverPreview(
                                                                                url,
                                                                            );
                                                                            setShowCoverModal(
                                                                                false,
                                                                            );
                                                                            setCoverUrlMode(
                                                                                false,
                                                                            );
                                                                            setCoverUrlInput(
                                                                                "",
                                                                            );
                                                                        }
                                                                        if (
                                                                            e.key ===
                                                                            "Escape"
                                                                        ) {
                                                                            setCoverUrlMode(
                                                                                false,
                                                                            );
                                                                            setCoverUrlInput(
                                                                                "",
                                                                            );
                                                                        }
                                                                    }}
                                                                    placeholder="Paste image URL and press Enter..."
                                                                    className="flex-1 rounded-lg px-3 py-2 text-[13px] outline-none placeholder:text-[var(--text-faint)] focus:border-[#9b7bf7]"
                                                                    style={{
                                                                        backgroundColor:
                                                                            "var(--bg-app)",
                                                                        color: "var(--text-primary)",
                                                                        border: "1px solid var(--border-default)",
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        if (
                                                                            coverUrlInput.trim()
                                                                        ) {
                                                                            const url =
                                                                                coverUrlInput.trim();
                                                                            setCoverPreview(
                                                                                url,
                                                                            );
                                                                            setShowCoverModal(
                                                                                false,
                                                                            );
                                                                            setCoverUrlMode(
                                                                                false,
                                                                            );
                                                                            setCoverUrlInput(
                                                                                "",
                                                                            );
                                                                        }
                                                                    }}
                                                                    className="px-4 py-2 bg-[#9b7bf7] text-white rounded-lg text-[13px] font-medium hover:bg-[#8a68ee] transition-colors disabled:opacity-50"
                                                                    disabled={
                                                                        !coverUrlInput.trim()
                                                                    }
                                                                >
                                                                    Set
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() =>
                                                            setShowCoverModal(
                                                                false,
                                                            )
                                                        }
                                                        className="cover-source-close absolute top-3 right-3 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                                                        aria-label="Close cover options"
                                                    >
                                                        <svg
                                                            width="14"
                                                            height="14"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <line
                                                                x1="18"
                                                                y1="6"
                                                                x2="6"
                                                                y2="18"
                                                            />
                                                            <line
                                                                x1="6"
                                                                y1="6"
                                                                x2="18"
                                                                y2="18"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ) : null}

                                            {/* Cover crop + stylise (opens when a device image is chosen) */}
                                            {coverCropSrc && (
                                                <ImageCropModal
                                                    title="Crop cover"
                                                    aspectRatio={16 / 5}
                                                    outputWidth={1600}
                                                    quality={0.55}
                                                    maxSizeKB={120}
                                                    initialSrc={coverCropSrc}
                                                    belowHeader
                                                    onSave={handleCoverCropSave}
                                                    onClose={() =>
                                                        setCoverCropSrc(null)
                                                    }
                                                />
                                            )}

                                            {/* Emoji overlapping banner bottom-left */}
                                            {pageEmoji && (
                                                <div
                                                    className="absolute group"
                                                    style={{
                                                        bottom:
                                                            coverPreview ||
                                                            showCoverModal
                                                                ? "-24px"
                                                                : "auto",
                                                        left: "16px",
                                                        position:
                                                            coverPreview ||
                                                            showCoverModal
                                                                ? "absolute"
                                                                : "relative",
                                                        zIndex: 10,
                                                    }}
                                                >
                                                    <div
                                                        className="w-[72px] h-[72px] rounded-full bg-[var(--bg-elevated)] flex items-center justify-center cursor-pointer relative"
                                                        style={{
                                                            borderRadius: "50%",
                                                        }}
                                                        onClick={() =>
                                                            setShowEmojiPicker(
                                                                true,
                                                            )
                                                        }
                                                    >
                                                        <span className="text-[42px] leading-none select-none">
                                                            {pageEmoji}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() =>
                                                            setPageEmoji(null)
                                                        }
                                                        className="absolute -top-1 -left-1 opacity-0 group-hover:opacity-100 h-5 w-5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-hover)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all text-[10px] z-20"
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Spacer when emoji overlaps banner */}
                                        {pageEmoji &&
                                            (coverPreview ||
                                                showCoverModal) && (
                                                <div className="h-8" />
                                            )}

                                        {/* Add cover / Add emoji buttons */}
                                        {(!coverPreview || !pageEmoji) &&
                                            !showCoverModal && (
                                                <div className="flex items-center gap-3 mb-4 mt-2">
                                                    {!coverPreview && (
                                                        <button
                                                            onClick={() =>
                                                                setShowCoverModal(
                                                                    true,
                                                                )
                                                            }
                                                            className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[#9b7bf7] transition-colors text-xs"
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <rect
                                                                    x="3"
                                                                    y="3"
                                                                    width="18"
                                                                    height="18"
                                                                    rx="2"
                                                                    ry="2"
                                                                />
                                                                <circle
                                                                    cx="8.5"
                                                                    cy="8.5"
                                                                    r="1.5"
                                                                />
                                                                <polyline points="21 15 16 10 5 21" />
                                                            </svg>
                                                            Add cover
                                                        </button>
                                                    )}
                                                    {!pageEmoji && (
                                                        <button
                                                            onClick={() =>
                                                                setShowEmojiPicker(
                                                                    true,
                                                                )
                                                            }
                                                            className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[#9b7bf7] transition-colors text-xs"
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <circle
                                                                    cx="12"
                                                                    cy="12"
                                                                    r="10"
                                                                />
                                                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                                                <line
                                                                    x1="9"
                                                                    y1="9"
                                                                    x2="9.01"
                                                                    y2="9"
                                                                />
                                                                <line
                                                                    x1="15"
                                                                    y1="9"
                                                                    x2="15.01"
                                                                    y2="9"
                                                                />
                                                            </svg>
                                                            Add emoji
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                        {/* Emoji picker — absolute positioned, glassmorphic */}
                                        {showEmojiPicker && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-[60]"
                                                    onClick={() =>
                                                        setShowEmojiPicker(
                                                            false,
                                                        )
                                                    }
                                                />
                                                <div className="relative">
                                                    <div className="absolute left-0 top-0 z-[61] emoji-picker-glass">
                                                        <EmojiPicker
                                                            onSelect={(
                                                                emoji,
                                                            ) => {
                                                                setPageEmoji(
                                                                    emoji,
                                                                );
                                                                setShowEmojiPicker(
                                                                    false,
                                                                );
                                                            }}
                                                            onRemove={() => {
                                                                setPageEmoji(
                                                                    null,
                                                                );
                                                                setShowEmojiPicker(
                                                                    false,
                                                                );
                                                            }}
                                                            onClose={() =>
                                                                setShowEmojiPicker(
                                                                    false,
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* Author bar — above title */}
                                        <div className="flex items-center gap-3 mt-2 mb-2">
                                            <div className="flex -space-x-2">
                                                <AvatarImg
                                                    src={user?.avatar_url}
                                                    name={
                                                        user?.display_name ||
                                                        user?.username
                                                    }
                                                    size={30}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2 text-[15px] text-[var(--text-faint)]">
                                                <span className="text-[var(--text-muted)] font-medium">
                                                    {user?.display_name ||
                                                        user?.username ||
                                                        "Author"}
                                                </span>
                                                <span className="text-[var(--text-faint)]">
                                                    ·
                                                </span>
                                                <span>
                                                    {readTimeFromWords(
                                                        wordCount,
                                                    )}{" "}
                                                    min read
                                                </span>
                                                <span className="text-[var(--text-faint)]">
                                                    ·
                                                </span>
                                                <span>
                                                    {wordCount}{" "}
                                                    {wordCount === 1
                                                        ? "word"
                                                        : "words"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 30px gap before title */}
                                        <div style={{ height: "30px" }} />

                                        {/* Title */}
                                        <div className="relative">
                                            <textarea
                                                ref={titleTextareaRef}
                                                value={title}
                                                onChange={(e) => {
                                                    setTitle(e.target.value);
                                                    setAiTitleKey(0);
                                                    e.target.style.height =
                                                        "auto";
                                                    e.target.style.height =
                                                        e.target.scrollHeight +
                                                        "px";
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter")
                                                        e.preventDefault();
                                                }}
                                                placeholder="Blog title..."
                                                className={`w-full bg-transparent text-[2em] font-extrabold outline-none placeholder-[var(--text-faint)] mb-1 leading-tight resize-none overflow-hidden min-h-[1.2em] ${aiTitleKey > 0 ? "text-transparent" : ""}`}
                                                rows={1}
                                            />
                                            {aiTitleKey > 0 && title && (
                                                <div
                                                    className="absolute inset-0 pointer-events-none text-[2em] font-extrabold leading-tight flex flex-wrap items-start"
                                                    key={aiTitleKey}
                                                >
                                                    {title
                                                        .split(/(\s+)/)
                                                        .map((word, i) =>
                                                            word.match(
                                                                /^\s+$/,
                                                            ) ? (
                                                                <span key={i}>
                                                                    &nbsp;
                                                                </span>
                                                            ) : (
                                                                <motion.span
                                                                    key={i}
                                                                    initial={{
                                                                        opacity: 0,
                                                                        y: 8,
                                                                        filter: "blur(4px)",
                                                                    }}
                                                                    animate={{
                                                                        opacity: 1,
                                                                        y: 0,
                                                                        filter: "blur(0px)",
                                                                    }}
                                                                    transition={{
                                                                        duration: 0.35,
                                                                        delay:
                                                                            i *
                                                                            0.06,
                                                                        ease: "easeOut",
                                                                    }}
                                                                    className="text-[#c4b5fd]"
                                                                    onAnimationComplete={() => {
                                                                        if (
                                                                            i ===
                                                                            title.split(
                                                                                /(\s+)/,
                                                                            )
                                                                                .length -
                                                                                1
                                                                        ) {
                                                                            setTimeout(
                                                                                () =>
                                                                                    setAiTitleKey(
                                                                                        0,
                                                                                    ),
                                                                                800,
                                                                            );
                                                                        }
                                                                    }}
                                                                >
                                                                    {word}
                                                                </motion.span>
                                                            ),
                                                        )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Tags — always shown under the title (edit + publish) */}
                                        <div className="flex flex-wrap gap-1.5 mt-1 mb-2 min-h-[24px]">
                                            {tags.length > 0 ? (
                                                tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="px-2.5 py-0.5 bg-[#9b7bf70a] rounded-full text-[13px] text-[#9b7bf7]"
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))
                                            ) : (
                                                <span
                                                    className="text-[12px]"
                                                    style={{
                                                        color: "var(--text-faint)",
                                                    }}
                                                >
                                                    Add tags from the publish
                                                    panel →
                                                </span>
                                            )}
                                        </div>

                                        {/* Collab lock warning — someone else was editing */}
                                        {collabLock && !collabLockDismissed && (
                                            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                                <ion-icon
                                                    name="warning-outline"
                                                    style={{
                                                        fontSize: "16px",
                                                        color: "#f59e0b",
                                                    }}
                                                />
                                                <span className="text-[12px] text-[var(--text-muted)] flex-1">
                                                    <strong>
                                                        {collabLock.lockedBy
                                                            ?.displayName ||
                                                            collabLock.lockedBy
                                                                ?.username ||
                                                            "Someone"}
                                                    </strong>{" "}
                                                    was recently editing this
                                                    blog. Your changes will sync
                                                    in real-time.
                                                </span>
                                                <button
                                                    onClick={() =>
                                                        setCollabLockDismissed(
                                                            true,
                                                        )
                                                    }
                                                    className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors"
                                                >
                                                    Got it
                                                </button>
                                            </div>
                                        )}

                                        {/* Collab error toast */}
                                        {collabError && (
                                            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                                <ion-icon
                                                    name="alert-circle-outline"
                                                    style={{
                                                        fontSize: "16px",
                                                        color: "#ef4444",
                                                    }}
                                                />
                                                <span className="text-[12px] text-red-400 flex-1">
                                                    Collaboration failed to
                                                    connect: {collabError}.
                                                    Editing locally.
                                                </span>
                                            </div>
                                        )}

                                        {/* Collab presence banner */}
                                        {collabConnected &&
                                            connectedUsers.length > 1 && (
                                                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20">
                                                    <div className="flex -space-x-1.5">
                                                        {connectedUsers
                                                            .slice(0, 5)
                                                            .map((u, i) => (
                                                                <div
                                                                    key={
                                                                        u.id ||
                                                                        i
                                                                    }
                                                                    className="w-6 h-6 rounded-full border-2 border-[var(--bg-app)] flex items-center justify-center text-[10px] font-bold text-white"
                                                                    style={{
                                                                        backgroundColor:
                                                                            u.color ||
                                                                            "#9b7bf7",
                                                                    }}
                                                                    title={
                                                                        u.name
                                                                    }
                                                                >
                                                                    {(u.name ||
                                                                        "?")[0].toUpperCase()}
                                                                </div>
                                                            ))}
                                                    </div>
                                                    <span className="text-[12px] text-[var(--text-muted)]">
                                                        {connectedUsers.length}{" "}
                                                        {connectedUsers.length ===
                                                        1
                                                            ? "person"
                                                            : "people"}{" "}
                                                        editing
                                                    </span>
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                                </div>
                                            )}

                                        {/* Read-only when the 5-editor cap is reached (#11 F) */}
                                        {roomFull && (
                                            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/25 text-[13px] text-[#d97706]">
                                                <ion-icon
                                                    name="eye-outline"
                                                    style={{ fontSize: "16px" }}
                                                />
                                                This blog already has the
                                                maximum of 5 live editors —
                                                you're viewing in read-only
                                                until a slot frees up.
                                            </div>
                                        )}
                                        <div className="min-h-[60vh] mt-6 pb-[100px] relative">
                                            <BlockNoteEditor
                                                ref={editorRef}
                                                onChange={handleEditorChange}
                                                initialContent={editorSeedContent}
                                                onReady={() => {
                                                    setEditorReady(true);
                                                    // BlockNote has consumed the seed into
                                                    // ProseMirror; release the serialized
                                                    // source held by the page on long posts.
                                                    setEditorSeedContent(null);
                                                }}
                                                onTitleChange={(newTitle) => {
                                                    // Ignore until the initial load is done and ignore empties,
                                                    // so a content-derived title can't wipe/hide the loaded title.
                                                    if (
                                                        !loadedRef.current ||
                                                        !newTitle
                                                    )
                                                        return;
                                                    setTitle(newTitle);
                                                    setAiTitleKey((k) => k + 1);
                                                }}
                                                blogId={blogId}
                                                mediaStorageStatus={
                                                    mediaStorageStatus
                                                }
                                                secret={secret}
                                                collaboration={collabConfig}
                                                editable={!roomFull}
                                                onCollabSeeded={
                                                    needsSeed
                                                        ? clearSeed
                                                        : undefined
                                                }
                                            />
                                            {/* Outline sidebar — shows heading positions with slider */}
                                            {editorContent && (
                                                <EditorOutline
                                                    editorContent={
                                                        editorContent
                                                    }
                                                />
                                            )}
                                        </div>
                                    </>
                                </div>
                            )}
                        </>
                    </div>

                    {mode === "preview" && (
                        <div className="blog-preview-fullwidth">
                            <BlogPreview
                                title={title}
                                subtitle={subtitle}
                                coverPreview={coverPreview}
                                coverZoom={coverZoom}
                                coverPos={coverPos}
                                pageEmoji={pageEmoji}
                                tags={tags}
                                html={previewHtml}
                                blocks={previewBlocks}
                                user={user}
                                wordCount={wordCount}
                                memberOnly={memberOnly}
                            />
                        </div>
                    )}

                    {mode === "code" && (
                        <BlogCodeView
                            blocks={editorContent}
                            markdown={markdown}
                        />
                    )}
                </div>
            </main>

            {/* Publish Side Panel backdrop */}
            {showPublishPanel && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowPublishPanel(false)}
                />
            )}

            {/* Publish Side Panel */}
            <div
                className={`fixed top-0 right-0 h-full w-[400px] bg-[var(--bg-surface)] border-l border-[var(--border-default)] z-50 flex flex-col shadow-2xl transition-transform duration-300 ${
                    showPublishPanel ? "translate-x-0" : "translate-x-full"
                }`}
            >
                <div className="flex items-center justify-between p-5 border-b border-[var(--border-default)]">
                    <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
                        Publish Settings
                    </h2>
                    <button
                        onClick={() => setShowPublishPanel(false)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
                    {/* Blog stats */}
                    <div
                        className="flex items-center gap-4 text-[13px] rounded-lg px-4 py-3"
                        style={{
                            color: "var(--text-muted)",
                            backgroundColor: "var(--bg-app)",
                            border: "1px solid var(--border-default)",
                        }}
                    >
                        <span className="flex items-center gap-1.5">
                            <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                />
                            </svg>
                            {wordCount} words
                        </span>
                        <span style={{ color: "var(--text-faint)" }}>
                            &middot;
                        </span>
                        <span className="flex items-center gap-1.5">
                            <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            {readTime} min read
                        </span>
                    </div>

                    {/* Owner — locked after publish */}
                    <div>
                        <label
                            className="text-[12px] font-medium mb-2 block"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Owner
                            {isPublished && (
                                <span
                                    className="ml-1.5 text-[10px] font-normal"
                                    style={{ color: "var(--text-faint)" }}
                                >
                                    (locked)
                                </span>
                            )}
                        </label>
                        {isPublished ? (
                            /* Locked — show current owner, no dropdown */
                            <div
                                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px]"
                                style={{
                                    backgroundColor: "var(--bg-app)",
                                    border: "1px solid var(--border-default)",
                                    opacity: 0.7,
                                }}
                            >
                                {ownerAvatar ? (
                                    <img
                                        src={ownerAvatar}
                                        alt=""
                                        className="w-5 h-5 rounded-full object-cover"
                                    />
                                ) : (
                                    <div
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                        style={{
                                            backgroundColor:
                                                "var(--bg-elevated)",
                                            color: "var(--text-body)",
                                        }}
                                    >
                                        {ownerInitial}
                                    </div>
                                )}
                                <span
                                    className="font-medium"
                                    style={{ color: "var(--text-primary)" }}
                                >
                                    {ownerName}
                                </span>
                                <ion-icon
                                    name="lock-closed"
                                    style={{
                                        fontSize: "12px",
                                        color: "var(--text-faint)",
                                        marginLeft: "auto",
                                    }}
                                />
                            </div>
                        ) : (
                            /* Editable — dropdown */
                            <div className="relative" ref={ownerDropdownRef}>
                                <button
                                    onClick={() =>
                                        setShowOwnerDropdown(!showOwnerDropdown)
                                    }
                                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] transition-colors"
                                    style={{
                                        backgroundColor: "var(--bg-app)",
                                        border: "1px solid var(--border-default)",
                                    }}
                                >
                                    {ownerAvatar ? (
                                        <img
                                            src={ownerAvatar}
                                            alt=""
                                            className="w-5 h-5 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                            style={{
                                                backgroundColor:
                                                    "var(--bg-elevated)",
                                                color: "var(--text-body)",
                                            }}
                                        >
                                            {ownerInitial}
                                        </div>
                                    )}
                                    <span
                                        className="font-medium flex-1 text-left"
                                        style={{ color: "var(--text-primary)" }}
                                    >
                                        {ownerName}
                                    </span>
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        style={{ color: "var(--text-faint)" }}
                                    >
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </button>

                                {showOwnerDropdown && (
                                    <div
                                        className="absolute top-full mt-1 left-0 right-0 rounded-lg shadow-xl z-10 overflow-hidden"
                                        style={{
                                            backgroundColor:
                                                "var(--dropdown-bg)",
                                            border: "1px solid var(--dropdown-border)",
                                        }}
                                    >
                                        <div
                                            className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider"
                                            style={{
                                                color: "var(--text-faint)",
                                                borderBottom:
                                                    "1px solid var(--divider)",
                                            }}
                                        >
                                            Choose an owner
                                        </div>
                                        <button
                                            onClick={() => {
                                                setPublishAs("personal");
                                                setCollectionId(null);
                                                setShowOwnerDropdown(false);
                                            }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors"
                                            style={{
                                                backgroundColor:
                                                    publishAs === "personal"
                                                        ? "var(--bg-hover)"
                                                        : "transparent",
                                            }}
                                        >
                                            {user?.avatar_url ? (
                                                <img
                                                    src={user.avatar_url}
                                                    alt=""
                                                    className="w-5 h-5 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div
                                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                                    style={{
                                                        backgroundColor:
                                                            "var(--bg-elevated)",
                                                        color: "var(--text-body)",
                                                    }}
                                                >
                                                    {(user?.display_name ||
                                                        username ||
                                                        "?")[0].toUpperCase()}
                                                </div>
                                            )}
                                            <span
                                                style={{
                                                    color: "var(--text-primary)",
                                                }}
                                            >
                                                {username}
                                            </span>
                                            {publishAs === "personal" && (
                                                <svg
                                                    className="ml-auto w-4 h-4 text-[#4ade80]"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <polyline
                                                        points="20 6 9 17 4 12"
                                                        strokeWidth="2.5"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />
                                                </svg>
                                            )}
                                        </button>
                                        {userOrgs.map((org) => (
                                            <button
                                                key={org.id}
                                                onClick={() => {
                                                    setPublishAs(
                                                        `org:${org.id}`,
                                                    );
                                                    setCollectionId(null);
                                                    setShowOwnerDropdown(false);
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors"
                                                style={{
                                                    backgroundColor:
                                                        publishAs ===
                                                        `org:${org.id}`
                                                            ? "var(--bg-hover)"
                                                            : "transparent",
                                                }}
                                            >
                                                <img
                                                    src={
                                                        org.logo_url ||
                                                        generatePixelAvatar(
                                                            org.slug,
                                                        )
                                                    }
                                                    alt=""
                                                    className="w-5 h-5 rounded object-cover"
                                                />
                                                <span
                                                    style={{
                                                        color: "var(--text-primary)",
                                                    }}
                                                >
                                                    {org.name}
                                                </span>
                                                {publishAs ===
                                                    `org:${org.id}` && (
                                                    <svg
                                                        className="ml-auto w-4 h-4 text-[#4ade80]"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <polyline
                                                            points="20 6 9 17 4 12"
                                                            strokeWidth="2.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    </svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Collection — only when publishing under an org. Files the post under
              an org collection (URL becomes /org/collection/slug). Optional. */}
                    {publishAs.startsWith("org:") && (
                        <div>
                            <label
                                className="text-[12px] font-medium mb-2 block"
                                style={{ color: "var(--text-muted)" }}
                            >
                                Collection{" "}
                                <span
                                    className="font-normal"
                                    style={{ color: "var(--text-faint)" }}
                                >
                                    — optional, files this post under a
                                    collection
                                </span>
                            </label>
                            <select
                                value={collectionId || ""}
                                onChange={(e) =>
                                    setCollectionId(e.target.value || null)
                                }
                                disabled={isPublished && !isOwner}
                                className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none disabled:opacity-70 disabled:cursor-not-allowed"
                                style={{
                                    backgroundColor: "var(--bg-app)",
                                    border: "1px solid var(--border-default)",
                                    color: "var(--text-primary)",
                                }}
                            >
                                <option value="">
                                    No collection (org root)
                                </option>
                                {orgCollections.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <p
                                className="text-[11px] mt-1"
                                style={{ color: "var(--text-faint)" }}
                            >
                                {orgCollections.length === 0
                                    ? "This org has no collections yet — create one in the org settings."
                                    : "Collaborators stay scoped to this post regardless of collection."}
                            </p>
                        </div>
                    )}

                    {/* URL slug — only the owner can change it. Published slug changes are
              destructive because old links break; collaborators always see it locked. */}
                    {(() => {
                        const slugLocked = !isOwner;
                        return (
                            <div>
                                <label
                                    className="text-[12px] font-medium mb-2 block"
                                    style={{ color: "var(--text-muted)" }}
                                >
                                    URL slug
                                    {slugLocked && (
                                        <span
                                            className="ml-1.5 text-[10px] font-normal"
                                            style={{
                                                color: "var(--text-faint)",
                                            }}
                                        >
                                            (locked)
                                        </span>
                                    )}
                                </label>
                                <div
                                    className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-[13px]"
                                    style={{
                                        backgroundColor: "var(--bg-app)",
                                        border: "1px solid var(--border-default)",
                                        opacity: slugLocked ? 0.7 : 1,
                                    }}
                                    onPointerEnter={(event) =>
                                        slugLocked &&
                                        setSlugLockHint({
                                            x: event.clientX,
                                            y: event.clientY,
                                        })
                                    }
                                    onPointerMove={(event) =>
                                        slugLocked &&
                                        setSlugLockHint({
                                            x: event.clientX,
                                            y: event.clientY,
                                        })
                                    }
                                    onPointerLeave={() => setSlugLockHint(null)}
                                >
                                    <span
                                        className="shrink-0"
                                        style={{ color: "var(--text-faint)" }}
                                    >
                                        /{ownerSlug}/
                                    </span>
                                    <BufferedSlugInput
                                        value={slug}
                                        disabled={slugLocked}
                                        onDraftChange={(nextSlug) => {
                                            pendingSlugRef.current = nextSlug;
                                            setHasUnsavedEdits(true);
                                        }}
                                        onCommit={(nextSlug) => {
                                            setSlugManual(true);
                                            setSlug(nextSlug);
                                        }}
                                    />
                                    {slugLocked && (
                                        <ion-icon
                                            name="lock-closed"
                                            style={{
                                                fontSize: "12px",
                                                color: "var(--text-faint)",
                                            }}
                                        />
                                    )}
                                </div>
                                {slugLocked &&
                                    slugLockHint &&
                                    typeof document !== "undefined" &&
                                    createPortal(
                                        <div
                                            role="tooltip"
                                            className="fixed z-[90] pointer-events-none rounded-lg px-3 py-2 text-[11px] font-medium text-white shadow-xl"
                                            style={{
                                                left: Math.max(
                                                    8,
                                                    Math.min(
                                                        slugLockHint.x,
                                                        window.innerWidth - 230,
                                                    ),
                                                ),
                                                top: slugLockHint.y + 14,
                                                backgroundColor: "#27232f",
                                            }}
                                        >
                                            Only the blog owner can edit the
                                            slug.
                                        </div>,
                                        document.body,
                                    )}
                                {!slugLocked && (
                                    <p
                                        className="text-[11px] mt-1"
                                        style={{
                                            color:
                                                slugAvail.state === "available"
                                                    ? "#4ade80"
                                                    : slugAvail.state ===
                                                        "taken"
                                                      ? "#f87171"
                                                      : isPublished
                                                        ? "#e8a840"
                                                        : "var(--text-faint)",
                                        }}
                                    >
                                        {slugAvail.state === "checking"
                                            ? "Checking…"
                                            : slugAvail.state === "available"
                                              ? "✓ Available in this space"
                                              : slugAvail.state === "taken"
                                                ? `✗ ${slugAvail.reason || "Taken"} — a number will be appended`
                                                : isPublished
                                                  ? "⚠ Changing the slug breaks existing links to this post."
                                                  : "Unique within your account or the selected org."}
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    {publishUrlWillChange && (
                        <div
                            role="alert"
                            className="rounded-xl px-3.5 py-3 text-[12px] leading-5"
                            style={{
                                color: "#e8a840",
                                backgroundColor: "rgba(232,168,64,0.08)",
                                border: "1px solid rgba(232,168,64,0.35)",
                            }}
                        >
                            <p className="font-semibold flex items-center gap-1.5">
                                <ion-icon name="warning-outline" />
                                This update changes the public URL
                            </p>
                            <p
                                className="mt-1 break-all"
                                style={{ color: "var(--text-muted)" }}
                            >
                                The old address{" "}
                                <code>{previousPublishedUrl}</code> will become
                                invalid after publishing this update.
                            </p>
                        </div>
                    )}

                    {/* Punchline (subtitle) — shown under the title on the published blog */}
                    <div>
                        <label
                            className="text-[12px] font-medium mb-2 block"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Punchline{" "}
                            <span
                                className="font-normal"
                                style={{ color: "var(--text-faint)" }}
                            >
                                — a short tagline shown under the title
                            </span>
                        </label>
                        <textarea
                            value={subtitle}
                            onChange={(e) =>
                                setSubtitle(e.target.value.slice(0, 200))
                            }
                            rows={2}
                            placeholder="e.g. Tested, ranked, and ready to use"
                            className="w-full text-[14px] rounded-lg px-3 py-2 outline-none resize-none"
                            style={{
                                backgroundColor: "var(--bg-app)",
                                border: "1px solid var(--border-default)",
                                color: "var(--text-primary)",
                            }}
                        />
                        <p
                            className="text-[11px] mt-1 text-right"
                            style={{ color: "var(--text-faint)" }}
                        >
                            {(subtitle || "").length}/200
                        </p>
                    </div>

                    {/* Tags */}
                    <div>
                        <label
                            className="text-[12px] font-medium mb-2 block"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Tags (up to 5){" "}
                            <span
                                className="font-normal"
                                style={{ color: "var(--text-faint)" }}
                            >
                                — press Enter to attach
                            </span>
                        </label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="flex items-center gap-1 px-2.5 py-1 bg-[#9b7bf714] rounded-full text-[12px] text-[#9b7bf7]"
                                >
                                    #{tag}
                                    <button
                                        onClick={() => removeTag(tag)}
                                        className="text-[#9b7bf780] hover:text-[#9b7bf7] ml-0.5 text-[10px]"
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                        </div>
                        {tags.length < 5 && <BufferedTagInput onAdd={addTag} />}
                    </div>

                    {/* Competitive publishing — only the owner may enter the blog. */}
                    {isOwner && <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-3.5">
                        <label className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)]">
                            <ion-icon
                                name="trophy-outline"
                                style={{ fontSize: "16px", color: "#9b7bf7" }}
                            />
                            Submit as a contest entry
                        </label>
                        <p className="mt-1 text-[11px] leading-5 text-[var(--text-faint)]">
                            Select a live contest. LixBlogs submits an immutable
                            snapshot after this blog is successfully published.
                        </p>
                        <input
                            type="search"
                            value={contestSearch}
                            onChange={(event) => setContestSearch(event.target.value)}
                            placeholder="Search live contests…"
                            className="mt-3 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[#9b7bf7]"
                        />
                        <select
                            value={selectedContest}
                            onChange={(event) => {
                                setSelectedContest(event.target.value);
                                setContestMessage("");
                            }}
                            disabled={contestLoading}
                            className="mt-2 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[#9b7bf7] disabled:opacity-60"
                        >
                            <option value="">
                                {contestLoading
                                    ? "Loading live contests…"
                                    : "Not a contest entry"}
                            </option>
                            {contestOptions.filter((contest) => `${contest.title} ${contest.theme || ''} ${(contest.tags || []).join(' ')}`.toLowerCase().includes(contestSearch.trim().toLowerCase())).map((contest) => (
                                <option key={contest.id} value={contest.slug}>
                                    {contest.title} · closes{" "}
                                    {new Date(
                                        contest.submissionsCloseAt * 1000,
                                    ).toLocaleDateString()}
                                </option>
                            ))}
                        </select>
                        {selectedContest && isPublished && (
                            <button
                                type="button"
                                onClick={() => submitBlogToContest()}
                                className="mt-3 w-full rounded-lg bg-[#9b7bf7] px-3 py-2 text-[12px] font-bold text-white"
                            >
                                Submit current published revision now
                            </button>
                        )}
                        {contestMessage && (
                            <p
                                role="status"
                                className="mt-2 text-[11px] leading-5"
                                style={{ color: "var(--text-muted)" }}
                            >
                                {contestMessage}
                            </p>
                        )}
                    </div>}

                    {/* Collaborators — invite co-authors (cross-posts to their profile) */}
                    <div>
                        <label
                            className="text-[12px] font-medium mb-2 block"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Collaborators
                        </label>
                        <button
                            onClick={() => setShowCollabPanel(true)}
                            className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[13px] transition-colors hover:border-[var(--border-hover)]"
                            style={{
                                backgroundColor: "var(--bg-app)",
                                border: "1px solid var(--border-default)",
                            }}
                        >
                            <span
                                className="flex items-center gap-2"
                                style={{ color: "var(--text-primary)" }}
                            >
                                <ion-icon
                                    name="people-outline"
                                    style={{
                                        fontSize: "16px",
                                        color: "var(--text-muted)",
                                    }}
                                />
                                {collaborators.length > 0
                                    ? `${collaborators.length} collaborator${collaborators.length === 1 ? "" : "s"}`
                                    : "Invite collaborators"}
                            </span>
                            <ion-icon
                                name="chevron-forward-outline"
                                style={{
                                    fontSize: "14px",
                                    color: "var(--text-faint)",
                                }}
                            />
                        </button>
                        <p
                            className="text-[11px] mt-1"
                            style={{ color: "var(--text-faint)" }}
                        >
                            Co-authors can view, edit, or admin — the post
                            cross-posts to their profile.
                        </p>
                    </div>

                    {(memberOnly ||
                        (ownerCanMarkMemberOnly ??
                            user?.tier === "member")) && (
                        <div>
                            <label
                                className="text-[12px] font-medium mb-2 block"
                                style={{ color: "var(--text-muted)" }}
                            >
                                Member-only Content
                            </label>
                            <button
                                onClick={() => setMemberOnly(!memberOnly)}
                                className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[13px] transition-colors disabled:cursor-default"
                                style={{
                                    backgroundColor: "var(--bg-app)",
                                    border: `1px solid ${memberOnly ? "#9b7bf7" : "var(--border-default)"}`,
                                }}
                            >
                                <span
                                    className="flex items-center gap-2"
                                    style={{ color: "var(--text-primary)" }}
                                >
                                    <ion-icon
                                        name={
                                            memberOnly
                                                ? "lock-closed"
                                                : "lock-open-outline"
                                        }
                                        style={{
                                            fontSize: "16px",
                                            color: memberOnly
                                                ? "#9b7bf7"
                                                : "var(--text-muted)",
                                        }}
                                    />
                                    {memberOnly
                                        ? "Member-only (Premium)"
                                        : "Public (Free for everyone)"}
                                </span>
                                <span
                                    className="relative inline-flex items-center rounded-full transition-colors"
                                    style={{
                                        width: "34px",
                                        height: "18px",
                                        backgroundColor: memberOnly
                                            ? "#9b7bf7"
                                            : "var(--border-default)",
                                    }}
                                >
                                    <span
                                        className="absolute rounded-full bg-white transition-transform"
                                        style={{
                                            width: "14px",
                                            height: "14px",
                                            left: "2px",
                                            transform: memberOnly
                                                ? "translateX(16px)"
                                                : "translateX(0)",
                                        }}
                                    />
                                </span>
                            </button>
                            <p
                                className="text-[11px] mt-1"
                                style={{ color: "var(--text-faint)" }}
                            >
                                Restrict full access to member tier users.
                            </p>
                        </div>
                    )}

                    {/* Secret mode — publish with no author shown. Locked once public. */}
                    <div>
                        <label
                            className="text-[12px] font-medium mb-2 block"
                            style={{ color: "var(--text-muted)" }}
                        >
                            Secret mode
                            {isPublished && (
                                <span
                                    className="ml-1.5 text-[10px] font-normal"
                                    style={{ color: "var(--text-faint)" }}
                                >
                                    (locked)
                                </span>
                            )}
                        </label>
                        <button
                            onClick={toggleSecret}
                            disabled={isPublished}
                            className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[13px] transition-colors disabled:cursor-default"
                            style={{
                                backgroundColor: "var(--bg-app)",
                                border: `1px solid ${secret ? "#9b7bf7" : "var(--border-default)"}`,
                                opacity: isPublished ? 0.6 : 1,
                            }}
                        >
                            <span
                                className="flex items-center gap-2"
                                style={{ color: "var(--text-primary)" }}
                            >
                                <ion-icon
                                    name={
                                        secret
                                            ? "eye-off-outline"
                                            : "eye-outline"
                                    }
                                    style={{
                                        fontSize: "16px",
                                        color: secret
                                            ? "#9b7bf7"
                                            : "var(--text-muted)",
                                    }}
                                />
                                {secret
                                    ? "Publish anonymously"
                                    : "Show my name"}
                            </span>
                            <span
                                className="relative inline-flex items-center rounded-full transition-colors"
                                style={{
                                    width: "34px",
                                    height: "18px",
                                    backgroundColor: secret
                                        ? "#9b7bf7"
                                        : "var(--border-default)",
                                }}
                            >
                                <span
                                    className="absolute rounded-full bg-white transition-transform"
                                    style={{
                                        width: "14px",
                                        height: "14px",
                                        left: "2px",
                                        transform: secret
                                            ? "translateX(16px)"
                                            : "translateX(0)",
                                    }}
                                />
                            </span>
                        </button>
                        <p
                            className="text-[11px] mt-1"
                            style={{ color: "var(--text-faint)" }}
                        >
                            {isPublished
                                ? "Secret mode can’t be changed after a post goes live."
                                : secret
                                  ? "No name, avatar or co-authors shown. Readable only via its short link, kept off your profile and out of search. Sub-pages and canvases are unavailable. You can’t undo this after publishing — and we still store your identity for abuse reports."
                                  : "Hide your name from readers. Choose before publishing — it locks once live."}
                        </p>

                        {secret && secretBlockers.length > 0 && (
                            <div
                                className="mt-2 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
                                style={{
                                    backgroundColor: "rgba(232,168,64,0.08)",
                                    border: "1px solid rgba(232,168,64,0.35)",
                                    color: "var(--text-body)",
                                }}
                            >
                                <p
                                    className="font-semibold mb-1 flex items-center gap-1.5"
                                    style={{ color: "#e8a840" }}
                                >
                                    <ion-icon
                                        name="warning-outline"
                                        style={{ fontSize: "13px" }}
                                    />
                                    {secretBlockers.length} sub-page
                                    {secretBlockers.length === 1 ? "" : "s"}
                                    /canvas won’t be published
                                </p>
                                <p style={{ color: "var(--text-muted)" }}>
                                    Secret posts can’t have sub-pages or
                                    canvases — they’re a separate surface with
                                    their own sharing rules that wouldn’t stay
                                    anonymous. Turn secret mode off, or remove{" "}
                                    {secretBlockers
                                        .map((s) => s.title || "Untitled")
                                        .slice(0, 3)
                                        .join(", ")}
                                    {secretBlockers.length > 3
                                        ? ` +${secretBlockers.length - 3} more`
                                        : ""}{" "}
                                    before publishing.
                                </p>
                            </div>
                        )}
                    </div>

                    {isOwner && isPublished && (
                        <section className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4">
                            <div className="flex items-center gap-2 text-red-500">
                                <ion-icon name="warning-outline" />
                                <h3 className="text-[12px] font-bold">
                                    Danger zone
                                </h3>
                            </div>
                            <p className="mt-2 text-[11px] leading-5 text-[var(--text-faint)]">
                                These actions remove the blog from normal reader
                                access. Contest snapshots already submitted remain
                                frozen.
                            </p>
                            <div className="mt-3 grid gap-2">
                                <button
                                    type="button"
                                    disabled={Boolean(dangerBusy)}
                                    onClick={() =>
                                        manageBlogPublication("unlist")
                                    }
                                    className="flex items-center justify-between rounded-lg border border-red-500/25 px-3 py-2.5 text-left text-[12px] font-semibold text-red-500 disabled:opacity-50"
                                >
                                    <span>Remove from public listings</span>
                                    <ion-icon name="eye-off-outline" />
                                </button>
                                <button
                                    type="button"
                                    disabled={Boolean(dangerBusy)}
                                    onClick={() =>
                                        manageBlogPublication("archive")
                                    }
                                    className="flex items-center justify-between rounded-lg bg-red-600 px-3 py-2.5 text-left text-[12px] font-bold text-white disabled:opacity-50"
                                >
                                    <span>Archive blog</span>
                                    <ion-icon name="archive-outline" />
                                </button>
                            </div>
                        </section>
                    )}
                </div>

                {/* Bottom actions */}
                <div
                    className="p-5 space-y-2"
                    style={{ borderTop: "1px solid var(--border-default)" }}
                >
                    <div className="relative group/panelpublish">
                        <button
                            onClick={() => {
                                if (isPublished) setShowPublishConfirm(true);
                                else handlePublish();
                            }}
                            disabled={!canPublishNow || publishing || (isPublished && hasNoChanges())}
                            className="w-full py-2.5 bg-[#9b7bf7] text-white font-bold rounded-xl text-[13px] hover:bg-[#b69aff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {publishing
                                ? isPublished
                                    ? "Updating..."
                                    : "Publishing..."
                                : isPublished
                                  ? "Update now"
                                  : "Publish now"}
                        </button>
                        {!canPublishNow && !publishing && !(isPublished && hasNoChanges()) && (
                            <div
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap px-3 py-1.5 rounded-lg text-[11px] font-medium z-50 opacity-0 group-hover/panelpublish:opacity-100 transition-opacity pointer-events-none"
                                style={{
                                    backgroundColor: "var(--bg-elevated)",
                                    color: "var(--text-muted)",
                                    border: "1px solid var(--border-default)",
                                    boxShadow: "var(--shadow-sm)",
                                }}
                            >
                                {!titleValid && !bodyValid
                                    ? "Title needs at least 2 words and body at least 20 words"
                                    : !titleValid
                                      ? "Title must have at least 2 words to publish"
                                      : "Body must have at least 20 words to publish"}
                            </div>
                        )}
                    </div>
                    {publishError && (
                        <p
                            role="alert"
                            className="text-center text-[11px] leading-4"
                            style={{ color: "#f87171" }}
                        >
                            {publishError}
                        </p>
                    )}
                    <button
                        onClick={handleSaveDraft}
                        disabled={publishing || savingDraft || hasNoChanges()}
                        className="w-full py-2 font-medium rounded-xl text-[12px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{
                            backgroundColor: "var(--bg-elevated)",
                            color: "var(--text-muted)",
                        }}
                    >
                        {savingDraft && (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-[#9b7bf7]/30 border-t-[#9b7bf7] animate-spin" />
                        )}
                        {savingDraft ? "Syncing to cloud…" : "Save Draft"}
                    </button>
                    {hasNoChanges() && (
                        <p
                            className="text-center text-[11px]"
                            style={{ color: "var(--text-faint)" }}
                        >
                            No changes to save
                        </p>
                    )}
                </div>
            </div>

            {/* Page Color Side Panel (members only) */}
            {showColorPanel && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowColorPanel(false)}
                    />
                    <div className="fixed top-0 right-0 h-full w-[320px] bg-[var(--bg-surface)] border-l border-[var(--border-default)] z-50 flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between p-5 border-b border-[var(--border-default)]">
                            <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
                                Page Theme
                            </h2>
                            <button
                                onClick={() => setShowColorPanel(false)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
                            >
                                <svg
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            <p className="text-[12px] text-[var(--text-muted)]">
                                Choose a background accent for your blog page.
                                Visible to readers.
                            </p>

                            {/* Reset */}
                            <button
                                onClick={() => setPageColor(null)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${!pageColor ? "border-[#9b7bf7] bg-[#9b7bf714]" : "border-[var(--border-default)] hover:border-[var(--border-hover)]"}`}
                            >
                                <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] border border-[var(--border-default)]" />
                                <span className="text-[13px] text-[var(--text-primary)]">
                                    Default (none)
                                </span>
                            </button>

                            {/* Predefined colors */}
                            <div className="space-y-2">
                                {[
                                    {
                                        name: "Midnight Purple",
                                        color: "#1a1028",
                                        accent: "#9b7bf7",
                                    },
                                    {
                                        name: "Deep Ocean",
                                        color: "#0f1a2e",
                                        accent: "#60a5fa",
                                    },
                                    {
                                        name: "Forest",
                                        color: "#0f1f17",
                                        accent: "#4ade80",
                                    },
                                    {
                                        name: "Warm Ember",
                                        color: "#1f150f",
                                        accent: "#fb923c",
                                    },
                                    {
                                        name: "Rose",
                                        color: "#1f0f18",
                                        accent: "#f472b6",
                                    },
                                    {
                                        name: "Slate",
                                        color: "#171b22",
                                        accent: "#9ca3af",
                                    },
                                    {
                                        name: "Golden",
                                        color: "#1a1708",
                                        accent: "#fbbf24",
                                    },
                                    {
                                        name: "Crimson",
                                        color: "#1f0f0f",
                                        accent: "#f87171",
                                    },
                                    {
                                        name: "Teal",
                                        color: "#0f1f1f",
                                        accent: "#2dd4bf",
                                    },
                                    {
                                        name: "Indigo",
                                        color: "#13102a",
                                        accent: "#818cf8",
                                    },
                                ].map(({ name, color, accent }) => (
                                    <button
                                        key={name}
                                        onClick={() => setPageColor(color)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${pageColor === color ? "border-[" + accent + "] bg-[" + accent + "14]" : "border-[var(--border-default)] hover:border-[var(--border-hover)]"}`}
                                        style={
                                            pageColor === color
                                                ? {
                                                      borderColor: accent,
                                                      background: `${accent}14`,
                                                  }
                                                : {}
                                        }
                                    >
                                        <div
                                            className="w-8 h-8 rounded-lg border border-[var(--border-hover)]"
                                            style={{ background: color }}
                                        />
                                        <div className="flex-1 text-left">
                                            <span className="text-[13px] text-[var(--text-primary)]">
                                                {name}
                                            </span>
                                        </div>
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ background: accent }}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Keyboard shortcuts modal */}
            {showShortcuts && (
                <KeyboardShortcutsModal
                    onClose={() => setShowShortcuts(false)}
                />
            )}
            {showCollabPanel && (
                <CollaboratorPanel
                    slugid={blogId}
                    onClose={() => setShowCollabPanel(false)}
                />
            )}

            {/* Saved to cloud toast */}
            <ViewportPortal>
                <AnimatePresence>
                    {showSavedToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-green-500/20 bg-[var(--bg-surface)]/90 backdrop-blur-lg shadow-2xl"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#4ade80"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="text-[13px] text-green-300 font-medium">
                                Saved to cloud
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </ViewportPortal>

            {/* Upload destination is transient here; full quota details live in Settings → Media. */}
            <ViewportPortal>
                <AnimatePresence>
                    {mediaStorageToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-[#9b7bf7]/20 bg-[var(--bg-surface)]/90 backdrop-blur-lg shadow-2xl"
                        >
                            <ion-icon
                                name="cloud-done-outline"
                                style={{ fontSize: "17px", color: "#9b7bf7" }}
                            />
                            <span className="text-[13px] text-[var(--text-primary)] font-medium">
                                {mediaStorageToast}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </ViewportPortal>

            <ViewportPortal>
                <AnimatePresence>
                    {clipboardToast && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 rounded-xl border bg-[var(--bg-surface)]/90 px-4 py-2.5 shadow-2xl backdrop-blur-lg"
                            style={{
                                borderColor:
                                    clipboardToast.type === "error"
                                        ? "rgba(248,113,113,0.35)"
                                        : "rgba(74,222,128,0.25)",
                            }}
                            role="status"
                        >
                            <ion-icon
                                name={
                                    clipboardToast.type === "error"
                                        ? "alert-circle-outline"
                                        : "checkmark-circle-outline"
                                }
                                style={{
                                    fontSize: "18px",
                                    color:
                                        clipboardToast.type === "error"
                                            ? "#f87171"
                                            : "#4ade80",
                                }}
                            />
                            <span className="text-[13px] font-medium text-[var(--text-primary)]">
                                {clipboardToast.message}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </ViewportPortal>

            <ViewportPortal>
                <AnimatePresence>
                    {versionPreview && (
                        <motion.div
                            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onPointerDown={(event) => {
                                if (event.target === event.currentTarget)
                                    setVersionPreview(null);
                            }}
                        >
                            <motion.div
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="version-preview-title"
                                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl"
                            >
                                <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] px-5 py-4">
                                    <div className="min-w-0">
                                        <h2
                                            id="version-preview-title"
                                            className="text-[15px] font-semibold text-[var(--text-primary)]"
                                        >
                                            {versionLabel(
                                                versionPreview.label,
                                            )}
                                        </h2>
                                        <p className="mt-1 text-[11px] text-[var(--text-faint)]">
                                            {new Date(
                                                versionPreview.created_at *
                                                    1000,
                                            ).toLocaleString()}
                                            {versionPreview.username
                                                ? ` · @${versionPreview.username}`
                                                : ""}
                                            {` · ${versionPreview.word_count || 0} words`}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setVersionPreview(null)
                                        }
                                        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                                        aria-label="Close version preview"
                                    >
                                        <ion-icon name="close-outline" />
                                    </button>
                                </div>
                                <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
                                    {versionPreview.markdown ||
                                        "This version is empty."}
                                </pre>
                                <div className="flex items-center justify-end gap-2 border-t border-[var(--border-default)] px-5 py-3">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setVersionPreview(null)
                                        }
                                        className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={
                                            historyActionId ===
                                            versionPreview.id
                                        }
                                        onClick={() =>
                                            restoreVersion(versionPreview.id)
                                        }
                                        className="rounded-lg bg-[#9b7bf7] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                                    >
                                        Restore this version
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </ViewportPortal>

            {/* Cover upload failure — keep the previous cover and make retry guidance visible. */}
            <ViewportPortal>
                <AnimatePresence>
                    {coverUploadError && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex w-max max-w-[min(92vw,520px)] items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
                            style={{
                                backgroundColor: "var(--card-bg)",
                                border: "1px solid rgba(248,113,113,0.35)",
                                color: "var(--text-primary)",
                            }}
                        >
                            <ion-icon
                                name="cloud-offline-outline"
                                style={{
                                    fontSize: "19px",
                                    color: "#f87171",
                                    flexShrink: 0,
                                }}
                            />
                            <span className="text-[12px] leading-relaxed flex-1">
                                {coverUploadError}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCoverUploadError("")}
                                className="w-7 h-7 rounded-md flex items-center justify-center"
                                style={{
                                    color: "var(--text-muted)",
                                    backgroundColor: "var(--bg-elevated)",
                                }}
                                aria-label="Dismiss cover upload error"
                            >
                                <ion-icon
                                    name="close-outline"
                                    style={{ fontSize: "16px" }}
                                />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </ViewportPortal>

            {/* Publish/Update confirmation modal */}
            {showPublishConfirm && (
                <EditorConfirmModal
                    title={
                        isPublished
                            ? "Update published blog?"
                            : "Publish this blog?"
                    }
                    description={
                        isPublished
                            ? publishUrlWillChange
                                ? `This will push your changes live and invalidate the old public URL ${previousPublishedUrl}. Existing links to it will stop working.`
                                : "This will push your changes live. Readers will see the updated version immediately."
                            : "Your blog will be visible to everyone. You can unpublish it later from the publish settings."
                    }
                    confirmLabel={isPublished ? "Update" : "Publish"}
                    onConfirm={() => {
                        setShowPublishConfirm(false);
                        handlePublish();
                    }}
                    onCancel={() => setShowPublishConfirm(false)}
                />
            )}

            {/* Markdown replace confirmation modal */}
            {showMdReplaceConfirm && pendingMdFile && (
                <EditorConfirmModal
                    title="Replace editor content?"
                    description="Importing this markdown file will replace all existing content in the editor. This cannot be undone."
                    confirmLabel="Replace"
                    destructive
                    onConfirm={() => {
                        setShowMdReplaceConfirm(false);
                        importMdFile(pendingMdFile);
                        setPendingMdFile(null);
                    }}
                    onCancel={() => {
                        setShowMdReplaceConfirm(false);
                        setPendingMdFile(null);
                    }}
                />
            )}

            {/* Leave confirmation modal */}
            {showLeaveConfirm && (
                <EditorConfirmModal
                    title="Unsaved Changes"
                    description={
                        leaveSaveError ||
                        "You have unsaved changes. Do you want to save them before leaving?"
                    }
                    confirmLabel="Save & leave"
                    cancelLabel="Stay"
                    thirdActionLabel="Leave without saving"
                    isConfirmLoading={isSavingLeave}
                    onThirdAction={() => {
                        bypassUnloadRef.current = true;
                        setHasUnsavedEdits(false);
                        setShowLeaveConfirm(false);
                        if (pendingLeaveUrl)
                            window.location.href = pendingLeaveUrl;
                    }}
                    onConfirm={async () => {
                        setIsSavingLeave(true);
                        setLeaveSaveError("");
                        await syncToCloud();
                        if (dirtyRef.current) {
                            setLeaveSaveError(
                                "Cloud save failed. Your draft is still stored locally; try again or leave without saving.",
                            );
                            setIsSavingLeave(false);
                            return;
                        }
                        bypassUnloadRef.current = true;
                        setIsSavingLeave(false);
                        setHasUnsavedEdits(false);
                        setShowLeaveConfirm(false);
                        if (pendingLeaveUrl)
                            window.location.href = pendingLeaveUrl;
                    }}
                    onCancel={() => {
                        setShowLeaveConfirm(false);
                        setPendingLeaveUrl(null);
                        setLeaveSaveError("");
                    }}
                />
            )}

            {/* Publish conflict — upstream changed. Offer Sync (adopt latest + retry). */}
            {conflict && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4"
                    onClick={() => setConflict(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl p-6"
                        style={{
                            backgroundColor: "var(--bg-surface)",
                            border: "1px solid var(--border-default)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-[17px] font-bold text-[var(--text-primary)] mb-1">
                            Out of sync
                        </h3>
                        <p className="text-[13px] text-[var(--text-muted)] mb-5 leading-relaxed">
                            {conflict.message}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConflict(null)}
                                className="px-4 py-2 text-[13px] rounded-full"
                                style={{
                                    color: "var(--text-muted)",
                                    border: "1px solid var(--border-default)",
                                }}
                            >
                                Keep editing
                            </button>
                            <button
                                onClick={() => {
                                    const status = conflict.status;
                                    if (conflict.currentVersion)
                                        setLastKnownUpdatedAt(
                                            conflict.currentVersion,
                                        );
                                    setConflict(null);
                                    doPublish(status);
                                }}
                                className="px-4 py-2 text-[13px] font-semibold rounded-full text-white"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #9b7bf7 0%, #8b6ae6 100%)",
                                }}
                            >
                                Sync &amp; publish
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Publishing progress overlay — kept up through the redirect to the post */}
            {publishing && (
                <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-10 h-10 border-[3px] border-[#9b7bf7] border-t-transparent rounded-full animate-spin mb-5" />
                    <p className="text-[15px] font-semibold text-white">
                        {isPublished
                            ? "Updating your post…"
                            : "Publishing your post…"}
                    </p>
                    <p className="text-[13px] text-white/60 mt-1">
                        Syncing to the cloud, this only takes a moment.
                    </p>
                </div>
            )}
        </div>
    );
}
