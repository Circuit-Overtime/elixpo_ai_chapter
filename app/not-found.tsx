"use client";

import { Box, Button, Typography } from "@mui/material";
import Link from "next/link";

const NotFound = () => {
    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                    "linear-gradient(135deg, var(--bg) 0%, var(--surface) 50%, var(--bg) 100%)",
                p: 2,
            }}
        >
            <Box sx={{ maxWidth: "500px", width: "100%", textAlign: "center" }}>
                {/* Big 404 */}
                <Typography
                    sx={{
                        fontSize: "120px",
                        fontWeight: 800,
                        color: "#ff7759",
                        mb: 2,
                        lineHeight: 1,
                    }}
                >
                    404
                </Typography>

                {/* Animated background circles */}
                <Box sx={{ position: "relative", mb: 4 }}>
                    <Box
                        sx={{
                            position: "absolute",
                            width: "200px",
                            height: "200px",
                            border: "2px solid rgba(255, 119, 89, 0.2)",
                            borderRadius: "50%",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            animation: "spin 20s linear infinite",
                            "@keyframes spin": {
                                from: {
                                    transform:
                                        "translate(-50%, -50%) rotate(0deg)",
                                },
                                to: {
                                    transform:
                                        "translate(-50%, -50%) rotate(360deg)",
                                },
                            },
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            width: "150px",
                            height: "150px",
                            border: "2px solid rgba(255, 119, 89, 0.3)",
                            borderRadius: "50%",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            animation: "spin-reverse 15s linear infinite",
                            "@keyframes spin-reverse": {
                                from: {
                                    transform:
                                        "translate(-50%, -50%) rotate(360deg)",
                                },
                                to: {
                                    transform:
                                        "translate(-50%, -50%) rotate(0deg)",
                                },
                            },
                        }}
                    />
                    <Typography
                        sx={{
                            fontSize: "60px",
                            position: "relative",
                            zIndex: 1,
                        }}
                    >
                        ?
                    </Typography>
                </Box>

                <Typography
                    variant="h3"
                    sx={{ fontWeight: 700, color: "#f5f5f4", mb: 2 }}
                >
                    Page Not Found
                </Typography>

                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "1.1rem",
                        mb: 4,
                        lineHeight: 1.6,
                    }}
                >
                    The page you're looking for doesn't exist or has been moved.
                    Let's get you back on track.
                </Typography>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Link href="/" style={{ textDecoration: "none" }}>
                        <Button
                            fullWidth
                            variant="contained"
                            sx={{
                                background: "rgba(255, 119, 89, 0.15)",
                                color: "#ff7759",
                                border: "1px solid rgba(255, 119, 89, 0.3)",
                                fontWeight: 600,
                                py: 1.5,
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    background: "rgba(255, 119, 89, 0.25)",
                                    borderColor: "rgba(255, 119, 89, 0.5)",
                                },
                            }}
                        >
                            Go Home
                        </Button>
                    </Link>

                    <Link href="/login" style={{ textDecoration: "none" }}>
                        <Button
                            fullWidth
                            variant="outlined"
                            sx={{
                                color: "var(--fg-muted)",
                                border: "1px solid var(--border)",
                                fontWeight: 600,
                                py: 1.5,
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    borderColor: "rgba(25,40,55,0.4)",
                                    color: "#f5f5f4",
                                },
                            }}
                        >
                            Back to Login
                        </Button>
                    </Link>
                </Box>

                {/* Error Code */}
                <Typography
                    sx={{
                        color: "var(--fg-faint)",
                        fontSize: "0.85rem",
                        mt: 6,
                        fontFamily: "monospace",
                    }}
                >
                    Error Code: 404_PAGE_NOT_FOUND
                </Typography>
            </Box>
        </Box>
    );
};

export default NotFound;
