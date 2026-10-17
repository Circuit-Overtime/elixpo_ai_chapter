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
import CodeBlock from "../../components/code-block";

const ERROR_BODY = `{
  "error": "invalid_client",
  "error_description": "Client authentication failed (e.g. unknown client, no client secrets, or unsupported authentication method)."
}`;

export default function ErrorsPage() {
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
                Error Reference
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                All authorization and authentication endpoints return standard
                OAuth 2.0 error payloads when a request fails.
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
                Error Payload Format
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Failed requests return an HTTP status code in the{" "}
                <code>4xx</code> or <code>5xx</code> range and a JSON body
                containing the fields <code>error</code> and{" "}
                <code>error_description</code>.
            </Typography>
            <CodeBlock code={ERROR_BODY} language="json" />

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
                Error Codes Table
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
                                Error Code
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontWeight: 600,
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                HTTP Status
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontWeight: 600,
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Meaning
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
                                <code>invalid_request</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                400 Bad Request
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The request is missing a required parameter,
                                includes an unsupported parameter, or is
                                otherwise malformed.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>invalid_client</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                401 Unauthorized
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Client authentication failed (e.g. unknown
                                client ID, invalid client secret, or no client
                                credentials provided).
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>invalid_grant</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                400 Bad Request
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The provided authorization code or refresh token
                                is invalid, expired, revoked, or the redirect
                                URI doesn't match.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>access_denied</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                403 Forbidden
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The resource owner or authorization server
                                denied the request (e.g. user pressed 'Cancel'
                                on the consent screen).
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>unsupported_response_type</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                400 Bad Request
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The authorization server does not support
                                obtaining an authorization code using this
                                method (only <code>code</code> is supported).
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>server_error</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                500 Internal Error
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The authorization server encountered an
                                unexpected condition that prevented it from
                                fulfilling the request.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
