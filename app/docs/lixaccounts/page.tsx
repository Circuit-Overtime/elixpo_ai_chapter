"use client";

import { Box, Chip, Typography } from "@mui/material";
import Link from "next/link";
import CodeBlock from "../../components/code-block";

const INSTALL = `npm install @elixpo/accounts`;

const CONFIGURE = `import {
  createAccountsClient,
  parseAuthorizationCallback,
} from "@elixpo/accounts";

const accounts = createAccountsClient({
  issuer: "https://accounts.elixpo.com",
  clientId: process.env.ELIXPO_CLIENT_ID!,
  clientSecret: process.env.ELIXPO_CLIENT_SECRET,
  redirectUri: "https://example.com/auth/callback",
  audience: "example.com",
});`;

const AUTHORIZE = `const { url, transaction } =
  await accounts.createAuthorizationRequest({
    scopes: ["openid", "profile", "email"],
    prompt: "select_account",
  });

// Store transaction in an encrypted, httpOnly session.
return Response.redirect(url);`;

const CALLBACK = `const { code } = parseAuthorizationCallback(
  request.url,
  transaction.state,
);

const tokens = await accounts.exchangeAuthorizationCode({
  code,
  codeVerifier: transaction.codeVerifier,
});

const identity = await accounts.verifyIdToken(
  tokens.idToken!,
  transaction.nonce,
);`;

const LIFECYCLE = `const rotated = await accounts.refresh(tokens.refreshToken);
// Atomically replace the old refresh token.
await accounts.revoke(rotated.refreshToken);`;

export default function LixaccountsDocsPage() {
    return (
        <Box>
            <Box
                sx={{
                    display: "flex",
                    alignItems: { xs: "flex-start", sm: "center" },
                    justifyContent: "space-between",
                    flexDirection: { xs: "column", sm: "row" },
                    gap: 2,
                    mb: 2,
                }}
            >
                <Typography
                    variant="h1"
                    sx={{
                        fontSize: "2rem",
                        fontWeight: 800,
                        color: "var(--fg)",
                        letterSpacing: "-0.02em",
                        mb: "0 !important",
                    }}
                >
                    @elixpo/accounts
                </Typography>
                <Chip
                    label="Developer SDK"
                    component="a"
                    href="https://www.npmjs.com/package/@elixpo/accounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    clickable
                    sx={{
                        bgcolor: "rgba(255, 119, 89, 0.1)",
                        color: "#ff7759",
                        border: "1px solid rgba(255, 119, 89, 0.25)",
                        fontWeight: 700,
                    }}
                />
            </Box>

            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                The official edge-safe TypeScript client for Elixpo Accounts. It
                discovers OAuth endpoints, creates S256 PKCE transactions,
                validates callbacks, rotates tokens, revokes access, and
                verifies signed access and ID tokens with JWKS.
            </Typography>

            <Typography variant="h2">Install</Typography>
            <CodeBlock code={INSTALL} language="bash" />

            <Typography variant="h2">Configure the client</Typography>
            <Typography>
                Register an OAuth application first, then initialize one client
                in your server runtime. The issuer is public; the client secret
                and returned tokens are not.
            </Typography>
            <CodeBlock code={CONFIGURE} language="typescript" />

            <Typography variant="h2">Start authorization</Typography>
            <Typography>
                Persist the complete transaction in an encrypted, httpOnly,
                same-site session before redirecting. The optional
                <code>select_account</code> prompt lets a signed-in user choose
                which Elixpo account authorizes the application.
            </Typography>
            <CodeBlock code={AUTHORIZE} language="typescript" />

            <Typography variant="h2">Handle the callback</Typography>
            <Typography>
                Read the stored transaction once, validate state, exchange the
                code with its PKCE verifier, and verify the ID token against the
                original nonce.
            </Typography>
            <CodeBlock code={CALLBACK} language="typescript" />

            <Typography variant="h2">Refresh and revoke</Typography>
            <Typography>
                Refresh tokens rotate. Replace the stored value atomically and
                never continue using the previous token.
            </Typography>
            <CodeBlock code={LIFECYCLE} language="typescript" />

            <Typography variant="h2">Security boundaries</Typography>
            <Box component="ul">
                <li>
                    Keep client secrets, refresh tokens, transactions, and all
                    returned tokens on the server.
                </li>
                <li>
                    Store state, nonce, and the PKCE verifier together in an
                    encrypted session with a short expiry.
                </li>
                <li>
                    Set <code>audience</code> before calling
                    <code>verifyAccessToken</code>.
                </li>
                <li>
                    Let hosted Accounts pages collect passwords, OTPs, passkeys,
                    MFA responses, consent, and account selection.
                </li>
            </Box>

            <Typography variant="h2">Choose your next reference</Typography>
            <Typography>
                Read the <Link href="/docs/oauth">OAuth flow</Link> for the wire
                protocol, the <Link href="/docs/errors">error reference</Link>{" "}
                for typed failures, or the{" "}
                <Link href="/docs/webhooks">webhook guide</Link> for lifecycle
                events.
            </Typography>
        </Box>
    );
}
