# Changelog

Each release of OreoOS gets its own section here. The CI release
workflow lifts the **top section** verbatim into the GitHub release's
`body` field — that's exactly what the Updates app surfaces as the
in-device changelog when an upgrade is available.

Format for a new entry (add to the top, push, CI does the rest):

```
## vX.Y.Z — YYYY-MM-DD
- Short bullets, present tense (e.g. "Fix Store hang at LOADING").
- Group bullets loosely by surface: OS, Apps, Drivers, Tooling, Docs.
- Keep technical, no marketing language.
```

---

## v1.4.19 — 2026-05-16

- **Fix**: Updates page no longer hangs forever — OTA's `check`,
  `peek`, and `download` now use the raw-socket helper instead of
  `urequests`, with `settimeout` correctly applied after the SSL
  wrap and a hard wallclock backstop.
- **Fix**: Time-sync no longer freezes the device for 15+ seconds —
  `timeutil.sync_from_ntp()` is now a 30-line raw UDP exchange with a
  2.5 s socket timeout (replaces `ntptime.settime()`).
- **Refactor**: Pulled the HTTP helper into `oreoOS/_http.py` so OTA
  + Store share one implementation (single place to fix bugs).
- **Updates UX**: New layout — `OREO OS <version>` header, animated
  "CHECKING …" loader, two side-by-side buttons (`INSTALL` +
  `CHANGELOG`) when an update is found, "Up to date — LTS YYYY-MM-DD"
  card otherwise. The changelog button opens a scrollable sub-page
  showing the GitHub release's body verbatim.

## v1.4.x — earlier patches

See the git log; this CHANGELOG was started at v1.4.19.
