"use client";

import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import DataObjectIcon from "@mui/icons-material/DataObject";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import LinkIcon from "@mui/icons-material/Link";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Menu,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useState } from "react";
import { GHOST_BTN, PRIMARY_BTN } from "./dashboard-ui";
import { openDrivePicker } from "./drive-picker";
import { BORDER, SURFACE } from "./glass-card";
import { useRole } from "./role-provider";

const ACCENT = "var(--accent)";
const TEXT_55 = "var(--fg-muted)";

export interface Attachment {
    id?: string;
    kind: "drive" | "url" | "variable";
    source: string;
    filename: string | null;
    mime?: string | null;
    size?: number | null;
}

const darkField = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        borderRadius: "10px",
        background: "var(--field-bg)",
        "& fieldset": { borderColor: "var(--field-border)" },
        "&:hover fieldset": { borderColor: "var(--accent-border)" },
        "&.Mui-focused fieldset": { borderColor: ACCENT },
    },
    "& .MuiInputBase-input": { fontSize: "0.9rem" },
};

const dialogPaper = {
    sx: {
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        backgroundImage: "none",
        borderRadius: "16px",
        width: "100%",
        maxWidth: 440,
    },
} as const;

function chipLabel(a: Attachment): string {
    if (a.kind === "variable") return a.source;
    if (a.filename) return a.filename;
    try {
        return new URL(a.source).pathname.split("/").pop() || a.source;
    } catch {
        return a.source;
    }
}

export default function AttachmentsStrip({
    attachments,
    onChange,
    onToast,
}: {
    attachments: Attachment[];
    onChange: (next: Attachment[]) => void;
    onToast: (m: string) => void;
}) {
    const { canWrite } = useRole();
    const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
    const [urlOpen, setUrlOpen] = useState(false);
    const [varOpen, setVarOpen] = useState(false);

    function add(a: Attachment) {
        onChange([...attachments, a]);
    }
    function remove(idx: number) {
        onChange(attachments.filter((_, i) => i !== idx));
    }

    async function pickDrive() {
        setMenuEl(null);
        try {
            const status: any = await fetch("/api/drive/status").then((r) => r.json());
            if (!status?.configured) {
                onToast("Google Drive isn’t set up on this deployment yet.");
                return;
            }
            if (!status?.connected) {
                onToast("Connect Google Drive in Settings first.");
                return;
            }
            const file = await openDrivePicker();
            if (file) {
                add({
                    kind: "drive",
                    source: file.id,
                    filename: file.name,
                    mime: file.mimeType,
                    size: file.sizeBytes,
                });
                onToast(`Attached ${file.name}`);
            }
        } catch (e: any) {
            onToast(
                e?.message === "not_configured"
                    ? "Google Drive isn’t configured."
                    : "Could not open the Drive picker.",
            );
        }
    }

    return (
        <Box sx={{ px: 1.5, py: 1, borderTop: "1px solid var(--border)" }}>
            <Stack direction="row" alignItems="center" sx={{ flexWrap: "wrap", gap: 0.8 }}>
                {canWrite && (
                    <Button
                        onClick={(e) => setMenuEl(e.currentTarget)}
                        startIcon={<AttachFileIcon sx={{ fontSize: "1rem !important" }} />}
                        sx={{ ...GHOST_BTN, py: 0.5, px: 1.4, fontSize: "0.8rem" }}
                    >
                        Attach
                    </Button>
                )}

                {attachments.length === 0 ? (
                    <Typography sx={{ color: TEXT_55, fontSize: "0.78rem", ml: 0.5 }}>
                        Files from Drive, a URL, or a {"{{variable}}"} resolved per send.
                    </Typography>
                ) : (
                    attachments.map((a, i) => (
                        <Chip
                            key={a.id || `${a.kind}-${i}`}
                            icon={
                                a.kind === "variable" ? (
                                    <DataObjectIcon
                                        sx={{ fontSize: 15, color: `${ACCENT} !important` }}
                                    />
                                ) : a.kind === "url" ? (
                                    <LinkIcon
                                        sx={{
                                            fontSize: 15,
                                            color: "var(--fg-muted) !important",
                                        }}
                                    />
                                ) : (
                                    <InsertDriveFileIcon
                                        sx={{
                                            fontSize: 15,
                                            color: "var(--fg-muted) !important",
                                        }}
                                    />
                                )
                            }
                            label={chipLabel(a)}
                            onDelete={canWrite ? () => remove(i) : undefined}
                            deleteIcon={
                                canWrite ? (
                                    <CloseIcon sx={{ fontSize: "16px !important" }} />
                                ) : undefined
                            }
                            size="small"
                            sx={{
                                maxWidth: 240,
                                height: 26,
                                fontSize: "0.74rem",
                                color: "var(--fg)",
                                bgcolor:
                                    a.kind === "variable" ? "var(--accent-tint)" : "var(--overlay)",
                                border: `1px solid ${a.kind === "variable" ? "var(--accent-border)" : BORDER}`,
                                "& .MuiChip-deleteIcon": {
                                    color: "var(--fg-muted)",
                                    "&:hover": { color: "var(--danger)" },
                                },
                            }}
                        />
                    ))
                )}
            </Stack>

            <Menu
                open={Boolean(menuEl)}
                anchorEl={menuEl}
                onClose={() => setMenuEl(null)}
                slotProps={{
                    paper: {
                        sx: {
                            background: SURFACE,
                            border: `1px solid ${BORDER}`,
                            backgroundImage: "none",
                            "& .MuiMenuItem-root": {
                                color: "var(--fg)",
                                fontSize: "0.85rem",
                                gap: 1,
                            },
                        },
                    },
                }}
            >
                <MenuItem onClick={pickDrive}>
                    <InsertDriveFileIcon sx={{ fontSize: 17 }} /> From Google Drive
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        setMenuEl(null);
                        setUrlOpen(true);
                    }}
                >
                    <LinkIcon sx={{ fontSize: 17 }} /> From a URL
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        setMenuEl(null);
                        setVarOpen(true);
                    }}
                >
                    <DataObjectIcon sx={{ fontSize: 17 }} /> Variable (per send)
                </MenuItem>
            </Menu>

            {urlOpen && (
                <UrlDialog
                    onClose={() => setUrlOpen(false)}
                    onAdd={(source, filename) => {
                        add({ kind: "url", source, filename: filename || null });
                        setUrlOpen(false);
                    }}
                />
            )}
            {varOpen && (
                <VariableDialog
                    onClose={() => setVarOpen(false)}
                    onAdd={(varName, filename) => {
                        add({
                            kind: "variable",
                            source: `{{${varName}}}`,
                            filename: filename || null,
                        });
                        setVarOpen(false);
                    }}
                />
            )}
        </Box>
    );
}

function UrlDialog({
    onClose,
    onAdd,
}: { onClose: () => void; onAdd: (source: string, filename: string) => void }) {
    const [url, setUrl] = useState("");
    const [filename, setFilename] = useState("");
    const valid = /^https?:\/\//i.test(url.trim());
    return (
        <Dialog open onClose={onClose} slotProps={{ paper: dialogPaper }}>
            <DialogTitle sx={{ color: "var(--fg)", fontWeight: 800 }}>
                Attach from a URL
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <TextField
                        autoFocus
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        fullWidth
                        size="small"
                        sx={darkField}
                        placeholder="https://…/file.pdf or a Drive share link"
                    />
                    <TextField
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        fullWidth
                        size="small"
                        sx={darkField}
                        placeholder="Filename (optional)"
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={onClose} sx={{ ...GHOST_BTN, py: 0.7 }}>
                    Cancel
                </Button>
                <Button
                    onClick={() => onAdd(url.trim(), filename.trim())}
                    disabled={!valid}
                    sx={PRIMARY_BTN}
                >
                    Attach
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function VariableDialog({
    onClose,
    onAdd,
}: { onClose: () => void; onAdd: (varName: string, filename: string) => void }) {
    const [varName, setVarName] = useState("");
    const [filename, setFilename] = useState("");
    const clean = varName.trim().replace(/[^a-zA-Z0-9_.]/g, "");
    return (
        <Dialog open onClose={onClose} slotProps={{ paper: dialogPaper }}>
            <DialogTitle sx={{ color: "var(--fg)", fontWeight: 800 }}>
                Variable attachment
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: TEXT_55, fontSize: "0.83rem", mb: 1.5 }}>
                    The file differs per send — your trigger payload supplies its URL or Drive id
                    under this variable.
                </Typography>
                <Stack spacing={2}>
                    <TextField
                        autoFocus
                        value={varName}
                        onChange={(e) => setVarName(e.target.value)}
                        fullWidth
                        size="small"
                        sx={darkField}
                        placeholder="invoice_url"
                        helperText={clean ? `Resolves {{${clean}}} at send` : "variable name"}
                        FormHelperTextProps={{ sx: { color: "var(--fg-faint)" } }}
                    />
                    <TextField
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        fullWidth
                        size="small"
                        sx={darkField}
                        placeholder="Filename (optional, may use {{vars}})"
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={onClose} sx={{ ...GHOST_BTN, py: 0.7 }}>
                    Cancel
                </Button>
                <Button
                    onClick={() => clean && onAdd(clean, filename.trim())}
                    disabled={!clean}
                    sx={PRIMARY_BTN}
                >
                    Add
                </Button>
            </DialogActions>
        </Dialog>
    );
}
