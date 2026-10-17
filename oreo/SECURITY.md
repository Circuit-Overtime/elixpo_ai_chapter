# Security Policy

## Supported versions

The badge is small and the surface area is small with it. We support
**the latest `stable/` release** on the OTA channel, plus the previous
patch. Older versions get security fixes only if the report is
critical and easy to backport.

| Version | Supported |
|---|:-:|
| latest `stable/v*` | ✅ |
| latest `stable/v*` − 1 | ✅ (critical only) |
| `beta/v*` | ✅ (latest only) |
| older | ❌ |

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Use one of:

1. **GitHub Security Advisory** (preferred):
   <https://github.com/elixpo/oreo/security/advisories/new>
2. **Email:** `hello@elixpo.com`

You can expect:

- An acknowledgement within **3 working days**.
- A first triage opinion ("we agree this is X severity") within **7 days**.
- A fix or mitigation plan within **30 days**, faster for high-severity
  issues. We'll keep you in the loop the whole way.
- Credit in the release notes (unless you'd rather stay anonymous).

## Scope

In scope:

- Anything that lets an attacker steal another badge's WiFi/BLE
  credentials, contact data, or saved tokens.
- Anything that lets a malicious OTA release land on a stranger's
  badge.
- Anything that can hard-brick the badge over the air.
- Backdoors / left-in debug paths in the OS or apps.

Out of scope (but still please tell us, just lower priority):

- Physical attacks that require holding the badge.
- DoS via direct interference (IR jammer, RF flooding) — those are
  physics, not bugs.
- Aesthetic / UI nits in error messages.

Thanks for keeping the panda safe. 🐼
