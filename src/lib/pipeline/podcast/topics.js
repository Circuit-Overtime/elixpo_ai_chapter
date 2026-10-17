import { chatCompletion } from "../pollinations.js";
import { MODELS } from "../config.js";
import { POLLINATIONS_API_KEY } from "../config.js";

const FEEDS = [
  "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en&gl=US&ceid=US:en",
  "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en&gl=US&ceid=US:en",
  "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en&gl=US&ceid=US:en",
  "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en&gl=US&ceid=US:en",
];

const POSITIVE_KEYWORDS = [
  "launch",
  "innovation",
  "discovery",
  "research",
  "tech",
  "startup",
  "breakthrough",
  "win",
  "record",
  "victory",
  "gold",
  "award",
  "space",
  "robotics",
  "climate solution",
  "medicine",
  "cure",
  "development",
  "success",
  "clean energy",
  "milestone",
  "achievement",
];

export async function fetchPodcastTopics() {
  const headlines = [];

  for (const feedUrl of FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const titleMatches = [
        ...xml.matchAll(
          /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>|<item>[\s\S]*?<title>(.*?)<\/title>/g
        ),
      ];

      for (const match of titleMatches) {
        const title = (match[1] || match[2] || "").trim();
        if (!title) continue;
        const lower = title.toLowerCase();
        if (
          POSITIVE_KEYWORDS.some((kw) => lower.includes(kw))
        ) {
          headlines.push(title);
        }
      }
    } catch (err) {
      console.error(`Error fetching ${feedUrl}: ${err.message}`);
    }
  }

  headlines.sort(() => Math.random() - 0.5);
  return headlines.slice(0, Math.min(5, headlines.length));
}

export async function pickPodcastTopic(topics) {
  console.log("🎯 Picking best podcast topic...");
  const raw = await chatCompletion({
    model: MODELS.scriptWriter,
    messages: [
      {
        role: "system",
        content:
          "You provide suggestions for engaging discussions. " +
          "Here are trending topics at the moment. Pick the most trending topic, " +
          "which avoids political or controversial bias and leans into curiosity, human interest, or general engagement. " +
          "Return a podcast title with just 5–6 words, exciting and creative. " +
          "Also return the URL of the source of the podcast topic. " +
          'Return JSON: {"podcast_title": "Name of the Topic", "source_url": "https link of the topic"}',
      },
      { role: "user", content: `These are the available topics:\n${topics.join("\n")}` },
    ],
    json: true,
    seed: Math.floor(Math.random() * 1000),
  });

  const parsed = JSON.parse(raw);
  console.log(`✅ Picked topic: ${parsed.podcast_title}`);
  return parsed;
}
