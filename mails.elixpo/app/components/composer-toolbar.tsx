"use client";

import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import ImageIcon from "@mui/icons-material/Image";
import LinkIcon from "@mui/icons-material/Link";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    Popover,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useRef, useState } from "react";

const ACCENT = "var(--accent)";

/**
 * Gmail-style formatting bar at the foot of the editor. Drives the underlying
 * BlockNote editor (via the lixeditor handle's getEditor()) so it works without
 * touching the slash menu, and inserts images through our Cloudinary upload —
 * never BlockNote's embed-URL placeholder.
 */
export default function ComposerToolbar({
    getEditor,
    uploadImage,
}: {
    getEditor: () => any | null;
    uploadImage: (file: File) => Promise<string>;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null>(null);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkText, setLinkText] = useState("");
    const [uploading, setUploading] = useState(false);

    function withEditor(fn: (ed: any) => void) {
        const ed = getEditor();
        if (!ed) return;
        try {
            ed.focus?.();
            fn(ed);
        } catch {
            /* editor API mismatch — fail silently rather than break compose */
        }
    }

    const toggleStyle = (style: string) => withEditor((ed) => ed.toggleStyles({ [style]: true }));

    /** Toggle the current block between `type`/`props` and a plain paragraph. */
    const toggleBlock = (type: string, props?: Record<string, any>) =>
        withEditor((ed) => {
            const block = ed.getTextCursorPosition().block;
            const same =
                block.type === type &&
                (!props || Object.entries(props).every(([k, v]) => block.props?.[k] === v));
            ed.updateBlock(block, same ? { type: "paragraph" } : { type, props });
        });

    function openLink(e: React.MouseEvent<HTMLElement>) {
        // Pre-fill the text with the current selection (if any) so linking a
        // selection keeps its text; otherwise the typed text is inserted.
        let selected = "";
        try {
            selected = getEditor()?.getSelectedText?.() || "";
        } catch {
            selected = "";
        }
        setLinkText(selected);
        setLinkUrl("");
        setLinkAnchor(e.currentTarget);
    }
    function applyLink() {
        const url = linkUrl.trim();
        if (!url) return;
        // createLink(url, text): with text it inserts a link at the cursor (or
        // replaces the selection); without text it links the current selection.
        const text = linkText.trim();
        withEditor((ed) => ed.createLink(url, text || undefined));
        setLinkAnchor(null);
    }

    async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-picking the same file
        if (!file) return;
        setUploading(true);
        try {
            const url = await uploadImage(file);
            withEditor((ed) => {
                const block = ed.getTextCursorPosition().block;
                ed.insertBlocks([{ type: "image", props: { url } }], block, "after");
            });
        } catch {
            /* surfaced by the upload layer; keep the bar responsive */
        } finally {
            setUploading(false);
        }
    }

    const btn = {
        color: "var(--fg-muted)",
        borderRadius: "8px",
        p: 0.5,
        "&:hover": { color: "var(--fg)", background: "var(--accent-tint)" },
    };

    return (
        <Stack
            direction="row"
            alignItems="center"
            spacing={0.3}
            sx={{
                px: 1.5,
                py: 0.55,
                borderTop: "1px solid var(--border)",
                background: "var(--overlay)",
                flexWrap: "wrap",
                rowGap: 0.5,
            }}
        >
            <Tooltip title="Bold">
                <IconButton size="small" sx={btn} onClick={() => toggleStyle("bold")}>
                    <FormatBoldIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Italic">
                <IconButton size="small" sx={btn} onClick={() => toggleStyle("italic")}>
                    <FormatItalicIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Underline">
                <IconButton size="small" sx={btn} onClick={() => toggleStyle("underline")}>
                    <FormatUnderlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Strikethrough">
                <IconButton size="small" sx={btn} onClick={() => toggleStyle("strike")}>
                    <StrikethroughSIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.6, my: 0.6, borderColor: "var(--border)" }}
            />

            {[1, 2].map((level) => (
                <Tooltip key={level} title={`Heading ${level}`}>
                    <IconButton
                        size="small"
                        sx={btn}
                        onClick={() => toggleBlock("heading", { level })}
                    >
                        <Typography
                            sx={{ fontSize: "0.82rem", fontWeight: 800, lineHeight: 1, px: 0.2 }}
                        >
                            H{level}
                        </Typography>
                    </IconButton>
                </Tooltip>
            ))}
            <Tooltip title="Quote">
                <IconButton size="small" sx={btn} onClick={() => toggleBlock("quote")}>
                    <FormatQuoteIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.6, my: 0.6, borderColor: "var(--border)" }}
            />

            <Tooltip title="Bulleted list">
                <IconButton size="small" sx={btn} onClick={() => toggleBlock("bulletListItem")}>
                    <FormatListBulletedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Numbered list">
                <IconButton size="small" sx={btn} onClick={() => toggleBlock("numberedListItem")}>
                    <FormatListNumberedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title="Insert link">
                <IconButton size="small" sx={btn} onClick={openLink}>
                    <LinkIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.6, my: 0.6, borderColor: "var(--border)" }}
            />

            <Tooltip title="Insert image">
                <span>
                    <IconButton
                        size="small"
                        sx={btn}
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                    >
                        {uploading ? (
                            <CircularProgress size={16} sx={{ color: ACCENT }} />
                        ) : (
                            <ImageIcon fontSize="small" />
                        )}
                    </IconButton>
                </span>
            </Tooltip>
            <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                hidden
                onChange={onPickImage}
            />

            <Popover
                open={Boolean(linkAnchor)}
                anchorEl={linkAnchor}
                onClose={() => setLinkAnchor(null)}
                anchorOrigin={{ vertical: "top", horizontal: "center" }}
                transformOrigin={{ vertical: "bottom", horizontal: "center" }}
                slotProps={{
                    paper: {
                        sx: {
                            p: 1.2,
                            background: "var(--menu-surface)",
                            border: "1px solid var(--border)",
                            borderRadius: "12px",
                        },
                    },
                }}
            >
                <Stack spacing={1} sx={{ minWidth: 280 }}>
                    <TextField
                        autoFocus
                        size="small"
                        placeholder="Link text"
                        value={linkText}
                        onChange={(e) => setLinkText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") applyLink();
                        }}
                        sx={{
                            "& .MuiOutlinedInput-root": { color: "var(--fg)", borderRadius: "8px" },
                            "& fieldset": { borderColor: "var(--field-border)" },
                        }}
                    />
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                            size="small"
                            placeholder="https://…"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") applyLink();
                            }}
                            sx={{
                                flex: 1,
                                "& .MuiOutlinedInput-root": {
                                    color: "var(--fg)",
                                    borderRadius: "8px",
                                },
                                "& fieldset": { borderColor: "var(--field-border)" },
                            }}
                        />
                        <Button
                            onClick={applyLink}
                            disabled={!linkUrl.trim()}
                            sx={{
                                textTransform: "none",
                                fontWeight: 700,
                                color: "var(--accent-contrast)",
                                px: 1.8,
                                borderRadius: "8px",
                                background: "var(--accent-gradient)",
                                "&.Mui-disabled": {
                                    background: "var(--overlay)",
                                    color: "var(--fg-faint)",
                                },
                            }}
                        >
                            Link
                        </Button>
                    </Stack>
                </Stack>
            </Popover>
        </Stack>
    );
}
