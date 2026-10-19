interface Env {
  ELIXPO_DASHBOARD_GITHUB_TOKEN?: string;
  ELIXPO_GITHUB_CONTROL_REPO: string;
}

type JsonObject = Record<string, unknown>;
type FloorSlug = "operations" | "oreoflow" | "discussions";

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function floorForWorkflow(name: string): FloorSlug {
  const value = name.toLowerCase();
  if (value.includes("discussion")) return "discussions";
  if (["repository agent", "mention", "ack", "issue intake", "approval", "pr review"].some((term) => value.includes(term))) return "operations";
  return "oreoflow";
}

function receiptTime(data: JsonObject): string {
  for (const key of ["updated_at", "checked_at", "decided_at", "cleaned_at", "submitted_at", "failed_at", "started_at", "picked_at", "evaluated_at"]) {
    const value = text(data[key]);
    if (value) return value;
  }
  return "";
}

function parseReceipt(name: string, source: string) {
  try {
    const data = JSON.parse(source) as JsonObject;
    const failure = typeof data.failure === "object" && data.failure ? data.failure as JsonObject : {};
    return {
      name,
      status: text(data.status, text(data.action, "recorded")),
      stage: text(data.stage, text(failure.stage, name)),
      key: text(data.key),
      issueUrl: text(data.issue_url),
      runId: text(data.run_id),
      tokenSpent: number(data.token_spent) ?? number(data.spent),
      tokenLimit: number(data.token_limit) ?? number(data.solve_token_budget),
      updatedAt: receiptTime(data),
      detail: text(data.error) || text(data.reason) || text(data.summary) || text(failure.message) || `${name} state recorded`,
    };
  } catch {
    return null;
  }
}

async function github<T>(path: string, token: string, raw = false): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "agent-elixpo-dashboard",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status} for ${path}`);
  return (raw ? response.text() : response.json()) as Promise<T>;
}

async function settled<T>(label: string, request: Promise<T>, warnings: string[]): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : "request failed"}`);
    return null;
  }
}

function securityEvents(runs: JsonObject[], receipts: JsonObject[]) {
  const workflowEvents = runs
    .filter((run) => text(run.name).toLowerCase().includes("security") || ["failure", "cancelled", "timed_out", "action_required"].includes(text(run.conclusion)))
    .map((run) => ({ id: `run-${number(run.id) || 0}`, title: text(run.name), detail: `${text(run.event)} on ${text(run.branch)} · ${text(run.conclusion) || text(run.status)}`, level: run.conclusion === "success" ? "success" : run.conclusion ? "warning" : "info", occurredAt: text(run.updatedAt), url: text(run.url) || null, source: "GitHub Actions" }));
  const receiptEvents = receipts
    .filter((receipt) => receipt.name === "doctor" || receipt.name === "janitor")
    .map((receipt) => ({ id: `receipt-${text(receipt.name)}-${text(receipt.runId) || text(receipt.updatedAt)}`, title: `${text(receipt.name).replace(/^./, (value) => value.toUpperCase())} · ${text(receipt.status)}`, detail: text(receipt.detail), level: ["complete", "continue", "healthy"].includes(text(receipt.status)) ? "success" : receipt.status === "terminate" ? "critical" : "info", occurredAt: text(receipt.updatedAt), url: text(receipt.issueUrl) || null, source: `state/${text(receipt.name)}.json` }));
  return [...workflowEvents, ...receiptEvents].filter((event) => event.occurredAt).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
}

async function snapshot(env: Env) {
  const warnings: string[] = [];
  const controlRepo = env.ELIXPO_GITHUB_CONTROL_REPO || "elixpo/agent.elixpo";
  const [owner, repo] = controlRepo.split("/", 2);
  if (!owner || !repo) throw new Error("ELIXPO_GITHUB_CONTROL_REPO must be owner/repository");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const token = env.ELIXPO_DASHBOARD_GITHUB_TOKEN || "";
  const stateNames = ["solve", "doctor", "janitor", "vet", "submit", "pick", "project"];
  const [repositoryData, runsData, issuesData, pullsData, commitsData, ...stateData] = await Promise.all([
    settled("repository", github<JsonObject>(base, token), warnings),
    settled("workflow runs", github<{ workflow_runs?: JsonObject[] }>(`${base}/actions/runs?per_page=100`, token), warnings),
    settled("issues", github<JsonObject[]>(`${base}/issues?state=all&sort=updated&direction=desc&per_page=50`, token), warnings),
    settled("pull requests", github<JsonObject[]>(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=30`, token), warnings),
    settled("commits", github<JsonObject[]>(`${base}/commits?per_page=20`, token), warnings),
    ...stateNames.map((name) => settled(`state/${name}.json`, github<string>(`${base}/contents/state/${name}.json`, token, true), warnings)),
  ]);

  const repositoryOwner = repositoryData?.owner as JsonObject | undefined;
  const repository = { fullName: text(repositoryData?.full_name, controlRepo), url: text(repositoryData?.html_url, `https://github.com/${controlRepo}`), avatarUrl: text(repositoryOwner?.avatar_url), owner: text(repositoryOwner?.login, owner), description: text(repositoryData?.description), defaultBranch: text(repositoryData?.default_branch, "main") };
  const runs = (runsData?.workflow_runs || []).map((item) => {
    const actor = item.actor as JsonObject | undefined;
    const name = text(item.name, "Unnamed workflow");
    const rawStatus = text(item.status, "unknown");
    return { id: number(item.id) || 0, name, status: ["queued", "in_progress", "completed"].includes(rawStatus) ? rawStatus : "unknown", conclusion: text(item.conclusion) || null, event: text(item.event, "unknown"), branch: text(item.head_branch, repository.defaultBranch), actor: text(actor?.login, "github"), actorAvatar: text(actor?.avatar_url), createdAt: text(item.created_at), updatedAt: text(item.updated_at), url: text(item.html_url), attempt: number(item.run_attempt) || 1, floor: floorForWorkflow(name) };
  });
  const issues = (issuesData || []).filter((item) => !item.pull_request).map((item) => {
    const user = item.user as JsonObject | undefined;
    const labels = Array.isArray(item.labels) ? item.labels : [];
    return { id: number(item.id) || 0, number: number(item.number) || 0, kind: "issue", title: text(item.title), state: text(item.state), url: text(item.html_url), author: text(user?.login), labels: labels.map((label) => typeof label === "string" ? label : text((label as JsonObject).name)).filter(Boolean), createdAt: text(item.created_at), updatedAt: text(item.updated_at), draft: false, mergedAt: null };
  });
  const pulls = (pullsData || []).map((item) => {
    const user = item.user as JsonObject | undefined;
    const labels = Array.isArray(item.labels) ? item.labels : [];
    return { id: number(item.id) || 0, number: number(item.number) || 0, kind: "pull_request", title: text(item.title), state: text(item.state), url: text(item.html_url), author: text(user?.login), labels: labels.map((label) => typeof label === "string" ? label : text((label as JsonObject).name)).filter(Boolean), createdAt: text(item.created_at), updatedAt: text(item.updated_at), draft: Boolean(item.draft), mergedAt: text(item.merged_at) || null };
  });
  const commits = (commitsData || []).map((item) => {
    const commit = item.commit as JsonObject | undefined;
    const commitAuthor = commit?.author as JsonObject | undefined;
    const author = item.author as JsonObject | undefined;
    return { sha: text(item.sha), message: text(commit?.message).split("\n")[0], url: text(item.html_url), author: text(author?.login, text(commitAuthor?.name, "unknown")), authoredAt: text(commitAuthor?.date) };
  });
  const receipts = stateData.map((source, index) => typeof source === "string" ? parseReceipt(stateNames[index], source) : null).filter(Boolean) as JsonObject[];
  return { generatedAt: new Date().toISOString(), repository, runs, work: [...pulls, ...issues].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), commits, receipts, security: securityEvents(runs as unknown as JsonObject[], receipts), warnings };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": status === 200 ? "public, max-age=15, s-maxage=30, stale-while-revalidate=60" : "no-store", "access-control-allow-origin": "*", "x-content-type-options": "nosniff" } });
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "accept" } });
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    if (url.pathname === "/api/health" || url.pathname === "/health") return json({ status: "ok", service: "agent-elixpo-api" });
    if (url.pathname !== "/api/snapshot" && url.pathname !== "/snapshot") return json({ error: "not_found" }, 404);
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = json(await snapshot(env));
      context.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      return json({ error: "snapshot_failed", detail: error instanceof Error ? error.message : "unknown error" }, 502);
    }
  },
};
