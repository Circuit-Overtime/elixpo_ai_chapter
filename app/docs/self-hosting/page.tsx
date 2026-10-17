"use client";

import { Box, Typography } from "@mui/material";
import CodeBlock from "../../components/code-block";

const CLONE_INSTALL = `git clone https://github.com/elixpo/accounts.elixpo.git
cd accounts.elixpo
npm install`;

const MIGRATE_DEV = `# Copy the environment template
cp .env.example .env.local

# Run DB schema migrations on local SQLite/D1 instance
npm run db:migrate:local

# Start the Next.js development server
npm run dev`;

const PROD_MIGRATIONS = `# Build validation check for edge runtime
npm run pages:build

# Apply migrations to remote production Cloudflare D1
wrangler d1 migrations apply elixpo_auth --remote`;

export default function SelfHostingPage() {
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
                Self-Hosting
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    fontSize: "1rem",
                    lineHeight: 1.7,
                }}
            >
                Follow this guide to deploy Elixpo Accounts in your own
                environment, whether for local development, docker, or deploying
                to production on Cloudflare Pages.
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
                Local Development
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                1. Clone the repository and install dependency packages:
            </Typography>
            <CodeBlock code={CLONE_INSTALL} language="bash" />

            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                2. Set up local D1 SQLite database, run migrations, and spin up
                the development server:
            </Typography>
            <CodeBlock code={MIGRATE_DEV} language="bash" />
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 4,
                    lineHeight: 1.6,
                }}
            >
                Open <code>http://localhost:3000</code> in your browser to view
                the Elixpo login/registration and developer dashboard.
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
                Cloudflare Pages Production Setup
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Elixpo Accounts is optimized for Cloudflare Pages (edge runtime)
                and Cloudflare D1. To deploy to your own Cloudflare account:
            </Typography>
            <Box
                component="ol"
                sx={{
                    color: "var(--fg-muted)",
                    pl: 3,
                    mb: 4,
                    "& li": { mb: 1.5, lineHeight: 1.6 },
                }}
            >
                <li>
                    <strong>Database:</strong> Create a Cloudflare D1 database
                    named <code>elixpo_auth</code> in the Cloudflare dashboard.
                </li>
                <li>
                    <strong>Pages Project:</strong> Connect your repository to
                    Cloudflare Pages. Select <code>Next.js (App Router)</code>{" "}
                    preset.
                </li>
                <li>
                    <strong>Bindings:</strong> In your Cloudflare Pages project
                    settings, bind your D1 database to the variable name{" "}
                    <code>DB</code>.
                </li>
                <li>
                    <strong>Environment Variables:</strong> Configure required
                    production variables under Pages Dashboard:
                    <ul>
                        <li>
                            <code>JWT_SECRET</code>: High-entropy string for
                            signing Access/Refresh tokens.
                        </li>
                        <li>
                            <code>SMTP_HOST</code> / <code>SMTP_USER</code> /{" "}
                            <code>SMTP_PASS</code> / <code>SMTP_PORT</code>:
                            Configures sockets-based SMTP transport for sending
                            transactional emails (OTP, resets).
                        </li>
                    </ul>
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
                Running Production Migrations
            </Typography>
            <Typography
                sx={{
                    color: "var(--fg-muted)",
                    mb: 2,
                    lineHeight: 1.6,
                }}
            >
                Run schema migrations on your production D1 instance via
                wrangler:
            </Typography>
            <CodeBlock code={PROD_MIGRATIONS} language="bash" />
        </Box>
    );
}
