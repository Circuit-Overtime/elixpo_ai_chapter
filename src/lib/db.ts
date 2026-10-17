import type { News, NewsDetails, Podcast, PodcastDetails } from "./types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

async function getDB(): Promise<D1Database> {
  const { env } = await getCloudflareContext();
  return (env as any).DB;
}

export async function getTodaysNews(): Promise<News | null> {
  const db = await getDB();

  const statsRow = await db
    .prepare("SELECT data FROM gen_stats WHERE key = ?")
    .bind("news")
    .first<{ data: string }>();

  if (!statsRow) return null;
  const stats: NewsDetails = JSON.parse(statsRow.data);

  const newsRow = await db
    .prepare("SELECT id, items FROM news WHERE id = ?")
    .bind(stats.latestNewsId)
    .first<{ id: string; items: string }>();

  if (!newsRow) return null;
  return { id: newsRow.id, items: JSON.parse(newsRow.items) };
}

export async function getTodaysNewsDetails(): Promise<NewsDetails | null> {
  const db = await getDB();

  const row = await db
    .prepare("SELECT data FROM gen_stats WHERE key = ?")
    .bind("news")
    .first<{ data: string }>();

  if (!row) return null;
  return JSON.parse(row.data);
}

export async function getTodaysPodcast(): Promise<Podcast | null> {
  const db = await getDB();

  const statsRow = await db
    .prepare("SELECT data FROM gen_stats WHERE key = ?")
    .bind("podcast")
    .first<{ data: string }>();

  if (!statsRow) return null;
  const stats: PodcastDetails = JSON.parse(statsRow.data);

  const podcastRow = await db
    .prepare(
      "SELECT id, podcast_name, podcast_audio_url, podcast_music_url, podcast_transcript_url, podcast_thumbnail_url, podcast_banner_url, topic_source FROM podcasts WHERE id = ?"
    )
    .bind(stats.latestPodcastID)
    .first<Podcast>();

  return podcastRow || null;
}

export async function getTodaysPodcastDetails(): Promise<PodcastDetails | null> {
  const db = await getDB();

  const row = await db
    .prepare("SELECT data FROM gen_stats WHERE key = ?")
    .bind("podcast")
    .first<{ data: string }>();

  if (!row) return null;
  return JSON.parse(row.data);
}
