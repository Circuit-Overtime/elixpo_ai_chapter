# rust-reedline Debian dependency

Crumb's official-Debian build needs `reedline 0.52.1` without optional
features. On 19 October 2026, `cargo debstatus` reported every transitive
dependency of that profile as compatible with Debian unstable; `reedline`
itself was the sole missing Crumb dependency.

These files are a starting overlay for a contribution to the Debian Rust
Team's `debcargo-conf` repository. They are not a substitute for that team's
review and are not used by Crumb's own source-package build.

In a current `debcargo-conf` checkout, place the overlay under
`src/reedline/debian/`, run the repository's `update.sh reedline`, review the
generated copyright and feature packages, then build it with the repository's
normal clean unstable workflow.
