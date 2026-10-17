"use client";

import { Box, Chip, Typography } from "@mui/material";
import Link from "next/link";
import CodeBlock from "../../components/code-block";

const NODE_JS_EXAMPLE = `// 1. Generate authorization URL
const state = crypto.randomUUID();
const authUrl = \`https://accounts.elixpo.com/oauth/authorize?\` +
  \`response_type=code&client_id=\${CLIENT_ID}\` +
  \`&redirect_uri=\${encodeURIComponent(REDIRECT_URI)}\` +
  \`&state=\${state}&scope=openid profile email\`;
// Redirect user to authUrl...

// 2. In your callback handler (e.g. Express)
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  // Verify state matches session-stored state...

  // 3. Exchange code for tokens
  const tokenRes = await fetch(
    'https://accounts.elixpo.com/api/auth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    }
  );
  const tokens = await tokenRes.json();

  // 4. Fetch user profile
  const userRes = await fetch(
    'https://accounts.elixpo.com/api/auth/me',
    { headers: { Authorization: \`Bearer \${tokens.access_token}\` } }
  );
  const user = await userRes.json();
  // user.id, user.email, user.displayName now available!
});`;

export default function QuickstartPage() {
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
                Quickstart
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                Get started with integrating Elixpo Accounts into your
                application. Register your client, obtain credentials, and
                implement the authorization flow.
            </Typography>

            <Box sx={{ mb: 4 }}>
                <Chip
                    label="Base URL: https://accounts.elixpo.com"
                    sx={{
                        bgcolor: "rgba(255, 119, 89, 0.1)",
                        color: "#ff7759",
                        border: "1px solid rgba(255, 119, 89, 0.2)",
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontSize: "0.85rem",
                    }}
                />
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
                1. Register OAuth Application
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Navigate to the <strong>Dashboard &gt; OAuth Apps</strong> page
                and click <strong>New OAuth App</strong>. Provide the following
                details:
            </Typography>
            <Box
                component="ul"
                sx={{
                    color: "var(--fg-muted)",
                    pl: 3,
                    mb: 4,
                    "& li": { mb: 1, lineHeight: 1.6 },
                }}
            >
                <li>
                    <strong>Application Name:</strong> The user-facing name
                    shown during the consent step.
                </li>
                <li>
                    <strong>Homepage URL:</strong> The primary marketing or
                    landing URL of your app.
                </li>
                <li>
                    <strong>Redirect URI(s):</strong> The absolute callback URLs
                    where users will be redirected upon successful
                    authorization. You can register up to <strong>5</strong>{" "}
                    URIs. HTTP and HTTPS are both permitted (useful for local
                    development).
                </li>
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
                2. Secure Credentials
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    lineHeight: 1.6,
                }}
            >
                Upon creation, the system generates a unique{" "}
                <strong>Client ID</strong> and <strong>Client Secret</strong>.
                The client secret is hashed before storage and is displayed{" "}
                <strong>only once</strong>. Ensure you copy and store it in your
                server's secure configuration or environment file (e.g.{" "}
                <code>.env</code>).
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
                Node.js Integration Code
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                The example below uses the protocol directly. For typed PKCE,
                callback, token, and JWKS helpers, follow the{" "}
                <Link
                    href="/docs/lixaccounts"
                    style={{ color: "#ff7759", fontWeight: 700 }}
                >
                    Developer SDK guide
                </Link>
                .
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 3,
                    lineHeight: 1.6,
                }}
            >
                Here is a brief server-side implementation example showing how
                to initialize the auth redirect, handle the callback, exchange
                code, and fetch user info.
            </Typography>
            <CodeBlock code={NODE_JS_EXAMPLE} language="javascript" />
        </Box>
    );
}
