"use client";

import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import Link from "next/link";
import CodeBlock from "../../components/code-block";

const AUTH_URL_EXAMPLE = `GET https://accounts.elixpo.com/oauth/authorize
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &state=RANDOM_CSRF_TOKEN
  &scope=openid profile email`;

const TOKEN_EXCHANGE_REQ = `POST https://accounts.elixpo.com/api/auth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "code_abc123",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "redirect_uri": "https://yourapp.com/callback"
}`;

const TOKEN_EXCHANGE_RES = `{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJ...",
  "scope": "openid profile email"
}`;

const TOKEN_REFRESH_REQ = `POST https://accounts.elixpo.com/api/auth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "eyJ...",
  "client_id": "YOUR_CLIENT_ID"
}`;

export default function OAuthPage() {
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
                OAuth 2.0 Flow
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                Elixpo Accounts implements the standard OAuth 2.0 Authorization
                Code Flow. This flow is recommended for web and mobile
                applications that communicate with a backend server where
                secrets can be safely stored. You can implement the protocol
                directly or use the{" "}
                <Link
                    href="/docs/lixaccounts"
                    style={{ color: "#ff7759", fontWeight: 700 }}
                >
                    @elixpo/accounts SDK
                </Link>{" "}
                for PKCE and token verification helpers.
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
                Step 1: Redirect to Authorization
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Redirect the user's browser to the authorize endpoint. If the
                user is not authenticated, they will be prompted to log in or
                create an account.
            </Typography>
            <CodeBlock code={AUTH_URL_EXAMPLE} language="http" />

            <Typography
                variant="h3"
                sx={{
                    fontSize: "1.1rem",
                    fontWeight: 600,
                    color: "#ff7759",
                    mt: 3,
                    mb: 2,
                }}
            >
                Query Parameters
            </Typography>
            <TableContainer
                sx={{
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    mb: 4,
                    background: "var(--surface)",
                }}
            >
                <Table size="small">
                    <TableHead sx={{ bgcolor: "var(--overlay)" }}>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontWeight: 600,
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Parameter
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontWeight: 600,
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Required
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontWeight: 600,
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Description
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>response_type</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#b91c1c",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Yes
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Must be set to <code>code</code>.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>client_id</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#b91c1c",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Yes
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Your application's Client ID.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>redirect_uri</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#b91c1c",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Yes
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Must exactly match one of your registered
                                Redirect URIs.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>state</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#b91c1c",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Yes
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                A high-entropy random string to mitigate CSRF
                                attacks.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>scope</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-faint)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                No
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Space-separated scopes. Defaults to{" "}
                                <code>openid profile email</code>.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>

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
                Step 2: Handle the Callback
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Once authorized, the user is redirected back to the specified{" "}
                <code>redirect_uri</code> with the following params:
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 1,
                    pl: 2,
                    borderLeft: "2px solid #ff7759",
                }}
            >
                <strong>Approved:</strong>{" "}
                <code>
                    https://yourapp.com/callback?code=code_abc123&state=YOUR_STATE
                </code>
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 3,
                    pl: 2,
                    borderLeft: "2px solid #b91c1c",
                }}
            >
                <strong>Denied:</strong>{" "}
                <code>
                    https://yourapp.com/callback?error=access_denied&state=YOUR_STATE
                </code>
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    lineHeight: 1.6,
                }}
            >
                Always verify the returned <code>state</code> matches the
                original CSRF token sent in Step 1 before proceeding.
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
                Step 3: Exchange Code for Tokens
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                From your secure server backend, execute a POST request to
                exchange the single-use authorization code (expires in 10
                minutes) for access and refresh tokens.
            </Typography>
            <CodeBlock code={TOKEN_EXCHANGE_REQ} language="json" />
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                <strong>Response:</strong>
            </Typography>
            <CodeBlock code={TOKEN_EXCHANGE_RES} language="json" />

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
                Step 4: Refresh Tokens
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Access tokens expire in 15 minutes. Send a refresh token request
                to exchange a refresh token for a new set of tokens. Refresh
                tokens are rotated (one-time use), immediately invalidating the
                old token.
            </Typography>
            <CodeBlock code={TOKEN_REFRESH_REQ} language="json" />
        </Box>
    );
}
