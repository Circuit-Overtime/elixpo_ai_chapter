import { Box } from "@mui/material";
import type { Metadata } from "next";
import BackgroundAurora from "../components/background-aurora";

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

/**
 * Shared chrome for the 2FA challenge surface — /mfa and
 * /mfa/setup-required. No navbar: the user is either mid-challenge (not
 * fully signed in yet) or behind the hard wall, so we don't surface
 * navigation that would let them slip past either gate.
 *
 * Uses the same `variant="auth"` aurora as /login so the visual flow
 * from sign-in → 2FA stays continuous.
 */
export default function MfaLayout({ children }: { children: React.ReactNode }) {
    return (
        <Box sx={{ position: "relative", minHeight: "100vh" }}>
            <BackgroundAurora variant="auth" />
            <Box sx={{ position: "relative", zIndex: 1 }}>{children}</Box>
        </Box>
    );
}
