"use client";

import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Button } from "@mui/material";
import { useState } from "react";
import { LLM_DOCS } from "../llm-content";

export default function CopyForLlm() {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(LLM_DOCS);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // ignore
        }
    };

    return (
        <Button
            onClick={copy}
            startIcon={
                copied ? (
                    <CheckIcon sx={{ fontSize: "1.05rem !important" }} />
                ) : (
                    <ContentCopyIcon sx={{ fontSize: "1.05rem !important" }} />
                )
            }
            sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.85rem",
                color: copied ? "var(--success)" : "var(--fg)",
                px: 1.8,
                py: 0.8,
                borderRadius: "10px",
                border: "1px solid var(--accent-border)",
                background: "var(--accent-tint)",
                "&:hover": {
                    borderColor: "var(--accent)",
                    background: "var(--accent-tint-strong)",
                },
            }}
        >
            {copied ? "Copied" : "Copy for LLM"}
        </Button>
    );
}
