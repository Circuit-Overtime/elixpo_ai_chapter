# @elixpo/lixrl-cli

Official command-line client for [Lixrl](https://lixrl.com). Manage production short links and QR codes from a terminal, deployment job, or agent workflow.

```bash
npm install --global @elixpo/lixrl-cli
lixrl login --open
lixrl whoami
```

If the selected profile already has a valid local key, login reuses it. Otherwise, the CLI asks whether to create a scoped key through Elixpo Accounts or paste an existing raw key. The final key is stored in the operating-system keychain. Accounts tokens used during approval remain in memory and are revoked after the exchange.

## Sign in securely

### Browser and device flow

```bash
lixrl login
lixrl whoami
```

When no valid local key exists, choose **Create a new API key** to continue with Accounts device login, or choose **Use an existing API key** to paste a raw key into the masked prompt. Use `lixrl login --new-key --open` to skip the choice and intentionally create a key. The CLI displays a prefilled Accounts URL and one-time code. After identity approval, Lixrl asks you to choose the key name, access level, and optional expiry date. Passwords, browser cookies, and Accounts refresh tokens are never stored by the CLI.

Running `lixrl login` again reuses a valid key already stored for the selected profile. Use `lixrl login --new-key` only when you intentionally want another key. The CLI cannot recover raw values for keys shown in the dashboard because Lixrl stores only hashes; paste the original key value or create a new one. The CLI also cannot revoke account keys during device login. If the allowance is full, revoke one in the browser, wait until its status shows **Revoked**, and then press Enter in the terminal.

### Paste an existing key

```bash
lixrl login --key
```

Create the key at [lixrl.com/profile/keys](https://lixrl.com/profile/keys), then paste its original value into the masked prompt. You can also run plain `lixrl login` and choose option 2. Dashboard key rows cannot reveal a raw key after creation.

Login configuration and Accounts discovery are retried briefly when a network or server failure is transient. If login still fails, the CLI distinguishes Lixrl configuration failures, Accounts timeouts, connection/DNS/TLS failures, HTTP failures, and incompatible authorization metadata instead of reporting every case as an Accounts outage.

For CI, set `LIXRL_API_KEY` through the CI secret store and use `--json --no-input`; never place the key in source files, command arguments, generated content, or logs.

Use `lixrl --help` for the complete command list. `shortner` is provided as a compatibility alias.

## Core workflows

```bash
lixrl urls create https://example.com/launch --title "Launch" --tag campaign
lixrl urls list --search launch --json
lixrl urls analytics abc123 --days 30
lixrl urls export --output links.csv
lixrl keys create --name deploy --scopes read,write
lixrl domains claim team
lixrl qr https://example.com --format png --style rounded --output launch.png
lixrl qr https://example.com --track --style aurora --output campaign.svg
```

Deletion, API-key revocation, mapping removal, and file replacement require `--yes`. Use `--json --no-input` for automation.

The interactive terminal uses distinct colors and symbols for successful operations, status information, correctable warnings, and failures. Set `NO_COLOR=1` for plain output. Command names, subcommands, required arguments, and required flags are validated before the CLI reads your keychain or asks you to sign in, so typos return an immediate usage message.

Network requests, browser approvals, keychain writes, and QR rendering show a compact spinner only while that asynchronous operation is pending. Spinner frames are cleared before the final result and are never emitted by `--json`, `--quiet`, or non-interactive output.

## Agent skills

The npm package contains focused skills for link management and QR generation. They are not copied anywhere during installation.

```bash
lixrl skills list
lixrl skills inspect lixrl-links
lixrl skills install lixrl-links
lixrl skills install lixrl-qr
```

`skills install` copies the selected skill into the current Codex skills directory. This keeps the skill version tied to the installed CLI release.
