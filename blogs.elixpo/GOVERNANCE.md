# LixBlogs governance

LixBlogs is an active core Elixpo service. The repository is maintained in
public, while production credentials, user data, moderation systems, package
publishing, and deployment access remain restricted operational responsibilities.

## Decision model

- Maintainers set the roadmap, review contributions, manage releases, and own
  production safety decisions.
- Material changes begin with an issue or discussion when early alignment would
  prevent wasted implementation work.
- Pull requests require review appropriate to their risk. Passing automation is
  evidence, not approval to merge.
- Security, privacy, authentication, payments, moderation, migrations, package
  publication, and deployment changes require a maintainer with access to the
  affected system.
- Irreversible or organization-wide policy changes must be recorded in the
  canonical Elixpo registry or governance documentation before implementation.

## Maintainers and contributors

The machine-readable maintainer declaration lives in
[`.elixpo/project.yml`](.elixpo/project.yml). Repository contribution history
records individual work but does not automatically grant an operational role.
Maintainers may delegate triage, write, release, or deployment permissions
without transferring ownership of unrelated systems.

Contributor credit should point to attributable work such as merged changes,
reviews, releases, documentation, design, or community operations. Commit count
alone is not a governance rank.

## Changes to governance

Governance changes use a pull request with an explanation of the operational
effect and the maintainers consulted. Changes to Elixpo-wide Chapters, Member
Projects, licensing, branding, sponsorship, or contributor recognition belong
in the organization governance source before this repository adopts them.
