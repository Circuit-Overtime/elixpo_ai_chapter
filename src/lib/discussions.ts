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

export async function getLatestDiscussions(limit = 8, category?: string): Promise<PublicDiscussion[]> {
  if (discussions.status !== "active") return [];
  const token = process.env.ELIXPO_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  const excludedNumbers = new Set<number>(discussions.moderation.excludedDiscussionNumbers);
  const excludedAuthors = new Set<string>(discussions.moderation.excludedAuthors);

  try {
    const response = await fetch(`${discussions.apiUrl}?per_page=30&sort=updated&direction=desc`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: discussions.refreshSeconds, tags: ["elixpo-discussions"] },
    });
    if (!response.ok) return [];

    const records = await response.json() as GitHubDiscussion[];
    return records
      .filter((record) => discussions.eligibleCategories.includes(record.category.name))
      .filter((record) => !category || record.category.name === category)
      .filter((record) => !discussions.moderation.excludeLocked || !record.locked)
      .filter((record) => !excludedNumbers.has(record.number))
      .filter((record) => !excludedAuthors.has(record.user.login))
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
      .slice(0, limit)
      .map((record) => ({
        number: record.number,
        title: record.title,
        url: record.html_url,
        category: record.category.name,
        author: record.user.login,
        authorUrl: record.user.html_url,
        updatedAt: record.updated_at,
        comments: record.comments,
        answered: Boolean(record.answer_chosen_at),
      }));
  } catch {
    return [];
  }
}
