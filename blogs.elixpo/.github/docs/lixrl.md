# ElixpoURL Docs — Overview

Source: https://lixrl.com/docs

This is one section of the ElixpoURL developer documentation. ElixpoURL is an open URL shortener built on Cloudflare's edge — short links, click analytics, and a REST API.

---
# Overview

ElixpoURL is an open URL shortener built on Cloudflare's edge. Short links, real-time click analytics, and a developer-first REST API — for any app you ship, Elixpo or not.

## What you get

- Edge-native redirects — every short link resolves on Cloudflare's edge, sub-50ms anywhere.
- Click analytics — counts, geo, referrers, devices, browsers; no third-party script.
- REST API + API keys with scoped permissions.
- Custom slugs, bulk operations, soft-delete, and TTLs.
- Sign in via Elixpo Accounts SSO — no separate password.

## Get started

Three ways into ElixpoURL, depending on how you like to work.

## How sign-in works

ElixpoURL doesn't store passwords. Every user signs in through Elixpo Accounts SSO — the same login that opens chat, art, blogs, and the rest of the ecosystem. Hit /api/auth/login to start the OAuth flow; we handle the callback, set the session cookie, and bounce you to your dashboard.

For machine-to-machine access, mint an API key from your dashboard and send it in the Authorization header.

## Conventions

- Base URL: https://lixrl.com
- API path prefix: /api
- All requests/responses are JSON unless stated otherwise.
- Errors follow the format { "error": "code", "message": "..." } — see Error Reference.
