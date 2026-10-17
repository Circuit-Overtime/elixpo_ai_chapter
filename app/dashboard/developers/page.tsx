"use client";

export const runtime = "edge";

import { Box, CircularProgress } from "@mui/material";
import { useEffect } from "react";

/** Developers merged into Products (1 product = 1 app). Redirect for old links. */
export default function DevelopersRedirect() {
    useEffect(() => {
        window.location.replace("/dashboard/products");
    }, []);
    return (
        <Box sx={{ display: "grid", placeItems: "center", py: 12 }}>
            <CircularProgress sx={{ color: "#9b7bf7" }} />
        </Box>
    );
}
