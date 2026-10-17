/**
 * Optional metadata — NOT a registry. Maps a discovered Cloudflare resource to a
 * friendly label, owning project, public domain, and known business tables.
 * Anything not listed here still renders generically (auto-labeled from its CF
 * name), so discovery coverage never depends on this file.
 */

export interface ProjectMeta {
    key: string;
    label: string;
    domain?: string;
    /** GitHub repository for this project (for the public status page issue links). */
    repo?: string;
    /** Known headline D1 tables worth surfacing as "business data" (Phase 2). */
    tables?: string[];
}

const GH = "https://github.com/elixpo";

/** Owning-project metadata keyed by the Cloudflare resource name (Pages/Worker/D1/KV). */
const META: Record<string, ProjectMeta> = {
    // Pages projects
    elixpo: {
        key: "elixpo",
        label: "Elixpo",
        domain: "elixpo.com",
        repo: `${GH}/elixpo`,
    },
    lixblogs: {
        key: "blogs",
        label: "Blogs",
        domain: "blogs.elixpo.com",
        repo: `${GH}/blogs.elixpo`,
    },
    lixsketch: {
        key: "sketch",
        label: "Sketch",
        domain: "sketch.elixpo.com",
        repo: `${GH}/sketch.elixpo`,
    },
    "lixsketch-collab": {
        key: "sketch",
        label: "Sketch Collab",
        domain: "sketch.elixpo.com",
        repo: `${GH}/sketch.elixpo`,
    },
    "elixpo-accounts": {
        key: "accounts",
        label: "Accounts",
        domain: "accounts.elixpo.com",
        repo: `${GH}/accounts.elixpo`,
    },
    elixpome: {
        key: "me",
        label: "Portfolio",
        domain: "me.elixpo.com",
        repo: `${GH}/me.elixpo`,
    },
    "elixpo-pay": {
        key: "pay",
        label: "Payouts",
        domain: "payouts.elixpo.com",
        repo: `${GH}/payouts.elixpo`,
    },
    "elixpo-mail": {
        key: "mail",
        label: "Mail",
        domain: "mails.elixpo.com",
        repo: `${GH}/mails.elixpo`,
    },
    lixsearch: {
        key: "search",
        label: "Search",
        domain: "search.elixpo.com",
        repo: "https://github.com/pollinations/search.elixpo",
    },
    oreo: {
        key: "oreo",
        label: "Oreo",
        domain: "oreo.elixpo.com",
        repo: `${GH}/oreo`,
    },
    "research-elixpo": {
        key: "research",
        label: "Research",
        domain: "research.elixpo.com",
        repo: `${GH}/research.elixpo`,
    },
    "packages-elixpo": {
        key: "packages",
        label: "Packages",
        domain: "packages.elixpo.com",
        repo: `${GH}/packages.elixpo`,
    },
    status: {
        key: "status",
        label: "Status",
        domain: "status.elixpo.com",
        repo: `${GH}/status.elixpo`,
    },
    lixrl: {
        key: "lixrl",
        label: "Lixrl",
        domain: "lixrl.com",
        repo: `${GH}/lixrl.com`,
    },

    // D1 databases (business tables filled in Phase 2 from each app's migrations)
    elixpo_auth: {
        key: "accounts",
        label: "Accounts DB",
        tables: ["users", "oauth_clients", "admin_logs"],
    },
    elixpo_pay: { key: "pay", label: "Payouts DB" },
    elixpo_mail: {
        key: "mail",
        label: "Mail DB",
        tables: ["tenants", "delivery_logs"],
    },
    elixpoblogs: { key: "blogs", label: "Blogs DB" },
    lixblogs_db: { key: "blogs", label: "Blogs DB" },
    lixsketch_db: { key: "sketch", label: "Sketch DB" },
};

export function metaFor(cfName: string): ProjectMeta {
    return META[cfName] || { key: cfName, label: autoLabel(cfName) };
}

/**
 * Every known public product domain (registry entries that carry a `domain`).
 * Used to monitor services regardless of how they're served — Pages auto-
 * discovery only sees Pages projects, so Worker-backed hosts (accounts, payouts,
 * mail, …) are surfaced from here. Deduped by domain, first label wins.
 */
export function knownDomains(): Array<ProjectMeta & { domain: string }> {
    const seen = new Set<string>();
    const out: Array<ProjectMeta & { domain: string }> = [];
    for (const m of Object.values(META)) {
        if (!m.domain || seen.has(m.domain)) continue;
        seen.add(m.domain);
        out.push(m as ProjectMeta & { domain: string });
    }
    return out;
}

/** Turn "elixpo-mail" / "lixsketch_collab" into "Elixpo Mail" / "Lixsketch Collab". */
export function autoLabel(name: string): string {
    return name
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
