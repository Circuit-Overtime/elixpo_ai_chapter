# LixBlogs CLI — Auth Threat Model

Tracking: elixpo/blogs.elixpo#137
Status: **Resolved by implementer** — this doc's existence and scope was an
open question on #137 ("should a threat model be written as part of this
issue, and what should it contain?"). Decision: yes, scoped to the five
areas #137 itself named. Flagged for the maintainer to expand or narrow.

## 1. Token storage

- Access and refresh tokens are stored in the OS keychain
  (Keychain on macOS, Secret Service/libsecret on Linux, Credential Manager
  on Windows) — never in a plain config file or environment variable by
  default.
- A fallback (e.g. encrypted file on disk) is only used if the keychain is
  unavailable, and only with explicit user opt-in at that moment — never a
  silent default.
- Redaction: tokens must never appear in logs, `--json` output, telemetry,
  or crash reports. This is verified by test (see `auth.test.mjs`), not
  just documented — string values matching known token prefixes should be
  masked in any error-serialization path.
- Risk if this fails: a leaked token grants whatever scopes it holds until
  revoked or expired — this is why short-lived access tokens (with refresh
  rotation) matter more than keychain storage alone.

## 2. Scope boundaries

- Scopes are least-privilege by default; publishing and destructive actions
  require scopes distinct from read/draft scopes (per #135).
- Accounts publishes the registered LixBlogs scope list. Login defaults to
  identity plus profile/blog read scopes; broader scopes must be requested
  explicitly and remain bounded by the public client's registration.
- Risk: an overly broad default scope grant (e.g. `login` implicitly
  granting `publish`) would mean any compromised session can publish
  without the user having explicitly consented to that. Mitigation: the
  CLI must request only the scopes a given command needs, not a blanket
  "everything" scope at login time.

## 3. Blast radius of a compromised agent/CLI session

- Worst case if a token is stolen or an agent is compromised: whatever
  scopes that specific token holds, until it's revoked or naturally
  expires (access tokens are short-lived; refresh tokens are the more
  valuable target).
- Mitigations already in scope: `lixblogs auth revoke`, tested refresh
  rotation/reuse rejection, and multi-profile isolation (below).
- Not yet mitigated / open for later work: there's no mechanism yet for a
  user to see "which sessions/devices currently hold a valid token for my
  account" and revoke just one — this would materially reduce blast radius
  and is worth a follow-up issue, not blocking this one.

## 4. Device-flow-specific risks

- **Code interception**: the user code is short and meant to be read aloud/
  typed manually; the device code (long, unguessable) is what's actually
  exchanged for a token. If a device code leaks (e.g. via a compromised
  clipboard), same blast radius as a stolen token.
- **Polling abuse**: a malicious client could poll rapidly to try to beat
  the user to approving/denying. Mitigated by `pollIntervalSeconds` and the
  `slow_down` response (see MockAuthProvider) which forces callers to back
  off — the real provider is expected to enforce this server-side too, not
  just suggest it.
- **Expired/denied code handling**: both must be treated as fully dead ends
  — no retry-with-same-code path. The mock encodes this by design (an
  expired/denied device code never later returns `approved`).
- **Reused-code replay**: an already-approved device code should not be
  usable to fetch a second, independent token. Not yet tested in the mock
  — worth adding once the "one device code → one token exchange" contract
  is confirmed for the real provider, since the mock doesn't currently
  invalidate a code after issuing a token for it.

## 5. Multi-profile / account isolation

- Each named profile's tokens must be stored under a distinct keychain
  entry — one profile's credential lookup must never return another
  profile's token, even if both are logged in simultaneously.
- Switching the active profile must not require re-entering credentials for
  profiles already logged in, but must also never leak which other profiles
  exist to a scope that shouldn't know (e.g. `--json` output for one
  profile shouldn't enumerate other profiles' identifiers).
- The active profile is non-sensitive registry metadata. Each profile's
  credentials remain isolated in its own OS-keychain entry, and concurrent
  refreshes for one profile share a single rotation operation.

## Explicitly out of scope for this document

- Threat modeling the API server itself (auth middleware, D1 access
  patterns) — that's elixpo/blogs.elixpo#136's concern.
- Supply-chain risk on the npm package itself (dependency compromise,
  publish-time integrity) — worth a separate doc once packaging/release
  work (later phase) is underway.
