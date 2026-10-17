import crypto from "crypto";
import fs from "fs";
import path from "path";

import { MAX_NEWS_ITEMS, NEWS_VOICES } from "../config.js";
import { uploadBuffer } from "../storage.js";
import { compressThumbnail, compressBanner, extractDominantColor } from "../compress.js";
import { fetchTrendingTopics } from "./topics.js";
import { generateNewsAnalysis, generateNewsScript } from "./analysis.js";
import { generateVoiceover } from "./voiceover.js";
import {
  generateVisualPrompt,
  generateBannerImage,
  createCombinedVisualPrompt,
  generateThumbnailImage,
  createCombinedNewsSummary,
} from "./images.js";

const TMP_ROOT = path.resolve("tmp/news");
const BACKUP_FILE = path.join(TMP_ROOT, "_backup.json");
const CLOUDINARY_ROOT = "elixpochat/news";

function ensureDirs(totalItems) {
  if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
  for (let i = 0; i < totalItems; i++) {
    const dir = path.join(TMP_ROOT, `item_${i}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanupTmp() {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  console.log("🧹 Cleaned up tmp/news/");
}

function logBackup(state) {
  if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function loadBackup() {
  if (!fs.existsSync(BACKUP_FILE)) return null;
  return JSON.parse(fs.readFileSync(BACKUP_FILE, "utf-8"));
}

function writeMetadata(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function safeRetry(fn, retries = 2, wait = 5000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < retries) {
        console.log(`Retry ${i + 1}/${retries} after error: ${err.message}`);
        await new Promise((r) => setTimeout(r, wait));
      } else throw err;
    }
  }
}

/**
 * Fix a specific news item — retries banner/thumbnail/audio for a single item.
 * Reads from tmp/news/item_N/metadata.json and _backup.json.
 * Usage: node run.js --news --fix=0
 */
export async function fixNewsItem(db, itemIndex) {
  console.log(`🔧 Fixing news item ${itemIndex}...`);
  const backup = loadBackup();
  if (!backup) { console.error("❌ No backup found. Run the full pipeline first."); return; }

  const items = backup.items;
  const item = items[itemIndex];
  if (!item) { console.error(`❌ Item ${itemIndex} not found in backup.`); return; }

  const itemDir = path.join(TMP_ROOT, `item_${itemIndex}`);
  if (!fs.existsSync(itemDir)) fs.mkdirSync(itemDir, { recursive: true });

  const topic = item.topic;
  console.log(`  Topic: ${topic}`);
  console.log(`  Status: ${item.status}`);
  console.log(`  Banner: ${item.image_url || "MISSING"}`);
  console.log(`  Thumbnail: ${item.thumbnail_url || "MISSING"}`);
  console.log(`  Audio: ${item.audio_url || "MISSING"}`);

  // Retry banner if missing
  if (!item.image_url) {
    console.log("  🖼️ Retrying banner...");
    try {
      const prompt = await generateVisualPrompt(topic);
      const rawImg = await safeRetry(() => generateBannerImage(prompt));
      const imgBuffer = compressBanner(rawImg, path.join(itemDir, "banner"));
      fs.writeFileSync(path.join(itemDir, "banner.jpg"), imgBuffer);
      const gc = extractDominantColor(imgBuffer, path.join(itemDir, "banner_color"));
      const bannerUrl = await uploadBuffer(imgBuffer, `${CLOUDINARY_ROOT}/item_${itemIndex}`, "banner");
      item.image_url = bannerUrl;
      item.gradient_color = gc;
      console.log(`  ✅ Banner fixed: ${bannerUrl}`);
    } catch (err) {
      console.error(`  ❌ Banner still failing: ${err.message}`);
    }
  }

  // Retry thumbnail if missing
  if (!item.thumbnail_url) {
    console.log("  🎨 Retrying thumbnail...");
    try {
      const prompt = await generateVisualPrompt(topic);
      const rawThumb = await safeRetry(() => generateThumbnailImage(prompt));
      const thumbBuffer = compressThumbnail(rawThumb, path.join(itemDir, "thumbnail"));
      fs.writeFileSync(path.join(itemDir, "thumbnail.jpg"), thumbBuffer);
      const thumbUrl = await uploadBuffer(thumbBuffer, `${CLOUDINARY_ROOT}/item_${itemIndex}`, "thumbnail");
      item.thumbnail_url = thumbUrl;
      console.log(`  ✅ Thumbnail fixed: ${thumbUrl}`);
    } catch (err) {
      console.error(`  ❌ Thumbnail still failing: ${err.message}`);
    }
  }

  // Retry audio if missing
  if (!item.audio_url && item.sections) {
    console.log("  🎙️ Retrying audio...");
    try {
      const { buffer: audioBuffer, timeline } = await safeRetry(() => generateVoiceover(item.sections, itemIndex));
      fs.writeFileSync(path.join(itemDir, "audio.mp3"), audioBuffer);
      const audioUrl = await uploadBuffer(audioBuffer, `${CLOUDINARY_ROOT}/item_${itemIndex}`, "audio", "video");
      item.audio_url = audioUrl;
      item.timeline = timeline;
      item.status = "complete";
      console.log(`  ✅ Audio fixed: ${audioUrl}`);
    } catch (err) {
      console.error(`  ❌ Audio still failing: ${err.message}`);
    }
  }

  // Save
  items[itemIndex] = item;
  logBackup(backup);

  // Update metadata
  writeMetadata(path.join(itemDir, "metadata.json"), {
    news_id: item.news_id, topic: item.topic, category: item.category,
    source_link: item.source_link, timestamp: item.timestamp,
    audio_url: item.audio_url, thumbnail_url: item.thumbnail_url,
    image_url: item.image_url, gradient_color: item.gradient_color,
    timeline: item.timeline,
  });

  console.log(`✅ Item ${itemIndex} fix complete.`);
}

/**
 * Run the full news generation pipeline.
 * @param {D1Database} db - Cloudflare D1 database
 */
export async function runNewsPipeline(db) {
  console.log("🚀 Starting news pipeline...");

  let backup = loadBackup();
  let overallId, topicResults, items;

  if (backup) {
    overallId = backup.overall_id;
    topicResults = backup.topics;
    items = backup.items;
    console.log("🗂️ Resumed from backup.");
  } else {
    topicResults = await fetchTrendingTopics();
    if (!topicResults.length) {
      console.log("⚠️ No trending topics found.");
      return;
    }
    const now = new Date().toISOString().replace(/\D/g, "");
    overallId = crypto.createHash("sha256").update(now).digest("hex").slice(0, 16);
    items = Array.from({ length: topicResults.length }, () => ({}));
    backup = { overall_id: overallId, topics: topicResults, items, status: "started" };
    logBackup(backup);
  }

  const totalItems = Math.min(topicResults.length, MAX_NEWS_ITEMS);
  ensureDirs(totalItems);

  for (let index = 0; index < totalItems; index++) {
    const { title: topic, category } = topicResults[index];
    const newsId = crypto.createHash("sha256").update(`${topic}-${index}-${overallId}`).digest("hex").slice(0, 16);
    const item = items[index] || {};
    const itemDir = path.join(TMP_ROOT, `item_${index}`);

    item.news_id = item.news_id || newsId;
    item.topic = item.topic || topic;
    item.category = item.category || category;

    // Skip if fully complete (has audio). Allow re-entry for missing banner.
    if (item.status === "complete" && item.audio_url) {
      // Retry banner if it's missing
      if (!item.image_url) {
        console.log(`🔄 Retrying banner for [${category}]: ${topic}`);
        try {
          const prompt = await generateVisualPrompt(item.topic);
          const rawImg = await safeRetry(() => generateBannerImage(prompt));
          const imgBuffer = compressBanner(rawImg, path.join(itemDir, "banner"));
          fs.writeFileSync(path.join(itemDir, "banner.jpg"), imgBuffer);
          const gc = extractDominantColor(imgBuffer, path.join(itemDir, "banner_color"));
          const imageUrl = await uploadBuffer(imgBuffer, `${CLOUDINARY_ROOT}/item_${index}`, "banner");
          item.image_url = imageUrl;
          item.gradient_color = gc;
          items[index] = item;
          logBackup(backup);
          console.log(`✅ Banner recovered for topic ${index}`);
        } catch (err) {
          console.warn(`⚠️ Banner retry failed for topic ${index}: ${err.message}`);
        }
      }
      console.log(`✅ Skipping complete [${category}]: ${topic}`);
      continue;
    }

    console.log(`⚙️ [${index + 1}/${totalItems}] [${category}] ${topic}`);

    const prevTopic = index > 0 ? topicResults[index - 1].title : null;
    const nextTopic = index < totalItems - 1 ? topicResults[index + 1].title : null;
    const voice = NEWS_VOICES[index % NEWS_VOICES.length];

    // Step 1: Script
    if (!item.status || item.status === "started" || item.status?.includes("script_failed")) {
      try {
        const info = await safeRetry(() => generateNewsAnalysis(topic));
        const scriptData = await safeRetry(() => generateNewsScript(info, prevTopic, nextTopic, index, totalItems));
        item.timestamp = new Date().toISOString();
        item.script = scriptData.script;
        item.sections = scriptData.sections;
        item.source_link = scriptData.source_link || "";
        item.status = "script_generated";
        item.error = null;
        items[index] = item;

        // Save script to item folder
        fs.writeFileSync(path.join(itemDir, "script.txt"), item.script, "utf-8");
        logBackup(backup);
        console.log(`✅ Script generated for topic ${index}`);
      } catch (err) {
        item.status = `news${index}_script_failed`;
        item.error = err.message;
        items[index] = item;
        logBackup(backup);
        console.error(`❌ Script error for topic ${index}: ${err.message}`);
        continue;
      }
    }

    // Step 2: Banner + Thumbnail (non-blocking — if either fails, proceed to audio)
    if (item.status === "script_generated" || item.status?.includes("image_failed")) {
      // Banner
      try {
        const prompt = await generateVisualPrompt(item.topic);
        const rawImg = await safeRetry(() => generateBannerImage(prompt));
        const imgBuffer = compressBanner(rawImg, path.join(itemDir, "banner"));
        fs.writeFileSync(path.join(itemDir, "banner.jpg"), imgBuffer);
        const gradientColor = extractDominantColor(imgBuffer, path.join(itemDir, "banner_color"));
        const bannerUrl = await uploadBuffer(imgBuffer, `${CLOUDINARY_ROOT}/item_${index}`, "banner");
        item.image_url = bannerUrl;
        item.gradient_color = gradientColor;
        console.log(`✅ Banner uploaded for topic ${index}`);
      } catch (err) {
        console.warn(`⚠️ Banner failed for topic ${index}: ${err.message}`);
        item.image_url = "";
        item.gradient_color = "#1a1a2e";
      }

      // Thumbnail
      try {
        const thumbPrompt = await generateVisualPrompt(item.topic);
        const rawThumb = await safeRetry(() => generateThumbnailImage(thumbPrompt));
        const thumbBuffer = compressThumbnail(rawThumb, path.join(itemDir, "thumbnail"));
        fs.writeFileSync(path.join(itemDir, "thumbnail.jpg"), thumbBuffer);
        const thumbUrl = await uploadBuffer(thumbBuffer, `${CLOUDINARY_ROOT}/item_${index}`, "thumbnail");
        item.thumbnail_url = thumbUrl;
        console.log(`✅ Thumbnail uploaded for topic ${index}`);
      } catch (err) {
        console.warn(`⚠️ Thumbnail failed for topic ${index}: ${err.message}`);
        item.thumbnail_url = "";
      }

      item.status = "image_uploaded";
      item.error = null;
      items[index] = item;
      logBackup(backup);
    }

    // Step 3: Audio (multi-voice) + Timeline
    if (item.status === "image_uploaded" || item.status?.includes("audio_failed")) {
      try {
        console.log(`🎙️ Generating multi-voice audio for topic ${index}...`);
        const { buffer: audioBuffer, timeline } = await safeRetry(() => generateVoiceover(item.sections || [{ type: "female", content: item.script }], index));

        fs.writeFileSync(path.join(itemDir, "audio.mp3"), audioBuffer);

        const audioUrl = await uploadBuffer(audioBuffer, `${CLOUDINARY_ROOT}/item_${index}`, "audio", "video");
        const timelineUrl = await uploadBuffer(Buffer.from(JSON.stringify(timeline)), `${CLOUDINARY_ROOT}/item_${index}`, "timeline", "raw");

        item.audio_url = audioUrl;
        item.timeline = timeline;
        item.timeline_url = timelineUrl;
        item.status = "complete";
        item.error = null;
        items[index] = item;

        // Write item metadata
        writeMetadata(path.join(itemDir, "metadata.json"), {
          news_id: item.news_id,
          topic: item.topic,
          category: item.category,
          source_link: item.source_link,
          timestamp: item.timestamp,
          audio_url: item.audio_url,
          timeline,
          image_url: item.image_url,
        });

        logBackup(backup);
        console.log(`✅ Complete: topic ${index}`);
      } catch (err) {
        item.status = `news${index}_audio_failed`;
        item.error = err.message;
        items[index] = item;
        logBackup(backup);
        console.error(`❌ Audio error for topic ${index}: ${err.message}`);
        continue;
      }
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  // Final: Thumbnail & Summary
  const allComplete = items.every((it) => it.status === "complete");
  if (!allComplete) {
    console.log("⚠️ Not all items complete. Final steps skipped.");
    return;
  }

  try {
    console.log("🖼️ Generating final thumbnail & summary...");
    const completedTopics = items.map((it) => it.topic).filter(Boolean);

    const thumbPrompt = await createCombinedVisualPrompt(completedTopics);
    const rawThumb = await generateThumbnailImage(thumbPrompt);
    const thumbBuffer = compressThumbnail(rawThumb, path.join(TMP_ROOT, "thumbnail"));
    fs.writeFileSync(path.join(TMP_ROOT, "thumbnail.jpg"), thumbBuffer);
    const thumbUrl = await uploadBuffer(thumbBuffer, CLOUDINARY_ROOT, "thumbnail");

    const summaryText = await createCombinedNewsSummary(completedTopics);

    const dbItems = items.map((it) => ({
      audio_url: it.audio_url,
      topic: it.topic,
      category: it.category,
      image_url: it.image_url,
      thumbnail_url: it.thumbnail_url,
      source_link: it.source_link,
      gradient_color: it.gradient_color,
      timeline: it.timeline,
    }));

    await db.prepare("INSERT OR REPLACE INTO news (id, items) VALUES (?, ?)").bind(overallId, JSON.stringify(dbItems)).run();

    const statsData = JSON.stringify({
      latestNewsId: overallId,
      latestNewsThumbnail: thumbUrl,
      latestNewsSummary: summaryText,
      latestNewsDate: new Date().toISOString(),
    });
    await db.prepare("INSERT OR REPLACE INTO gen_stats (key, data) VALUES (?, ?)").bind("news", statsData).run();

    // Write overall metadata
    writeMetadata(path.join(TMP_ROOT, "metadata.json"), {
      id: overallId,
      date: new Date().toISOString(),
      summary: summaryText,
      thumbnail_url: thumbUrl,
      total_items: totalItems,
      items: dbItems,
    });

    // cleanupTmp();
    console.log("✅ News pipeline complete!");
  } catch (err) {
    backup.status = "final_error";
    backup.error = err.message;
    logBackup(backup);
    console.error(`❌ Final step error: ${err.message}`);
  }
}
