# Governance

Crumb uses a maintainer-led model within the Elixpo organization.

The accountable lead is [@Circuit-Overtime](https://github.com/Circuit-Overtime).
Maintainers set product direction, review contributions, manage releases, and
protect security and licensing boundaries. Substantial changes should be
discussed publicly before implementation whenever doing so is safe.

## Decision principles

1. Keep the native Rust harness independently useful and self-hostable.
2. Keep Pollinations the default inference layer while preserving explicit,
   replaceable provider boundaries.
3. Make tool execution inspectable, bounded, and attributable.
4. Prefer small, testable capabilities over hidden autonomous behavior.
5. Record material architecture, security, and release decisions in the
   repository rather than relying on private context.

Elixpoo may triage, summarize, review, and maintain repository metadata, but it
does not decide governance, merge code, or replace accountable human
maintainers. Crumb itself is a product runtime, not the authority over this
repository.

Consensus is preferred. When it is not reachable, the accountable maintainer
makes and records the decision. Organization-wide policy, trademark, conduct,
and security decisions may be escalated to the Elixpo leads.
