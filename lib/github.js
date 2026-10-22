// Minimal GitHub REST helper for server-side moderation automation.
// Authenticates as @elixpoo via the ELIXPOO_GH_TOKEN secret and targets the
// repo named in MODERATION_REPO (e.g. "elixpo/lixblogs").

const GH_API = 'https://api.github.com';

function ghHeaders() {
  // Prefer a dedicated moderation token; fall back to the existing @elixpoo PAT.
  const token = process.env.ELIXPOO_GH_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
  if (!token) throw new Error('No GitHub token (set ELIXPOO_GH_TOKEN or GITHUB_ACCESS_TOKEN)');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'lixblogs-moderation',
    'Content-Type': 'application/json',
  };
}

export function moderationRepo() {
  return process.env.MODERATION_REPO || 'elixpo/lixblogs';
}

export async function createIssue({ title, body, labels = [] }) {
  const res = await fetch(`${GH_API}/repos/${moderationRepo()}/issues`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({ title, body, labels }),
  });
  if (!res.ok) throw new Error(`GitHub createIssue ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json(); // { number, html_url, node_id, ... }
}

export async function commentIssue(number, body) {
  const res = await fetch(`${GH_API}/repos/${moderationRepo()}/issues/${number}/comments`, {
    method: 'POST',
    headers: ghHeaders(),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`GitHub commentIssue ${res.status}`);
  return res.json();
}

export async function closeIssue(number, { comment, stateReason = 'completed' } = {}) {
  if (comment) await commentIssue(number, comment).catch(() => {});
  const res = await fetch(`${GH_API}/repos/${moderationRepo()}/issues/${number}`, {
    method: 'PATCH',
    headers: ghHeaders(),
    body: JSON.stringify({ state: 'closed', state_reason: stateReason }),
  });
  if (!res.ok) throw new Error(`GitHub closeIssue ${res.status}`);
  return res.json();
}
