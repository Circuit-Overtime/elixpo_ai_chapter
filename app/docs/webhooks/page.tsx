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

const WEBHOOK_PAYLOAD_EXAMPLE = `{
  "id": "evt_7f1c1a2b3c4d",
  "event": "user.created",
  "createdAt": "2026-06-07T18:48:21.000Z",
  "data": {
    "id": "u_9b7bf7c2-866e-ee9d-3e48-ee9d3e488297",
    "email": "newuser@example.com",
    "displayName": "swift-falcon",
    "createdAt": "2026-06-07T18:48:20.000Z"
  }
}`;

const VERIFICATION_CODE_EXAMPLE = `const crypto = require("crypto");

app.post("/webhook-endpoint", (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  const rawBody = JSON.stringify(req.body); // Ensure you have access to the raw payload string
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!signature) {
    return res.status(401).send("Missing signature");
  }

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    return res.status(403).send("Invalid signature");
  }

  // Handle the verified webhook event...
  console.log("Verified event:", req.body.event);
  res.status(200).send("OK");
});`;

export default function WebhooksPage() {
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
                Webhooks
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                Webhooks allow your application to receive real-time HTTP POST
                notifications about events happening on the Elixpo Accounts
                platform (e.g. user signup, oauth app deletion).
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
                Supported Events
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 3,
                    lineHeight: 1.6,
                }}
            >
                You can configure webhook subscriptions in the Developer Portal
                for any of the following event types:
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
                                Event Code
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
                                <code>user.created</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Triggered when a new user registers on the
                                platform.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>user.updated</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Triggered when user profile data or username is
                                updated.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>user.deleted</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Triggered when a user deletes their account.
                                Register a <code>webhook_url</code> and
                                subscribe to this to purge the user&apos;s data
                                and stop any billing — e.g. Elixpo Pay cancels
                                their subscriptions and revokes entitlements on
                                this event.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>auth.login_success</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Triggered on a successful user login.
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>auth.login_failed</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Triggered on a failed login attempt (suspicious
                                activity tracker).
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell
                                sx={{
                                    color: "var(--fg)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                <code>oauth.app_created</code>
                            </TableCell>
                            <TableCell
                                sx={{
                                    color: "var(--fg-muted)",
                                    borderBottom: "1px solid var(--border)",
                                }}
                            >
                                Triggered when a new developer registers an
                                OAuth application.
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
                Payload Format
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                All webhook deliveries send a JSON POST request containing
                standard fields:
            </Typography>
            <CodeBlock code={WEBHOOK_PAYLOAD_EXAMPLE} language="json" />

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
                Signature Verification
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Every webhook request includes an{" "}
                <code>X-Webhook-Signature</code> header. This is a hex-encoded
                HMAC SHA256 signature calculated from the raw string payload
                body and your webhook signing secret.
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 3,
                    lineHeight: 1.6,
                }}
            >
                Always verify this signature using a constant-time comparison
                helper (like Node's <code>crypto.timingSafeEqual</code>) before
                processing.
            </Typography>
            <CodeBlock code={VERIFICATION_CODE_EXAMPLE} language="javascript" />

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
                Delivery & Retry Policy
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Your server must respond with a status code in the{" "}
                <code>2xx</code> range within 5 seconds to mark a delivery as
                successful. If the delivery fails (e.g. timeout or non-2xx
                status), the webhook system will retry up to{" "}
                <strong>5 times</strong> with an exponential backoff spacing.
            </Typography>
        </Box>
    );
}
