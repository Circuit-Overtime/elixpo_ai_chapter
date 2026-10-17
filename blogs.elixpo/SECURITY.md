# Security policy

## Supported code

Security fixes target the current `main` branch and the operated service at
[blogs.elixpo.com](https://blogs.elixpo.com). Older commits, forks, local
deployments, and third-party integrations are not maintained as supported
versions unless a release record states otherwise.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability, leaked credential,
private user data, or an exploit that could affect the hosted service.

Use GitHub's private security-advisory flow for this repository when available:

<https://github.com/elixpo/blogs.elixpo/security/advisories/new>

If that route is unavailable, email `hello@elixpo.com` with the subject
`[LixBlogs security]`. Include the affected component, reproduction steps,
impact, and any suggested mitigation. Do not include live credentials or
unnecessary personal data.

## Scope

Reports may cover the web application, supported API routes, authentication,
authorization, collaboration, media handling, the publishing CLI, the editor
package, or the official deployment. Dependency-only reports should identify a
reachable vulnerable path rather than relying solely on a scanner result.

We coordinate disclosure after the impact and remediation path are understood.
This policy does not promise a bounty or a fixed response deadline.
