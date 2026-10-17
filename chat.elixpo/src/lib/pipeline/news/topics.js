import { MAX_NEWS_ITEMS } from "../config.js";

const CATEGORIZED_FEEDS = {
  tech: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en&gl=US&ceid=US:en",
  science: "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en&gl=US&ceid=US:en",
  sports: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en&gl=US&ceid=US:en",
  health: "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en&gl=US&ceid=US:en",
  entertainment: "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en&gl=US&ceid=US:en",
  travel: "https://news.google.com/rss/headlines/section/topic/TRAVEL?hl=en&gl=US&ceid=US:en",
  business: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en",
};

export const CATEGORY_LABELS = ["Tech", "Science", "Sports", "Health", "Entertainment", "Travel", "Business"];

const POSITIVE_KEYWORDS = [
  "launch", "innovation", "discovery", "research", "technology", "startup", "breakthrough",
  "win", "victory", "award", "space", "robotics", "ai", "artificial intelligence",
  "quantum", "renewable", "sustainability", "clean energy", "climate", "solar", "electric",
  "medicine", "cure", "development", "progress", "achievement", "milestone", "solution", "success",
  "education", "exploration", "expedition", "feature", "culture", "film", "music", "festival",
  "performance", "exhibition", "design", "growth", "expansion", "release", "announcement",
  "collaboration", "partnership", "support", "investment", "health", "fitness", "recovery",
  "wildlife", "conservation", "art", "celebration", "record-breaking", "positive",
];

const EXCLUSION_KEYWORDS = [
  "scandal", "lawsuit", "crime", "accident", "death", "controversy", "fraud", "hack", "attack",
  "layoff", "bankruptcy", "recall", "crisis", "collapse", "loss", "murder", "violence", "war",
  "conflict", "protest", "riot", "abuse", "shooting", "rape", "dead", "tragedy", "terror",
  "arrested", "charged", "explosion", "died", "injured", "casualty", "hostage", "detained",
  "disaster", "emergency", "hate", "racism", "xenophobia", "extremism", "clash", "corruption",
];

/**
 * Fetch exactly 1 trending headline per category (7 total).
 * Returns array of { title, category } objects.
 */
export async function fetchTrendingTopics() {
  console.log("🔍 Fetching trending topics (1 per category)...");
  const results = [];

  const categories = Object.keys(CATEGORIZED_FEEDS);

  for (const category of categories) {
    if (results.length >= MAX_NEWS_ITEMS) break;

    const feedUrl = CATEGORIZED_FEEDS[category];
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const titleMatches = [...xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>|<item>[\s\S]*?<title>(.*?)<\/title>/g)];

      let picked = false;
      for (const match of titleMatches) {
        if (picked) break;
        const rawTitle = (match[1] || match[2] || "").trim();
        if (!rawTitle) continue;
        const titleLower = rawTitle.toLowerCase();

        const hasPositive = POSITIVE_KEYWORDS.some((kw) => titleLower.includes(kw));
        const hasExclusion = EXCLUSION_KEYWORDS.some((kw) => titleLower.includes(kw));

        if (hasPositive && !hasExclusion) {
          results.push({ title: rawTitle, category });
          picked = true;
        }
      }

      // Fallback: if no positive match, take the first non-excluded headline
      if (!picked) {
        for (const match of titleMatches) {
          const rawTitle = (match[1] || match[2] || "").trim();
          if (!rawTitle) continue;
          const titleLower = rawTitle.toLowerCase();
          if (!EXCLUSION_KEYWORDS.some((kw) => titleLower.includes(kw))) {
            results.push({ title: rawTitle, category });
            break;
          }
        }
      }
    } catch (err) {
      console.error(`  ❌ Error fetching ${category}: ${err.message}`);
    }
  }

  console.log(`✅ Found ${results.length} topics across ${categories.length} categories`);
  return results;
}
