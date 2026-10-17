# Security model

- Interactive API keys are stored by the operating-system keychain, never in the CLI config file.
- Automation reads `LIXRL_API_KEY` from the current process environment.
- API requests are restricted to `/api/*` on the configured HTTPS origin.
- JSON and error output redact credential-shaped fields.
- Destructive actions and file replacement require explicit confirmation.
- Bundled skills call the CLI and do not access credentials directly.
