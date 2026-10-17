"use client";

import {
    Check as CheckIcon,
    ContentCopy as ContentCopyIcon,
} from "@mui/icons-material";
import { Box, IconButton, Tooltip } from "@mui/material";
import { useState } from "react";

interface CodeBlockProps {
    code: string;
    language?: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy code: ", err);
        }
    };

    return (
        <Box
            sx={{
                position: "relative",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                p: 2,
                mb: 2,
                "&:hover .copy-btn": {
                    opacity: 1,
                },
            }}
        >
            <Tooltip title={copied ? "Copied!" : "Copy code"}>
                <IconButton
                    className="copy-btn"
                    onClick={handleCopy}
                    size="small"
                    sx={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        color: copied ? "#ff7759" : "var(--fg-faint)",
                        bgcolor: "var(--overlay)",
                        opacity: { xs: 1, md: 0 },
                        transition: "all 0.2s ease",
                        "&:hover": {
                            bgcolor: "var(--overlay)",
                            color: "var(--fg)",
                        },
                    }}
                >
                    {copied ? (
                        <CheckIcon sx={{ fontSize: "0.95rem" }} />
                    ) : (
                        <ContentCopyIcon sx={{ fontSize: "0.95rem" }} />
                    )}
                </IconButton>
            </Tooltip>
            <Box
                component="pre"
                sx={{
                    margin: 0,
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: "0.82rem",
                    color: "var(--fg)",
                    overflowX: "auto",
                    whiteSpace: "pre",
                    pr: 4,
                    "&::-webkit-scrollbar": {
                        height: "6px",
                    },
                    "&::-webkit-scrollbar-thumb": {
                        bgcolor: "var(--border)",
                        borderRadius: "3px",
                    },
                }}
            >
                {code}
            </Box>
        </Box>
    );
}
