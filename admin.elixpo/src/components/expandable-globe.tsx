"use client";

import { C, TopList } from "@/components/ui";
import type { Dim } from "@/lib/metrics";
import { Fullscreen } from "@mui/icons-material";
import { Box, Dialog, IconButton, Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { useState } from "react";

const Globe = dynamic(() => import("@/components/globe"), { ssr: false });

export default function ExpandableGlobe({
    country,
    size = 300,
}: { country: Dim[]; size?: number }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Box sx={{ position: "relative" }}>
                <IconButton
                    size="small"
                    onClick={() => setOpen(true)}
                    title="Expand globe"
                    sx={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        zIndex: 2,
                        color: C.textMuted,
                        "&:hover": { color: C.accentLight },
                    }}
                >
                    <Fullscreen fontSize="small" />
                </IconButton>
                <Globe country={country} size={size} />
            </Box>

            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                maxWidth="md"
                fullWidth
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: "rgba(15,17,26,0.98)",
                            backdropFilter: "blur(18px)",
                            border: `1px solid ${C.border}`,
                            borderRadius: "16px",
                        },
                    },
                }}
            >
                <Box sx={{ p: 3 }}>
                    <Typography
                        sx={{
                            color: C.text,
                            fontWeight: 700,
                            fontSize: "1rem",
                            mb: 2,
                        }}
                    >
                        Requests by country
                    </Typography>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" },
                            gap: 3,
                            alignItems: "center",
                        }}
                    >
                        <Globe country={country} size={440} />
                        <Box sx={{ maxHeight: 440, overflowY: "auto" }}>
                            <TopList
                                items={country.map((c) => ({
                                    label: c.label,
                                    value: c.count,
                                }))}
                            />
                        </Box>
                    </Box>
                </Box>
            </Dialog>
        </>
    );
}
