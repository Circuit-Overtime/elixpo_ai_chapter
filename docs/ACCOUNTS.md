# Elixpo Accounts Docs — Overview

Source: https://accounts.elixpo.com/docs

This is one section of the Elixpo Accounts developer documentation. Elixpo Accounts is an open OAuth 2.0 single sign-on built on Cloudflare's edge.

---
# Overview

Elixpo Accounts is the central Single Sign-On (SSO) gateway and OAuth 2.0 Identity Provider for the Elixpo ecosystem. It allows users to authenticate once and access all services securely. Third-party applications can integrate with Elixpo Accounts to allow users to sign in using their Elixpo credentials.

## Core Capabilities

- Universal SSO: One account accesses every app in the Elixpo ecosystem, including Chat, Art, Blogs, and Sketch.
- OAuth 2.0 Provider: Standard Authorization Code Flow with Refresh Token rotation for secure, seamless third-party integrations.
- Passwordless Login: Secure phishing-resistant authentication using WebAuthn / Passkeys.
- Edge-Native Runtime: Optimized execution globally on Cloudflare Pages and Cloudflare D1 with minimal latency.
- Developer Portal: Self-service portal to register OAuth applications, subscribe to Webhooks, and generate API Keys.

## Architecture & Security

The authentication protocol follows standard OAuth 2.0 and OpenID Connect patterns. Token issuance comprises short-lived JWT Access Tokens (15 minutes expiry) signed using HS256 (Web Crypto API), combined with rotated Refresh Tokens. Refresh token rotation guarantees that every time a client refreshes an access token, the current refresh token is invalidated, and a new one is returned to prevent replay attacks.
