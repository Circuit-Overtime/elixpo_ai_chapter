# LixBlogs search syntax

Search on LixBlogs supports a GitHub-style qualifier syntax. Type a plain query and
it just searches; add qualifiers to pin results down.

```
hacktoberfest                                  plain search
tag:hacktoberfest                              only posts tagged hacktoberfest
tag:hacktoberfest sort:likes                   …most liked first
author:nonsense3 tag:open-source               that author, that tag
"super contributor" -tag:meetup                exact phrase, excluding a tag
org:gdgoc created:>2025-10-01 in:title kolkata
```

Everything combines with **AND**: each qualifier narrows the result set further.

---

## Free text

A bare word matches the post's **title, subtitle, slug and excerpt**.

| Query | Matches |
|---|---|
| `rookie` | posts with "rookie" in any of those fields |
| `rookie hacktoberfest` | posts matching **both** words (not either) |
| `"super contributor"` | the exact phrase, as written |

Free text needs at least 2 characters. A qualifier-only query like `tag:ai` is valid
on its own with no free text at all.

> **Full post text is not searched.** Post bodies are stored compressed, so they
> can't be matched. `in:body` searches the post's **excerpt** (the short preview
> shown in feeds), not the whole article. Titles are the reliable target.

---

## Qualifiers

### `tag:`
Match a tag. Repeat it to require several — `tag:` behaves like GitHub's `label:`.

```
tag:open-source              tagged open-source
tag:ai tag:machine-learning  tagged BOTH
tag:"machine learning"       tags containing spaces need quotes
-tag:meetup                  exclude anything tagged meetup
```

### `author:`
Match the post's author by handle. The `@` is optional.

```
author:nonsense3
author:@nonsense3            same thing
-author:nonsense3            everything except their posts
```

> `author:` never matches [secret posts](#secret-posts).

### `org:`
Match posts published under an organization.

```
org:gdgoc
-org:gdgoc
```

### `in:`
Restrict where free text is matched. Repeatable.

| Value | Searches |
|---|---|
| `in:title` | title only |
| `in:subtitle` | subtitle only |
| `in:slug` | URL slug only |
| `in:body` | the excerpt (preview text) — see the note above |

```
in:title kolkata             "kolkata" must be in the title
in:title in:subtitle rookie  title or subtitle
```

### `is:`
Filter by state.

```
is:published
is:unlisted
is:secret                    only anonymous posts
-is:secret                   exclude anonymous posts
```

### `created:` and `published:`
Filter by date, `YYYY-MM-DD`.

| Query | Means |
|---|---|
| `created:2025-10-01` | that whole day |
| `created:>2025-10-01` | after that day |
| `created:>=2025-10-01` | that day or later |
| `created:<2025-10-01` | before that day |
| `created:<=2025-10-01` | that day or earlier |
| `published:2025-10-01..2025-10-31` | that range, inclusive |

### `sort:`
Order the results. Default is newest first.

| Value | Order |
|---|---|
| `sort:recent` | newest first (default) |
| `sort:oldest` | oldest first |
| `sort:likes` | most liked |
| `sort:comments` | most discussed |
| `sort:views` | most viewed |

---

## Negation

Prefix any of `tag:`, `author:`, `org:`, `is:` with `-` to exclude:

```
-tag:meetup
-author:nonsense3
-is:secret
```

---

## Secret posts

[Secret posts](#) are published anonymously — no author name, avatar or co-authors.
Search deliberately treats them differently:

- **`author:` never matches a secret post.** If it did, the qualifier would be a
  deanonymization tool: filter by a handle and read back that person's anonymous
  posts.
- **`-author:` never filters secret posts out.** Otherwise you could confirm
  authorship by watching a post disappear when you excluded a handle.
- **`org:` *does* match secret posts.** An organization isn't a person, and a secret
  post published under an org already shows that org on its card — so nothing about
  the writer is revealed.
- `is:secret` / `-is:secret` filter by anonymity itself. Neither exposes an identity.

---

## Unrecognised qualifiers

A qualifier we don't know is searched as plain text rather than ignored, and is
reported back in the response's `unknown` field. So `athor:bob` (a typo) searches for
the literal string `athor:bob` instead of silently returning everything.

---

## Using it from the API

The same syntax works on the search endpoint:

```
GET /api/search/blogs?q=tag:hacktoberfest+sort:likes&limit=20
```

| Param | Meaning |
|---|---|
| `q` | the query, including qualifiers |
| `limit` | max results (default 10, max 20) |
| `fields` | extra data to include: `tags`, `views`, `likes`, `comments` |
| `status` | statuses to search when `is:` isn't given (default `published,unlisted`) |

Response:

```jsonc
{
  "blogs": [ /* … */ ],
  "unknown": ["athor:bob"]   // qualifiers we didn't recognise
}
```

The grammar lives in [`lib/searchQuery.js`](https://github.com/elixpo/blogs.elixpo/blob/main/lib/searchQuery.js); its tests are in
[`tests/searchQuery.test.mjs`](https://github.com/elixpo/blogs.elixpo/blob/main/tests/searchQuery.test.mjs).
