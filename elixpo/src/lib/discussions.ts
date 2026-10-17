import "server-only";
import discussions from "../../content/discussions.json";

type GitHubDiscussion = {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  comments: number;
  locked: boolean;
  answer_chosen_at: string | null;
  user: { login: string; html_url: string };
  category: { name: string };
};

export type PublicDiscussion = {
  number: number;
  title: string;
  url: string;
  category: string;
  author: string;
  authorUrl: string;
  updatedAt: string;
  comments: number;
  answered: boolean;
};

export const DISCUSSIONS_CONFIG = discussions;

function requestHeaders() {
  const token = process.env.ELIXPO_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function isEligible(record: GitHubDiscussion, category?: string) {
  const excludedNumbers = new Set<number>(discussions.moderation.excludedDiscussionNumbers);
  const excludedAuthors = new Set<string>(discussions.moderation.excludedAuthors);
  return discussions.eligibleCategories.includes(record.category.name)
    && (!category || record.category.name === category)
    && (!discussions.moderation.excludeLocked || !record.locked)
    && !excludedNumbers.has(record.number)
    && !excludedAuthors.has(record.user.login);
}

function toPublicDiscussion(record: GitHubDiscussion): PublicDiscussion {
  return {
    number: record.number,
    title: record.title,
    url: record.html_url,
    category: record.category.name,
    author: record.user.login,
    authorUrl: record.user.html_url,
    updatedAt: record.updated_at,
    comments: record.comments,
    answered: Boolean(record.answer_chosen_at),
  };
}

export async function getLatestDiscussions(limit = 8, category?: string): Promise<PublicDiscussion[]> {
  if (discussions.status !== "active") return [];

  try {
    const response = await fetch(`${discussions.apiUrl}?per_page=30&sort=updated&direction=desc`, {
      headers: requestHeaders(),
      next: { revalidate: discussions.refreshSeconds, tags: ["elixpo-discussions"] },
    });
    if (!response.ok) return [];

    const records = await response.json() as GitHubDiscussion[];
    return records
      .filter((record) => isEligible(record, category))
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
      .slice(0, limit)
      .map(toPublicDiscussion);
  } catch {
    return [];
  }
}

export async function getFeaturedDiscussions(): Promise<PublicDiscussion[]> {
  if (discussions.status !== "active" || !discussions.moderation.featuredRequiresEditorialSelection) return [];
  const selected = discussions.featuredDiscussionNumbers;
  if (selected.length === 0) return [];

  const records = await Promise.all(selected.map(async (number) => {
    try {
      const response = await fetch(`${discussions.apiUrl}/${number}`, {
        headers: requestHeaders(),
        next: { revalidate: discussions.refreshSeconds, tags: ["elixpo-discussions"] },
      });
      return response.ok ? await response.json() as GitHubDiscussion : null;
    } catch {
      return null;
    }
  }));

  return records
    .filter((record): record is GitHubDiscussion => record !== null && isEligible(record))
    .map(toPublicDiscussion);
}
