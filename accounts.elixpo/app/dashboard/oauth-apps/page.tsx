"use client";

import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Paper,
    Snackbar,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CustomOAuthScope } from "@/lib/oauth-scope-registry";
import { generatePixelAvatar } from "@/lib/pixel-avatar";
import { OAuthScopePicker } from "../../components/oauth-scope-picker";

interface OAuthApp {
    client_id: string;
    name: string;
    homepage_url?: string;
    logo_url?: string;
    description?: string;
    created_at: string;
    is_active: boolean;
    redirect_uris?: string[];
    client_type?: "confidential" | "public";
    audience?: string | null;
}

interface CreateAppResponse {
    client_id: string;
    client_secret?: string;
    client_type: "confidential" | "public";
    audience?: string | null;
    name: string;
    redirect_uris: string[];
    scopes: string[];
    created_at: string;
}

const textFieldSx = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        background: "transparent",
        "& fieldset": { borderColor: "var(--border)" },
        "&:hover fieldset": { borderColor: "var(--border)" },
        "&.Mui-focused fieldset": { borderColor: "#ff7759" },
    },
    "& .MuiInputLabel-root": { color: "var(--fg-muted)" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#ff7759" },
    "& .MuiFormHelperText-root": { color: "var(--fg-faint)" },
};

const tableHeadSx = {
    "& .MuiTableCell-head": {
        color: "#ff7759",
        fontWeight: 600,
        backgroundColor: "rgba(255, 119, 89,0.05)",
        borderColor: "rgba(255, 119, 89,0.2)",
    },
};

const tableBodySx = {
    "& .MuiTableCell-body": {
        color: "var(--fg)",
        borderColor: "var(--border)",
    },
    "& .MuiTableRow-root:hover": {
        backgroundColor: "var(--overlay)",
    },
};

// Prefer the configured brand asset, then the app's own favicon and a cached
// favicon lookup before falling back to a generated avatar.
function faviconSources(homepageUrl?: string, logoUrl?: string): string[] {
    const sources = logoUrl ? [logoUrl] : [];
    if (!homepageUrl) return sources;
    try {
        const u = new URL(homepageUrl);
        sources.push(
            `${u.origin}/favicon.ico`,
            `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`,
        );
        return [...new Set(sources)];
    } catch {
        return sources;
    }
}

function AppIcon({ app, size = 28 }: { app: OAuthApp; size?: number }) {
    const [stage, setStage] = useState(0);
    const sources = faviconSources(app.homepage_url, app.logo_url);
    useEffect(() => setStage(0), []);
    const src =
        stage < sources.length
            ? sources[stage]
            : generatePixelAvatar(app.client_id + app.name, size);
    return (
        <Box
            component="img"
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            sx={{
                width: size,
                height: size,
                borderRadius: "6px",
                flexShrink: 0,
                background: "var(--surface)",
            }}
            onError={() => stage < sources.length && setStage((s) => s + 1)}
        />
    );
}

const OAuthAppsPage = () => {
    const [apps, setApps] = useState<OAuthApp[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [openSecretDialog, setOpenSecretDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [appLoading, setAppLoading] = useState(true);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [newAppData, setNewAppData] = useState<CreateAppResponse | null>(
        null,
    );
    const [secretCopied, setSecretCopied] = useState(false);
    const [idCopied, setIdCopied] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [appFilter, setAppFilter] = useState<"all" | "web" | "device">("all");
    const filteredApps = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return apps.filter((app) => {
            const clientType = app.client_type || "confidential";
            if (appFilter === "web" && clientType !== "confidential") {
                return false;
            }
            if (appFilter === "device" && clientType !== "public") {
                return false;
            }
            if (!query) return true;
            return [
                app.name,
                app.client_id,
                app.homepage_url,
                app.description,
            ].some((value) => value?.toLowerCase().includes(query));
        });
    }, [appFilter, apps, searchQuery]);

    const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: "success" | "error" | "warning";
    }>({ open: false, message: "", severity: "success" });
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        clientId: string;
        appName: string;
    }>({ open: false, clientId: "", appName: "" });

    const [formData, setFormData] = useState({
        name: "",
        homepage_url: "",
        logo_url: "",
        description: "",
        redirect_uris: [""],
        client_type: "confidential" as "confidential" | "public",
        audience: "",
        scopes: ["openid", "profile", "email"],
        custom_scopes: [] as CustomOAuthScope[],
    });

    // useCallback gives stable refs so the auth/apps fetches don't loop
    // when eslint-react-hooks puts them in the useEffect deps array.
    const fetchVerificationStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me", { credentials: "include" });
            if (res.ok) {
                const data: any = await res.json();
                setEmailVerified(data.emailVerified ?? false);
            }
        } catch {
            // fail silently
        }
    }, []);

    const fetchApps = useCallback(async () => {
        try {
            setAppLoading(true);
            const response = await fetch("/api/auth/oauth-apps", {
                credentials: "include",
            });
            if (!response.ok) throw new Error("Failed to fetch applications");
            const data: any = await response.json();
            setApps(data.apps || []);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to load applications",
            );
        } finally {
            setAppLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchApps();
        fetchVerificationStatus();
    }, [fetchApps, fetchVerificationStatus]);

    const showToast = (
        message: string,
        severity: "success" | "error" | "warning",
    ) => {
        setToast({ open: true, message, severity });
    };

    const handleCreateApp = async () => {
        setError("");

        if (!formData.name.trim()) {
            setError("Application name is required");
            return;
        }
        if (!formData.homepage_url.trim()) {
            setError("Homepage URL is required");
            return;
        }
        if (formData.logo_url.trim()) {
            try {
                const logoUrl = new URL(formData.logo_url.trim());
                if (
                    logoUrl.protocol !== "https:" &&
                    logoUrl.protocol !== "http:"
                ) {
                    setError("App icon URL must use HTTP or HTTPS");
                    return;
                }
            } catch {
                setError("App icon URL must be a valid URL");
                return;
            }
        }
        const uris = formData.redirect_uris
            .map((u) => u.trim())
            .filter(Boolean);
        if (formData.client_type === "confidential" && uris.length === 0) {
            setError("At least one redirect URI is required");
            return;
        }
        if (formData.client_type === "public" && !formData.audience.trim()) {
            setError("A resource audience is required for public clients");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/api/auth/oauth-clients", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    homepage_url: formData.homepage_url,
                    logo_url: formData.logo_url.trim() || undefined,
                    description: formData.description || undefined,
                    redirect_uris: uris,
                    scopes: formData.scopes,
                    custom_scopes: formData.custom_scopes,
                    client_type: formData.client_type,
                    audience:
                        formData.client_type === "public"
                            ? formData.audience.trim()
                            : undefined,
                }),
            });

            if (!response.ok) {
                const errorData: any = await response.json();
                throw new Error(
                    errorData.error || "Failed to create application",
                );
            }

            const data: any = await response.json();
            setNewAppData(data);
            setOpenSecretDialog(true);
            setOpenDialog(false);
            setFormData({
                name: "",
                homepage_url: "",
                logo_url: "",
                description: "",
                redirect_uris: [""],
                client_type: "confidential",
                audience: "",
                scopes: ["openid", "profile", "email"],
                custom_scopes: [],
            });
            setSuccessMessage("Application registered successfully!");
            await fetchApps();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to create application",
            );
        } finally {
            setLoading(false);
        }
    };

    const handleCopyToClipboard = (text: string, type: "secret" | "id") => {
        navigator.clipboard.writeText(text);
        if (type === "secret") {
            setSecretCopied(true);
            setTimeout(() => setSecretCopied(false), 2000);
        } else {
            setIdCopied(true);
            setTimeout(() => setIdCopied(false), 2000);
        }
    };

    const handleDeleteApp = async (clientId: string) => {
        try {
            const response = await fetch(
                `/api/auth/oauth-clients/${clientId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );
            if (!response.ok) throw new Error("Failed to delete application");
            showToast("Application deleted successfully", "success");
            setDeleteConfirm({ open: false, clientId: "", appName: "" });
            await fetchApps();
        } catch (err) {
            showToast(
                err instanceof Error
                    ? err.message
                    : "Failed to delete application",
                "error",
            );
            setDeleteConfirm({ open: false, clientId: "", appName: "" });
        }
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setError("");
        setFormData({
            name: "",
            homepage_url: "",
            logo_url: "",
            description: "",
            redirect_uris: [""],
            client_type: "confidential",
            audience: "",
            scopes: ["openid", "profile", "email"],
            custom_scopes: [],
        });
    };

    const dialogPaperSx = {
        backdropFilter: "blur(20px)",
        background:
            "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.95) 100%)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
    };

    return (
        <Box>
            <Box>
                {/* Header */}
                <Box
                    sx={{
                        mb: 4,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                    }}
                >
                    <Box>
                        <Typography
                            variant="h4"
                            sx={{ fontWeight: 700, color: "var(--fg)", mb: 1 }}
                        >
                            OAuth Applications
                        </Typography>
                        <Typography sx={{ color: "var(--fg-faint)" }}>
                            Register applications to allow users to sign in with
                            their SSO based Account.
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        disableElevation
                        aria-label="New OAuth App"
                        onClick={() => {
                            if (emailVerified === false) {
                                showToast(
                                    "Please verify your email address before registering an OAuth application.",
                                    "warning",
                                );
                                return;
                            }
                            setOpenDialog(true);
                        }}
                        // Below sm: collapse to a square icon-only FAB-style
                        // button to reclaim header width on phones. The
                        // label content stays the same; only the surface
                        // changes via responsive sx.
                        sx={{
                            background: "rgba(255, 119, 89,0.15)",
                            color: "#ff7759",
                            border: "1px solid rgba(255, 119, 89,0.3)",
                            fontWeight: 600,
                            textTransform: "none",
                            boxShadow: "none",
                            "&:hover": {
                                background: "rgba(255, 119, 89,0.25)",
                                borderColor: "rgba(255, 119, 89,0.5)",
                                boxShadow: "none",
                            },
                            minWidth: { xs: 44, sm: "auto" },
                            width: { xs: 44, sm: "auto" },
                            height: { xs: 44, sm: "auto" },
                            p: { xs: 0, sm: undefined },
                            px: { xs: 0, sm: 3 },
                            py: { xs: 0, sm: 1.2 },
                            fontSize: { xs: 0, sm: "1rem" },
                            "& .MuiButton-startIcon": {
                                m: { xs: 0, sm: undefined },
                            },
                        }}
                        startIcon={<AddIcon />}
                    >
                        New OAuth App
                    </Button>
                </Box>

                {/* Messages */}
                {error && (
                    <Alert
                        severity="error"
                        onClose={() => setError("")}
                        sx={{
                            mb: 2,
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            color: "#b91c1c",
                            borderColor: "rgba(239, 68, 68, 0.3)",
                        }}
                    >
                        {error}
                    </Alert>
                )}
                {successMessage && (
                    <Alert
                        severity="success"
                        onClose={() => setSuccessMessage("")}
                        sx={{
                            mb: 2,
                            backgroundColor: "rgba(255, 119, 89,0.1)",
                            color: "#ff7759",
                            borderColor: "rgba(255, 119, 89,0.3)",
                        }}
                    >
                        {successMessage}
                    </Alert>
                )}

                {apps.length > 0 && (
                    <>
                        <Tabs
                            value={appFilter}
                            onChange={(_, value: "all" | "web" | "device") =>
                                setAppFilter(value)
                            }
                            sx={{
                                mb: 2,
                                minHeight: 40,
                                borderBottom: "1px solid var(--border)",
                                "& .MuiTab-root": {
                                    minHeight: 40,
                                    color: "var(--fg-faint)",
                                    textTransform: "none",
                                    fontWeight: 600,
                                },
                                "& .Mui-selected": { color: "#ff7759" },
                                "& .MuiTabs-indicator": {
                                    backgroundColor: "#ff7759",
                                },
                            }}
                        >
                            <Tab value="all" label="All" />
                            <Tab value="web" label="Web Apps" />
                            <Tab value="device" label="Device Flow" />
                        </Tabs>
                        <TextField
                            fullWidth
                            value={searchQuery}
                            onChange={(event) =>
                                setSearchQuery(event.target.value)
                            }
                            placeholder="Search by app name, domain, or client ID"
                            aria-label="Search OAuth applications"
                            sx={{ ...textFieldSx, mb: 2 }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon
                                                sx={{
                                                    color: "var(--fg-faint)",
                                                }}
                                            />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                    </>
                )}

                {/* Applications Table */}
                <Box
                    sx={{
                        backdropFilter: "blur(20px)",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "16px",
                        overflow: "hidden",
                    }}
                >
                    {appLoading ? (
                        <Box
                            sx={{
                                p: 4,
                                textAlign: "center",
                                color: "var(--fg-faint)",
                            }}
                        >
                            Loading applications...
                        </Box>
                    ) : apps.length === 0 ? (
                        <Box sx={{ p: 6, textAlign: "center" }}>
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    mb: 1,
                                }}
                            >
                                No OAuth applications registered yet.
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{ color: "var(--fg-faint)" }}
                            >
                                Click "New OAuth App" to register your first
                                application.
                            </Typography>
                        </Box>
                    ) : filteredApps.length === 0 ? (
                        <Box sx={{ p: 6, textAlign: "center" }}>
                            <Typography sx={{ color: "var(--fg-faint)" }}>
                                {searchQuery.trim()
                                    ? `No applications match “${searchQuery}”.`
                                    : appFilter === "device"
                                      ? "No Device Flow applications registered."
                                      : "No Web applications registered."}
                            </Typography>
                        </Box>
                    ) : (
                        <TableContainer
                            component={Paper}
                            sx={{
                                background: "transparent",
                                boxShadow: "none",
                            }}
                        >
                            <Table>
                                <TableHead sx={tableHeadSx}>
                                    <TableRow>
                                        <TableCell>Application</TableCell>
                                        <TableCell>Client ID</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Created</TableCell>
                                        <TableCell align="right">
                                            Actions
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody sx={tableBodySx}>
                                    {filteredApps.map((app) => (
                                        <TableRow key={app.client_id}>
                                            <TableCell>
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 1.5,
                                                    }}
                                                >
                                                    <AppIcon
                                                        app={app}
                                                        size={28}
                                                    />
                                                    <Box>
                                                        <Typography
                                                            component={Link}
                                                            href={`/dashboard/oauth-apps/${app.client_id}`}
                                                            sx={{
                                                                fontWeight: 500,
                                                                color: "var(--fg)",
                                                                textDecoration:
                                                                    "none",
                                                                cursor: "pointer",
                                                                "&:hover": {
                                                                    color: "#ff7759",
                                                                    textDecoration:
                                                                        "underline",
                                                                    textUnderlineOffset:
                                                                        "3px",
                                                                },
                                                            }}
                                                        >
                                                            {app.name}
                                                        </Typography>
                                                        <Chip
                                                            size="small"
                                                            label={
                                                                app.client_type ===
                                                                "public"
                                                                    ? "Device Flow"
                                                                    : "Web Application"
                                                            }
                                                            sx={{
                                                                mt: 0.5,
                                                                height: 20,
                                                                bgcolor:
                                                                    app.client_type ===
                                                                    "public"
                                                                        ? "rgba(255, 119, 89, 0.12)"
                                                                        : "var(--overlay)",
                                                                color:
                                                                    app.client_type ===
                                                                    "public"
                                                                        ? "#ff7759"
                                                                        : "var(--fg-muted)",
                                                                border: "1px solid var(--border)",
                                                                fontSize:
                                                                    "0.65rem",
                                                            }}
                                                        />
                                                        {app.client_type ===
                                                            "public" &&
                                                            app.audience && (
                                                                <Typography
                                                                    variant="caption"
                                                                    sx={{
                                                                        display:
                                                                            "block",
                                                                        color: "var(--fg-faint)",
                                                                        fontSize:
                                                                            "0.68rem",
                                                                    }}
                                                                >
                                                                    Audience ·{" "}
                                                                    {
                                                                        app.audience
                                                                    }
                                                                </Typography>
                                                            )}
                                                        {app.homepage_url && (
                                                            <Typography
                                                                component="a"
                                                                href={
                                                                    app.homepage_url
                                                                }
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                variant="caption"
                                                                sx={{
                                                                    display:
                                                                        "block",
                                                                    color: "var(--fg-faint)",
                                                                    fontFamily:
                                                                        "monospace",
                                                                    fontSize:
                                                                        "0.7rem",
                                                                    textDecoration:
                                                                        "none",
                                                                    "&:hover": {
                                                                        color: "#ff7759",
                                                                        textDecoration:
                                                                            "underline",
                                                                    },
                                                                }}
                                                            >
                                                                {(() => {
                                                                    try {
                                                                        return new URL(
                                                                            app.homepage_url,
                                                                        )
                                                                            .hostname;
                                                                    } catch {
                                                                        return app.homepage_url;
                                                                    }
                                                                })()}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </TableCell>
                                            <TableCell
                                                sx={{
                                                    fontFamily: "monospace",
                                                    fontSize: "0.85rem",
                                                }}
                                            >
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 1,
                                                    }}
                                                >
                                                    {app.client_id.substring(
                                                        0,
                                                        20,
                                                    )}
                                                    …
                                                    <IconButton
                                                        size="small"
                                                        onClick={() =>
                                                            handleCopyToClipboard(
                                                                app.client_id,
                                                                "id",
                                                            )
                                                        }
                                                        sx={{
                                                            color: "#ff7759",
                                                            p: 0.5,
                                                        }}
                                                        title="Copy Client ID"
                                                    >
                                                        <ContentCopyIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={
                                                        app.is_active
                                                            ? "Active"
                                                            : "Inactive"
                                                    }
                                                    size="small"
                                                    sx={{
                                                        backgroundColor:
                                                            app.is_active
                                                                ? "rgba(255, 119, 89,0.2)"
                                                                : "rgba(107, 114, 128, 0.2)",
                                                        color: app.is_active
                                                            ? "#ff7759"
                                                            : "var(--fg-faint)",
                                                        border: "1px solid",
                                                        borderColor:
                                                            app.is_active
                                                                ? "rgba(255, 119, 89,0.3)"
                                                                : "rgba(107, 114, 128, 0.3)",
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell
                                                sx={{
                                                    fontSize: "0.9rem",
                                                    color: "var(--fg-faint)",
                                                }}
                                            >
                                                {new Date(
                                                    app.created_at,
                                                ).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Box
                                                    sx={{
                                                        display: "flex",
                                                        gap: 0.5,
                                                        justifyContent:
                                                            "flex-end",
                                                    }}
                                                >
                                                    <IconButton
                                                        size="small"
                                                        component={Link}
                                                        href={`/dashboard/oauth-apps/${app.client_id}`}
                                                        title="Settings"
                                                        sx={{
                                                            color: "var(--fg-faint)",
                                                            "&:hover": {
                                                                color: "var(--fg)",
                                                                bgcolor:
                                                                    "var(--overlay)",
                                                            },
                                                        }}
                                                    >
                                                        <SettingsIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() =>
                                                            setDeleteConfirm({
                                                                open: true,
                                                                clientId:
                                                                    app.client_id,
                                                                appName:
                                                                    app.name,
                                                            })
                                                        }
                                                        sx={{
                                                            color: "#ef4444",
                                                            "&:hover": {
                                                                backgroundColor:
                                                                    "rgba(239, 68, 68, 0.1)",
                                                            },
                                                        }}
                                                        title="Delete Application"
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            </Box>

            {/* Register Application Dialog */}
            <Dialog
                open={openDialog}
                onClose={handleCloseDialog}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: dialogPaperSx }}
            >
                <DialogTitle
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 700,
                        borderBottom: "1px solid var(--border)",
                    }}
                >
                    Register a new OAuth application
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Typography
                        variant="caption"
                        sx={{
                            color: "var(--fg-faint)",
                            display: "block",
                            mb: 2,
                        }}
                    >
                        Applications are registered to allow users to sign in
                        with their Elixpo account.
                    </Typography>

                    <TextField
                        fullWidth
                        label="Application name"
                        value={formData.name}
                        onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                        }
                        margin="dense"
                        placeholder="My Awesome App"
                        helperText="Something users will recognize and trust"
                        sx={textFieldSx}
                        disabled={loading}
                    />
                    <TextField
                        fullWidth
                        label="Homepage URL"
                        value={formData.homepage_url}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                homepage_url: e.target.value,
                            })
                        }
                        margin="dense"
                        placeholder="https://example.com"
                        helperText="The full URL to your application homepage"
                        sx={textFieldSx}
                        disabled={loading}
                    />
                    <TextField
                        fullWidth
                        type="url"
                        label="App icon URL"
                        value={formData.logo_url}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                logo_url: e.target.value,
                            })
                        }
                        margin="dense"
                        placeholder="https://example.com/icon.png"
                        helperText="Optional — falls back to your homepage favicon, then a generated icon"
                        sx={textFieldSx}
                        disabled={loading}
                    />
                    <TextField
                        fullWidth
                        label="Application description"
                        value={formData.description}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                description: e.target.value,
                            })
                        }
                        margin="dense"
                        placeholder="What does your application do?"
                        multiline
                        rows={2}
                        helperText="Optional — this is displayed to users on the OAuth consent screen"
                        sx={textFieldSx}
                        disabled={loading}
                    />
                    <Typography
                        sx={{
                            color: "var(--fg-muted)",
                            fontSize: "0.85rem",
                            mt: 2,
                            mb: 0.5,
                        }}
                    >
                        Application type
                    </Typography>
                    <Box
                        component="select"
                        value={formData.client_type}
                        onChange={(event) =>
                            setFormData({
                                ...formData,
                                client_type: event.target.value as
                                    | "confidential"
                                    | "public",
                            })
                        }
                        disabled={loading}
                        sx={{
                            width: "100%",
                            bgcolor: "var(--surface)",
                            color: "var(--fg)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            p: 1.25,
                        }}
                    >
                        <option value="confidential">Web Application</option>
                        <option value="public">Device Flow</option>
                    </Box>

                    {formData.client_type === "public" && (
                        <TextField
                            fullWidth
                            label="Resource audience"
                            value={formData.audience}
                            onChange={(event) =>
                                setFormData({
                                    ...formData,
                                    audience: event.target.value,
                                })
                            }
                            margin="dense"
                            placeholder="blogs.elixpo.com"
                            helperText="Host only. Device Flow apps never receive a client secret."
                            sx={textFieldSx}
                            disabled={loading}
                        />
                    )}
                    <Typography
                        sx={{
                            color: "var(--fg-muted)",
                            fontSize: "0.85rem",
                            mt: 2,
                            mb: 0.75,
                        }}
                    >
                        OAuth scopes
                    </Typography>
                    <OAuthScopePicker
                        selectedScopes={formData.scopes}
                        customScopes={formData.custom_scopes}
                        onSelectedScopesChange={(scopes) =>
                            setFormData({ ...formData, scopes })
                        }
                        onCustomScopesChange={(custom_scopes) =>
                            setFormData({ ...formData, custom_scopes })
                        }
                    />
                    <Typography
                        sx={{
                            color: "var(--fg-muted)",
                            fontSize: "0.85rem",
                            mt: 2,
                            mb: 0.5,
                        }}
                    >
                        Redirect URIs
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: "var(--fg-faint)",
                            display: "block",
                            mb: 1,
                        }}
                    >
                        {formData.client_type === "public"
                            ? "Optional for Device Flow apps"
                            : "The callback URLs where users return after authorization (up to 5)"}
                    </Typography>
                    {formData.redirect_uris.map((uri, index) => (
                        <Box
                            key={index}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                mb: 1,
                            }}
                        >
                            <TextField
                                fullWidth
                                size="small"
                                value={uri}
                                onChange={(e) => {
                                    const updated = [...formData.redirect_uris];
                                    updated[index] = e.target.value;
                                    setFormData({
                                        ...formData,
                                        redirect_uris: updated,
                                    });
                                }}
                                placeholder="https://example.com/auth/callback"
                                sx={textFieldSx}
                                disabled={loading}
                            />
                            {formData.redirect_uris.length > 1 && (
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const updated =
                                            formData.redirect_uris.filter(
                                                (_, i) => i !== index,
                                            );
                                        setFormData({
                                            ...formData,
                                            redirect_uris: updated,
                                        });
                                    }}
                                    sx={{
                                        color: "#ef4444",
                                        "&:hover": {
                                            bgcolor: "rgba(239,68,68,0.1)",
                                        },
                                    }}
                                    disabled={loading}
                                >
                                    <RemoveCircleOutlineIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                    ))}
                    {formData.redirect_uris.length < 5 && (
                        <Button
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={() =>
                                setFormData({
                                    ...formData,
                                    redirect_uris: [
                                        ...formData.redirect_uris,
                                        "",
                                    ],
                                })
                            }
                            sx={{
                                color: "#ff7759",
                                textTransform: "none",
                                fontSize: "0.8rem",
                                mt: 0.5,
                            }}
                            disabled={loading}
                        >
                            Add URI
                        </Button>
                    )}

                    {error && (
                        <Alert
                            severity="error"
                            sx={{
                                mt: 2,
                                backgroundColor: "rgba(239, 68, 68, 0.1)",
                                color: "#b91c1c",
                            }}
                        >
                            {error}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions
                    sx={{
                        borderTop: "1px solid var(--border)",
                        p: 2,
                    }}
                >
                    <Button
                        onClick={handleCloseDialog}
                        sx={{ color: "var(--fg-faint)" }}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreateApp}
                        variant="contained"
                        disableElevation
                        disabled={loading}
                        sx={{
                            background: "rgba(255, 119, 89,0.15)",
                            color: "#ff7759",
                            border: "1px solid rgba(255, 119, 89,0.3)",
                            fontWeight: 600,
                            "&:hover": {
                                background: "rgba(255, 119, 89,0.25)",
                            },
                            "&:disabled": { color: "var(--fg-faint)" },
                        }}
                    >
                        {loading ? "Registering..." : "Register application"}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirm.open}
                onClose={() =>
                    setDeleteConfirm({ open: false, clientId: "", appName: "" })
                }
                PaperProps={{ sx: dialogPaperSx }}
            >
                <DialogTitle
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 700,
                        borderBottom: "1px solid var(--border)",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <WarningAmberIcon sx={{ color: "#ef4444" }} />
                        Deactivate application
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Typography sx={{ color: "var(--fg-muted)", mb: 1 }}>
                        Are you sure you want to deactivate{" "}
                        <strong style={{ color: "var(--fg)" }}>
                            {deleteConfirm.appName}
                        </strong>
                        ?
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ color: "var(--fg-faint)" }}
                    >
                        This will immediately stop all OAuth authentication
                        requests for this application. This action cannot be
                        undone.
                    </Typography>
                </DialogContent>
                <DialogActions
                    sx={{
                        borderTop: "1px solid var(--border)",
                        p: 2,
                    }}
                >
                    <Button
                        onClick={() =>
                            setDeleteConfirm({
                                open: false,
                                clientId: "",
                                appName: "",
                            })
                        }
                        sx={{ color: "var(--fg-faint)" }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => handleDeleteApp(deleteConfirm.clientId)}
                        variant="contained"
                        disableElevation
                        sx={{
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "#ef4444",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            fontWeight: 600,
                            "&:hover": {
                                background: "rgba(239, 68, 68, 0.25)",
                            },
                        }}
                    >
                        Deactivate
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Secret Credentials Dialog */}
            <Dialog
                open={openSecretDialog}
                onClose={() => setOpenSecretDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: dialogPaperSx }}
            >
                <DialogTitle
                    sx={{
                        color: "var(--fg)",
                        fontWeight: 700,
                        borderBottom: "1px solid var(--border)",
                    }}
                >
                    Application registered
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Alert
                        severity={
                            newAppData?.client_type === "public"
                                ? "info"
                                : "warning"
                        }
                        sx={{
                            mb: 3,
                            backgroundColor: "rgba(251, 146, 60, 0.1)",
                            color: "#b45309",
                            borderColor: "rgba(251, 146, 60, 0.3)",
                        }}
                    >
                        {newAppData?.client_type === "public"
                            ? "Device Flow apps do not use a client secret."
                            : "Copy the client secret now. It will not be shown again."}
                    </Alert>

                    {newAppData && (
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2.5,
                            }}
                        >
                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.75,
                                    }}
                                >
                                    Client ID
                                </Typography>
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        background: "var(--surface)",
                                        p: 1.5,
                                        borderRadius: "8px",
                                        border: "1px solid rgba(255, 119, 89,0.2)",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: "#ff7759",
                                            fontFamily: "monospace",
                                            fontSize: "0.85rem",
                                            flex: 1,
                                            wordBreak: "break-all",
                                        }}
                                    >
                                        {newAppData.client_id}
                                    </Typography>
                                    <IconButton
                                        size="small"
                                        onClick={() =>
                                            handleCopyToClipboard(
                                                newAppData.client_id,
                                                "id",
                                            )
                                        }
                                        sx={{ color: "#ff7759" }}
                                    >
                                        <ContentCopyIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                                {idCopied && (
                                    <Typography
                                        sx={{
                                            color: "#ff7759",
                                            fontSize: "0.75rem",
                                            mt: 0.5,
                                        }}
                                    >
                                        Copied!
                                    </Typography>
                                )}
                            </Box>

                            {newAppData.client_secret && (
                                <Box>
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.8rem",
                                            mb: 0.75,
                                        }}
                                    >
                                        Client Secret
                                    </Typography>
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1,
                                            background: "var(--surface)",
                                            p: 1.5,
                                            borderRadius: "8px",
                                            border: "1px solid rgba(239, 68, 68, 0.2)",
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: "#ef4444",
                                                fontFamily: "monospace",
                                                fontSize: "0.85rem",
                                                flex: 1,
                                                wordBreak: "break-all",
                                            }}
                                        >
                                            {newAppData.client_secret}
                                        </Typography>
                                        <IconButton
                                            size="small"
                                            onClick={() =>
                                                handleCopyToClipboard(
                                                    newAppData.client_secret ||
                                                        "",
                                                    "secret",
                                                )
                                            }
                                            sx={{ color: "#ef4444" }}
                                        >
                                            <ContentCopyIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                    {secretCopied && (
                                        <Typography
                                            sx={{
                                                color: "#ef4444",
                                                fontSize: "0.75rem",
                                                mt: 0.5,
                                            }}
                                        >
                                            Copied!
                                        </Typography>
                                    )}
                                </Box>
                            )}

                            <Box>
                                <Typography
                                    sx={{
                                        color: "var(--fg-faint)",
                                        fontSize: "0.8rem",
                                        mb: 0.75,
                                    }}
                                >
                                    Scopes granted
                                </Typography>
                                <Box
                                    sx={{
                                        display: "flex",
                                        gap: 1,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {newAppData.scopes.map((scope) => (
                                        <Chip
                                            key={scope}
                                            label={scope}
                                            size="small"
                                            sx={{
                                                backgroundColor:
                                                    "rgba(255, 119, 89,0.1)",
                                                color: "#ff7759",
                                                border: "1px solid rgba(255, 119, 89,0.2)",
                                            }}
                                        />
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions
                    sx={{
                        borderTop: "1px solid var(--border)",
                        p: 2,
                    }}
                >
                    <Button
                        onClick={() => setOpenSecretDialog(false)}
                        variant="contained"
                        disableElevation
                        sx={{
                            background: "rgba(255, 119, 89,0.15)",
                            color: "#ff7759",
                            border: "1px solid rgba(255, 119, 89,0.3)",
                            "&:hover": {
                                background: "rgba(255, 119, 89,0.25)",
                            },
                        }}
                    >
                        I've saved my credentials
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Toast Snackbar */}
            <Snackbar
                open={toast.open}
                autoHideDuration={4000}
                onClose={() => setToast({ ...toast, open: false })}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setToast({ ...toast, open: false })}
                    severity={toast.severity}
                    variant="filled"
                    sx={{
                        ...(toast.severity === "warning" && {
                            backgroundColor: "#b45309",
                            color: "#fff",
                        }),
                        ...(toast.severity === "success" && {
                            backgroundColor: "#15803d",
                            color: "#fff",
                        }),
                        ...(toast.severity === "error" && {
                            backgroundColor: "#b91c1c",
                            color: "#fff",
                        }),
                    }}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default OAuthAppsPage;
