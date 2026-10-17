"use client";

import {
    BlockNoteSchema,
    createCodeBlockSpec,
    defaultBlockSpecs,
    defaultInlineContentSpecs,
} from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import {
    ColorStyleButton,
    CreateLinkButton,
    FormattingToolbar,
    FormattingToolbarController,
    getDefaultReactSlashMenuItems,
    getFormattingToolbarItems,
    SideMenu,
    SideMenuController,
    SuggestionMenuController,
    TableHandlesController,
    useBlockNoteEditor,
    useCreateBlockNote,
    useEditorSelectionChange,
    useExtensionState,
} from "@blocknote/react";
import { createPortal } from "react-dom";
import { isAllowedImage } from "../../utils/allowedImageTypes";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "../../styles/katex-fonts.css";
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import { useTheme } from "../../context/ThemeContext";
import { normalizeUrl } from "../../utils/linkHelper";
import { confirmSubpageDelete } from "../../utils/subpageDelete";
import {
    extractMermaidFences,
    extractMermaidPaste,
} from "../../utils/markdownMermaid";
import {
    createMediaUploadId,
    enqueueMediaUpload,
} from "../../utils/mediaUploadQueue";
import { getLixShikiHighlighter } from "../../utils/shikiHighlighter";
import { clearInheritedBlockTextColors } from "../../utils/blockColorNormalization";
import { parseChecklistShortcut } from "../../utils/checklistShortcut";
import { getHeadingSection } from "../../utils/headingSections";
import AICommandMenu from "./AICommandMenu";
import AISelectionToolbar from "./AISelectionToolbar";
import { AIBlock } from "./blocks/AIBlock";
import { BlockEquation } from "./blocks/BlockEquation";
import {
    BlogImageBlock,
    BlogImageUploadContext,
} from "./blocks/BlogImageBlock";
import { BlogMentionInline } from "./blocks/BlogMentionInline";
import { Breadcrumbs } from "./blocks/Breadcrumbs";
import { ButtonBlock } from "./blocks/ButtonBlock";
import { CanvasBlock } from "./blocks/CanvasBlock";
import { DateInline } from "./blocks/DateInline";
import { InlineButton } from "./blocks/InlineButton";
// Custom inline content
import { InlineEquation } from "./blocks/InlineEquation";
import { MentionInline } from "./blocks/MentionInline";
import {
    MermaidBlock,
    requestMermaidEditorFocus,
} from "./blocks/MermaidBlock";
import { OrgMentionInline } from "./blocks/OrgMentionInline";
import { PDFEmbedBlock } from "./blocks/PDFEmbedBlock";
// Custom blocks — local versions (package is for external consumers)
import { TableOfContents } from "./blocks/TableOfContents";
import { TabsBlock } from "./blocks/TabsBlock";
import LinkPreviewTooltip, { useLinkPreview } from "./LinkPreviewTooltip";
import MentionMenu from "./MentionMenu";

// AI features (space-to-AI menu, AI block, AI selection toolbar, AI image gen)
// are temporarily disabled and surfaced as "Coming soon". Flip to re-enable.
const AI_ENABLED = false;

const SPECIAL_BLOCK_LABELS = {
    image: "image",
    table: "table",
    codeBlock: "code block",
    mermaidBlock: "diagram",
    blockEquation: "equation",
    aiBlock: "AI block",
    pdfEmbed: "PDF",
    buttonBlock: "button",
    breadcrumbs: "breadcrumbs",
    tableOfContents: "table of contents",
    tabsBlock: "tabs block",
    canvasBlock: "canvas",
};

function withoutBlockIds(block) {
    if (!block || typeof block !== "object") return block;
    const partial = { ...block };
    delete partial.id;
    const children = partial.children;
    return {
        ...partial,
        ...(Array.isArray(children)
            ? { children: children.map(withoutBlockIds) }
            : {}),
    };
}

function EditorSideMenu({ onBlockContextMenu }) {
    const editor = useBlockNoteEditor();
    const temporarySectionEndRef = useRef(null);
    const block = useExtensionState(SideMenuExtension, {
        editor,
        selector: (state) => state?.block,
    });

    const prepareSectionDrag = (event) => {
        if (!event.target.closest?.('button[draggable="true"]')) return;
        if (block?.type !== "heading") return;

        const section = getHeadingSection(editor.document, block.id);
        if (section.length <= 1) return;
        let endBlock = section[section.length - 1];

        try {
            editor.setSelection(block.id, endBlock.id);
        } catch {
            // BlockNote cannot end a range selection on content-less blocks
            // such as images or diagrams. Add an invisible trailing paragraph
            // for the duration of the drag so those blocks remain in the range.
            const [temporaryEnd] = editor.insertBlocks(
                [{ type: "paragraph", content: [] }],
                endBlock.id,
                "after",
            );
            if (!temporaryEnd) return;
            temporarySectionEndRef.current = temporaryEnd.id;
            editor.setSelection(block.id, temporaryEnd.id);
        }
    };

    const finishSectionDrag = () => {
        const temporaryId = temporarySectionEndRef.current;
        temporarySectionEndRef.current = null;
        if (!temporaryId) return;
        // The drop transaction is synchronous, but cleanup on the next frame
        // keeps it out of BlockNote's drag-end selection bookkeeping.
        requestAnimationFrame(() => {
            try {
                if (editor.getBlock(temporaryId)) editor.removeBlocks([temporaryId]);
            } catch {}
        });
    };

    return (
        <div
            className="blog-editor-side-menu-host"
            onDragStartCapture={prepareSectionDrag}
            onDragEnd={finishSectionDrag}
            onContextMenu={(event) => {
                const dragHandle = event.target.closest?.(
                    '[data-test="dragHandle"], button[draggable="true"]',
                );
                if (!dragHandle) return;
                if (!block || !SPECIAL_BLOCK_LABELS[block.type]) return;
                onBlockContextMenu(event, block);
            }}
        >
            <SideMenu />
        </div>
    );
}

// ── Schema ──

// Supported languages for code blocks
const codeBlockLanguages = {
    text: { name: "Text" },
    javascript: { name: "JavaScript", aliases: ["js"] },
    typescript: { name: "TypeScript", aliases: ["ts"] },
    python: { name: "Python", aliases: ["py"] },
    java: { name: "Java" },
    c: { name: "C" },
    cpp: { name: "C++" },
    csharp: { name: "C#", aliases: ["cs"] },
    go: { name: "Go" },
    rust: { name: "Rust", aliases: ["rs"] },
    ruby: { name: "Ruby", aliases: ["rb"] },
    php: { name: "PHP" },
    swift: { name: "Swift" },
    kotlin: { name: "Kotlin", aliases: ["kt"] },
    html: { name: "HTML" },
    css: { name: "CSS" },
    json: { name: "JSON" },
    yaml: { name: "YAML", aliases: ["yml"] },
    markdown: { name: "Markdown", aliases: ["md"] },
    bash: { name: "Bash", aliases: ["sh"] },
    shell: { name: "Shell" },
    sql: { name: "SQL" },
    graphql: { name: "GraphQL", aliases: ["gql"] },
    jsx: { name: "JSX" },
    tsx: { name: "TSX" },
    vue: { name: "Vue" },
    svelte: { name: "Svelte" },
    dart: { name: "Dart" },
    lua: { name: "Lua" },
    r: { name: "R" },
    scala: { name: "Scala" },
};

// Code block with Shiki syntax highlighting (lazy-loaded)
const codeBlockWithHighlighting = createCodeBlockSpec({
    supportedLanguages: codeBlockLanguages,
    createHighlighter: async () => {
        const highlighter = await getLixShikiHighlighter();

        // BlockNote's adapter always asks Shiki for its first loaded theme. Emit
        // both palettes as CSS variables instead, so reopened blocks follow the
        // site theme and theme switches do not require re-tokenizing the document.
        if (!highlighter.__lixDualTheme) {
            const codeToTokens = highlighter.codeToTokens.bind(highlighter);
            highlighter.codeToTokens = (code, options = {}) => {
                const { theme: _ignoredTheme, ...rest } = options;
                return codeToTokens(code, {
                    ...rest,
                    themes: {
                        light: "vitesse-light",
                        dark: "vitesse-dark",
                    },
                    defaultColor: false,
                });
            };
            highlighter.__lixDualTheme = true;
        }

        return highlighter;
    },
});

// Block specs from createReactBlockSpec are factories — call them to get the spec
const schema = BlockNoteSchema.create({
    blockSpecs: {
        ...defaultBlockSpecs,
        codeBlock: codeBlockWithHighlighting,
        image: BlogImageBlock({}),
        tableOfContents: TableOfContents({}),
        blockEquation: BlockEquation({}),
        buttonBlock: ButtonBlock({}),
        breadcrumbs: Breadcrumbs({}),
        tabsBlock: TabsBlock({}),
        canvasBlock: CanvasBlock({}),
        aiBlock: AIBlock({}),
        mermaidBlock: MermaidBlock({}),
        pdfEmbed: PDFEmbedBlock({}),
    },
    inlineContentSpecs: {
        ...defaultInlineContentSpecs,
        inlineEquation: InlineEquation,
        dateInline: DateInline,
        mention: MentionInline,
        blogMention: BlogMentionInline,
        orgMention: OrgMentionInline,
        inlineButton: InlineButton,
    },
});

// ── Inline LaTeX live preview (lazy-loads katex) ──

function InlineLatexPreview({ latex }) {
    const [html, setHtml] = useState("");
    useEffect(() => {
        const s = latex?.trim();
        if (!s) {
            setHtml("");
            return;
        }
        import("katex").then(({ default: katex }) => {
            let expr = s;
            if (expr.startsWith("\\(") && expr.endsWith("\\)"))
                expr = expr.slice(2, -2).trim();
            else if (
                expr.startsWith("$") &&
                expr.endsWith("$") &&
                expr.length > 2
            )
                expr = expr.slice(1, -1).trim();
            try {
                setHtml(
                    katex.renderToString(expr, {
                        displayMode: false,
                        throwOnError: false,
                    }),
                );
            } catch {
                setHtml("");
            }
        });
    }, [latex]);
    if (!html) return null;
    return (
        <div
            className="inline-latex-preview"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

// ── Helpers ──

function filterItems(items, query) {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((item) => {
        const title = (item.title || "").toLowerCase();
        const subtext = (item.subtext || "").toLowerCase();
        const aliases = (item.aliases || []).map((a) => a.toLowerCase());
        return (
            title.includes(q) ||
            subtext.includes(q) ||
            aliases.some((a) => a.includes(q))
        );
    });
}

function Icon({ d, d2, color }) {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color || "currentColor"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d={d} />
            {d2 && <path d={d2} />}
        </svg>
    );
}

// ── Text-color & highlight toolbar buttons (#14) ──
// Two dedicated buttons on the selection toolbar (text color + a separate
// highlight). Text colors are hex values mapped in base.css (so green is real
// green, not BlockNote's named-color grey); highlights are translucent rgba so
// they read like a marker, not a solid fill.
const TEXT_COLORS = [
    { label: "Default", value: "default" },
    { label: "White", value: "#ffffff" },
    { label: "Gray", value: "#9ca3af" },
    { label: "Red", value: "#f87171" },
    { label: "Orange", value: "#fb923c" },
    { label: "Yellow", value: "#fbbf24" },
    { label: "Green", value: "#4ade80" },
    { label: "Blue", value: "#60a5fa" },
    { label: "Purple", value: "#a78bfa" },
    { label: "Pink", value: "#f472b6" },
];
const HIGHLIGHT_COLORS = [
    { label: "None", value: "default" },
    { label: "Gray", value: "rgba(156,163,175,0.25)" },
    { label: "Red", value: "rgba(248,113,113,0.25)" },
    { label: "Orange", value: "rgba(251,146,60,0.25)" },
    { label: "Yellow", value: "rgba(251,191,36,0.25)" },
    { label: "Green", value: "rgba(74,222,128,0.25)" },
    { label: "Blue", value: "rgba(96,165,250,0.25)" },
    { label: "Purple", value: "rgba(167,139,250,0.25)" },
    { label: "Pink", value: "rgba(244,114,182,0.25)" },
];

function ToolbarStyleButton({ editor, kind }) {
    const isText = kind === "text";
    const palette = isText ? TEXT_COLORS : HIGHLIGHT_COLORS;
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (e.target.closest(".toolbar-color-popover")) return;
            if (btnRef.current && btnRef.current.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [open]);

    const toggle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 6, left: r.left });
        setOpen((o) => !o);
    };

    const apply = (e, value) => {
        e.preventDefault();
        try {
            editor.focus();
            const key = isText ? "textColor" : "backgroundColor";
            if (value === "default") editor.removeStyles({ [key]: "" });
            else editor.addStyles({ [key]: value });
            // Drop the selection so the applied color/highlight is visible.
            setTimeout(() => window.getSelection()?.removeAllRanges(), 50);
        } catch (err) {
            console.error("Failed to apply style:", err);
        }
        setOpen(false);
    };

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`bn-button ${isText ? "toolbar-color-btn" : "toolbar-highlight-btn"}`}
                title={isText ? "Text color" : "Highlight"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggle}
            >
                {isText ? (
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
                        <path d="M4 20h16" />
                        <path d="M7 16l5-12 5 12" />
                        <path d="M9.5 11h5" />
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
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                )}
                <span
                    className="toolbar-color-indicator"
                    style={{ background: isText ? "#e0e0e0" : "#fbbf24" }}
                />
            </button>
            {open &&
                createPortal(
                    <div
                        className="toolbar-color-popover"
                        style={{
                            position: "fixed",
                            top: pos.top,
                            left: pos.left,
                            zIndex: 10001,
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        <div className="toolbar-color-popover-label">
                            {isText ? "Text Color" : "Highlight"}
                        </div>
                        <div className="toolbar-color-grid">
                            {palette.map((c) => (
                                <button
                                    key={c.value}
                                    type="button"
                                    className="toolbar-color-swatch"
                                    title={c.label}
                                    style={
                                        c.value === "default"
                                            ? {
                                                  background: "transparent",
                                                  border: "1.5px dashed #6b7a8d",
                                              }
                                            : { background: c.value }
                                    }
                                    onMouseDown={(e) => apply(e, c.value)}
                                />
                            ))}
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}

// Classify the current selection's relationship to link marks:
//  'none'    — no link in the selection (offer "Create link")
//  'partial' — selection touches a link but isn't exactly one whole link
//              (a substring of a URL, or link + surrounding text) → no link button
//  'full'    — the selection is exactly one whole link → offer "Edit link"
function analyzeLinkSelection(editor) {
    try {
        const tiptap = editor?._tiptapEditor;
        if (!tiptap) return { kind: "none" };
        const { state } = tiptap;
        const { from, to, empty } = state.selection;
        if (empty) return { kind: "none" };

        let href = null;
        let linkChars = 0;
        state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.isText) {
                const lm = node.marks.find((m) => m.type.name === "link");
                if (lm) {
                    href = lm.attrs.href;
                    const s = Math.max(pos, from);
                    const e = Math.min(pos + node.nodeSize, to);
                    linkChars += Math.max(0, e - s);
                }
            }
        });

        if (linkChars === 0) return { kind: "none", from, to };

        // Expand the link range around the selection and check it matches exactly.
        let lf = from,
            lt = to;
        state.doc.nodesBetween(
            Math.max(0, from - 2000),
            Math.min(state.doc.content.size, to + 2000),
            (node, pos) => {
                if (
                    node.isText &&
                    node.marks.some(
                        (m) => m.type.name === "link" && m.attrs.href === href,
                    )
                ) {
                    if (pos < lf) lf = pos;
                    if (pos + node.nodeSize > lt) lt = pos + node.nodeSize;
                }
            },
        );

        if (lf === from && lt === to) {
            return {
                kind: "full",
                href,
                text: state.doc.textBetween(lf, lt),
                from: lf,
                to: lt,
            };
        }
        return { kind: "partial" };
    } catch {
        return { kind: "none" };
    }
}

function getLinkRange(tiptap, pos, href) {
    try {
        const { state } = tiptap;
        const $pos = state.doc.resolve(pos);
        const blockStart = $pos.start();
        const blockEnd = $pos.end();

        const linkNodes = [];
        state.doc.nodesBetween(blockStart, blockEnd, (node, nodePos) => {
            if (node.isText) {
                const lm = node.marks.find(
                    (m) => m.type.name === "link" && m.attrs.href === href,
                );
                if (lm) {
                    linkNodes.push({
                        start: nodePos,
                        end: nodePos + node.nodeSize,
                        text: node.text,
                    });
                }
            }
        });

        const initialNodeIndex = linkNodes.findIndex(
            (n) => pos >= n.start && pos <= n.end,
        );
        if (initialNodeIndex === -1) return null;

        let lf = linkNodes[initialNodeIndex].start;
        for (let i = initialNodeIndex - 1; i >= 0; i--) {
            if (linkNodes[i].end === lf) {
                lf = linkNodes[i].start;
            } else {
                break;
            }
        }

        let lt = linkNodes[initialNodeIndex].end;
        for (let i = initialNodeIndex + 1; i < linkNodes.length; i++) {
            if (linkNodes[i].start === lt) {
                lt = linkNodes[i].end;
            } else {
                break;
            }
        }

        return {
            from: lf,
            to: lt,
            text: state.doc.textBetween(lf, lt),
            href,
        };
    } catch {
        return null;
    }
}

// ── Slash menu items ──

function getCustomSlashMenuItems(editor, callbacks = {}) {
    const defaults = getDefaultReactSlashMenuItems(editor).filter((item) => {
        const t = item.title.toLowerCase();
        // Drop the default image item too — it opens BlockNote's built-in file panel.
        // We insert our own image block (custom Upload/Embed UI) instead.
        return t !== "video" && t !== "audio" && t !== "file" && t !== "image";
    });

    const customBlocks = [
        {
            title: "Image",
            subtext: "Upload or embed an image",
            group: "Media",
            aliases: ["image", "img", "picture", "photo", "upload"],
            icon: (
                <Icon
                    d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
                    d2="M3 3h18v18H3z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 15l-5-5L5 21"
                />
            ),
            onItemClick: () =>
                editor.insertBlocks(
                    [{ type: "image", props: { url: "" } }],
                    editor.getTextCursorPosition().block,
                    "after",
                ),
        },
        // Table of Contents is no longer insertable — the floating TOC is rendered
        // automatically at the top-right of every blog. The `tableOfContents` block
        // spec stays mounted for backward compat with already-saved blogs (#19).
        {
            title: "Block Equation",
            subtext: "Render LaTeX as a block",
            group: "Custom Blocks",
            aliases: ["latex", "math", "equation", "formula", "katex"],
            icon: <Icon d="M4 4l4 16M12 4l4 16M7 8h10M6 16h10" />,
            onItemClick: () =>
                editor.insertBlocks(
                    [{ type: "blockEquation" }],
                    editor.getTextCursorPosition().block,
                    "after",
                ),
        },
        {
            title: "Button",
            subtext: "Interactive button with action",
            group: "Custom Blocks",
            aliases: ["button", "cta", "action", "link button"],
            icon: (
                <Icon d="M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
            ),
            onItemClick: () =>
                editor.insertBlocks(
                    [{ type: "buttonBlock" }],
                    editor.getTextCursorPosition().block,
                    "after",
                ),
        },
        {
            title: "Breadcrumbs",
            subtext: "Navigation breadcrumb trail",
            group: "Custom Blocks",
            aliases: ["breadcrumb", "nav", "path", "navigation"],
            icon: <Icon d="M3 12h4l3-3 4 6 3-3h4" />,
            onItemClick: () =>
                editor.insertBlocks(
                    [{ type: "breadcrumbs" }],
                    editor.getTextCursorPosition().block,
                    "after",
                ),
        },
        {
            title: "Sub Page",
            subtext: "Nested page within this blog (max 2 per blog)",
            group: "Custom Blocks",
            aliases: [
                "subpage",
                "sub page",
                "tabs",
                "nested",
                "page in page",
                "child page",
            ],
            icon: (
                <Icon
                    d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                    d2="M14 2v6h6M16 13H8M16 17H8"
                />
            ),
            onItemClick: () =>
                editor.insertBlocks(
                    [{ type: "tabsBlock" }],
                    editor.getTextCursorPosition().block,
                    "after",
                ),
        },
        {
            // Canvas is a separate modality with known bugs — surfaced as "Coming
            // soon" and not insertable for now (#11). Existing canvas sub-pages still
            // render via the canvasBlock spec.
            title: "Canvas (Coming soon)",
            subtext: "Canvas sketching is coming soon",
            group: "Custom Blocks",
            aliases: [
                "canvas",
                "sketch",
                "draw",
                "whiteboard",
                "lixsketch",
                "diagram canvas",
            ],
            icon: <Icon d="M3 3h18v18H3zM3 9h18M9 21V9" color="#6b7a8d" />,
            onItemClick: () => {},
        },
        {
            title: "Diagram",
            subtext: "Mermaid flowchart, sequence, or class diagram",
            group: "Custom Blocks",
            aliases: [
                "mermaid",
                "diagram",
                "flowchart",
                "sequence",
                "chart",
                "graph",
            ],
            icon: (
                <Icon
                    d="M3 3h7v7H3zM14 3h7v7h-7zM8.5 14h7v7h-7z"
                    d2="M6.5 10v4M17.5 10v4"
                />
            ),
            onItemClick: () => {
                const anchor = editor.getTextCursorPosition().block;
                editor.insertBlocks(
                    [{ type: "mermaidBlock" }],
                    anchor,
                    "after",
                );
                const documentBlocks = editor.document;
                const anchorIndex = documentBlocks.findIndex(
                    (block) => block.id === anchor.id,
                );
                if (anchorIndex >= 0) {
                    requestMermaidEditorFocus(
                        documentBlocks[anchorIndex + 1]?.id,
                    );
                }
            },
        },
        // PDF embed removed: only static-image attachments are allowed in blog
        // content. The pdfEmbed block spec stays mounted for backward compat
        // with already-saved blogs but is no longer insertable from the menu.
        // AI block removed entirely — AI features are not part of blogs.
    ];

    const inlineItems = [
        {
            title: "Inline Equation",
            subtext: "Inline LaTeX math",
            group: "Inline",
            aliases: ["inline math", "inline latex", "math inline"],
            icon: <Icon d="M4 4l4 16M12 4l4 16M7 8h10M6 16h10" />,
            onItemClick: () => {
                if (callbacks.onInlineLatex) {
                    callbacks.onInlineLatex();
                }
            },
        },
        {
            title: "Date",
            subtext: "Insert current date",
            group: "Inline",
            aliases: ["date", "today", "timestamp"],
            icon: (
                <Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
            ),
            onItemClick: () => {
                editor.insertInlineContent([
                    {
                        type: "dateInline",
                        props: { date: new Date().toISOString().split("T")[0] },
                    },
                ]);
            },
        },
        // Secret blogs can't mention people: naming a collaborator inside an anonymous
        // post narrows down who wrote it. This slash command bypasses MentionMenu and
        // inserts the node directly, so it has to be removed here too — gating the menu
        // alone would leave this path wide open.
        ...(callbacks.secret
            ? []
            : [
                  {
                      title: "Mention User",
                      subtext: "Mention a LixBlogs user",
                      group: "Inline",
                      aliases: ["mention", "user", "tag user", "@"],
                      icon: (
                          <Icon d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" />
                      ),
                      onItemClick: () => {
                          const username = prompt("Enter username:");
                          if (username)
                              editor.insertInlineContent([
                                  {
                                      type: "mention",
                                      props: {
                                          username: username.replace("@", ""),
                                      },
                                  },
                              ]);
                      },
                  },
              ]),
        {
            title: "Mention Blog",
            subtext: "Link to another published blog",
            group: "Inline",
            aliases: ["blog mention", "link blog", "reference", "cite"],
            icon: (
                <Icon
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
                    d2="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
            ),
            onItemClick: () => {
                const title = prompt("Blog title:");
                const slugid = prompt("Blog slug ID:");
                if (title && slugid)
                    editor.insertInlineContent([
                        { type: "blogMention", props: { title, slugid } },
                    ]);
            },
        },
        // Text color / background are set from the selection (formatting) toolbar,
        // not the slash menu (#14). The prompt()-based slash items were removed.
    ];

    return [...defaults, ...customBlocks, ...inlineItems];
}

// ── Check if block is empty ──

function isCurrentBlockEmpty(editor) {
    try {
        const cursor = editor.getTextCursorPosition();
        if (!cursor?.block) return false;
        const block = cursor.block;
        if (block.type !== "paragraph") return false;
        if (!block.content || block.content.length === 0) return true;
        if (
            block.content.length === 1 &&
            block.content[0].type === "text" &&
            block.content[0].text === ""
        )
            return true;
        return false;
    } catch {
        return false;
    }
}

// ── BlogEditor ──

// Sanitize saved content — convert raw LaTeX/code paragraphs back into proper block types
// Block types known to the schema — used to filter out stale/removed block types
const KNOWN_BLOCK_TYPES = new Set([
    "paragraph",
    "heading",
    "quote",
    "bulletListItem",
    "numberedListItem",
    "image",
    "table",
    "codeBlock",
    "checkListItem",
    "file",
    "video",
    "audio",
    "divider",
    "tableOfContents",
    "blockEquation",
    "buttonBlock",
    "breadcrumbs",
    "tabsBlock",
    "canvasBlock",
    "aiBlock",
    "mermaidBlock",
    "pdfEmbed",
]);

function sanitizeInitialContent(blocks) {
    // Parse JSON string if needed
    if (typeof blocks === "string") {
        try {
            blocks = JSON.parse(blocks);
        } catch {
            return undefined;
        }
    }
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0)
        return undefined;

    // Filter out unknown block types (e.g. removed custom blocks)
    const filtered = blocks.filter(
        (b) => !b.type || KNOWN_BLOCK_TYPES.has(b.type),
    );
    if (filtered.length === 0) return undefined;

    const sanitized = clearInheritedBlockTextColors(doSanitize(filtered));
    return sanitized?.length ? sanitized : undefined;
}

function normalizeInternalTextColors(content) {
    if (!Array.isArray(content)) return content;
    return content.map((item) => {
        let next = item;
        const textColor = String(item?.styles?.textColor || "").toLowerCase();
        if (
            textColor === "gray" ||
            textColor === "grey" ||
            textColor === "default"
        ) {
            const styles = { ...item.styles };
            delete styles.textColor;
            next = { ...next, styles };
        }
        if (Array.isArray(item?.content)) {
            next = {
                ...next,
                content: normalizeInternalTextColors(item.content),
            };
        }
        return next;
    });
}

function doSanitize(blocks) {
    if (!blocks || !Array.isArray(blocks)) return blocks;
    const result = [];
    let i = 0;

    const getText = (b) => {
        if (!b.content || !Array.isArray(b.content)) return "";
        return b.content
            .map((c) => {
                if (c.type === "inlineEquation") return c.props?.latex || "";
                return c.text || "";
            })
            .join("")
            .trim();
    };

    while (i < blocks.length) {
        let block = blocks[i];
        if (Array.isArray(block.content)) {
            block = {
                ...block,
                content: normalizeInternalTextColors(block.content),
            };
        }
        // Recursively sanitize children
        if (block.children && block.children.length > 0) {
            block = { ...block, children: doSanitize(block.children) };
        }

        // Migrate saved/pasted Mermaid code blocks into the native diagram block.
        // Older documents used a regular codeBlock, which meant reopening the
        // editor never showed the Mermaid controls or viewport.
        if (block.type === "codeBlock") {
            const codeText = getText(block);
            const language = String(block.props?.language || "").toLowerCase();
            const fenced = codeText.match(
                /^\s*```\s*mermaid\s*\n([\s\S]*?)\n?```\s*$/i,
            );
            if (language === "mermaid" || fenced) {
                const { content: _content, ...rest } = block;
                result.push({
                    ...rest,
                    type: "mermaidBlock",
                    props: { diagram: (fenced?.[1] || codeText).trim() },
                    children: block.children || [],
                });
                i++;
                continue;
            }
        }

        if (block.type === "paragraph") {
            const paragraphText = getText(block);
            const inlineFence = paragraphText.match(
                /^\s*```\s*mermaid\s*\n([\s\S]*?)\n?```\s*$/i,
            );
            if (inlineFence) {
                result.push({
                    id: block.id,
                    type: "mermaidBlock",
                    props: { diagram: inlineFence[1].trim() },
                    children: block.children || [],
                });
                i++;
                continue;
            }

            if (/^```\s*mermaid\s*$/i.test(paragraphText)) {
                const diagramLines = [];
                let cursor = i + 1;
                while (cursor < blocks.length) {
                    const line = getText(blocks[cursor]);
                    if (/^```\s*$/.test(line)) break;
                    diagramLines.push(line);
                    cursor++;
                }
                if (cursor < blocks.length && diagramLines.length) {
                    result.push({
                        id: block.id,
                        type: "mermaidBlock",
                        props: { diagram: diagramLines.join("\n").trim() },
                        children: block.children || [],
                    });
                    i = cursor + 1;
                    continue;
                }
            }
        }
        // Headings render in the default color — drop stray inline text colors
        // (e.g. a pasted #e06c75) so they stay consistent and re-saving normalizes them.
        if (block.type === "heading" && Array.isArray(block.content)) {
            block = {
                ...block,
                content: block.content.map((c) =>
                    c.styles && (c.styles.textColor || c.styles.backgroundColor)
                        ? {
                              ...c,
                              styles: {
                                  ...c.styles,
                                  textColor: undefined,
                                  backgroundColor: undefined,
                              },
                          }
                        : c,
                ),
            };
        }
        // Code block containing LaTeX \[...\] expressions → extract as blockEquations
        if (block.type === "codeBlock") {
            const codeText = getText(block);
            const latexPattern = /\\\[[\s\S]*?\\\]/g;
            const latexMatches = codeText.match(latexPattern);
            if (latexMatches && latexMatches.length > 0) {
                // Split code block into text segments and LaTeX blocks
                const parts = codeText.split(latexPattern);
                let mIdx = 0;
                for (let p = 0; p < parts.length; p++) {
                    const segment = parts[p].trim();
                    // Non-LaTeX text segments become paragraphs (e.g. comments like "% Time-Dependent...")
                    if (segment) {
                        const lines = segment
                            .split("\n")
                            .filter((l) => l.trim());
                        for (const line of lines) {
                            const trimLine = line.trim();
                            // Skip comment-only lines (% ...)
                            if (trimLine.startsWith("%")) {
                                result.push({
                                    type: "paragraph",
                                    content: [
                                        {
                                            type: "text",
                                            text: trimLine,
                                            styles: { italic: true },
                                        },
                                    ],
                                    children: [],
                                });
                            } else {
                                result.push({
                                    type: "paragraph",
                                    content: [{ type: "text", text: trimLine }],
                                    children: [],
                                });
                            }
                        }
                    }
                    if (mIdx < latexMatches.length) {
                        const latex = latexMatches[mIdx]
                            .replace(/^\\\[/, "")
                            .replace(/\\\]$/, "")
                            .trim();
                        if (latex) {
                            result.push({
                                type: "blockEquation",
                                props: { latex },
                                children: [],
                            });
                        }
                        mIdx++;
                    }
                }
                i++;
                continue;
            }
        }

        if (block.type !== "paragraph") {
            result.push(block);
            i++;
            continue;
        }

        const text = getText(block);

        // Paragraph containing only a single inlineEquation → convert to blockEquation
        const contentItems = (block.content || []).filter(
            (c) => !(c.type === "text" && !c.text?.trim()),
        );
        if (
            contentItems.length === 1 &&
            contentItems[0].type === "inlineEquation" &&
            contentItems[0].props?.latex
        ) {
            result.push({
                id: block.id,
                type: "blockEquation",
                props: { latex: contentItems[0].props.latex },
                children: [],
            });
            i++;
            continue;
        }

        // Single-line \[...\] — may have \] at end of content
        const singleBracket = text.match(/^\\\[(.+?)\\\]$/s);
        if (singleBracket) {
            result.push({
                id: block.id,
                type: "blockEquation",
                props: { latex: singleBracket[1].trim() },
            });
            i++;
            continue;
        }

        // Single-line $$...$$
        const singleDollar = text.match(/^\$\$(.+?)\$\$$/s);
        if (singleDollar) {
            result.push({
                id: block.id,
                type: "blockEquation",
                props: { latex: singleDollar[1].trim() },
            });
            i++;
            continue;
        }

        // Multi-line \[ opener — collect until a block containing \]
        if (text === "\\[" || text.startsWith("\\[")) {
            const firstContent = text === "\\[" ? "" : text.slice(2);
            // Check if \] is already in this block
            const closeInFirst = firstContent.indexOf("\\]");
            if (closeInFirst !== -1) {
                const latex = firstContent.slice(0, closeInFirst).trim();
                if (latex)
                    result.push({
                        id: block.id,
                        type: "blockEquation",
                        props: { latex },
                        children: [],
                    });
                i++;
                continue;
            }
            const latexParts = firstContent ? [firstContent] : [];
            i++;
            while (i < blocks.length) {
                const nextText = getText(blocks[i]);
                // Check if this block contains the closing \]
                const closeIdx = nextText.indexOf("\\]");
                if (closeIdx !== -1) {
                    const before = nextText.slice(0, closeIdx).trim();
                    if (before) latexParts.push(before);
                    i++;
                    break;
                }
                if (nextText === "\\]") {
                    i++;
                    break;
                }
                latexParts.push(nextText);
                i++;
            }
            const latex = latexParts.join("\n").trim();
            if (latex)
                result.push({
                    id: block.id,
                    type: "blockEquation",
                    props: { latex },
                    children: [],
                });
            continue;
        }

        // Multi-line $$ opener
        if (text === "$$" || (text.startsWith("$$") && !text.endsWith("$$"))) {
            const firstContent = text === "$$" ? "" : text.slice(2);
            const latexParts = firstContent ? [firstContent] : [];
            i++;
            while (i < blocks.length) {
                const nextText = getText(blocks[i]);
                const closeIdx = nextText.indexOf("$$");
                if (closeIdx !== -1) {
                    const before = nextText.slice(0, closeIdx).trim();
                    if (before) latexParts.push(before);
                    i++;
                    break;
                }
                if (nextText === "$$") {
                    i++;
                    break;
                }
                latexParts.push(nextText);
                i++;
            }
            const latex = latexParts.join("\n").trim();
            if (latex)
                result.push({
                    id: block.id,
                    type: "blockEquation",
                    props: { latex },
                    children: [],
                });
            continue;
        }

        // Horizontal rule: ---, ***, ___, ———, ––– etc → divider
        if (/^([-*_])\1{2,}$/.test(text) || /^[—–]{2,}$/.test(text)) {
            result.push({ id: block.id, type: "divider", children: [] });
            i++;
            continue;
        }

        // Code fence opener: ```lang — collect until closing ```
        const fenceMatch = text.match(/^```(\w*)$/);
        if (fenceMatch) {
            const lang = fenceMatch[1] || "";
            const codeLines = [];
            i++;
            while (i < blocks.length) {
                const nextText = getText(blocks[i]);
                if (nextText === "```") {
                    i++;
                    break;
                }
                codeLines.push(nextText);
                i++;
            }
            if (lang === "mermaid") {
                result.push({
                    id: block.id,
                    type: "mermaidBlock",
                    props: { diagram: codeLines.join("\n") },
                });
            } else {
                result.push({
                    id: block.id,
                    type: "codeBlock",
                    props: { language: lang },
                    content: [{ type: "text", text: codeLines.join("\n") }],
                });
            }
            continue;
        }

        result.push(block);
        i++;
    }
    return result;
}

const BlogEditor = forwardRef(function BlogEditor(
    {
        onChange,
        initialContent,
        onReady,
        onTitleChange,
        blogId,
        mediaStorageStatus,
        collaboration,
        onCollabSeeded,
        editable = true,
        secret = false,
    },
    ref,
) {
    const { isDark } = useTheme();
    const sanitizedContent = useMemo(
        () => sanitizeInitialContent(initialContent),
        [initialContent],
    );

    const editor = useCreateBlockNote({
        schema,
        // When in collab mode, Yjs doc is the source of truth — no initialContent
        ...(collaboration
            ? { collaboration }
            : { initialContent: sanitizedContent || undefined }),
        domAttributes: {
            editor: { class: "blog-editor" },
        },
        placeholders: {
            default: AI_ENABLED
                ? "Press 'Space' for AI, type '/' for commands"
                : "Type '/' for commands",
        },
    });

    // BlockNote's ExtensionManager retains its complete construction options,
    // including the full initial block array, after ProseMirror has already
    // converted it into a document. Drop that redundant tree immediately.
    if (!collaboration && editor._extensionManager?.options?.initialContent) {
        delete editor._extensionManager.options.initialContent;
    }

    const [pageMenu, setPageMenu] = useState(null); // {x,y} for the right-click page menu (#21)
    const [blockMenu, setBlockMenu] = useState(null); // {x,y,blockId,blockType}
    const [showMentionMenu, setShowMentionMenu] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
    const mentionStartRef = useRef(null);
    const mentionDismissedRef = useRef(null); // @-position the user ESC-dismissed, so we don't reopen it
    const [showAIMenu, setShowAIMenu] = useState(false);
    const [aiMenuPos, setAiMenuPos] = useState({
        top: 0,
        left: 0,
        anchorBlockId: null,
    });
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiGeneratingBlockId, setAiGeneratingBlockId] = useState(null);
    const [aiPhase, setAiPhase] = useState("idle"); // idle | thinking | writing | generating_image | uploading
    const [aiStatusInline, setAiStatusInline] = useState(false); // true = inline status bar, false = bottom bar
    const [aiInlinePos, setAiInlinePos] = useState({ top: 0 }); // position for inline status bar
    const [aiStatusText, setAiStatusText] = useState("is thinking"); // cycling status text
    const aiStatusTimerRef = useRef(null);
    const [aiErrorToast, setAiErrorToast] = useState(null);
    const [aiBlockIds, setAiBlockIds] = useState(new Set());
    const [showAIActions, setShowAIActions] = useState(false);
    const [aiActionsPos, setAiActionsPos] = useState({ top: 0, left: 0 });
    const aiAbortRef = useRef(null);
    const aiBlockIdsRef = useRef(new Set());
    const aiBlockCountRef = useRef(0);

    const openBlockContextMenu = useCallback(
        (event, block) => {
            if (!editable || !SPECIAL_BLOCK_LABELS[block?.type]) return;
            event.preventDefault();
            event.stopPropagation();
            const handle = event.target.closest?.(
                'button[draggable="true"]',
            );
            const anchor = handle?.getBoundingClientRect();
            const menuWidth = 210;
            const menuGap = 10;
            const viewportPadding = 8;
            const preferredLeft =
                (anchor?.left ?? event.clientX) - menuWidth - menuGap;
            const fallbackRight = (anchor?.right ?? event.clientX) + menuGap;
            setPageMenu(null);
            setBlockMenu({
                // Keep block actions outside the content block, beside the
                // drag controls. Fall back to the right only on narrow screens.
                x:
                    preferredLeft >= viewportPadding
                        ? preferredLeft
                        : Math.max(
                              viewportPadding,
                              Math.min(
                                  fallbackRight,
                                  window.innerWidth -
                                      menuWidth -
                                      viewportPadding,
                              ),
                          ),
                y: Math.max(
                    viewportPadding,
                    Math.min(
                        anchor?.top ?? event.clientY,
                        window.innerHeight - 170,
                    ),
                ),
                blockId: block.id,
                blockType: block.type,
            });
        },
        [editable],
    );
    const CustomSideMenu = useCallback(
        () => (
            <EditorSideMenu onBlockContextMenu={openBlockContextMenu} />
        ),
        [openBlockContextMenu],
    );
    const removeSpecialBlock = useCallback(
        async ({ blockId, blockType }) => {
            const block = editor.getBlock(blockId);
            if (!block) return;

            let subpages = [];
            if (blockType === "canvasBlock" && block.props?.subpageId) {
                subpages = [
                    {
                        id: block.props.subpageId,
                        kind: "canvas",
                    },
                ];
            } else if (blockType === "tabsBlock") {
                try {
                    subpages = JSON.parse(block.props?.tabs || "[]")
                        .filter((tab) => tab?.subpageId)
                        .map((tab) => ({
                            id: tab.subpageId,
                            kind: tab.kind || "doc",
                        }));
                } catch {}
            }

            for (const subpage of subpages) {
                const confirmed = await confirmSubpageDelete(subpage.id, {
                    fallbackKind: subpage.kind,
                });
                if (!confirmed) return;
            }
            await Promise.all(
                subpages.map((subpage) =>
                    fetch(`/api/subpages?id=${subpage.id}`, {
                        method: "DELETE",
                    }).catch(() => null),
                ),
            );
            editor.removeBlocks([blockId]);
        },
        [editor],
    );
    const aiAnchorIdRef = useRef(null);
    const wrapperRef = useRef(null);
    const [showInlineLatex, setShowInlineLatex] = useState(false);
    const [inlineLatexValue, setInlineLatexValue] = useState("");
    const inlineLatexRef = useRef(null);
    const editorLinkPreview = useLinkPreview();
    const [linkEditor, setLinkEditor] = useState(null); // { anchorText, url, pos, linkEl, range }
    const [shorteningLink, setShorteningLink] = useState(false);
    const [linkShortenError, setLinkShortenError] = useState("");

    const shortenCurrentLink = async () => {
        const normalizedUrl = normalizeUrl(linkEditor?.url || "");
        if (
            !normalizedUrl ||
            !/^https?:\/\//i.test(normalizedUrl) ||
            shorteningLink
        )
            return;
        try {
            const parsed = new URL(normalizedUrl);
            if (
                parsed.hostname === "lixrl.com" ||
                parsed.hostname.endsWith(".lixrl.com")
            ) {
                setLinkShortenError(
                    "This link is already shortened with LixRL.",
                );
                return;
            }
        } catch {
            setLinkShortenError("Enter a valid web address first.");
            return;
        }

        setShorteningLink(true);
        setLinkShortenError("");
        try {
            const response = await fetch("/api/integrations/lixrl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "shorten",
                    url: normalizedUrl,
                    title: linkEditor?.anchorText?.trim() || undefined,
                }),
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error || "Unable to shorten this URL");
            setLinkEditor((prev) =>
                prev ? { ...prev, url: data.short_url } : prev,
            );
        } catch (error) {
            setLinkShortenError(error.message || "Unable to shorten this URL");
        } finally {
            setShorteningLink(false);
        }
    };

    // Link preview hover listeners on editor links
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const handleMouseOver = (e) => {
            const link = e.target.closest("a[href]");
            if (
                !link ||
                link.closest(".bn-link-toolbar") ||
                link.closest(".bn-toolbar")
            )
                return;
            if (
                document.querySelector(".bn-link-toolbar") ||
                document.querySelector(".link-editor-popup")
            )
                return;
            const href = link.getAttribute("href");
            if (href) {
                const normalized = normalizeUrl(href);
                if (normalized.startsWith("http")) {
                    editorLinkPreview.show(link, normalized);
                }
            }
        };

        const handleMouseOut = (e) => {
            const link = e.target.closest("a[href]");
            if (!link) return;
            editorLinkPreview.cancel();
        };

        // Ctrl+Click (or Cmd+Click) to open link in new tab
        const handleClick = (e) => {
            editorLinkPreview.hide();
            if (!(e.ctrlKey || e.metaKey)) return;
            const link = e.target.closest("a[href]");
            if (
                !link ||
                link.closest(".bn-link-toolbar") ||
                link.closest(".bn-toolbar")
            )
                return;
            const href = link.getAttribute("href");
            if (href) {
                const normalized = normalizeUrl(href);
                if (
                    !normalized ||
                    normalized.startsWith("/") ||
                    normalized.startsWith("#")
                )
                    return;
                e.preventDefault();
                e.stopPropagation();
                window.open(normalized, "_blank", "noopener,noreferrer");
            }
        };

        // Ctrl/Cmd held → change link cursor to pointer
        const handleKeyDown = (e) => {
            if (e.ctrlKey || e.metaKey) {
                wrapper.classList.add("ctrl-held");
            }
        };
        const handleKeyUp = () => {
            wrapper.classList.remove("ctrl-held");
        };
        const handleBlur = () => {
            wrapper.classList.remove("ctrl-held");
        };

        wrapper.addEventListener("mouseover", handleMouseOver);
        wrapper.addEventListener("mouseout", handleMouseOut);
        wrapper.addEventListener("click", handleClick);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            wrapper.removeEventListener("mouseover", handleMouseOver);
            wrapper.removeEventListener("mouseout", handleMouseOut);
            wrapper.removeEventListener("click", handleClick);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, [editor]);

    // Intercept BlockNote's "Edit link" button — replace with our custom link editor
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || !editor) return;

        const handleClick = (e) => {
            const editBtn = e.target.closest(".bn-link-toolbar .bn-button");
            if (!editBtn) return;
            const toolbar = editBtn.closest(".bn-link-toolbar");
            if (!toolbar) return;
            const buttons = toolbar.querySelectorAll(".bn-button");
            if (buttons[0] !== editBtn) return;

            e.preventDefault();
            e.stopPropagation();

            const tiptap = editor?._tiptapEditor;
            if (!tiptap) return;
            const { state } = tiptap;
            const { from, to } = state.selection;

            const $pos = state.doc.resolve(from);
            const marks = $pos.marks();
            const linkMark = marks.find((m) => m.type.name === "link");
            if (!linkMark) return;

            let linkFrom = from,
                linkTo = to;
            state.doc.nodesBetween(
                Math.max(0, from - 200),
                Math.min(state.doc.content.size, to + 200),
                (node, pos) => {
                    if (
                        node.isText &&
                        node.marks.some(
                            (m) =>
                                m.type.name === "link" &&
                                m.attrs.href === linkMark.attrs.href,
                        )
                    ) {
                        if (pos < linkFrom) linkFrom = pos;
                        if (pos + node.nodeSize > linkTo)
                            linkTo = pos + node.nodeSize;
                    }
                },
            );

            const anchorText = state.doc.textBetween(linkFrom, linkTo);
            const url = linkMark.attrs.href;

            const linkEl =
                wrapper
                    .querySelector(".bn-link-toolbar")
                    ?.parentElement?.querySelector("a[href]") ||
                document.querySelector(`a[href="${url}"]`);
            const rect =
                linkEl?.getBoundingClientRect() ||
                editBtn.getBoundingClientRect();

            setLinkEditor({
                anchorText,
                url,
                from: linkFrom,
                to: linkTo,
                top: rect.bottom + 6,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
            });
        };

        wrapper.addEventListener("click", handleClick, true);
        return () => wrapper.removeEventListener("click", handleClick, true);
    }, [editor]);

    // Auto-convert ![alt](url) to image block and [text](url) to link as you type
    useEffect(() => {
        if (!editor) return;
        const tiptap = editor._tiptapEditor;
        if (!tiptap) return;

        const handleInput = () => {
            const { state, view } = tiptap;
            const { $from } = state.selection;
            const textBefore = $from.parent.textBetween(
                0,
                $from.parentOffset,
                undefined,
                "\ufffc",
            );

            // Check for image syntax: ![alt](url)
            const imgMatch = textBefore.match(
                /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/,
            );
            if (imgMatch) {
                const [fullMatch, alt, imgUrl] = imgMatch;
                const from = $from.pos - fullMatch.length;
                const tr = state.tr.delete(from, $from.pos);
                view.dispatch(tr);
                const cursorBlock = editor.getTextCursorPosition().block;
                editor.insertBlocks(
                    [
                        {
                            type: "image",
                            props: { url: imgUrl, caption: alt || "" },
                        },
                    ],
                    cursorBlock,
                    "after",
                );
                requestAnimationFrame(() => {
                    try {
                        const block = editor.getTextCursorPosition().block;
                        if (
                            block?.type === "paragraph" &&
                            !(block.content || []).some((c) => c.text?.trim())
                        )
                            editor.removeBlocks([block.id]);
                    } catch {}
                });
                return;
            }

            // Check for link syntax: [text](url)
            const match = textBefore.match(/\[([^\]]+)\]\(([^)\s]+)\)$/);
            if (match) {
                const [fullMatch, linkText, url] = match;
                const from = $from.pos - fullMatch.length;
                const normalizedUrl = normalizeUrl(url);
                if (!normalizedUrl) return;
                const linkMark = state.schema.marks.link.create({
                    href: normalizedUrl,
                });
                const tr = state.tr
                    .delete(from, $from.pos)
                    .insertText(linkText, from)
                    .addMark(from, from + linkText.length, linkMark);
                view.dispatch(tr);
                return;
            }

            // Auto-convert bare URL followed by space to a link chip
            // Match: "https://example.com " (URL ending with a space)
            const urlMatch = textBefore.match(/(https?:\/\/[^\s]+)\s$/);
            if (urlMatch) {
                const [fullMatch, url] = urlMatch;
                const from = $from.pos - fullMatch.length;
                const to = $from.pos - 1; // exclude the trailing space
                const linkMark = state.schema.marks.link.create({ href: url });
                const tr = state.tr.addMark(from, to, linkMark);
                view.dispatch(tr);
                return;
            }
        };

        tiptap.on("update", handleInput);
        return () => tiptap.off("update", handleInput);
    }, [editor]);

    // Ctrl+K — create link from selection
    useEffect(() => {
        if (!editor) return;
        const tiptap = editor._tiptapEditor;
        if (!tiptap) return;

        const handleCtrlK = (e) => {
            if (!((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")))
                return;

            const { state, view } = tiptap;
            const { from, to, empty } = state.selection;
            if (empty) return; // no selection → let the browser handle it

            // Disable Ctrl+K when the selection already overlaps a link. Creating a
            // second link over existing link text produces broken nested marks — the
            // user should use the link toolbar's Edit button instead.
            let overlapsLink = false;
            state.doc.nodesBetween(from, to, (node) => {
                if (
                    node.isText &&
                    node.marks.some((m) => m.type.name === "link")
                )
                    overlapsLink = true;
            });
            if (overlapsLink) {
                e.preventDefault();
                return;
            }

            e.preventDefault();

            const selectedText = state.doc.textBetween(from, to);
            const isUrl = /^https?:\/\/\S+$/.test(selectedText.trim());

            // Open the custom link editor (prefilled) rather than a native prompt(),
            // so the user can edit both the text and the URL before applying.
            let rect;
            try {
                const start = view.coordsAtPos(from);
                rect = { bottom: start.bottom, left: start.left };
            } catch {
                rect = { bottom: 120, left: 120 };
            }

            setLinkEditor({
                anchorText: selectedText,
                url: isUrl ? selectedText.trim() : "https://",
                from,
                to,
                top: rect.bottom + 6,
                left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
            });
        };

        // Typing the closing backtick of `inline code` makes ProseMirror's markdown
        // input rule apply the `code` mark and clear ALL stored marks — so the next
        // word loses bold/italic. We re-apply the carried (non-code) marks afterward.
        const handleBacktick = (e) => {
            if (e.key !== "`") return;
            const t = editor?._tiptapEditor;
            if (!t) return;
            const { state } = t;
            const { $from, empty } = state.selection;
            if (!empty) return;
            const codeType = state.schema.marks.code;
            if (!codeType) return;
            // Only when this backtick closes a span (an opening one exists earlier in the block).
            const before = $from.parent.textBetween(
                0,
                $from.parentOffset,
                "\n",
                "￼",
            );
            if (!before.includes("`")) return;
            const carry = (state.storedMarks || $from.marks() || []).filter(
                (m) => m.type !== codeType,
            );
            requestAnimationFrame(() => {
                try {
                    const tt = editor._tiptapEditor;
                    if (tt.state.selection.empty) {
                        tt.view.dispatch(tt.state.tr.setStoredMarks(carry));
                    }
                } catch {}
            });
        };

        const dom = tiptap.view?.dom;
        if (!dom) return;
        dom.addEventListener("keydown", handleCtrlK);
        dom.addEventListener("keydown", handleBacktick);
        return () => {
            try {
                dom.removeEventListener("keydown", handleCtrlK);
                dom.removeEventListener("keydown", handleBacktick);
            } catch {}
        };
    }, [editor]);

    // Open the custom link editor for an already-resolved full-link selection.
    const openLinkEditorForSelection = useCallback((ed, link) => {
        try {
            const view = ed?._tiptapEditor?.view;
            const coords = view?.coordsAtPos(link.from) || {
                bottom: 120,
                left: 120,
            };
            setLinkEditor({
                anchorText: link.text || link.href || "",
                url: link.href || "https://",
                from: link.from,
                to: link.to,
                top: coords.bottom + 6,
                left: Math.max(
                    8,
                    Math.min(coords.left, window.innerWidth - 340),
                ),
            });
        } catch {}
    }, []);

    // Custom formatting toolbar: swaps the link control based on the selection.
    // Plain text → "Create link"; a full link → "Edit link"; a partial/substring
    // link selection → no link control at all (and Ctrl+K is blocked too).
    const LinkAwareFormattingToolbar = useMemo(
        () =>
            function LinkAwareFormattingToolbar() {
                const ed = useBlockNoteEditor();
                const [, force] = useReducer((x) => x + 1, 0);
                useEditorSelectionChange(() => force(), ed);
                const link = analyzeLinkSelection(ed);
                // Drop the default combined color button — we provide separate text-color
                // and highlight buttons (#14).
                const items = getFormattingToolbarItems().filter(
                    (el) =>
                        el.type !== CreateLinkButton &&
                        el.type !== ColorStyleButton,
                );
                return (
                    <FormattingToolbar>
                        {items}
                        {/* Convert the selection into an inline button (#22). */}
                        {link.kind === "none" && (
                            <button
                                key="makeButton"
                                type="button"
                                className="bn-button"
                                title="Make button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    const text = (
                                        ed.getSelectedText?.() || ""
                                    ).trim();
                                    ed.insertInlineContent([
                                        {
                                            type: "inlineButton",
                                            props: {
                                                label: text || "Button",
                                                href: "",
                                            },
                                        },
                                    ]);
                                }}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 28,
                                    height: 28,
                                }}
                            >
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
                                    <rect
                                        x="3"
                                        y="8"
                                        width="18"
                                        height="8"
                                        rx="2"
                                    />
                                    <path d="M8 12h8" />
                                </svg>
                            </button>
                        )}
                        <ToolbarStyleButton
                            key="textColor"
                            editor={ed}
                            kind="text"
                        />
                        <ToolbarStyleButton
                            key="highlight"
                            editor={ed}
                            kind="highlight"
                        />
                        {/* Create link via the custom editor so the selected text is wrapped
                as the link's label (#12) — same flow as the Ctrl+K shortcut. */}
                        {link.kind === "none" && (
                            <button
                                key="createLink"
                                type="button"
                                className="bn-button bn-link-edit-btn"
                                title="Create link (Ctrl+K)"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    try {
                                        const t = ed._tiptapEditor;
                                        const { from, to } = link;
                                        if (from == null || to == null) return;
                                        const text = t.state.doc.textBetween(
                                            from,
                                            to,
                                        );
                                        const isUrl = /^https?:\/\/\S+$/.test(
                                            text.trim(),
                                        );
                                        let coords;
                                        try {
                                            coords = t.view.coordsAtPos(from);
                                        } catch {
                                            coords = { bottom: 120, left: 120 };
                                        }
                                        setLinkEditor({
                                            anchorText: text,
                                            url: isUrl
                                                ? text.trim()
                                                : "https://",
                                            from,
                                            to,
                                            top: coords.bottom + 6,
                                            left: Math.max(
                                                8,
                                                Math.min(
                                                    coords.left,
                                                    window.innerWidth - 340,
                                                ),
                                            ),
                                        });
                                    } catch {}
                                }}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "0 8px",
                                    height: 28,
                                    fontSize: 13,
                                    fontWeight: 500,
                                }}
                            >
                                <svg
                                    width="13"
                                    height="13"
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
                                Link
                            </button>
                        )}
                        {link.kind === "full" && (
                            <button
                                key="editLink"
                                type="button"
                                className="bn-button bn-link-edit-btn"
                                title="Edit link"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                    openLinkEditorForSelection(ed, link)
                                }
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    padding: "0 8px",
                                    height: 28,
                                    fontSize: 13,
                                    fontWeight: 500,
                                }}
                            >
                                <svg
                                    width="13"
                                    height="13"
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
                                Edit link
                            </button>
                        )}
                    </FormattingToolbar>
                );
            },
        [openLinkEditorForSelection],
    );

    // Seed Yjs doc from existing content when collab starts on a blog that already has content
    useEffect(() => {
        if (!collaboration || !onCollabSeeded || !initialContent) return;
        // Check if the Yjs fragment is empty (first collab session for this blog)
        const fragment = collaboration.fragment;
        if (
            fragment &&
            fragment.length === 0 &&
            Array.isArray(initialContent) &&
            initialContent.length > 0
        ) {
            const sanitized = sanitizeInitialContent(initialContent);
            if (sanitized && sanitized.length > 0) {
                try {
                    editor.replaceBlocks(editor.document, sanitized);
                } catch (e) {
                    console.error("Failed to seed collab doc:", e);
                }
            }
            onCollabSeeded();
        }
    }, [collaboration, onCollabSeeded]);

    // Build HTML that includes custom blocks (equations, mermaid)
    const getCustomHTML = useCallback(async () => {
        const baseHTML = await editor.blocksToHTMLLossy(editor.document);
        const doc = editor.document;
        // Collect custom block HTML to append/inject
        const customParts = [];
        for (const block of doc) {
            if (block.type === "blockEquation" && block.props?.latex) {
                customParts.push(
                    `<div class="preview-block-equation" data-latex="${encodeURIComponent(block.props.latex)}"></div>`,
                );
            } else if (block.type === "mermaidBlock" && block.props?.diagram) {
                customParts.push(
                    `<div class="preview-mermaid-block" data-diagram="${encodeURIComponent(block.props.diagram)}"></div>`,
                );
            }
        }
        // Append custom blocks at the positions where empty divs were generated
        return (
            baseHTML + (customParts.length ? "\n" + customParts.join("\n") : "")
        );
    }, [editor]);

    useImperativeHandle(
        ref,
        () => ({
            getDocument: () => editor.document,
            getEditor: () => editor,
            getBlocks: () => editor.document,
            getHTML: async () => await getCustomHTML(),
            getMarkdown: async () =>
                await editor.blocksToMarkdownLossy(editor.document),
        }),
        [editor, getCustomHTML],
    );

    // Prevent backspace from triggering browser back navigation when editor is empty
    useEffect(() => {
        const editorEl = wrapperRef.current?.querySelector(".bn-editor");
        if (!editorEl) return;

        // Content-none block types that should be deletable with Backspace
        const customBlockTypes = new Set([
            "mermaidBlock",
            "blockEquation",
            "aiBlock",
            "tabsBlock",
            "canvasBlock",
            "buttonBlock",
            "breadcrumbs",
            "tableOfContents",
            "pdfEmbed",
        ]);

        function isBlockEmpty(block) {
            if (!block) return false;
            const type = block.type;
            if (type === "mermaidBlock") return !block.props?.diagram;
            if (type === "blockEquation") return !block.props?.latex;
            if (type === "aiBlock") return !block.props?.prompt;
            if (type === "tabsBlock") {
                let tabs = [];
                try {
                    tabs = JSON.parse(block.props?.tabs || "[]");
                } catch {}
                return tabs.length === 0;
            }
            if (type === "codeBlock") {
                const code = (block.content || [])
                    .map((c) => c.text || "")
                    .join("");
                return !code.trim();
            }
            // Paragraph / heading / list items: empty when there's no text content.
            if (
                type === "paragraph" ||
                type === "heading" ||
                type === "bulletListItem" ||
                type === "numberedListItem" ||
                type === "checkListItem"
            ) {
                if (!block.content || block.content.length === 0) return true;
                if (
                    block.content.length === 1 &&
                    block.content[0].type === "text" &&
                    !block.content[0].text
                )
                    return true;
                return false;
            }
            // Other custom blocks without content prop are "always have content" (e.g. buttonBlock)
            if (customBlockTypes.has(type)) return false;
            return false;
        }

        function handleKeyDown(e) {
            const isEditorFocused =
                editorEl.contains(document.activeElement) ||
                editorEl === document.activeElement;
            if (!isEditorFocused) return;

            // Do not ask BlockNote for its cursor during ordinary navigation.
            // This listener runs in capture phase, before ProseMirror processes the
            // key; reading the editor cursor here can restore the previous selection
            // and swallow ArrowLeft/ArrowRight caret movement in Firefox.
            const handlesCtrlA =
                e.key === "a" && (e.ctrlKey || e.metaKey);
            const handlesCtrlEnter =
                e.key === "Enter" && (e.ctrlKey || e.metaKey);
            const handlesChecklistShortcut =
                e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey;
            if (
                !handlesCtrlA &&
                !handlesCtrlEnter &&
                !handlesChecklistShortcut &&
                e.key !== "Backspace"
            )
                return;

            const cursor = editor.getTextCursorPosition();
            const block = cursor?.block;

            // `[ ] ` and `[x] ` at the beginning of a paragraph become a
            // checklist item. Keep this explicit because browser/IME behavior
            // can prevent BlockNote's native input rule from firing reliably.
            if (handlesChecklistShortcut && block?.type === "paragraph") {
                const value = (block.content || [])
                    .map((item) => item.text || "")
                    .join("");
                const shortcut = parseChecklistShortcut(value);
                if (shortcut) {
                    e.preventDefault();
                    e.stopPropagation();
                    editor.updateBlock(block.id, {
                        type: "checkListItem",
                        props: { checked: shortcut.checked },
                        content: [],
                    });
                    requestAnimationFrame(() => {
                        try {
                            editor.setTextCursorPosition(block.id, "end");
                        } catch {}
                    });
                    return;
                }
            }

            // Ctrl+A inside a code block → select all text in that code block
            if (
                e.key === "a" &&
                (e.ctrlKey || e.metaKey) &&
                block?.type === "codeBlock"
            ) {
                const blockElement = wrapperRef.current?.querySelector(
                    `[data-id="${CSS.escape(block.id)}"] [data-content-type="codeBlock"]`,
                );
                const editable = blockElement?.querySelector(
                    '[contenteditable="true"]',
                );
                if (!editable) return;
                e.preventDefault();
                e.stopPropagation();
                const range = document.createRange();
                range.selectNodeContents(editable);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
                return;
            }

            // Ctrl+Enter inside a code block → exit to a new paragraph below
            if (
                e.key === "Enter" &&
                (e.ctrlKey || e.metaKey) &&
                block?.type === "codeBlock"
            ) {
                e.preventDefault();
                e.stopPropagation();
                editor.insertBlocks([{ type: "paragraph" }], block.id, "after");
                // Move cursor to the new block
                requestAnimationFrame(() => {
                    try {
                        const doc = editor.document;
                        const idx = doc.findIndex((b) => b.id === block.id);
                        if (idx >= 0 && idx + 1 < doc.length) {
                            editor.setTextCursorPosition(
                                doc[idx + 1].id,
                                "start",
                            );
                        }
                    } catch {}
                });
                return;
            }

            if (e.key === "Backspace") {
                if (!block) return; // let BlockNote / browser handle when no block context

                // Backspace on an empty NESTED list item → outdent one level (keep the
                // bullet) instead of letting it collapse to a plain line (#13).
                const LIST_TYPES = new Set([
                    "bulletListItem",
                    "numberedListItem",
                    "checkListItem",
                ]);
                if (LIST_TYPES.has(block.type) && isBlockEmpty(block)) {
                    try {
                        if (editor.canUnnestBlock?.()) {
                            e.preventDefault();
                            e.stopPropagation();
                            editor.unnestBlock();
                            return;
                        }
                    } catch {}
                    // Top-level empty list item → fall through to BlockNote's default.
                }

                // Convert empty heading to paragraph
                if (block.type === "heading" && isBlockEmpty(block)) {
                    e.preventDefault();
                    e.stopPropagation();
                    editor.updateBlock(block.id, {
                        type: "paragraph",
                        props: {},
                    });
                    return;
                }

                // Delete empty custom blocks (mermaid, equation, AI, tabs, code, etc.)
                if (
                    (customBlockTypes.has(block.type) ||
                        block.type === "codeBlock") &&
                    isBlockEmpty(block)
                ) {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        editor.removeBlocks([block.id]);
                    } catch {}
                    return;
                }

                // Empty paragraphs: explicitly delete the block and merge with the
                // previous one. Default browser contenteditable behavior on an empty
                // <p> inserts a <br> instead of removing the line, which surfaces as
                // "backspace creates a new line".
                if (block.type === "paragraph" && isBlockEmpty(block)) {
                    const doc = editor.document;
                    const idx = doc.findIndex((b) => b.id === block.id);
                    if (idx > 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        const prev = doc[idx - 1];
                        try {
                            editor.removeBlocks([block.id]);
                            if (prev?.id)
                                editor.setTextCursorPosition(prev.id, "end");
                        } catch {}
                        return;
                    }
                }

                // Otherwise: hand off to BlockNote's normal backspace logic. We
                // intentionally do NOT stopPropagation here — that was masking
                // BlockNote's join-with-previous behavior and producing stray <br>s.
            }
        }

        // Use capture phase to catch it before the browser navigation handler
        editorEl.addEventListener("keydown", handleKeyDown, { capture: true });
        return () =>
            editorEl.removeEventListener("keydown", handleKeyDown, {
                capture: true,
            });
    }, [editor]);

    // Handle clipboard paste — markdown auto-render + image upload
    useEffect(() => {
        const editorEl = wrapperRef.current?.querySelector(".bn-editor");
        if (!editorEl) return;

        function looksLikeMarkdown(text) {
            // Quick heuristic: contains markdown patterns
            return (
                /^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s|^\s*>\s|^\s*\[[ xX]\](?:\s|$)|```|^\|.+\|/m.test(
                    text,
                ) || /(?:^|\n)[ \t]*~{3,}|\*\*.+\*\*|\[.+\]\(.+\)|!\[/.test(text)
            );
        }

        function handlePaste(e) {
            const items = e.clipboardData?.items;
            if (!items) return;

            const textData = e.clipboardData.getData("text/plain");
            const htmlData = e.clipboardData.getData("text/html");
            const extractedClipboardMermaid = extractMermaidPaste(
                textData,
                htmlData,
            );
            const hasClipboardMermaid =
                extractedClipboardMermaid.diagrams.length > 0;
            const hasMarkdownFence =
                /(?:^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*[^\r\n]*\r?\n/.test(textData);

            // If pasting a bare URL, convert to a link inline
            if (
                textData &&
                /^https?:\/\/\S+$/.test(textData.trim()) &&
                !e.clipboardData.getData("text/html")
            ) {
                const url = textData.trim();
                e.preventDefault();
                const tiptap = editor._tiptapEditor;
                if (tiptap) {
                    const { state, view } = tiptap;
                    const { from, to } = state.selection;
                    const normalizedUrl = normalizeUrl(url);
                    if (!normalizedUrl) return;
                    const linkMark = state.schema.marks.link.create({
                        href: normalizedUrl,
                    });
                    const tr = state.tr
                        .insertText(url, from, to)
                        .addMark(from, from + url.length, linkMark);
                    view.dispatch(tr);
                }
                return;
            }

            // If pasting exactly a single markdown link, convert it to an inline link directly
            const mdLinkMatch = textData
                ? textData
                      .trim()
                      .match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
                : null;
            if (mdLinkMatch && !e.clipboardData.getData("text/html")) {
                const [, linkText, url] = mdLinkMatch;
                e.preventDefault();
                const tiptap = editor._tiptapEditor;
                if (tiptap) {
                    const { state, view } = tiptap;
                    const { from, to } = state.selection;
                    const normalizedUrl = normalizeUrl(url);
                    if (!normalizedUrl) return;
                    const linkMark = state.schema.marks.link.create({
                        href: normalizedUrl,
                    });
                    const tr = state.tr
                        .insertText(linkText, from, to)
                        .addMark(from, from + linkText.length, linkMark);
                    view.dispatch(tr);
                }
                return;
            }

            // Check for plain text with markdown
            if (
                textData &&
                (looksLikeMarkdown(textData) || hasClipboardMermaid)
            ) {
                // Fenced Markdown must go through the Markdown parser even
                // when a clipboard app also supplies HTML. Otherwise a code
                // sample can become paragraphs with escaped line breaks (\\).
                if (!htmlData || hasClipboardMermaid || hasMarkdownFence) {
                    e.preventDefault();
                    e.stopPropagation();

                    (async () => {
                        try {
                            // Pre-process: extract mermaid fenced blocks before BlockNote parses
                            // Use placeholder format without double underscores (markdown interprets __ as bold)
                            const extractedMermaid = hasClipboardMermaid
                                ? extractedClipboardMermaid
                                : extractMermaidFences(textData);
                            const mermaidBlocks = extractedMermaid.diagrams;
                            let processed = extractedMermaid.content;

                            // Pre-process: extract block LaTeX \[...\]
                            const blockLatex = [];
                            processed = processed.replace(
                                /\\\[([\s\S]*?)\\\]/g,
                                (_, latex) => {
                                    const placeholder = `LATEXBLOCKPLACEHOLDER${blockLatex.length}END`;
                                    blockLatex.push(latex.trim());
                                    return placeholder;
                                },
                            );

                            // Pre-process: extract inline LaTeX \(...\)
                            // Markdown parsers strip backslash escapes, so extract before parsing
                            const inlineLatex = [];
                            processed = processed.replace(
                                /\\\((.+?)\\\)/g,
                                (_, latex) => {
                                    const placeholder = `LATEXINLINEPLACEHOLDER${inlineLatex.length}END`;
                                    inlineLatex.push(latex.trim());
                                    return placeholder;
                                },
                            );

                            const singleMermaid = processed
                                .trim()
                                .match(/^MERMAIDPLACEHOLDER(\d+)END$/);
                            let blocks = singleMermaid
                                ? [
                                      {
                                          type: "mermaidBlock",
                                          props: {
                                              diagram:
                                                  mermaidBlocks[
                                                      Number(singleMermaid[1])
                                                  ] || "",
                                          },
                                          children: [],
                                      },
                                  ]
                                : await editor.tryParseMarkdownToBlocks(
                                      processed,
                                  );

                            // Post-process: replace placeholders with custom blocks
                            blocks = blocks.flatMap((block) => {
                                if (
                                    !block.content ||
                                    !Array.isArray(block.content)
                                ) {
                                    return [block];
                                }
                                const text = block.content
                                    .map((c) => c.text || "")
                                    .join("");

                                // Mermaid placeholder → mermaidBlock
                                const mermaidMatch = text.match(
                                    /^MERMAIDPLACEHOLDER(\d+)END$/,
                                );
                                if (mermaidMatch) {
                                    const idx = parseInt(mermaidMatch[1]);
                                    return [
                                        {
                                            type: "mermaidBlock",
                                            props: {
                                                diagram:
                                                    mermaidBlocks[idx] || "",
                                            },
                                            children: [],
                                        },
                                    ];
                                }

                                // Block LaTeX placeholder → blockEquation
                                const latexMatch = text.match(
                                    /^LATEXBLOCKPLACEHOLDER(\d+)END$/,
                                );
                                if (latexMatch) {
                                    const idx = parseInt(latexMatch[1]);
                                    return [
                                        {
                                            type: "blockEquation",
                                            props: {
                                                latex: blockLatex[idx] || "",
                                            },
                                            children: [],
                                        },
                                    ];
                                }

                                // Inline LaTeX placeholders → inlineEquation
                                if (/LATEXINLINEPLACEHOLDER\d+END/.test(text)) {
                                    const parts = [];
                                    const regex =
                                        /LATEXINLINEPLACEHOLDER(\d+)END/g;
                                    let lastIdx = 0;
                                    let m;
                                    while ((m = regex.exec(text)) !== null) {
                                        if (m.index > lastIdx) {
                                            parts.push({
                                                type: "text",
                                                text: text.slice(
                                                    lastIdx,
                                                    m.index,
                                                ),
                                            });
                                        }
                                        parts.push({
                                            type: "inlineEquation",
                                            props: {
                                                latex:
                                                    inlineLatex[
                                                        parseInt(m[1])
                                                    ] || "",
                                            },
                                        });
                                        lastIdx = m.index + m[0].length;
                                    }
                                    if (lastIdx < text.length) {
                                        parts.push({
                                            type: "text",
                                            text: text.slice(lastIdx),
                                        });
                                    }
                                    if (parts.length > 0) {
                                        return [{ ...block, content: parts }];
                                    }
                                }

                                return [block];
                            });

                            if (blocks?.length > 0) {
                                const cursor = editor.getTextCursorPosition();
                                if (cursor?.block) {
                                    editor.insertBlocks(
                                        blocks,
                                        cursor.block,
                                        "after",
                                    );
                                }
                            }
                        } catch (err) {
                            console.error("Markdown paste failed:", err);
                            editor.insertBlocks(
                                [
                                    {
                                        type: "paragraph",
                                        content: [
                                            { type: "text", text: textData },
                                        ],
                                    },
                                ],
                                editor.getTextCursorPosition()?.block,
                                "after",
                            );
                        }
                    })();
                    return;
                }
            }

            for (const item of items) {
                if (item.type.startsWith("image/")) {
                    e.preventDefault();
                    e.stopPropagation();

                    const file = item.getAsFile();
                    if (!file) return;

                    // Reject anything outside the static-image allowlist (animated
                    // GIF, HEIC, TIFF, etc.) before kicking off compression/upload.
                    if (!isAllowedImage(file)) {
                        console.warn("[Paste] Rejected image type:", file.type);
                        return;
                    }

                    const cursor = editor.getTextCursorPosition();
                    if (!cursor?.block) return;

                    // Insert image block with loading placeholder + empty paragraph below
                    const uploadJobId = createMediaUploadId();
                    editor.insertBlocks(
                        [
                            {
                                type: "image",
                                props: {
                                    url: "",
                                    caption: "",
                                    previewWidth: 740,
                                    _uploading: "uploading",
                                    _uploadJobId: uploadJobId,
                                },
                            },
                            { type: "paragraph", content: [] },
                        ],
                        cursor.block,
                        "after",
                    );

                    const doc = editor.document;
                    const cursorIdx = doc.findIndex(
                        (b) => b.id === cursor.block.id,
                    );
                    const newBlock = doc[cursorIdx + 1];
                    if (!newBlock) return;

                    // Move cursor to the paragraph below so user can keep typing
                    const paragraphBlock = doc[cursorIdx + 2];
                    if (paragraphBlock) {
                        requestAnimationFrame(() => {
                            try {
                                editor.setTextCursorPosition(
                                    paragraphBlock.id,
                                    "start",
                                );
                            } catch {}
                        });
                    }

                    // Compress and upload, then update with real URL
                    (async () => {
                        try {
                            const { compressBlogImage } = await import(
                                "../../utils/compressImage"
                            );
                            const { blob } = await compressBlogImage(file);

                            const data = await enqueueMediaUpload(blob, {
                                id: uploadJobId,
                                filename: `image_${uploadJobId}.webp`,
                                blogId,
                                type: "image",
                            });

                            editor.updateBlock(newBlock.id, {
                                type: "image",
                                props: {
                                    url: data.url,
                                    caption: "",
                                    previewWidth: 740,
                                    _uploading: "",
                                    _uploadJobId: "",
                                    _mediaId: data.id || "",
                                },
                            });
                        } catch (err) {
                            console.error(
                                "Clipboard image upload failed:",
                                err,
                            );
                            try {
                                editor.updateBlock(newBlock.id, {
                                    type: "image",
                                    props: { _uploading: "error" },
                                });
                            } catch {}
                        }
                    })();

                    return;
                }
            }
        }

        function handleEditorDrop(e) {
            if (e.target.closest('[data-content-type="image"]')) return;
            const file = e.dataTransfer?.files?.[0];
            if (!file?.type.startsWith("image/")) return;
            if (!isAllowedImage(file)) return;

            e.preventDefault();
            e.stopPropagation();

            const cursor = editor.getTextCursorPosition();
            if (!cursor?.block) return;

            const uploadJobId = createMediaUploadId();
            editor.insertBlocks(
                [
                    {
                        type: "image",
                        props: {
                            url: "",
                            caption: "",
                            previewWidth: 740,
                            _uploading: "uploading",
                            _uploadJobId: uploadJobId,
                        },
                    },
                    { type: "paragraph", content: [] },
                ],
                cursor.block,
                "after",
            );

            const dropDoc = editor.document;
            const dropIdx = dropDoc.findIndex((b) => b.id === cursor.block.id);
            const dropBlock = dropDoc[dropIdx + 1];
            if (!dropBlock) return;

            const dropParagraph = dropDoc[dropIdx + 2];
            if (dropParagraph) {
                requestAnimationFrame(() => {
                    try {
                        editor.setTextCursorPosition(dropParagraph.id, "start");
                    } catch {}
                });
            }

            (async () => {
                try {
                    const { compressBlogImage } = await import(
                        "../../utils/compressImage"
                    );
                    const { blob } = await compressBlogImage(file);

                    const data = await enqueueMediaUpload(blob, {
                        id: uploadJobId,
                        filename: `image_${uploadJobId}.webp`,
                        blogId,
                        type: "image",
                    });

                    editor.updateBlock(dropBlock.id, {
                        type: "image",
                        props: {
                            url: data.url,
                            caption: "",
                            previewWidth: 740,
                            _uploading: "",
                            _uploadJobId: "",
                            _mediaId: data.id || "",
                        },
                    });
                } catch (err) {
                    console.error("Dropped image upload failed:", err);
                    try {
                        editor.updateBlock(dropBlock.id, {
                            type: "image",
                            props: { _uploading: "error" },
                        });
                    } catch {}
                }
            })();
        }

        function handleEditorDragOver(e) {
            if (e.target.closest('[data-content-type="image"]')) return;
            if (e.dataTransfer?.types?.includes("Files")) {
                e.preventDefault();
            }
        }

        // Handle Markdown fences before ProseMirror converts them into a
        // generic code block (or stops the bubbling paste event).
        editorEl.addEventListener("paste", handlePaste, true);
        editorEl.addEventListener("drop", handleEditorDrop);
        editorEl.addEventListener("dragover", handleEditorDragOver);
        return () => {
            editorEl.removeEventListener("paste", handlePaste, true);
            editorEl.removeEventListener("drop", handleEditorDrop);
            editorEl.removeEventListener("dragover", handleEditorDragOver);
        };
    }, [editor, blogId]);

    // Hide BlockNote's formatting toolbar when a custom block (code, equation, mermaid, etc.) is focused
    const noToolbarTypes = useMemo(
        () =>
            new Set([
                "codeBlock",
                "blockEquation",
                "mermaidBlock",
                "image",
                "tabsBlock",
                "canvasBlock",
                "aiBlock",
                "pdfEmbed",
                "tableOfContents",
                "buttonBlock",
                "breadcrumbs",
            ]),
        [],
    );

    useEffect(() => {
        let rafId = null;
        function hideToolbarForCustomBlocks() {
            // Debounce via rAF — selectionchange fires very frequently during typing
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                try {
                    const cursor = editor.getTextCursorPosition();
                    const blockType = cursor?.block?.type;
                    const shouldHide =
                        blockType && noToolbarTypes.has(blockType);
                    document.querySelectorAll(".bn-toolbar").forEach((el) => {
                        const container = el.closest(
                            '[data-tippy-root], [style*="position"]',
                        );
                        const target = container || el;
                        if (shouldHide) {
                            target.style.display = "none";
                        } else {
                            target.style.removeProperty("display");
                        }
                    });
                } catch {}
            });
        }

        document.addEventListener(
            "selectionchange",
            hideToolbarForCustomBlocks,
        );
        return () => {
            document.removeEventListener(
                "selectionchange",
                hideToolbarForCustomBlocks,
            );
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [editor, noToolbarTypes]);

    // Cache block count without materializing editor.document on every change.
    const blockCountRef = useRef(0);
    const documentChangeTimerRef = useRef(null);

    const handleChange = useCallback(() => {
        // editor.document materializes the full BlockNote JSON tree. Coalesce
        // transactions so a long post does not allocate that tree per keystroke.
        clearTimeout(documentChangeTimerRef.current);
        const count =
            editor._tiptapEditor?.state?.doc?.childCount ??
            blockCountRef.current;
        documentChangeTimerRef.current = setTimeout(
            () => {
                if (onChange) onChange(editor.document);
            },
            count >= 60 ? 500 : 120,
        );

        blockCountRef.current = count;
    }, [onChange, editor]);

    useEffect(
        () => () => clearTimeout(documentChangeTimerRef.current),
        [],
    );

    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

    // Initialize once. Keeping the unstable callback prop out of this effect
    // prevents parent status renders from repeatedly materializing the document.
    useEffect(() => {
        let innerFrame = null;
        const outerFrame = requestAnimationFrame(() => {
            innerFrame = requestAnimationFrame(() => {
                blockCountRef.current = editor.document.length;
                onReadyRef.current?.();
            });
        });
        return () => {
            cancelAnimationFrame(outerFrame);
            if (innerFrame) cancelAnimationFrame(innerFrame);
        };
    }, [editor]);

    // AI sparkle star — inline element appended to last AI text block
    const sparkleRef = useRef(null);

    const moveSparkleToLastAiBlock = useCallback(() => {
        // Remove any existing sparkle from DOM
        const existing = wrapperRef.current?.querySelector(".ai-glob-cursor");
        if (existing) existing.remove();

        const ids = aiBlockIdsRef.current;
        if (!ids || ids.size === 0) return;

        // Find the last text block (skip image blocks)
        let lastTextId = null;
        for (const id of [...ids].reverse()) {
            const el = wrapperRef.current?.querySelector(`[data-id="${id}"]`);
            if (
                el &&
                !el.querySelector(
                    ".blog-img-empty, .blog-img-loaded, .blog-img-generating",
                )
            ) {
                lastTextId = id;
                break;
            }
        }
        if (!lastTextId) return;

        const blockEl = wrapperRef.current?.querySelector(
            `[data-id="${lastTextId}"]`,
        );
        if (!blockEl) return;

        const inlineEl =
            blockEl.querySelector(".bn-inline-content") ||
            blockEl.querySelector("p") ||
            blockEl;

        // Create and append sparkle inline at the end of the text
        const star = document.createElement("span");
        star.className = "ai-glob-cursor";
        inlineEl.appendChild(star);
        sparkleRef.current = star;
    }, []);

    const hideSparkle = useCallback(() => {
        const existing = wrapperRef.current?.querySelector(".ai-glob-cursor");
        if (existing) existing.remove();
        sparkleRef.current = null;
    }, []);

    const getItems = useMemo(
        () => async (query) =>
            filterItems(
                getCustomSlashMenuItems(editor, {
                    onInlineLatex: () => {
                        setInlineLatexValue("");
                        setShowInlineLatex(true);
                    },
                    blogId,
                    secret,
                }),
                query,
            ),
        [editor, blogId, secret],
    );

    // Space trigger for AI menu on empty blocks
    useEffect(() => {
        if (!AI_ENABLED) return; // AI is disabled — space types normally
        function handleKeyDown(e) {
            if (e.key === " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (isCurrentBlockEmpty(editor)) {
                    e.preventDefault();

                    const wrapperRect =
                        wrapperRef.current?.getBoundingClientRect();
                    if (!wrapperRect) return;

                    const cursor = editor.getTextCursorPosition();
                    if (!cursor?.block?.id) return;

                    const anchorBlockId = cursor.block.id;
                    const blockEl = wrapperRef.current?.querySelector(
                        `[data-id="${anchorBlockId}"]`,
                    );
                    if (!blockEl) return;

                    // Insert a new empty paragraph below so the placeholder text moves there
                    editor.insertBlocks(
                        [{ type: "paragraph", content: [] }],
                        anchorBlockId,
                        "after",
                    );

                    // Position the AI input at the block BEFORE hiding it
                    const blockRect = blockEl.getBoundingClientRect();
                    const top = blockRect.top - wrapperRect.top;

                    setAiMenuPos({ top, left: 0, anchorBlockId });
                    setShowAIMenu(true);

                    // Hide the empty line after capturing position — use rAF so React renders the menu first
                    requestAnimationFrame(() => {
                        blockEl.style.visibility = "hidden";
                        blockEl.style.height = "0";
                        blockEl.style.overflow = "hidden";
                        blockEl.style.margin = "0";
                        blockEl.style.padding = "0";
                        // Hide placeholder on the newly inserted paragraph below
                        const doc = editor.document;
                        const idx = doc.findIndex(
                            (b) => b.id === anchorBlockId,
                        );
                        if (idx !== -1 && idx + 1 < doc.length) {
                            const nextId = doc[idx + 1].id;
                            const nextEl = wrapperRef.current?.querySelector(
                                `[data-id="${nextId}"]`,
                            );
                            if (nextEl)
                                nextEl.classList.add("ai-hide-placeholder");
                        }
                    });
                }
            }
        }

        const editorEl = wrapperRef.current?.querySelector(".bn-editor");
        if (editorEl) {
            editorEl.addEventListener("keydown", handleKeyDown);
            return () => editorEl.removeEventListener("keydown", handleKeyDown);
        }
    }, [editor]);

    // @ mention trigger
    useEffect(() => {
        const editorEl = wrapperRef.current?.querySelector(".bn-editor");
        if (!editorEl) return;

        function checkMention() {
            try {
                const cursor = editor.getTextCursorPosition();
                if (!cursor?.block) {
                    setShowMentionMenu(false);
                    return;
                }
                const block = cursor.block;
                if (!block.content || !Array.isArray(block.content)) {
                    setShowMentionMenu(false);
                    return;
                }

                // Use DOM selection to find @ at the actual cursor position
                // This works regardless of which text node the cursor is in
                const domSel = window.getSelection();
                if (!domSel || domSel.rangeCount === 0 || !domSel.anchorNode) {
                    setShowMentionMenu(false);
                    return;
                }

                const anchorNode = domSel.anchorNode;
                if (anchorNode.nodeType !== Node.TEXT_NODE) {
                    setShowMentionMenu(false);
                    return;
                }

                const textUpToCursor = anchorNode.textContent.slice(
                    0,
                    domSel.anchorOffset,
                );
                const atIdx = textUpToCursor.lastIndexOf("@");
                if (atIdx === -1) {
                    setShowMentionMenu(false);
                    mentionDismissedRef.current = null;
                    return;
                }

                const afterAt = textUpToCursor.slice(atIdx + 1);
                if (afterAt.includes(" ") || afterAt.length > 30) {
                    setShowMentionMenu(false);
                    return;
                }

                // The user pressed ESC on this @token — keep it closed until they move to
                // a different @ (so typing more text doesn't pop the menu back open).
                if (mentionDismissedRef.current === atIdx) {
                    setShowMentionMenu(false);
                    return;
                }
                mentionDismissedRef.current = null;

                const range = domSel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const wrapperRect = wrapperRef.current?.getBoundingClientRect();
                if (wrapperRect && rect.height > 0) {
                    setMentionPos({
                        top: rect.bottom - wrapperRect.top + 6,
                        left: rect.left - wrapperRect.left,
                    });
                }

                setMentionQuery(afterAt);
                setShowMentionMenu(true);
                mentionStartRef.current = atIdx;
            } catch {
                setShowMentionMenu(false);
            }
        }

        editorEl.addEventListener("input", checkMention);
        return () => {
            editorEl.removeEventListener("input", checkMention);
        };
    }, [editor]);

    // Close mention menu and remove the @query text when a mention is inserted
    const handleMentionClose = useCallback(() => {
        setShowMentionMenu(false);
        setMentionQuery("");
        mentionStartRef.current = null;
        mentionDismissedRef.current = null;
    }, []);

    // ESC: dismiss the menu but keep the typed @text, and remember this @-position
    // so it doesn't pop back open as the user keeps typing.
    const handleMentionDismiss = useCallback(() => {
        mentionDismissedRef.current = mentionStartRef.current;
        setShowMentionMenu(false);
        setMentionQuery("");
    }, []);

    const handleAIStop = useCallback(() => {
        if (aiAbortRef.current) {
            aiAbortRef.current.abort();
            aiAbortRef.current = null;
        }
        if (aiStatusTimerRef.current) {
            clearInterval(aiStatusTimerRef.current);
            aiStatusTimerRef.current = null;
        }
        setAiStatusInline(false);
        setAiGenerating(false);
        setAiPhase("idle");
        setAiGeneratingBlockId(null);
        hideSparkle();
        wrapperRef.current?.classList.remove("ai-editor-locked");
        wrapperRef.current
            ?.querySelectorAll(
                ".ai-skeleton-nearby, .ai-placeholder-skeleton, .ai-edit-selected-block, .ai-hide-placeholder, .ai-writing-active",
            )
            .forEach((el) => {
                el.classList.remove(
                    "ai-skeleton-nearby",
                    "ai-placeholder-skeleton",
                    "ai-edit-selected-block",
                    "ai-hide-placeholder",
                    "ai-writing-active",
                );
            });

        // Ensure AI blocks have color props and show keep/discard
        const ids = aiBlockIdsRef.current;
        const _noColorTypes = new Set([
            "image",
            "divider",
            "mermaidBlock",
            "blockEquation",
        ]);
        if (ids && ids.size > 0) {
            for (const id of ids) {
                try {
                    const block = editor.document.find((b) => b.id === id);
                    if (block && !_noColorTypes.has(block.type)) {
                        editor.updateBlock(id, {
                            props: {
                                textColor: "purple",
                                backgroundColor: "purple",
                            },
                        });
                    }
                } catch {}
            }
            setShowAIActions(true);
            // Apply highlight via DOM directly (can't use highlightAiBlocks — defined later)
            const cls = "ai-generated-highlight";
            for (const id of ids) {
                const el = wrapperRef.current?.querySelector(
                    `[data-id="${id}"]`,
                );
                if (el) {
                    el.classList.remove("ai-writing-active");
                    el.classList.add(cls);
                }
            }
            requestAnimationFrame(() => {
                const firstId = [...ids][0];
                const el = wrapperRef.current?.querySelector(
                    `[data-id="${firstId}"]`,
                );
                if (el)
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }
    }, [editor, hideSparkle]);

    // Re-apply ai-generated-highlight after BlockNote re-renders (which destroys DOM classes)
    useEffect(() => {
        if (aiBlockIds.size === 0) return;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        let applyPending = false;
        const applyHighlights = () => {
            if (applyPending) return;
            applyPending = true;
            requestAnimationFrame(() => {
                applyPending = false;
                // During generation use blue (ai-writing-active), after done use green (ai-generated-highlight)
                const cls = aiGenerating
                    ? "ai-writing-active"
                    : "ai-generated-highlight";
                for (const id of aiBlockIds) {
                    const el = wrapper.querySelector(`[data-id="${id}"]`);
                    if (el && !el.classList.contains(cls)) {
                        el.classList.remove(
                            "ai-writing-active",
                            "ai-generated-highlight",
                        );
                        el.classList.add(cls);
                    }
                }
            });
        };

        applyHighlights();
        const observer = new MutationObserver(applyHighlights);
        observer.observe(wrapper, {
            childList: true,
            subtree: true,
            attributes: false,
        });
        return () => observer.disconnect();
    }, [aiBlockIds]);

    // Highlight AI blocks in the DOM with lavender class + position sparkle
    const highlightAiBlocks = useCallback(
        (ids, showCursor = true, writing = false) => {
            // Remove old highlights
            wrapperRef.current
                ?.querySelectorAll(
                    ".ai-generated-highlight, .ai-writing-active",
                )
                .forEach((el) => {
                    el.classList.remove(
                        "ai-generated-highlight",
                        "ai-writing-active",
                    );
                });
            // Add highlight: blue while writing, green when done
            const cls = writing
                ? "ai-writing-active"
                : "ai-generated-highlight";
            for (const id of ids) {
                const el = wrapperRef.current?.querySelector(
                    `[data-id="${id}"]`,
                );
                if (el) el.classList.add(cls);
            }
            if (showCursor) {
                moveSparkleToLastAiBlock();
            } else {
                hideSparkle();
            }
        },
        [moveSparkleToLastAiBlock, hideSparkle],
    );

    // Get current AI block IDs by position relative to anchor
    const getAiBlockIds = useCallback(() => {
        const anchorId = aiAnchorIdRef.current;
        const count = aiBlockCountRef.current;
        if (!anchorId || count === 0) return [];
        const doc = editor.document;
        const idx = doc.findIndex((b) => b.id === anchorId);
        if (idx === -1) return [];
        return doc.slice(idx + 1, idx + 1 + count).map((b) => b.id);
    }, [editor]);

    const handleAIKeep = useCallback(() => {
        hideSparkle();
        wrapperRef.current?.classList.remove("ai-editor-locked");
        // Reset textColor and backgroundColor to default on all AI blocks
        const _noReset = new Set([
            "image",
            "divider",
            "mermaidBlock",
            "blockEquation",
        ]);
        for (const id of aiBlockIdsRef.current) {
            try {
                const block = editor.document.find((b) => b.id === id);
                if (block && !_noReset.has(block.type)) {
                    editor.updateBlock(id, {
                        props: {
                            textColor: "default",
                            backgroundColor: "default",
                        },
                    });
                }
            } catch {}
        }
        wrapperRef.current
            ?.querySelectorAll(".ai-generated-highlight, .ai-writing-active")
            .forEach((el) => {
                el.classList.remove(
                    "ai-generated-highlight",
                    "ai-writing-active",
                );
            });
        setAiBlockIds(new Set());
        aiBlockIdsRef.current = new Set();
        aiBlockCountRef.current = 0;
        aiAnchorIdRef.current = null;
        setShowAIActions(false);
    }, [editor, hideSparkle]);

    const handleAIDiscard = useCallback(() => {
        hideSparkle();
        wrapperRef.current?.classList.remove("ai-editor-locked");
        const storedIds = [...aiBlockIdsRef.current];
        if (storedIds.length > 0) {
            try {
                editor.removeBlocks(storedIds);
            } catch {
                try {
                    const fb = getAiBlockIds();
                    if (fb.length > 0) editor.removeBlocks(fb);
                } catch {}
            }
        }
        wrapperRef.current
            ?.querySelectorAll(".ai-generated-highlight, .ai-writing-active")
            .forEach((el) => {
                el.classList.remove(
                    "ai-generated-highlight",
                    "ai-writing-active",
                );
            });
        setAiBlockIds(new Set());
        aiBlockIdsRef.current = new Set();
        aiBlockCountRef.current = 0;
        aiAnchorIdRef.current = null;
        setShowAIActions(false);
    }, [editor, getAiBlockIds, hideSparkle]);

    // Click on AI content to show keep/discard
    useEffect(() => {
        if (aiBlockIds.size === 0) return;

        function handleClick(e) {
            const blockEl = e.target.closest?.(".ai-generated-highlight");
            if (blockEl) {
                const rect = blockEl.getBoundingClientRect();
                const wrapperRect = wrapperRef.current?.getBoundingClientRect();
                if (wrapperRect) {
                    setAiActionsPos({
                        top: rect.top - wrapperRect.top - 36,
                        left: rect.left - wrapperRect.left + rect.width / 2,
                    });
                }
                setShowAIActions(true);
            }
            // Don't close on click elsewhere — user must explicitly Keep or Undo
        }

        const wrapper = wrapperRef.current;
        wrapper?.addEventListener("click", handleClick);
        return () => wrapper?.removeEventListener("click", handleClick);
    }, [aiBlockIds]);

    // Helper: extract full blog text from editor document
    const getFullBlogContext = useCallback(() => {
        try {
            const doc = editor.document;
            return doc
                .map((b) => {
                    const text = (b.content || [])
                        .map((c) => c.text || "")
                        .join("");
                    if (b.type === "heading")
                        return `${"#".repeat(b.props?.level || 1)} ${text}`;
                    if (b.type === "bulletListItem") return `- ${text}`;
                    if (b.type === "numberedListItem") return `1. ${text}`;
                    if (b.type === "codeBlock")
                        return `\`\`\`\n${text}\n\`\`\``;
                    return text;
                })
                .filter(Boolean)
                .join("\n");
        } catch {
            return "";
        }
    }, [editor]);

    // Replace an image placeholder with the real Cloudinary URL
    const replaceImagePlaceholder = useCallback(
        (imageId, url, alt) => {
            try {
                const doc = editor.document;
                for (const block of doc) {
                    if (
                        block.type === "image" &&
                        block.props?._imageId === imageId
                    ) {
                        editor.updateBlock(block.id, {
                            type: "image",
                            props: {
                                url,
                                caption: alt || block.props.caption || "",
                                previewWidth: 740,
                                _imageId: imageId,
                            },
                        });
                        // Remove skeleton class and add fade-in animation
                        requestAnimationFrame(() => {
                            const el = wrapperRef.current?.querySelector(
                                `[data-id="${block.id}"]`,
                            );
                            if (el) {
                                el.classList.remove("ai-image-skeleton");
                                el.classList.add("ai-image-loaded");
                            }
                        });
                        break;
                    }
                }
                // Also look for the IMG_LOADING: text in paragraph blocks (fallback)
                for (const block of doc) {
                    if (block.type === "paragraph") {
                        const text = (block.content || [])
                            .map((c) => c.text || "")
                            .join("");
                        if (text.includes(`IMG_LOADING:${imageId}`)) {
                            editor.updateBlock(block.id, {
                                type: "image",
                                props: {
                                    url,
                                    caption: alt || "",
                                    previewWidth: 740,
                                },
                            });
                            requestAnimationFrame(() => {
                                const el = wrapperRef.current?.querySelector(
                                    `[data-id="${block.id}"]`,
                                );
                                if (el) {
                                    el.classList.remove("ai-image-skeleton");
                                    el.classList.add("ai-image-loaded");
                                }
                            });
                            break;
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to replace image placeholder:", e);
            }
        },
        [editor],
    );

    const handleAISubmit = useCallback(
        async (userPrompt) => {
            const menuPos = aiMenuPos; // capture before closing
            setShowAIMenu(false);

            // Restore the host block visibility and clean up placeholder hiding
            if (menuPos.anchorBlockId) {
                const hostEl = wrapperRef.current?.querySelector(
                    `[data-id="${menuPos.anchorBlockId}"]`,
                );
                if (hostEl) {
                    hostEl.style.visibility = "";
                    hostEl.style.height = "";
                    hostEl.style.overflow = "";
                    hostEl.style.margin = "";
                    hostEl.style.padding = "";
                }
                try {
                    const doc = editor.document;
                    const idx = doc.findIndex(
                        (b) => b.id === menuPos.anchorBlockId,
                    );
                    if (idx !== -1 && idx + 1 < doc.length) {
                        const nextEl = wrapperRef.current?.querySelector(
                            `[data-id="${doc[idx + 1].id}"]`,
                        );
                        if (nextEl)
                            nextEl.classList.remove("ai-hide-placeholder");
                    }
                } catch {}
            }

            // Auto-keep previous AI content if any exists
            if (aiBlockIdsRef.current.size > 0) {
                handleAIKeep();
            }

            setShowAIActions(false);

            const cursor = editor.getTextCursorPosition();
            if (!cursor?.block) return;

            const fullBlogText = getFullBlogContext();
            const cursorBlock = cursor.block;
            const blockText = (cursorBlock.content || [])
                .map((c) => c.text || "")
                .join("");
            const isEditMode = blockText.trim().length > 0;

            const anchorBlockId = cursorBlock.id;
            aiAnchorIdRef.current = anchorBlockId;

            // The space handler already inserted an empty paragraph after the anchor block.
            // Find and reuse it as the placeholder instead of inserting another one.
            const doc = editor.document;
            const anchorIdx = doc.findIndex(
                (b) => b.id === menuPos.anchorBlockId || b.id === anchorBlockId,
            );
            let insertedBlock = null;

            if (anchorIdx !== -1 && anchorIdx + 1 < doc.length) {
                const nextBlock = doc[anchorIdx + 1];
                const nextText = (nextBlock.content || [])
                    .map((c) => c.text || "")
                    .join("");
                if (nextBlock.type === "paragraph" && nextText.trim() === "") {
                    insertedBlock = nextBlock;
                }
            }

            // Fallback: insert a new placeholder if we couldn't find the space handler's block
            if (!insertedBlock) {
                editor.insertBlocks(
                    [{ type: "paragraph", content: [] }],
                    cursor.block,
                    "after",
                );
                const freshDoc = editor.document;
                const cursorIdx = freshDoc.findIndex(
                    (b) => b.id === anchorBlockId,
                );
                insertedBlock = freshDoc[cursorIdx + 1];
            }

            if (!insertedBlock) return;

            aiBlockCountRef.current = 1;
            let currentIds = [insertedBlock.id];
            aiBlockIdsRef.current = new Set(currentIds);

            setAiGenerating(true);
            setAiPhase("thinking");
            setAiGeneratingBlockId(insertedBlock.id);
            wrapperRef.current?.classList.add("ai-editor-locked");
            const abortController = new AbortController();
            aiAbortRef.current = abortController;

            // Skeleton on anchor line
            const anchorEl = menuPos.anchorBlockId
                ? wrapperRef.current?.querySelector(
                      `[data-id="${menuPos.anchorBlockId}"]`,
                  )
                : wrapperRef.current?.querySelector(
                      `[data-id="${anchorBlockId}"]`,
                  );
            if (anchorEl) {
                anchorEl.classList.add(
                    "ai-edit-selected-block",
                    "ai-hide-placeholder",
                );
            }

            // Position inline status bar below anchor (offset past the thin shimmer bar)
            const wrapperRect = wrapperRef.current?.getBoundingClientRect();
            const anchorBottom =
                anchorEl && wrapperRect
                    ? anchorEl.getBoundingClientRect().bottom - wrapperRect.top
                    : menuPos.top + 36;
            setAiStatusInline(true);
            setAiInlinePos({ top: anchorBottom + 16 });
            setAiStatusText("is thinking");

            // Skeleton on placeholder block
            requestAnimationFrame(() => {
                const placeholderEl = wrapperRef.current?.querySelector(
                    `[data-id="${insertedBlock.id}"]`,
                );
                if (placeholderEl) {
                    placeholderEl.classList.add("ai-placeholder-skeleton");
                    let sibling = placeholderEl.nextElementSibling;
                    let count = 0;
                    while (sibling && count < 3) {
                        sibling.classList.add("ai-skeleton-nearby");
                        sibling = sibling.nextElementSibling;
                        count++;
                    }
                }
            });

            // --- Helpers ---
            function cleanupSkeletons() {
                if (aiStatusTimerRef.current) {
                    clearInterval(aiStatusTimerRef.current);
                    aiStatusTimerRef.current = null;
                }
                setAiStatusInline(false);
                wrapperRef.current
                    ?.querySelectorAll(
                        ".ai-placeholder-skeleton, .ai-skeleton-nearby, .ai-edit-selected-block, .ai-hide-placeholder, .ai-typing-skeleton, .ai-writing-active",
                    )
                    .forEach((el) => {
                        el.classList.remove(
                            "ai-placeholder-skeleton",
                            "ai-skeleton-nearby",
                            "ai-edit-selected-block",
                            "ai-hide-placeholder",
                            "ai-typing-skeleton",
                            "ai-writing-active",
                        );
                    });
            }

            function handleAIError(err) {
                cleanupSkeletons();
                setAiGenerating(false);
                setAiPhase("idle");
                setAiGeneratingBlockId(null);
                aiAbortRef.current = null;
                hideSparkle();
                try {
                    const ids = getAiBlockIds();
                    if (ids.length > 0) editor.removeBlocks(ids);
                } catch {}
                setAiBlockIds(new Set());
                aiBlockIdsRef.current = new Set();
                setShowAIActions(false);
                if (err.name !== "AbortError") {
                    console.error("AI generation error:", err);
                    setAiErrorToast("AI generation failed");
                }
            }

            try {
                const { streamAI, getOrCreateSession, reuploadImage } =
                    await import("../../ai/agent");
                const { AGENT_SYSTEM_PROMPT, EDIT_SYSTEM_PROMPT } =
                    await import("../../ai/prompts");
                const { parseMarkdownToBlocks } = await import(
                    "./markdownToBlocks"
                );

                // Get or create lixsearch session for this blog
                const sessionId = await getOrCreateSession(blogId);

                // Build user prompt with context
                let finalPrompt;
                if (isEditMode) {
                    const docBlocks = editor.document;
                    const blockIdx = docBlocks.findIndex(
                        (b) => b.id === cursorBlock.id,
                    );
                    const before = docBlocks.slice(
                        Math.max(0, blockIdx - 5),
                        blockIdx,
                    );
                    const after = docBlocks.slice(blockIdx + 1, blockIdx + 6);
                    const contextBefore = before
                        .map((b) =>
                            (b.content || []).map((c) => c.text || "").join(""),
                        )
                        .filter(Boolean)
                        .join("\n");
                    const contextAfter = after
                        .map((b) =>
                            (b.content || []).map((c) => c.text || "").join(""),
                        )
                        .filter(Boolean)
                        .join("\n");
                    finalPrompt = `## Full blog content (for context):\n${fullBlogText}\n\n---\n\nNearby context:\nBefore:\n${contextBefore}\n\nCurrent block:\n${blockText}\n\nAfter:\n${contextAfter}\n\n---\n\nInstruction: ${userPrompt}`;
                } else {
                    finalPrompt = fullBlogText
                        ? `## Full blog content so far (for context):\n${fullBlogText}\n\n---\n\nContinue/add the following: ${userPrompt}`
                        : userPrompt;
                }

                let firstChunkReceived = false;
                let imagePlaceholderInserted = false;

                // Stream AI response — markdown text arrives in real-time
                await streamAI({
                    sessionId,
                    systemPrompt: isEditMode
                        ? EDIT_SYSTEM_PROMPT
                        : AGENT_SYSTEM_PROMPT,
                    userPrompt: finalPrompt,
                    signal: abortController.signal,

                    onTask: (taskText, phase) => {
                        // Show lixsearch TASK status directly in the status bar
                        if (phase === "done") return;

                        // Set phase for the bottom bar icon/label
                        if (phase === "generating_image")
                            setAiPhase("generating_image");
                        else if (phase === "image_ready")
                            setAiPhase("uploading");
                        else
                            setAiPhase(
                                firstChunkReceived ? "writing" : "thinking",
                            );

                        // Display the raw task text from lixsearch as status
                        setAiStatusText(taskText);

                        // Insert image placeholder skeleton when image generation starts
                        const t = taskText.toLowerCase();
                        if (
                            (t.includes("generating image") ||
                                t.includes("creating your image") ||
                                t.includes("image generation")) &&
                            !imagePlaceholderInserted
                        ) {
                            imagePlaceholderInserted = true;
                            const afterId = currentIds[currentIds.length - 1];
                            try {
                                editor.insertBlocks(
                                    [
                                        {
                                            type: "image",
                                            props: {
                                                _imageId: "ai_stream_img",
                                                caption: "",
                                            },
                                        },
                                    ],
                                    afterId,
                                    "after",
                                );
                                const updDoc = editor.document;
                                const aftIdx = updDoc.findIndex(
                                    (b) => b.id === afterId,
                                );
                                const imgBlock = updDoc[aftIdx + 1];
                                if (imgBlock) {
                                    currentIds.push(imgBlock.id);
                                    aiBlockIdsRef.current = new Set(currentIds);
                                    aiBlockCountRef.current = currentIds.length;
                                    requestAnimationFrame(() => {
                                        const el =
                                            wrapperRef.current?.querySelector(
                                                `[data-id="${imgBlock.id}"]`,
                                            );
                                        if (el)
                                            el.classList.add(
                                                "ai-image-skeleton",
                                            );
                                    });
                                }
                            } catch {}
                        }
                    },

                    onChunk: (_chunk, fullText) => {
                        if (!firstChunkReceived) {
                            firstChunkReceived = true;
                            cleanupSkeletons();
                            setAiPhase("writing");
                        }

                        // Handle TITLE: prefix
                        let contentText = fullText;
                        if (contentText.trim().startsWith("TITLE:")) {
                            const lines = contentText.trim().split("\n");
                            const titleLine = lines.shift();
                            const newTitle = titleLine
                                .replace(/^TITLE:\s*/, "")
                                .trim();
                            if (onTitleChange && newTitle)
                                onTitleChange(newTitle);
                            contentText = lines.join("\n").trim();
                            if (!contentText) return;
                        }

                        // Parse markdown to blocks and update in real-time
                        const newBlocks = parseMarkdownToBlocks(contentText);
                        if (newBlocks.length === 0) return;

                        try {
                            // Get current AI block IDs from the document
                            const anchorId = aiAnchorIdRef.current;
                            const docNow = editor.document;
                            const anchorIdxNow = docNow.findIndex(
                                (b) => b.id === anchorId,
                            );
                            if (anchorIdxNow === -1) return;

                            // Separate blocks: inline-content blocks go through replaceBlocks,
                            // content-none blocks (image, mermaid, divider, blockEquation) are inserted after
                            const specialTypes = new Set([
                                "image",
                                "mermaidBlock",
                                "divider",
                                "blockEquation",
                            ]);
                            const inlineBlocks = newBlocks.filter(
                                (b) => !specialTypes.has(b.type),
                            );
                            const specialBlocks = newBlocks
                                .map((b, idx) => ({ block: b, origIdx: idx }))
                                .filter(
                                    ({ block }) =>
                                        specialTypes.has(block.type) &&
                                        block.type !== "image",
                                );

                            // Get existing AI inline block IDs (exclude special blocks)
                            const existingInlineIds = currentIds.filter(
                                (id) => {
                                    const block = docNow.find(
                                        (b) => b.id === id,
                                    );
                                    return (
                                        block && !specialTypes.has(block.type)
                                    );
                                },
                            );

                            // Keep track of special block IDs already in the document
                            const existingSpecialIds = currentIds.filter(
                                (id) => {
                                    const block = docNow.find(
                                        (b) => b.id === id,
                                    );
                                    return (
                                        block &&
                                        specialTypes.has(block.type) &&
                                        block.type !== "image"
                                    );
                                },
                            );

                            // Remove old special blocks (they'll be re-inserted in correct positions)
                            if (existingSpecialIds.length > 0) {
                                try {
                                    editor.removeBlocks(existingSpecialIds);
                                } catch {}
                            }

                            // Replace inline blocks
                            if (
                                existingInlineIds.length > 0 &&
                                inlineBlocks.length > 0
                            ) {
                                editor.replaceBlocks(
                                    existingInlineIds,
                                    inlineBlocks,
                                );
                            }

                            // Refresh doc and collect new inline IDs
                            const refreshedDoc = editor.document;
                            const newAnchorIdx = refreshedDoc.findIndex(
                                (b) => b.id === anchorId,
                            );
                            const imageIds = currentIds.filter((id) => {
                                const block = docNow.find((b) => b.id === id);
                                return block && block.type === "image";
                            });
                            const newInlineIds = refreshedDoc
                                .slice(
                                    newAnchorIdx + 1,
                                    newAnchorIdx + 1 + inlineBlocks.length,
                                )
                                .map((b) => b.id);

                            // Insert special blocks (mermaid, divider) at their correct positions
                            // They go after the inline block that precedes them in the original order
                            const insertedSpecialIds = [];
                            for (const {
                                block: specBlock,
                                origIdx,
                            } of specialBlocks) {
                                // Find how many inline blocks come before this special block
                                const inlineBefore = newBlocks
                                    .slice(0, origIdx)
                                    .filter(
                                        (b) => !specialTypes.has(b.type),
                                    ).length;
                                const afterId =
                                    inlineBefore > 0 &&
                                    inlineBefore <= newInlineIds.length
                                        ? newInlineIds[inlineBefore - 1]
                                        : newInlineIds.length > 0
                                          ? newInlineIds[
                                                newInlineIds.length - 1
                                            ]
                                          : anchorId;
                                try {
                                    editor.insertBlocks(
                                        [specBlock],
                                        afterId,
                                        "after",
                                    );
                                    const updDoc = editor.document;
                                    const afterIdx = updDoc.findIndex(
                                        (b) => b.id === afterId,
                                    );
                                    const inserted = updDoc[afterIdx + 1];
                                    if (inserted) {
                                        insertedSpecialIds.push(inserted.id);
                                        // Update newInlineIds to account for insertion shifting
                                        newInlineIds.splice(
                                            inlineBefore,
                                            0,
                                            inserted.id,
                                        );
                                    }
                                } catch {}
                            }

                            currentIds = [...newInlineIds, ...imageIds];
                            aiBlockIdsRef.current = new Set(currentIds);
                            aiBlockCountRef.current = currentIds.length;

                            // Set BlockNote textColor + backgroundColor on AI blocks (survives re-renders)
                            const noColorProps = new Set([
                                "image",
                                "divider",
                                "mermaidBlock",
                                "blockEquation",
                            ]);
                            for (const id of currentIds) {
                                try {
                                    const block = editor.document.find(
                                        (b) => b.id === id,
                                    );
                                    if (
                                        block &&
                                        !noColorProps.has(block.type)
                                    ) {
                                        editor.updateBlock(id, {
                                            props: {
                                                textColor: "purple",
                                                backgroundColor: "purple",
                                            },
                                        });
                                    }
                                } catch {}
                            }

                            // Highlight while streaming and scroll
                            highlightAiBlocks(currentIds, true, true);
                            requestAnimationFrame(() => {
                                const lastId =
                                    currentIds[currentIds.length - 1];
                                const lastEl =
                                    wrapperRef.current?.querySelector(
                                        `[data-id="${lastId}"]`,
                                    );
                                if (lastEl) {
                                    const rect = lastEl.getBoundingClientRect();
                                    if (
                                        rect.bottom >
                                        window.innerHeight * 0.85
                                    ) {
                                        window.scrollTo({
                                            top:
                                                window.scrollY +
                                                rect.top -
                                                window.innerHeight * 0.5,
                                            behavior: "smooth",
                                        });
                                    }
                                }
                            });
                        } catch {
                            /* block may have been removed */
                        }
                    },

                    onImage: ({ alt, url }) => {
                        // Image URL arrived in the stream — show immediately, then re-upload to Cloudinary
                        let targetBlockId = null;

                        if (imagePlaceholderInserted) {
                            replaceImagePlaceholder("ai_stream_img", url, alt);
                            imagePlaceholderInserted = false;
                            // Find the placeholder block ID for later update
                            const doc = editor.document;
                            for (const b of doc) {
                                if (
                                    b.type === "image" &&
                                    b.props?._imageId === "ai_stream_img"
                                ) {
                                    targetBlockId = b.id;
                                    break;
                                }
                            }
                        } else {
                            const afterId = currentIds[currentIds.length - 1];
                            try {
                                editor.insertBlocks(
                                    [
                                        {
                                            type: "image",
                                            props: {
                                                url,
                                                caption: alt || "",
                                                previewWidth: 740,
                                            },
                                        },
                                    ],
                                    afterId,
                                    "after",
                                );
                                const updDoc = editor.document;
                                const aftIdx = updDoc.findIndex(
                                    (b) => b.id === afterId,
                                );
                                const imgBlock = updDoc[aftIdx + 1];
                                if (imgBlock) {
                                    targetBlockId = imgBlock.id;
                                    currentIds.push(imgBlock.id);
                                    aiBlockIdsRef.current = new Set(currentIds);
                                    aiBlockCountRef.current = currentIds.length;
                                    requestAnimationFrame(() => {
                                        const el =
                                            wrapperRef.current?.querySelector(
                                                `[data-id="${imgBlock.id}"]`,
                                            );
                                        if (el)
                                            el.classList.add("ai-image-loaded");
                                    });
                                }
                            } catch {}
                        }

                        // Re-upload to Cloudinary in background (lixsearch URLs are temporary)
                        const blockIdToUpdate = targetBlockId;
                        reuploadImage(url, alt).then((uploaded) => {
                            if (!uploaded) return;
                            // Find the image block and replace URL with permanent Cloudinary URL
                            try {
                                const doc = editor.document;
                                const block = blockIdToUpdate
                                    ? doc.find((b) => b.id === blockIdToUpdate)
                                    : doc.find(
                                          (b) =>
                                              b.type === "image" &&
                                              b.props?.url === url,
                                      );
                                if (block) {
                                    editor.updateBlock(block.id, {
                                        props: {
                                            url: uploaded.url,
                                            _mediaId: uploaded.id,
                                        },
                                    });
                                }
                            } catch {}
                        });
                    },

                    onDone: (fullText) => {
                        // Final parse to ensure all content is captured
                        let contentText = fullText;
                        if (contentText.trim().startsWith("TITLE:")) {
                            const lines = contentText.trim().split("\n");
                            const titleLine = lines.shift();
                            const newTitle = titleLine
                                .replace(/^TITLE:\s*/, "")
                                .trim();
                            if (onTitleChange && newTitle)
                                onTitleChange(newTitle);
                            contentText = lines.join("\n").trim();
                        }

                        if (contentText) {
                            const finalBlocks =
                                parseMarkdownToBlocks(contentText);
                            const _special = new Set([
                                "image",
                                "mermaidBlock",
                                "divider",
                                "blockEquation",
                            ]);
                            const inlineOnly = finalBlocks.filter(
                                (b) => !_special.has(b.type),
                            );
                            const specialOnly = finalBlocks
                                .map((b, idx) => ({ block: b, origIdx: idx }))
                                .filter(
                                    ({ block }) =>
                                        _special.has(block.type) &&
                                        block.type !== "image",
                                );

                            if (inlineOnly.length > 0) {
                                try {
                                    const anchorId = aiAnchorIdRef.current;
                                    const docNow = editor.document;
                                    const existingInline = currentIds.filter(
                                        (id) => {
                                            const block = docNow.find(
                                                (b) => b.id === id,
                                            );
                                            return (
                                                block &&
                                                !_special.has(block.type)
                                            );
                                        },
                                    );
                                    const existingSpecial = currentIds.filter(
                                        (id) => {
                                            const block = docNow.find(
                                                (b) => b.id === id,
                                            );
                                            return (
                                                block &&
                                                _special.has(block.type) &&
                                                block.type !== "image"
                                            );
                                        },
                                    );
                                    if (existingSpecial.length > 0) {
                                        try {
                                            editor.removeBlocks(
                                                existingSpecial,
                                            );
                                        } catch {}
                                    }
                                    if (existingInline.length > 0) {
                                        editor.replaceBlocks(
                                            existingInline,
                                            inlineOnly,
                                        );
                                    }
                                    const refreshedDoc = editor.document;
                                    const newAnchorIdx = refreshedDoc.findIndex(
                                        (b) => b.id === anchorId,
                                    );
                                    const imageIds = currentIds.filter((id) => {
                                        const block = docNow.find(
                                            (b) => b.id === id,
                                        );
                                        return block && block.type === "image";
                                    });
                                    const newInlineIds = refreshedDoc
                                        .slice(
                                            newAnchorIdx + 1,
                                            newAnchorIdx +
                                                1 +
                                                inlineOnly.length,
                                        )
                                        .map((b) => b.id);

                                    // Insert special blocks at correct positions
                                    for (const {
                                        block: specBlock,
                                        origIdx,
                                    } of specialOnly) {
                                        const inlineBefore = finalBlocks
                                            .slice(0, origIdx)
                                            .filter(
                                                (b) => !_special.has(b.type),
                                            ).length;
                                        const afterId =
                                            inlineBefore > 0 &&
                                            inlineBefore <= newInlineIds.length
                                                ? newInlineIds[inlineBefore - 1]
                                                : newInlineIds.length > 0
                                                  ? newInlineIds[
                                                        newInlineIds.length - 1
                                                    ]
                                                  : anchorId;
                                        try {
                                            editor.insertBlocks(
                                                [specBlock],
                                                afterId,
                                                "after",
                                            );
                                            const updDoc = editor.document;
                                            const afterIdx = updDoc.findIndex(
                                                (b) => b.id === afterId,
                                            );
                                            const inserted =
                                                updDoc[afterIdx + 1];
                                            if (inserted)
                                                newInlineIds.splice(
                                                    inlineBefore,
                                                    0,
                                                    inserted.id,
                                                );
                                        } catch {}
                                    }

                                    currentIds = [...newInlineIds, ...imageIds];
                                    aiBlockIdsRef.current = new Set(currentIds);
                                    aiBlockCountRef.current = currentIds.length;
                                } catch {}
                            }
                        } else {
                            // No content — remove placeholder
                            try {
                                editor.removeBlocks([insertedBlock.id]);
                            } catch {}
                            currentIds = [];
                        }

                        // Insert trailing empty paragraph
                        try {
                            const lastAiId = currentIds[currentIds.length - 1];
                            if (lastAiId) {
                                editor.insertBlocks(
                                    [{ type: "paragraph", content: [] }],
                                    lastAiId,
                                    "after",
                                );
                            }
                        } catch {}

                        // Set final BlockNote textColor + backgroundColor on AI blocks
                        const _skipColor = new Set([
                            "image",
                            "divider",
                            "mermaidBlock",
                            "blockEquation",
                        ]);
                        for (const id of currentIds) {
                            try {
                                const block = editor.document.find(
                                    (b) => b.id === id,
                                );
                                if (block && !_skipColor.has(block.type)) {
                                    editor.updateBlock(id, {
                                        props: {
                                            textColor: "purple",
                                            backgroundColor: "purple",
                                        },
                                    });
                                }
                            } catch {}
                        }

                        const finalIds = new Set(currentIds);
                        aiBlockIdsRef.current = finalIds;
                        setAiBlockIds(finalIds);
                        setAiGenerating(false);
                        setAiPhase("idle");
                        setAiGeneratingBlockId(null);
                        aiAbortRef.current = null;
                        setShowAIActions(currentIds.length > 0);
                        highlightAiBlocks(currentIds, false);
                    },

                    onError: (err) => {
                        handleAIError(err);
                    },
                });
            } catch (err) {
                handleAIError(err);
            }
        },
        [
            editor,
            getAiBlockIds,
            highlightAiBlocks,
            getFullBlogContext,
            blogId,
            handleAIKeep,
            aiMenuPos,
            hideSparkle,
            onTitleChange,
            replaceImagePlaceholder,
        ],
    );

    return (
        <div
            className={`blog-editor-wrapper${aiGenerating ? " ai-editor-locked" : ""}`}
            ref={wrapperRef}
            style={{ position: "relative" }}
            onContextMenu={(e) => {
                // Keep native menus on links/inputs/toolbars; otherwise show ours (#21).
                if (
                    e.target.closest(
                        'a, input, textarea, button, .bn-link-toolbar, [data-content-type="codeBlock"]',
                    )
                )
                    return;
                e.preventDefault();
                setBlockMenu(null);
                setPageMenu({
                    x: Math.min(e.clientX, window.innerWidth - 230),
                    y: Math.min(e.clientY, window.innerHeight - 320),
                });
            }}
        >
            <BlogImageUploadContext.Provider
                value={{
                    blogId,
                    mediaStorageStatus,
                }}
            >
                <BlockNoteView
                    editor={editor}
                    onChange={handleChange}
                    editable={editable}
                    theme={isDark ? "dark" : "light"}
                    slashMenu={false}
                    sideMenu={false}
                    filePanel={false}
                    formattingToolbar={false}
                >
                    <SideMenuController sideMenu={CustomSideMenu} />
                    <SuggestionMenuController
                        triggerCharacter="/"
                        getItems={getItems}
                    />
                    <FormattingToolbarController
                        formattingToolbar={LinkAwareFormattingToolbar}
                    />
                    <TableHandlesController />
                </BlockNoteView>
            </BlogImageUploadContext.Provider>

            {/* Special-block menu — right-click the block's left drag handle. */}
            {blockMenu && (
                <>
                    <div
                        className="editor-context-menu-dismiss"
                        onMouseDown={() => setBlockMenu(null)}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            setBlockMenu(null);
                        }}
                    />
                    <div
                        className="page-context-menu block-context-menu"
                        role="menu"
                        aria-label={`${SPECIAL_BLOCK_LABELS[blockMenu.blockType]} block actions`}
                        style={{
                            position: "fixed",
                            top: blockMenu.y,
                            left: blockMenu.x,
                            zIndex: 101,
                        }}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className="page-context-menu-item"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                try {
                                    const source = editor.getBlock(
                                        blockMenu.blockId,
                                    );
                                    const [paragraph] = editor.insertBlocks(
                                        [{ type: "paragraph" }],
                                        source,
                                        "after",
                                    );
                                    editor.setTextCursorPosition(
                                        paragraph.id,
                                        "start",
                                    );
                                } catch {}
                                setBlockMenu(null);
                            }}
                        >
                            <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            >
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Add text below
                        </button>
                        {blockMenu.blockType !== "tabsBlock" &&
                            blockMenu.blockType !== "canvasBlock" && (
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="page-context-menu-item"
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onClick={() => {
                                        try {
                                            const source = editor.getBlock(
                                                blockMenu.blockId,
                                            );
                                            editor.insertBlocks(
                                                [withoutBlockIds(source)],
                                                source,
                                                "after",
                                            );
                                        } catch {}
                                        setBlockMenu(null);
                                    }}
                                >
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
                                        <rect
                                            x="8"
                                            y="8"
                                            width="12"
                                            height="12"
                                            rx="2"
                                        />
                                        <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
                                    </svg>
                                    Duplicate block
                                </button>
                            )}
                        <div className="block-context-menu-separator" />
                        <button
                            type="button"
                            role="menuitem"
                            className="page-context-menu-item block-context-menu-delete"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={async () => {
                                const menu = blockMenu;
                                setBlockMenu(null);
                                try {
                                    await removeSpecialBlock(menu);
                                } catch {}
                            }}
                        >
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
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
                            </svg>
                            Delete {SPECIAL_BLOCK_LABELS[blockMenu.blockType]}
                        </button>
                    </div>
                </>
            )}

            {/* Page context menu (#21) — quick block inserts on right-click */}
            {pageMenu && (
                <>
                    <div
                        className="editor-context-menu-dismiss"
                        onMouseDown={() => setPageMenu(null)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setPageMenu(null);
                        }}
                    />
                    <div
                        className="page-context-menu"
                        style={{
                            position: "fixed",
                            top: pageMenu.y,
                            left: pageMenu.x,
                            zIndex: 101,
                        }}
                    >
                        {[
                            {
                                label: "Heading",
                                type: "heading",
                                props: { level: 2 },
                                d: "M6 4v16M18 4v16M6 12h12",
                            },
                            {
                                label: "Bullet list",
                                type: "bulletListItem",
                                d: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
                            },
                            {
                                label: "Image",
                                type: "image",
                                props: { url: "" },
                                d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M3 3h18v18H3z M21 15l-5-5L5 21",
                            },
                            {
                                label: "Table",
                                type: "table",
                                d: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
                            },
                            {
                                label: "Code block",
                                type: "codeBlock",
                                d: "M16 18l6-6-6-6M8 6l-6 6 6 6",
                            },
                            {
                                label: "Quote",
                                type: "quote",
                                d: "M3 21c3 0 7-1 7-8V5H3v7h4M14 21c3 0 7-1 7-8V5h-7v7h4",
                            },
                            {
                                label: "Divider",
                                type: "divider",
                                d: "M3 12h18",
                            },
                        ].map((it) => (
                            <button
                                key={it.label}
                                type="button"
                                className="page-context-menu-item"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    try {
                                        const cur =
                                            editor.getTextCursorPosition()
                                                .block;
                                        editor.insertBlocks(
                                            [
                                                {
                                                    type: it.type,
                                                    ...(it.props
                                                        ? { props: it.props }
                                                        : {}),
                                                },
                                            ],
                                            cur,
                                            "after",
                                        );
                                    } catch {}
                                    setPageMenu(null);
                                }}
                            >
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
                                    <path d={it.d} />
                                </svg>
                                {it.label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* @ Mention menu */}
            {showMentionMenu && (
                <div
                    className="absolute z-[60]"
                    style={{ top: mentionPos.top, left: mentionPos.left }}
                >
                    <MentionMenu
                        editor={editor}
                        query={mentionQuery}
                        onClose={handleMentionClose}
                        onDismiss={handleMentionDismiss}
                        allowUsers={!secret}
                    />
                </div>
            )}

            {AI_ENABLED && showAIMenu && (
                <AICommandMenu
                    position={aiMenuPos}
                    onSubmit={handleAISubmit}
                    onClose={() => {
                        setShowAIMenu(false);
                        // Restore the host block and remove the inserted empty paragraph
                        if (aiMenuPos.anchorBlockId) {
                            const hostEl = wrapperRef.current?.querySelector(
                                `[data-id="${aiMenuPos.anchorBlockId}"]`,
                            );
                            if (hostEl) {
                                hostEl.style.visibility = "";
                                hostEl.style.height = "";
                                hostEl.style.overflow = "";
                                hostEl.style.margin = "";
                                hostEl.style.padding = "";
                            }
                            // Remove the extra paragraph we inserted below
                            try {
                                const doc = editor.document;
                                const idx = doc.findIndex(
                                    (b) => b.id === aiMenuPos.anchorBlockId,
                                );
                                if (idx !== -1 && idx + 1 < doc.length) {
                                    const nextBlock = doc[idx + 1];
                                    const nextEl =
                                        wrapperRef.current?.querySelector(
                                            `[data-id="${nextBlock.id}"]`,
                                        );
                                    if (nextEl)
                                        nextEl.classList.remove(
                                            "ai-hide-placeholder",
                                        );
                                    const isEmpty =
                                        nextBlock.type === "paragraph" &&
                                        (!nextBlock.content ||
                                            nextBlock.content.length === 0 ||
                                            (nextBlock.content.length === 1 &&
                                                nextBlock.content[0].text ===
                                                    ""));
                                    if (isEmpty)
                                        editor.removeBlocks([nextBlock.id]);
                                }
                            } catch {}
                            // Refocus the original block
                            try {
                                editor.setTextCursorPosition(
                                    aiMenuPos.anchorBlockId,
                                    "start",
                                );
                            } catch {}
                        }
                    }}
                />
            )}

            {/* Inline AI status bar — appears at the empty line before streaming starts */}
            {aiGenerating && aiStatusInline && (
                <div
                    className="ai-inline-status-bar"
                    style={{
                        position: "absolute",
                        top: aiInlinePos.top,
                        left: 0,
                        right: 0,
                        zIndex: 100,
                    }}
                >
                    <div className="mx-auto w-full max-w-[600px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden border-[1.5px] border-[rgba(196,181,253,0.3)]">
                                <img
                                    src="/logo-mark.png"
                                    alt="Elixpo"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[13px] font-semibold text-[#c4b5fd]">
                                    Elixpo
                                </span>
                                <span className="text-[13px] text-[#8b8fa3] ai-status-text-fade">
                                    {aiStatusText}
                                    <span className="elixpo-typing-dots">
                                        <span />
                                        <span />
                                        <span />
                                    </span>
                                </span>
                            </div>
                            <button
                                onClick={handleAIStop}
                                className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium text-[#f87171] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.25)] hover:bg-[rgba(248,113,113,0.15)] transition-colors"
                            >
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 12 12"
                                    fill="currentColor"
                                >
                                    <rect
                                        x="1"
                                        y="1"
                                        width="10"
                                        height="10"
                                        rx="2"
                                    />
                                </svg>
                                Stop
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Elixpo AI typing bar — fixed bottom glassmorphism (shown after first chunk) */}
            {aiGenerating && !aiStatusInline && (
                <div className="elixpo-typing-bar">
                    <div className="elixpo-typing-bar-inner">
                        <img
                            src="/logo-mark.png"
                            alt="Elixpo"
                            className="elixpo-typing-avatar"
                        />
                        <div className="elixpo-typing-text">
                            <span className="elixpo-typing-name">Elixpo</span>
                            <span className="elixpo-typing-status">
                                {aiStatusText ||
                                    (aiPhase === "thinking"
                                        ? "is thinking"
                                        : aiPhase === "generating_image"
                                          ? "is creating an image"
                                          : aiPhase === "uploading"
                                            ? "is uploading"
                                            : "is writing")}
                                <span className="elixpo-typing-dots">
                                    <span />
                                    <span />
                                    <span />
                                </span>
                            </span>
                        </div>
                        <button
                            className="elixpo-stop-btn"
                            onClick={handleAIStop}
                        >
                            <svg
                                width="10"
                                height="10"
                                viewBox="0 0 12 12"
                                fill="currentColor"
                            >
                                <rect
                                    x="1"
                                    y="1"
                                    width="10"
                                    height="10"
                                    rx="2"
                                />
                            </svg>
                            Stop
                        </button>
                    </div>
                </div>
            )}

            {/* Keep/Discard actions — fixed bottom bar after AI done */}
            {showAIActions && !aiGenerating && aiBlockIds.size > 0 && (
                <div className="elixpo-done-bar">
                    <div className="elixpo-done-bar-inner">
                        <img
                            src="/logo-mark.png"
                            alt="Elixpo"
                            className="elixpo-typing-avatar"
                        />
                        <span className="elixpo-done-label">
                            Elixpo finished writing
                        </span>
                        <div className="elixpo-done-actions">
                            <button
                                className="elixpo-done-keep"
                                onClick={handleAIKeep}
                                title="Keep"
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Keep
                            </button>
                            <button
                                className="elixpo-done-discard"
                                onClick={handleAIDiscard}
                                title="Discard"
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                Undo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI selection toolbar — appears on text selection (disabled while AI is off) */}
            {AI_ENABLED && (
                <AISelectionToolbar
                    editor={editor}
                    onTitleChange={onTitleChange}
                    blogId={blogId}
                />
            )}

            {/* AI error toast */}
            {aiErrorToast && (
                <div
                    className="ai-error-toast"
                    onAnimationEnd={(e) => {
                        if (e.animationName === "ai-toast-fade-out")
                            setAiErrorToast(null);
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        style={{ flexShrink: 0 }}
                    >
                        <circle
                            cx="8"
                            cy="8"
                            r="7"
                            stroke="#ff6b6b"
                            strokeWidth="1.5"
                        />
                        <path
                            d="M8 4.5v4"
                            stroke="#ff6b6b"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        />
                        <circle cx="8" cy="11" r="0.75" fill="#ff6b6b" />
                    </svg>
                    <span>{aiErrorToast}</span>
                    <button
                        onClick={() => setAiErrorToast(null)}
                        aria-label="Dismiss"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Inline LaTeX input popup */}
            {showInlineLatex && (
                <div
                    className="inline-latex-overlay"
                    onClick={() => setShowInlineLatex(false)}
                >
                    <div
                        className="inline-latex-popup"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="inline-latex-header">
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#c4b5fd"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M4 4l4 16M12 4l4 16M7 8h10M6 16h10" />
                            </svg>
                            <span>Inline Equation</span>
                        </div>
                        <input
                            ref={inlineLatexRef}
                            type="text"
                            className="inline-latex-input"
                            value={inlineLatexValue}
                            onChange={(e) =>
                                setInlineLatexValue(e.target.value)
                            }
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter" &&
                                    inlineLatexValue.trim()
                                ) {
                                    e.preventDefault();
                                    editor.insertInlineContent([
                                        {
                                            type: "inlineEquation",
                                            props: {
                                                latex: inlineLatexValue.trim(),
                                            },
                                        },
                                    ]);
                                    setShowInlineLatex(false);
                                    setInlineLatexValue("");
                                }
                                if (e.key === "Escape") {
                                    setShowInlineLatex(false);
                                    setInlineLatexValue("");
                                }
                            }}
                            placeholder="E = mc^2"
                            autoFocus
                        />
                        <InlineLatexPreview latex={inlineLatexValue} />
                        <div className="inline-latex-actions">
                            <button
                                className="mermaid-btn-cancel"
                                onClick={() => {
                                    setShowInlineLatex(false);
                                    setInlineLatexValue("");
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className="mermaid-btn-save"
                                disabled={!inlineLatexValue.trim()}
                                onClick={() => {
                                    if (inlineLatexValue.trim()) {
                                        editor.insertInlineContent([
                                            {
                                                type: "inlineEquation",
                                                props: {
                                                    latex: inlineLatexValue.trim(),
                                                },
                                            },
                                        ]);
                                        setShowInlineLatex(false);
                                        setInlineLatexValue("");
                                    }
                                }}
                            >
                                Insert
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Link preview tooltip */}
            {editorLinkPreview.preview && (
                <LinkPreviewTooltip
                    anchorEl={editorLinkPreview.preview.anchorEl}
                    url={editorLinkPreview.preview.url}
                    onClose={editorLinkPreview.hide}
                    onEdit={() => {
                        const anchorEl = editorLinkPreview.preview.anchorEl;
                        const url = editorLinkPreview.preview.url;
                        const tiptap = editor?._tiptapEditor;
                        if (tiptap && anchorEl) {
                            try {
                                const pos = tiptap.view.posAtDOM(anchorEl, 0);
                                const range = getLinkRange(tiptap, pos, url);
                                if (range) {
                                    const rect =
                                        anchorEl.getBoundingClientRect();
                                    setLinkEditor({
                                        anchorText: range.text,
                                        url: range.href,
                                        from: range.from,
                                        to: range.to,
                                        top: rect.bottom + 6,
                                        left: Math.max(
                                            8,
                                            Math.min(
                                                rect.left,
                                                window.innerWidth - 340,
                                            ),
                                        ),
                                    });
                                }
                            } catch (e) {
                                console.error(e);
                            }
                        }
                        editorLinkPreview.hide();
                    }}
                />
            )}

            {/* Custom link editor — [anchor text](url) */}
            {linkEditor && (
                <>
                    <div
                        className="fixed inset-0 z-[98]"
                        onClick={() => setLinkEditor(null)}
                    />
                    <div
                        className="link-editor-popup"
                        style={{ top: linkEditor.top, left: linkEditor.left }}
                    >
                        <div className="link-editor-header">
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#9b7bf7"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                            </svg>
                            <span>Edit Link</span>
                        </div>
                        <div className="link-editor-fields">
                            <div className="link-editor-field">
                                <label className="link-editor-label">
                                    Text
                                </label>
                                <input
                                    type="text"
                                    value={linkEditor.anchorText}
                                    onChange={(e) =>
                                        setLinkEditor((prev) => ({
                                            ...prev,
                                            anchorText: e.target.value,
                                        }))
                                    }
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            if (!linkEditor.url.trim()) return;
                                            const tiptap = editor._tiptapEditor;
                                            if (tiptap) {
                                                const { state, view } = tiptap;
                                                const normalizedUrl =
                                                    normalizeUrl(
                                                        linkEditor.url,
                                                    );
                                                if (!normalizedUrl) return;
                                                const linkMark =
                                                    state.schema.marks.link.create(
                                                        { href: normalizedUrl },
                                                    );
                                                const text =
                                                    linkEditor.anchorText.trim() ||
                                                    normalizedUrl;
                                                const tr = state.tr;
                                                const textNode =
                                                    state.schema.text(text, [
                                                        linkMark,
                                                    ]);
                                                tr.replaceWith(
                                                    linkEditor.from,
                                                    linkEditor.to,
                                                    textNode,
                                                );
                                                try {
                                                    const newPos =
                                                        linkEditor.from +
                                                        text.length;
                                                    const selection =
                                                        state.selection.constructor.create(
                                                            tr.doc,
                                                            newPos,
                                                        );
                                                    tr.setSelection(selection);
                                                } catch {}
                                                view.dispatch(tr);
                                                view.focus();
                                            }
                                            setLinkEditor(null);
                                        }
                                        if (e.key === "Escape")
                                            setLinkEditor(null);
                                    }}
                                    placeholder="Link text..."
                                    className="link-editor-input"
                                    autoFocus
                                />
                            </div>
                            <div className="link-editor-field">
                                <label className="link-editor-label">URL</label>
                                <input
                                    type="text"
                                    value={linkEditor.url}
                                    onChange={(e) => {
                                        setLinkEditor((prev) => ({
                                            ...prev,
                                            url: e.target.value,
                                        }));
                                        setLinkShortenError("");
                                    }}
                                    onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            if (!linkEditor.url.trim()) return;
                                            const tiptap = editor._tiptapEditor;
                                            if (tiptap) {
                                                const { state, view } = tiptap;
                                                const normalizedUrl =
                                                    normalizeUrl(
                                                        linkEditor.url,
                                                    );
                                                if (!normalizedUrl) return;
                                                const linkMark =
                                                    state.schema.marks.link.create(
                                                        { href: normalizedUrl },
                                                    );
                                                const text =
                                                    linkEditor.anchorText.trim() ||
                                                    normalizedUrl;
                                                const tr = state.tr;
                                                const textNode =
                                                    state.schema.text(text, [
                                                        linkMark,
                                                    ]);
                                                tr.replaceWith(
                                                    linkEditor.from,
                                                    linkEditor.to,
                                                    textNode,
                                                );
                                                try {
                                                    const newPos =
                                                        linkEditor.from +
                                                        text.length;
                                                    const selection =
                                                        state.selection.constructor.create(
                                                            tr.doc,
                                                            newPos,
                                                        );
                                                    tr.setSelection(selection);
                                                } catch {}
                                                view.dispatch(tr);
                                                view.focus();
                                            }
                                            setLinkEditor(null);
                                        }
                                        if (e.key === "Escape")
                                            setLinkEditor(null);
                                    }}
                                    placeholder="https://..."
                                    className="link-editor-input"
                                />
                            </div>
                            <div className="link-editor-shortener">
                                <button
                                    type="button"
                                    className="link-editor-shorten"
                                    disabled={
                                        shorteningLink ||
                                        !/^https?:\/\//i.test(
                                            normalizeUrl(linkEditor.url) || "",
                                        )
                                    }
                                    onClick={shortenCurrentLink}
                                >
                                    <ion-icon name="flash-outline" />
                                    {shorteningLink
                                        ? "Shortening…"
                                        : "Shorten with LixRL"}
                                </button>
                                <a
                                    href="/settings?tab=integrations"
                                    className="link-editor-connect"
                                >
                                    Manage
                                </a>
                            </div>
                            {linkShortenError && (
                                <p className="link-editor-error">
                                    {linkShortenError}
                                    {linkShortenError
                                        .toLowerCase()
                                        .includes("connect") && (
                                        <>
                                            {" "}
                                            <a href="/settings?tab=integrations">
                                                Open settings
                                            </a>
                                        </>
                                    )}
                                </p>
                            )}
                        </div>
                        <div className="link-editor-actions">
                            <button
                                className="link-editor-cancel"
                                onClick={() => setLinkEditor(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="link-editor-save"
                                disabled={!normalizeUrl(linkEditor.url)}
                                onClick={() => {
                                    const tiptap = editor._tiptapEditor;
                                    if (tiptap) {
                                        const { state, view } = tiptap;
                                        const normalizedUrl = normalizeUrl(
                                            linkEditor.url,
                                        );
                                        if (!normalizedUrl) return;
                                        const linkMark =
                                            state.schema.marks.link.create({
                                                href: normalizedUrl,
                                            });
                                        const text =
                                            linkEditor.anchorText.trim() ||
                                            normalizedUrl;
                                        const tr = state.tr;
                                        const textNode = state.schema.text(
                                            text,
                                            [linkMark],
                                        );
                                        tr.replaceWith(
                                            linkEditor.from,
                                            linkEditor.to,
                                            textNode,
                                        );
                                        try {
                                            const newPos =
                                                linkEditor.from + text.length;
                                            const selection =
                                                state.selection.constructor.create(
                                                    tr.doc,
                                                    newPos,
                                                );
                                            tr.setSelection(selection);
                                        } catch {}
                                        view.dispatch(tr);
                                        view.focus();
                                    }
                                    setLinkEditor(null);
                                }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});

export default BlogEditor;
