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

const USER_API_REQ = `GET https://accounts.elixpo.com/api/auth/me
Authorization: Bearer ACCESS_TOKEN`;

const USER_API_RES = `{
  "id": "u_9b7bf7c2-866e-ee9d-3e48-ee9d3e488297",
  "email": "developer@elixpo.com",
  "displayName": "swift-falcon",
  "provider": "email",
  "emailVerified": true
}`;

export default function UsersApiPage() {
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
                Users API
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                Use the Users API to retrieve the authenticated user's profile
                details. Access is guarded by standard Bearer token
                authentication in the HTTP header.
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
                Fetch User Profile
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Invoke the profile endpoint by passing the JWT access token
                received during the token exchange step.
            </Typography>
            <CodeBlock code={USER_API_REQ} language="http" />

            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                <strong>Response:</strong>
            </Typography>
            <CodeBlock code={USER_API_RES} language="json" />

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
                Profile Fields
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
                                Field
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-faint)",
                                    fontWeight: 600,
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Type
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
                                <code>id</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                String
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The stable, unique UUID representing the user
                                across all Elixpo products.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>email</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                String
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The user's registered email address.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>displayName</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                String
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                The user's username/nickname (e.g.{" "}
                                <code>swift-falcon</code>).
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>provider</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                String
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Authentication provider (e.g. <code>email</code>
                                , <code>google</code>, <code>github</code>).
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>emailVerified</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "#ff7759",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Boolean
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Whether the user's email has been verified via
                                OTP code.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
