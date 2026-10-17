"use client";
export const runtime = "edge";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

interface ServiceDetail {
    client_id: string;
    name: string;
    description: string | null;
    homepage_url: string | null;
    logo_url: string | null;
    scopes: string[];
    first_authorized: string;
    last_authorized: string;
    active_sessions: number;
    total_sign_ins: number;
    sign_in_timeline: Array<{ date: string; count: number }>;
}

const cardSx = {
    p: 3,
    borderRadius: "14px",
    bgcolor: "var(--surface)",
    border: "1px solid var(--border)",
};

const ServiceDetailPage = ({
    params,
}: {
    params: Promise<{ client_id: string }>;
}) => {
    const { client_id } = use(params);
    const router = useRouter();

    const [svc, setSvc] = useState<ServiceDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `/api/auth/connected-services/${client_id}`,
                );
                if (!res.ok) {
                    if (res.status === 404) {
                        setError(
                            "You're not connected to this app, or it doesn't exist.",
                        );
                    } else {
                        setError("Failed to load app details");
                    }
                    return;
                }
                const data: any = await res.json();
                if (!cancelled) setSvc(data);
            } catch {
                if (!cancelled) setError("Network error");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [client_id]);

    const revoke = async () => {
        if (!svc) return;
        const ok = confirm(
            `Revoke ${svc.name}? This signs you out of the app everywhere and clears its permissions.`,
        );
        if (!ok) return;
        setRevoking(true);
        try {
            const res = await fetch(
                `/api/auth/connected-services?client_id=${svc.client_id}`,
                { method: "DELETE" },
            );
            if (res.ok) {
                router.push("/dashboard/services");
            } else {
                setRevoking(false);
            }
        } catch {
            setRevoking(false);
        }
    };

    if (loading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "60vh",
                }}
            >
                <CircularProgress sx={{ color: "#ff7759" }} />
            </Box>
        );
    }

    if (error || !svc) {
        return (
            <Box sx={{ maxWidth: 720, mx: "auto", px: 3, py: 6 }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => router.push("/dashboard/services")}
                    sx={{
                        color: "var(--fg-muted)",
                        textTransform: "none",
                        mb: 3,
                    }}
                >
                    Back to Services
                </Button>
                <Box sx={cardSx}>
                    <Typography sx={{ color: "var(--fg-muted)" }}>
                        {error || "Not found"}
                    </Typography>
                </Box>
            </Box>
        );
    }

    const hostname = svc.homepage_url
        ? (() => {
              try {
                  return new URL(svc.homepage_url).hostname;
              } catch {
                  return "";
              }
          })()
        : "";

    const maxC = Math.max(1, ...svc.sign_in_timeline.map((p) => p.count));

    // Icon: explicit logo_url > favicon (via google's s2 service) > first
    // letter fallback. The state machine is rendered below in the JSX.
    const faviconSrc =
        !svc.logo_url && hostname
            ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`
            : null;

    return (
        <Box sx={{ maxWidth: 880, mx: "auto", px: 3, py: 5 }}>
            <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => router.push("/dashboard/services")}
                sx={{
                    color: "var(--fg-faint)",
                    textTransform: "none",
                    mb: 3,
                    "&:hover": {
                        color: "var(--fg)",
                        background: "var(--overlay)",
                    },
                }}
            >
                Back to Services
            </Button>

            {/* Header card — app identity + revoke */}
            <Box sx={{ ...cardSx, mb: 3 }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2.5,
                        mb: 2,
                    }}
                >
                    <Box
                        sx={{
                            width: 56,
                            height: 56,
                            borderRadius: "12px",
                            overflow: "hidden",
                            bgcolor: "var(--overlay)",
                            border: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        <ServiceHeaderIcon
                            logoUrl={svc.logo_url}
                            faviconSrc={faviconSrc}
                            name={svc.name}
                        />
                    </Box>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                            sx={{
                                color: "var(--fg)",
                                fontWeight: 700,
                                fontSize: "1.4rem",
                                lineHeight: 1.2,
                            }}
                        >
                            {svc.name}
                        </Typography>
                        {hostname && (
                            <Typography
                                component="a"
                                href={svc.homepage_url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.85rem",
                                    fontFamily:
                                        "var(--font-geist-mono), monospace",
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    mt: 0.5,
                                    "&:hover": { color: "#ff7759" },
                                }}
                            >
                                {hostname}
                                <OpenInNewIcon sx={{ fontSize: "0.85rem" }} />
                            </Typography>
                        )}
                    </Box>
                    <Button
                        size="small"
                        startIcon={<LinkOffIcon />}
                        onClick={revoke}
                        disabled={revoking}
                        sx={{
                            color: "var(--fg-faint)",
                            textTransform: "none",
                            borderRadius: "8px",
                            border: "1px solid var(--border)",
                            px: 1.5,
                            "&:hover": {
                                color: "#b91c1c",
                                borderColor: "rgba(239,68,68,0.4)",
                                bgcolor: "rgba(239,68,68,0.08)",
                            },
                        }}
                    >
                        {revoking ? "..." : "Revoke access"}
                    </Button>
                </Box>

                {svc.description && (
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.95rem",
                            lineHeight: 1.6,
                            mb: 2.5,
                        }}
                    >
                        {svc.description}
                    </Typography>
                )}

                <Divider
                    sx={{
                        borderColor: "var(--border)",
                        mb: 2.5,
                    }}
                />

                {/* Scopes */}
                <Box>
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            mb: 1.25,
                        }}
                    >
                        Permissions granted
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                        {svc.scopes.length > 0 ? (
                            svc.scopes.map((s) => (
                                <Chip
                                    key={s}
                                    label={s}
                                    size="small"
                                    sx={{
                                        bgcolor: "rgba(255, 119, 89,0.1)",
                                        color: "#ff7759",
                                        border: "1px solid rgba(255, 119, 89,0.25)",
                                        fontFamily:
                                            "var(--font-geist-mono), monospace",
                                        fontSize: "0.72rem",
                                    }}
                                />
                            ))
                        ) : (
                            <Typography
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontSize: "0.85rem",
                                }}
                            >
                                No scopes recorded.
                            </Typography>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* Stats row */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "1fr 1fr",
                        sm: "repeat(4, 1fr)",
                    },
                    gap: 2,
                    mb: 3,
                }}
            >
                <StatTile label="Total sign-ins" value={svc.total_sign_ins} />
                <StatTile label="Active sessions" value={svc.active_sessions} />
                <StatTile
                    label="First authorized"
                    value={new Date(svc.first_authorized).toLocaleDateString(
                        undefined,
                        {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        },
                    )}
                />
                <StatTile
                    label="Last sign-in"
                    value={new Date(svc.last_authorized).toLocaleDateString(
                        undefined,
                        {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        },
                    )}
                />
            </Box>

            {/* Sign-in timeline */}
            <Box sx={cardSx}>
                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        mb: 2,
                    }}
                >
                    Sign-ins · last 30 days
                </Typography>
                {svc.sign_in_timeline.length === 0 ? (
                    <Typography
                        sx={{
                            color: "var(--fg-faint)",
                            fontStyle: "italic",
                            fontSize: "0.9rem",
                            py: 3,
                            textAlign: "center",
                        }}
                    >
                        No sign-ins in the last 30 days.
                    </Typography>
                ) : (
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "flex-end",
                            gap: "4px",
                            height: 120,
                        }}
                    >
                        {svc.sign_in_timeline.map((p) => (
                            <Box
                                key={p.date}
                                title={`${p.date}: ${p.count}`}
                                sx={{
                                    flex: "1 1 0",
                                    maxWidth: 36,
                                    height: `${Math.max((p.count / maxC) * 100, 4)}%`,
                                    borderRadius: "3px 3px 0 0",
                                    background:
                                        "linear-gradient(180deg, rgba(255, 119, 89,0.95) 0%, rgba(255, 119, 89,0.55) 100%)",
                                    transition: "filter 0.15s ease",
                                    "&:hover": {
                                        filter: "brightness(1.25)",
                                    },
                                }}
                            />
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
};

function ServiceHeaderIcon({
    logoUrl,
    faviconSrc,
    name,
}: {
    logoUrl: string | null;
    faviconSrc: string | null;
    name: string;
}) {
    // Tracks which source failed so we fall through cleanly: logo → favicon
    // → letter. Without these flags an onError-loop on the favicon would
    // never reach the letter fallback.
    const [logoFailed, setLogoFailed] = useState(false);
    const [favFailed, setFavFailed] = useState(false);

    if (logoUrl && !logoFailed) {
        return (
            <img
                src={logoUrl}
                alt={name}
                width={56}
                height={56}
                onError={() => setLogoFailed(true)}
                style={{
                    objectFit: "cover",
                    width: "100%",
                    height: "100%",
                }}
            />
        );
    }
    if (faviconSrc && !favFailed) {
        return (
            <img
                src={faviconSrc}
                alt={name}
                width={32}
                height={32}
                onError={() => setFavFailed(true)}
                style={{ objectFit: "contain" }}
            />
        );
    }
    return (
        <Typography
            sx={{
                color: "#ff7759",
                fontWeight: 700,
                fontSize: "1.5rem",
            }}
        >
            {name.slice(0, 1).toUpperCase()}
        </Typography>
    );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
    return (
        <Box sx={cardSx}>
            <Typography
                sx={{
                    color: "var(--fg-faint)",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    mb: 0.5,
                }}
            >
                {label}
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg)",
                    fontWeight: 700,
                    fontSize: "1.5rem",
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {value}
            </Typography>
        </Box>
    );
}

export default ServiceDetailPage;
