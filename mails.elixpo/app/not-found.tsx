import { Box, Button, Stack, Typography } from "@mui/material";
import Image from "next/image";
import Link from "next/link";

const INK = "#212121";
const SLATE = "#75758a";
const HAIRLINE = "#d9d9dd";

const PRIMARY = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.92rem",
    color: "#fff",
    px: 3,
    py: 1.1,
    borderRadius: "32px", // Pill
    background: "#17171c",
    boxShadow: "none",
    fontFamily: "var(--font-sans)",
    "&:hover": { background: "#000" },
};

const GHOST = {
    textTransform: "none" as const,
    fontWeight: 500,
    fontSize: "0.92rem",
    color: INK,
    px: 2.8,
    py: 1.1,
    borderRadius: "32px", // Pill outline
    border: `1px solid ${HAIRLINE}`,
    fontFamily: "var(--font-sans)",
    "&:hover": { borderColor: INK, background: "rgba(0,0,0,0.02)" },
};

export default function NotFound() {
    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "grid",
                placeItems: "center",
                px: 3,
                background: "#ffffff",
                color: INK,
            }}
        >
            <Stack alignItems="center" textAlign="center" spacing={3.5} sx={{ maxWidth: 460 }}>
                <Image
                    src="/logo.png"
                    alt="Elixpo Mails"
                    width={52}
                    height={52}
                    style={{ borderRadius: 12 }}
                />
                <Box>
                    <Typography
                        sx={{
                            fontWeight: 500,
                            fontSize: { xs: "5rem", md: "6.5rem" },
                            lineHeight: 1,
                            letterSpacing: "-0.04em",
                            color: "#000000",
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        404
                    </Typography>
                    <Typography
                        sx={{
                            fontWeight: 500,
                            fontSize: "1.45rem",
                            mt: 1.5,
                            letterSpacing: "-0.02em",
                            color: "#000000",
                            fontFamily: "var(--font-display)",
                        }}
                    >
                        Lost in the outbox
                    </Typography>
                    <Typography
                        sx={{
                            color: SLATE,
                            fontSize: "0.98rem",
                            mt: 1.5,
                            lineHeight: 1.6,
                            fontFamily: "var(--font-sans)",
                        }}
                    >
                        This page didn&rsquo;t make it to the inbox. The link may be broken or the
                        page may have moved.
                    </Typography>
                </Box>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ width: "100%", justifyContent: "center" }}
                >
                    <Button component={Link} href="/" sx={PRIMARY}>
                        Back home
                    </Button>
                    <Button component={Link} href="/docs" sx={GHOST}>
                        Read the docs
                    </Button>
                </Stack>
            </Stack>
        </Box>
    );
}
