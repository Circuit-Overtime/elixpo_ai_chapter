# Short links in published writing

Use Lixrl only for public destinations the author deliberately selects. Do not shorten draft URLs, preview links, private documents, citations, source references, or every link in a post automatically.

## Procedure

1. Identify the canonical destination and confirm it is already public.
2. Show the author the destination, proposed title, campaign, tags, and where the short link will appear. Obtain approval before changing the post.
3. Create the link with attributable metadata:

```bash
lixrl urls create "https://example.com/canonical-page" \
  --title "Post title — destination" \
  --campaign "blog-post-slug" \
  --tag blog \
  --tag "post-slug" \
  --json --no-input
```

4. Replace only the approved occurrence and preserve the original destination in the authoring record.
5. Before publication, verify the returned short URL resolves to the intended canonical destination.

If Lixrl authentication is missing, stop without changing the draft. Ask the user to complete `lixrl login --open`, then verify with `lixrl whoami --json --no-input`. LixBlogs OAuth credentials and Lixrl API keys are separate and must never be substituted for each other.
