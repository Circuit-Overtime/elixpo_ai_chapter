"use client";

import LinkOffIcon from "@mui/icons-material/LinkOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Tab,
    Tabs,
    Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { generatePixelAvatar } from "@/lib/pixel-avatar";

interface ConnectedService {
    client_id: string;
    name: string;
    description?: string;
    homepage_url?: string;
    logo_url?: string;
    client_type?: "confidential" | "public";
    first_authorized: string;
    last_authorized: string;
}

function ServiceIcon({
    svc,
    size = 40,
}: {
    svc: ConnectedService;
    size?: number;
}) {
    const [faviconFailed, setFaviconFailed] = useState(false);
    const hostname = svc.homepage_url
        ? (() => {
              try {
                  return new URL(svc.homepage_url).hostname;
              } catch {
                  return "";
              }
          })()
        : "";

    if (svc.homepage_url && hostname && !faviconFailed) {
        return (
            <Box
                component="img"
                src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                alt=""
                sx={{
                    width: size,
                    height: size,
                    borderRadius: "10px",
                    flexShrink: 0,
                    bgcolor: "var(--overlay)",
                    p: 0.5,
                }}
                onError={() => setFaviconFailed(true)}
            />
        );
    }

    // Pixel avatar fallback
    return (
        <Box
            component="img"
            src={generatePixelAvatar(svc.client_id + svc.name, size)}
            alt=""
            sx={{
                width: size,
                height: size,
                borderRadius: "10px",
                flexShrink: 0,
            }}
        />
    );
}

// Only allow post-revoke redirects back to first-party elixpo.com hosts.
function _isSafeReturn(url: string): boolean {
    try {
        const u = new URL(url);
        return (
            u.protocol === "https:" &&
            (u.hostname === "elixpo.com" || u.hostname.endsWith(".elixpo.com"))
        );
    } catch {
        return false;
    }
}

const getSafeReturnPath = (value: string | null): string | null => {
    if (!value || typeof window === "undefined") return null;
    try {
        const url = new URL(value, window.location.origin);
        const isHttp = url.protocol === "http:" || url.protocol === "https:";
        if (!isHttp) return null;
        if (url.origin !== window.location.origin) return null;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return null;
    }
};

const ServicesPage = () => {
    const [services, setServices] = useState<ConnectedService[]>([]);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [paramHandled, setParamHandled] = useState(false);
    const [serviceType, setServiceType] = useState<"confidential" | "public">(
        "confidential",
    );
    const filteredServices = services.filter(
        (service) => (service.client_type || "confidential") === serviceType,
    );

    // Deep-link revoke: blogs.elixpo (and other first-party apps) send the user
    // here with ?revoke=<app>&return_to=<url>. Auto-trigger the revoke for the
    // matching connected app, then bounce them back so they're signed out there.
    useEffect(() => {
        if (loading || paramHandled || typeof window === "undefined") return;
        const sp = new URLSearchParams(window.location.search);
        const revoke = sp.get("revoke");
        const returnTo = sp.get("return_to");
        const safeReturnPath = getSafeReturnPath(returnTo);
        if (!revoke) return;
        setParamHandled(true);

        const needle = revoke.toLowerCase();
        const target = services.find(
            (s) =>
                s.name?.toLowerCase() === needle ||
                s.name?.toLowerCase().includes(needle) ||
                (s.homepage_url || "").toLowerCase().includes(needle),
        );
        if (!target) {
            // Not connected (or already revoked) — just send them back.
            if (safeReturnPath) window.location.href = safeReturnPath;
            return;
        }
        (async () => {
            const ok = confirm(
                `Revoke access for ${target.name}? This permanently deletes your ${target.name} account and all its data. This cannot be undone.`,
            );
            if (!ok) return;
            setRevoking(target.client_id);
            try {
                const res = await fetch(
                    `/api/auth/connected-services?client_id=${target.client_id}`,
                    { method: "DELETE", credentials: "include" },
                );
                if (res.ok) {
                    setServices((prev) =>
                        prev.filter((s) => s.client_id !== target.client_id),
                    );
                    if (safeReturnPath) {
                        window.location.href = safeReturnPath;
                        return;
                    }
                }
            } finally {
                setRevoking(null);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, services, paramHandled]);

    // eslint-disable-next-line react-hooks/exhaustive-deps

    // useCallback gives a stable reference so the effect doesn't loop when
    // eslint-react-hooks puts fetchServices in deps.
    const fetchServices = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/auth/connected-services", {
                credentials: "include",
            });
            if (res.ok) {
                const data: any = await res.json();
                setServices(data.services || []);
            }
        } catch {
            // fail silently
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchServices();
    }, [fetchServices]);

    const revokeService = async (clientId: string) => {
        if (
            !confirm(
                "Revoke access for this service? You will need to re-authorize it to use it again.",
            )
        )
            return;
        setRevoking(clientId);
        try {
            const res = await fetch(
                `/api/auth/connected-services?client_id=${clientId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );
            if (res.ok) {
                setServices((prev) =>
                    prev.filter((s) => s.client_id !== clientId),
                );
            }
        } catch {
            // fail silently
        } finally {
            setRevoking(null);
        }
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    sx={{ fontWeight: 700, color: "var(--fg)", mb: 1 }}
                >
                    Connected Services
                </Typography>
                <Typography sx={{ color: "var(--fg-faint)" }}>
                    Applications you've signed in to using your Elixpo account.
                </Typography>
            </Box>

            <Tabs
                value={serviceType}
                onChange={(_, value: "confidential" | "public") =>
                    setServiceType(value)
                }
                sx={{
                    mb: 3,
                    minHeight: 40,
                    borderBottom: "1px solid var(--border)",
                    "& .MuiTab-root": {
                        minHeight: 40,
                        color: "var(--fg-faint)",
                        textTransform: "none",
                        fontWeight: 600,
                    },
                    "& .Mui-selected": { color: "#ff7759" },
                    "& .MuiTabs-indicator": { backgroundColor: "#ff7759" },
                }}
            >
                <Tab value="confidential" label="Web Application" />
                <Tab value="public" label="Device Flow" />
            </Tabs>

            {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                    <CircularProgress sx={{ color: "#ff7759" }} />
                </Box>
            ) : services.length === 0 ? (
                <Box
                    sx={{
                        py: 8,
                        textAlign: "center",
                        borderRadius: "16px",
                        bgcolor: "var(--surface)",
                        border: "1px solid var(--border)",
                    }}
                >
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "1rem",
                            mb: 0.5,
                        }}
                    >
                        No connected services yet
                    </Typography>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.85rem",
                        }}
                    >
                        When you sign in to third-party apps using Elixpo,
                        they'll appear here.
                    </Typography>
                </Box>
            ) : filteredServices.length === 0 ? (
                <Box
                    sx={{
                        py: 6,
                        textAlign: "center",
                        borderRadius: "16px",
                        bgcolor: "var(--surface)",
                        border: "1px solid var(--border)",
                    }}
                >
                    <Typography sx={{ color: "var(--fg-faint)" }}>
                        No{" "}
                        {serviceType === "public"
                            ? "Device Flow"
                            : "Web Application"}{" "}
                        services connected
                    </Typography>
                </Box>
            ) : (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        gap: 2,
                    }}
                >
                    {filteredServices.map((svc) => {
                        const hostname = svc.homepage_url
                            ? (() => {
                                  try {
                                      return new URL(svc.homepage_url).hostname;
                                  } catch {
                                      return "";
                                  }
                              })()
                            : "";
                        // Make the whole card a link to the per-app detail
                        // page. Inner interactive elements (revoke button,
                        // hostname external link) stopPropagation so they
                        // don't navigate through the card.
                        return (
                            <Box
                                key={svc.client_id}
                                role="link"
                                tabIndex={0}
                                onClick={() => {
                                    window.location.href = `/dashboard/services/${svc.client_id}`;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        window.location.href = `/dashboard/services/${svc.client_id}`;
                                    }
                                }}
                                sx={{
                                    p: 2.5,
                                    borderRadius: "14px",
                                    bgcolor: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    transition:
                                        "border-color 0.2s, background-color 0.2s, transform 0.2s",
                                    cursor: "pointer",
                                    "&:hover": {
                                        borderColor: "rgba(255, 119, 89,0.45)",
                                        bgcolor: "rgba(255, 119, 89,0.04)",
                                        transform: "translateY(-1px)",
                                    },
                                    "&:focus-visible": {
                                        outline: "2px solid #ff7759",
                                        outlineOffset: 2,
                                    },
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 2,
                                }}
                            >
                                {/* Top row: icon + name + revoke */}
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                    }}
                                >
                                    <ServiceIcon svc={svc} size={44} />
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography
                                            sx={{
                                                color: "var(--fg)",
                                                fontWeight: 600,
                                                fontSize: "1rem",
                                            }}
                                        >
                                            {svc.name}
                                        </Typography>
                                        {hostname && (
                                            <Typography
                                                component="a"
                                                href={svc.homepage_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                                sx={{
                                                    color: "var(--fg-faint)",
                                                    fontSize: "0.75rem",
                                                    textDecoration: "none",
                                                    fontFamily: "monospace",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 0.5,
                                                    "&:hover": {
                                                        color: "#ff7759",
                                                    },
                                                }}
                                            >
                                                {hostname}
                                                <OpenInNewIcon
                                                    sx={{ fontSize: "0.7rem" }}
                                                />
                                            </Typography>
                                        )}
                                    </Box>
                                    <Button
                                        size="small"
                                        startIcon={<LinkOffIcon />}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            revokeService(svc.client_id);
                                        }}
                                        disabled={revoking === svc.client_id}
                                        sx={{
                                            color: "var(--fg-faint)",
                                            textTransform: "none",
                                            fontSize: "0.8rem",
                                            flexShrink: 0,
                                            borderRadius: "8px",
                                            px: 1.5,
                                            "&:hover": {
                                                color: "#b91c1c",
                                                bgcolor: "rgba(239,68,68,0.08)",
                                            },
                                        }}
                                    >
                                        {revoking === svc.client_id
                                            ? "..."
                                            : "Revoke"}
                                    </Button>
                                </Box>

                                {/* Description */}
                                {svc.description && (
                                    <Typography
                                        sx={{
                                            color: "var(--fg-faint)",
                                            fontSize: "0.85rem",
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {svc.description}
                                    </Typography>
                                )}

                                {/* Metadata chips */}
                                <Box
                                    sx={{
                                        display: "flex",
                                        gap: 1,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <Chip
                                        label={`Authorized ${new Date(svc.first_authorized).toLocaleDateString()}`}
                                        size="small"
                                        sx={{
                                            bgcolor: "var(--overlay)",
                                            color: "var(--fg-faint)",
                                            fontSize: "0.7rem",
                                            height: 22,
                                        }}
                                    />
                                    <Chip
                                        label={`Last used ${new Date(svc.last_authorized).toLocaleDateString()}`}
                                        size="small"
                                        sx={{
                                            bgcolor: "var(--overlay)",
                                            color: "var(--fg-faint)",
                                            fontSize: "0.7rem",
                                            height: 22,
                                        }}
                                    />
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
};

export default ServicesPage;
