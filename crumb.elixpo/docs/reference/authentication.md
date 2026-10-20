# Authentication

Crumb connects an Elixpo account to Pollinations through:

```bash
crumb auth login
crumb auth status
crumb auth logout
```

The same actions are available inside Crumb as `/auth login`, `/auth status`,
and `/auth logout`. First sign in at the Crumb account site and link
Pollinations. `crumb auth login` then uses the Elixpo Accounts RFC 8628 device
flow and sends its short-lived Accounts access token to Crumb's connector
exchange endpoint. The Pollinations credential is returned over HTTPS and
saved in the OS keyring; it never appears in a callback URL or terminal log.

Set `CRUMB_ACCOUNT_URL=http://localhost:3000` when testing against the local
web app.

## Linux

Crumb uses the desktop Secret Service over a pure-Rust Zbus client. A logged-in
GNOME or KDE desktop normally already provides an unlocked store, so no system
development package is required.

On Debian or Ubuntu, install GNOME Keyring only when no Secret Service provider
is present:

```bash
sudo apt install gnome-keyring
```

KWallet and KeePassXC's Secret Service integration are also compatible. Crumb
returns a redacted error when the store is absent or locked; it never silently
writes the key to a plaintext file.

For headless or ephemeral sessions, `POLLINATIONS_API_KEY` remains an explicit
process-only override. Crumb does not persist that value.

Local development also accepts `POLLINATIONS_KEY` as an alias so the existing
root `.env.local` can be sourced without renaming its variable. Crumb does not
scan or parse dotenv files itself:

```bash
set -a
source ./.env.local
set +a
cargo run -p crumb-cli
```

## Web configuration

See [account connector development](../development/account-connector.md) for
the Accounts registration, Pollinations App Key, Cloudflare bindings, and
local port layout.
