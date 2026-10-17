/** Pulls the public changelog gists (gist.github.com/elixpoo) for the status
 * page's "Recent changes" section. Cached ~10 min (GitHub anon rate limit). */

import { cached } from "./kv";

export interface ChangeLogItem {
    project: string;
    description: string;
    url: string;
    updatedAt: string;
}

export async function fetchChangelogs(limit = 6): Promise<ChangeLogItem[]> {
    return cached("changelogs:elixpoo", 600, async () => {
        try {
            const res = await fetch(
                "https://api.github.com/users/elixpoo/gists?per_page=30",
                {
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "User-Agent": "elixpo-admin",
                    },
                },
            );
            if (!res.ok) return [];
            const gists = (await res.json()) as {
                description?: string;
                html_url: string;
                updated_at: string;
            }[];

            const items: ChangeLogItem[] = gists
                .filter((g) => /change\s*log/i.test(g.description || ""))
                .map((g) => {
                    const desc = String(g.description || "");
                    const project = desc.split(/[—-]/)[0].trim() || "Elixpo";
                    return {
                        project,
                        description: desc,
                        url: g.html_url,
                        updatedAt: g.updated_at,
                    };
                });

            // Dedupe by project (keep the most recent gist per project).
            const byProject = new Map<string, ChangeLogItem>();
            for (const it of items) {
                const ex = byProject.get(it.project);
                if (!ex || it.updatedAt > ex.updatedAt)
                    byProject.set(it.project, it);
            }
            return Array.from(byProject.values())
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, limit);
        } catch {
            return [];
        }
    });
}
