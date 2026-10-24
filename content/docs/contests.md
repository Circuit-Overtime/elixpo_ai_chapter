# Writing contests

LixBlogs contests are time-bound publishing events. An organizer defines a theme, problem statement, rules, dates, eligibility, and optional writing template. Authors submit an already-published blog while keeping ownership, attribution, canonical URL, and license.

## Lifecycle

A contest moves through `draft`, `scheduled`, `live`, `judging`, and `completed`. An organizer may cancel it before completion. The public state advances from the configured dates even when no dashboard is open.

- **Draft:** visible only to the organizer, moderators, and judges.
- **Scheduled:** public, but submissions have not opened.
- **Live:** eligible authors may submit or withdraw before the deadline.
- **Judging:** submissions and withdrawals are closed; judges can read frozen revisions.
- **Completed:** placements and results are public and immutable through normal contest controls.

Dates become locked once the contest opens or receives its first submission. This prevents an organizer from silently changing the deadline after authors participate.

## Roles

The creator is the organizer. Only the organizer can assign or remove roles.

- **Moderators** maintain contest information and operational controls.
- **Judges** can retrieve frozen submission snapshots and select results.
- **Authors** can submit only their own public, non-secret blogs.

Every role change, submission, withdrawal, lifecycle transition, and result update is recorded in the contest audit log.

## Immutable submissions

Submitting stores the source blog ID and a frozen copy of its title, metadata, topics, license, and block content. Later edits to the public blog do not change what judges review. The gallery continues linking to the author's canonical blog and clearly labels the entry as frozen at submission.

Required topics, publication targets, and per-author limits are checked when the entry is submitted. A withdrawal is allowed only while the contest remains live.

Account age is configured in whole months from `0`. An organizer can accept between `1` and `5` entries per author. Contest tags are for discovery; required topics are enforced against each submitted blog.

## Public contest workspace

Every published contest separates its information into Overview, Discussion, Leaderboard, Rules, and Write-up Format tabs. Discussion posts are public, limited to 4,000 characters, and removable by their author or a contest host. Cancelled contests keep their discussion history in read-only form. The leaderboard lists frozen submissions throughout the contest and adds final placements when judging is complete.

## Results

The first release supports one winner plus runner-up and honorable-mention placements. Finalizing results closes the contest, notifies participants, and adds public contest recognition to the winning authors' profiles.

Community voting, automated judging, sponsors, monetary prizes, payouts, advanced rubrics, and anonymized judging are not part of this release.

## CLI automation

The CLI uses existing blog scopes. Reads require `lixblogs:blog:read`, contest and submission mutations require `lixblogs:blog:write`, and final results require `lixblogs:blog:publish`.

```bash
lixblogs contest list --status live
lixblogs contest list --mine
lixblogs contest create \
  --title "Build for the open web" \
  --problem "Explain a practical improvement to the open web." \
  --rules "Submit original work published on LixBlogs." \
  --starts-at 2026-10-01T00:00:00Z \
  --submissions-close-at 2026-10-15T23:59:59Z \
  --judging-closes-at 2026-10-20T23:59:59Z \
  --tag open-web --contest-tag community \
  --allowed-target personal \
  --minimum-account-age-months 1 \
  --require-bio
lixblogs contest publish CONTEST_ID --yes
lixblogs contest role CONTEST_ID --user reviewer --role judge
lixblogs contest submit CONTEST_ID --blog BLOG_ID
lixblogs contest submissions CONTEST_ID --snapshot --json
lixblogs contest results CONTEST_ID \
  --award winner:SUBMISSION_ID \
  --award runner-up:OTHER_SUBMISSION_ID \
  --finalize --yes
```

Eligibility can be restricted with repeated `--eligible-user USERNAME` flags and reopened with `contest edit CONTEST_ID --clear-eligible-users`. `--no-require-bio` removes the bio requirement. Organizers may remove only private drafts with `contest delete CONTEST_ID --yes`; published contest history must be cancelled and retained.

Use `--json --no-input` with a scoped personal access token for workflows. The API enforces the same ownership, role, deadline, and eligibility boundaries as the website.
Organization-scoped tokens cannot create or manage contests in this release; eligible organization-published entries can still be allowed explicitly by the organizer.
