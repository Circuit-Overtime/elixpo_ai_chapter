"use client";

import { Box, Typography } from "@mui/material";
import Link from "next/link";

export default function OverviewPage() {
    return (
        <Box>
            <Typography
                variant="h1"
                sx={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "var(--fg)",
                    mb: 2,
                    letterSpacing: "-0.02em",
                }}
            >
                Overview
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 3,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                Elixpo Accounts is the central Single Sign-On (SSO) gateway and
                OAuth 2.0 Identity Provider for the Elixpo ecosystem. It allows
                users to authenticate once and access all services securely.
                Third-party applications can integrate with Elixpo Accounts to
                allow users to sign in using their Elixpo credentials.
            </Typography>

            <Typography
                variant="h2"
                sx={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: "var(--fg)",
                    mt: 4,
                    mb: 2,
                    letterSpacing: "-0.01em",
                }}
            >
                Core Capabilities
            </Typography>
            <Box
                component="ul"
                sx={{
                    color: "var(--fg-muted)",
                    pl: 3,
                    mb: 4,
                    "& li": { mb: 1.5, lineHeight: 1.6 },
                }}
            >
                <li>
                    <strong>Universal SSO:</strong> One account accesses every
                    app in the Elixpo ecosystem, including Chat, Art, Blogs, and
                    Sketch.
                </li>
                <li>
                    <strong>OAuth 2.0 Provider:</strong> Standard Authorization
                    Code Flow with Refresh Token rotation for secure, seamless
                    third-party integrations.
                </li>
                <li>
                    <strong>Passwordless Login:</strong> Secure
                    phishing-resistant authentication using WebAuthn / Passkeys.
                </li>
                <li>
                    <strong>Edge-Native Runtime:</strong> Optimized execution
                    globally on Cloudflare Pages and Cloudflare D1 with minimal
                    latency.
                </li>
                <li>
                    <strong>Developer Portal:</strong> Self-service portal to
                    register OAuth applications, subscribe to Webhooks, and
                    generate API Keys.
                </li>
            </Box>

            <Box
                sx={{
                    border: "1px solid rgba(255, 119, 89, 0.28)",
                    bgcolor: "rgba(255, 119, 89, 0.06)",
                    borderRadius: 3,
                    p: { xs: 2.5, sm: 3 },
                    mb: 4,
                }}
            >
                <Typography
                    variant="h2"
                    sx={{
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        color: "var(--fg)",
                        mt: "0 !important",
                        mb: 1,
                    }}
                >
                    Prefer a typed integration?
                </Typography>
                <Typography sx={{ color: "var(--fg-muted)", mb: 2 }}>
                    The <code>@elixpo/accounts</code> package handles discovery,
                    PKCE, authorization callbacks, token rotation, revocation,
                    and token verification.
                </Typography>
                <Link
                    href="/docs/lixaccounts"
                    style={{ color: "#ff7759", fontWeight: 700 }}
                >
                    Open the Developer SDK guide →
                </Link>
            </Box>

            <Typography
                variant="h2"
                sx={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    color: "var(--fg)",
                    mt: 4,
                    mb: 2,
                    letterSpacing: "-0.01em",
                }}
            >
                Architecture & Security
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 3,
                    fontSize: "1.0rem",
                    lineHeight: 1.7,
                }}
            >
                The authentication protocol follows standard OAuth 2.0 and
                OpenID Connect patterns. Token issuance comprises short-lived
                JWT Access Tokens (15 minutes expiry) signed using HS256 (Web
                Crypto API), combined with rotated Refresh Tokens. Refresh token
                rotation guarantees that every time a client refreshes an access
                token, the current refresh token is invalidated, and a new one
                is returned to prevent replay attacks.
            </Typography>
        </Box>
    );
}
