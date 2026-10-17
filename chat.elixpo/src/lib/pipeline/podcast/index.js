import crypto from "crypto";
import fs from "fs";
import path from "path";

import { uploadBuffer } from "../storage.js";
import { compressThumbnail, compressBanner, extractDominantColor } from "../compress.js";
import { CLOUDINARY_PODCAST_ROOT, MODELS } from "../config.js";
import { generateImage } from "../pollinations.js";
import { BANNER_STYLE } from "../prompts.js";
import { fetchPodcastTopics, pickPodcastTopic } from "./topics.js";
import { getLatestInfo, generatePodcastScript } from "./creator.js";
import { generatePodcastSpeech } from "./audio.js";
import { generatePodcastThumbnail, generatePodcastBanner } from "./images.js";

const TMP_ROOT = path.resolve("tmp/podcast");
const BACKUP_FILE = path.join(TMP_ROOT, "_backup.json");

function ensureTmp() {
  if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
  const carouselDir = path.join(TMP_ROOT, "carousel");
  if (!fs.existsSync(carouselDir)) fs.mkdirSync(carouselDir, { recursive: true });
}

function logBackup(state) {
  ensureTmp();
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function loadBackup() {
  if (!fs.existsSync(BACKUP_FILE)) return null;
  return JSON.parse(fs.readFileSync(BACKUP_FILE, "utf-8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function generatePodcastId(podcastName) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return crypto.createHash("sha256").update(`${timestamp}_${podcastName}`).digest("hex").slice(0, 16);
}

/**
 * Run the podcast pipeline.
 * @param {D1Database} db
 * @param {object} opts - { step: "all"|"topic"|"script"|"thumbnail"|"banner"|"carousel"|"audio"|"upload" }
 */
export async function runPodcastPipeline(db, opts = {}) {
  const step = opts.step || "all";
  const runAll = step === "all";
  console.log(`🎙️ Podcast pipeline [step: ${step}]`);
  ensureTmp();

  let backup = loadBackup() || {};
  let { podcast_id: podcastId, topic_name: topicName, topic_source: topicSource, sections } = backup;

  // ── TOPIC ──
  if (runAll ? !backup.status : step === "topic") {
    console.log("📰 Fetching topic...");
    const topics = await fetchPodcastTopics();
    if (!topics.length) { console.log("⚠️ No topics."); return; }
    const picked = await pickPodcastTopic(topics);
    topicName = (picked.podcast_title || "").replace(/,/g, " ").trim();
    topicSource = picked.source_url || "";
    podcastId = generatePodcastId(topicName);
    Object.assign(backup, { podcast_id: podcastId, topic_name: topicName, topic_source: topicSource, status: "topic_stored" });
    logBackup(backup);
    console.log(`✅ Topic: ${topicName} | ID: ${podcastId}`);
    if (!runAll) return;
  }

  // ── SCRIPT ──
  if (runAll ? backup.status === "topic_stored" : step === "script") {
    console.log("📝 Generating script...");
    const info = await getLatestInfo(topicName);
    const result = await generatePodcastScript(info, topicName, topicSource);
    sections = result.sections;
    Object.assign(backup, { script: result.script, sections, status: "script_generated" });
    fs.writeFileSync(path.join(TMP_ROOT, "script.txt"), result.script, "utf-8");
    logBackup(backup);
    console.log("✅ Script done.");
    if (!runAll) return;
  }
  sections = sections || backup.sections;

  // ── THUMBNAIL ──
  if (runAll ? backup.status === "script_generated" : step === "thumbnail") {
    console.log("🎨 Generating thumbnail...");
    const rawThumb = await generatePodcastThumbnail(topicName);
    const thumbBuffer = compressThumbnail(rawThumb, path.join(TMP_ROOT, "thumbnail"));
    fs.writeFileSync(path.join(TMP_ROOT, "thumbnail.jpg"), thumbBuffer);
    backup.thumbnail_local = true;
    logBackup(backup);
    console.log("✅ Thumbnail saved to tmp.");
    if (runAll) { backup.status = "thumbnail_done"; logBackup(backup); }
    else return;
  }

  // ── BANNER ──
  if (runAll ? backup.status === "thumbnail_done" : step === "banner") {
    console.log("🖼️ Generating banner...");
    const rawBanner = await generatePodcastBanner(topicName);
    const bannerBuffer = compressBanner(rawBanner, path.join(TMP_ROOT, "banner"));
    fs.writeFileSync(path.join(TMP_ROOT, "banner.jpg"), bannerBuffer);
    const gradientColor = extractDominantColor(bannerBuffer, path.join(TMP_ROOT, "banner_color"));
    backup.gradient_color = gradientColor;
    backup.banner_local = true;
    logBackup(backup);
    console.log(`✅ Banner saved. Gradient: ${gradientColor}`);
    if (runAll) { backup.status = "banner_done"; logBackup(backup); }
    else return;
  }

  // ── CAROUSEL ──
  if (runAll ? backup.status === "banner_done" : step === "carousel") {
    const imageSections = (sections || []).filter((s) => s.type === "image");
    console.log(`🖼️ Generating ${imageSections.length} carousel images...`);
    for (let i = 0; i < imageSections.length; i++) {
      const desc = imageSections[i].content;
      console.log(`  [${i + 1}/${imageSections.length}] ${desc.slice(0, 60)}...`);
      const imgBuffer = await generateImage({
        prompt: `${desc} ${BANNER_STYLE}`,
        width: 1280, height: 720,
        model: MODELS.imageGen, seed: 300 + i,
      });
      const compressed = compressBanner(imgBuffer, path.join(TMP_ROOT, "carousel", `slide_${i}`));
      fs.writeFileSync(path.join(TMP_ROOT, "carousel", `slide_${i}.jpg`), compressed);
    }
    backup.carousel_local = true;
    logBackup(backup);
    console.log("✅ Carousel saved.");
    if (runAll) { backup.status = "carousel_done"; logBackup(backup); }
    else return;
  }

  // ── AUDIO ──
  if (runAll ? backup.status === "carousel_done" : step === "audio") {
    console.log("🔊 Generating multi-voice speech...");
    const { buffer: speechBuffer, timeline } = await generatePodcastSpeech(sections);
    fs.writeFileSync(path.join(TMP_ROOT, "audio.mp3"), speechBuffer);
    writeJSON(path.join(TMP_ROOT, "timeline.json"), timeline);
    backup.audio_local = true;
    logBackup(backup);
    console.log("✅ Audio + timeline saved.");
    if (runAll) { backup.status = "audio_done"; logBackup(backup); }
    else return;
  }

  // ── UPLOAD (reads tmp, pushes to Cloudinary, writes D1) ──
  if (runAll ? backup.status === "audio_done" : step === "upload") {
    console.log("☁️ Uploading to Cloudinary (overwrite)...");

    // Upload thumbnail
    const thumbPath = path.join(TMP_ROOT, "thumbnail.jpg");
    const thumbUrl = fs.existsSync(thumbPath)
      ? await uploadBuffer(fs.readFileSync(thumbPath), CLOUDINARY_PODCAST_ROOT, "thumbnail")
      : backup.thumbnail_url || "";

    // Upload banner
    const bannerPath = path.join(TMP_ROOT, "banner.jpg");
    const bannerUrl = fs.existsSync(bannerPath)
      ? await uploadBuffer(fs.readFileSync(bannerPath), CLOUDINARY_PODCAST_ROOT, "banner")
      : backup.banner_url || "";

    // Upload audio
    const audioPath = path.join(TMP_ROOT, "audio.mp3");
    const audioUrl = fs.existsSync(audioPath)
      ? await uploadBuffer(fs.readFileSync(audioPath), CLOUDINARY_PODCAST_ROOT, "audio", "video")
      : backup.audio_url || "";

    // Upload timeline
    const timelinePath = path.join(TMP_ROOT, "timeline.json");
    const timelineUrl = fs.existsSync(timelinePath)
      ? await uploadBuffer(fs.readFileSync(timelinePath), CLOUDINARY_PODCAST_ROOT, "timeline", "raw")
      : backup.timeline_url || "";

    // Upload carousel
    const carouselUrls = [];
    const carouselDir = path.join(TMP_ROOT, "carousel");
    if (fs.existsSync(carouselDir)) {
      const slides = fs.readdirSync(carouselDir).filter((f) => f.endsWith(".jpg")).sort();
      for (let i = 0; i < slides.length; i++) {
        const url = await uploadBuffer(fs.readFileSync(path.join(carouselDir, slides[i])), `${CLOUDINARY_PODCAST_ROOT}/carousel`, `slide_${i}`);
        carouselUrls.push(url);
      }
    }

    console.log("✅ All media uploaded.");

    // Read timeline for duration + image mapping
    const timeline = fs.existsSync(timelinePath) ? JSON.parse(fs.readFileSync(timelinePath, "utf-8")) : [];
    const lastSpeech = [...timeline].reverse().find((t) => t.type !== "image");
    const duration = lastSpeech ? Math.ceil(lastSpeech.end) : null;
    const imageTimeline = timeline.filter((t) => t.type === "image").map((t, i) => ({
      time: t.start, url: carouselUrls[i] || "", description: t.content,
    }));

    // Write to D1
    console.log("💾 Writing to D1...");
    await db.prepare(
      "INSERT OR REPLACE INTO podcasts (id, podcast_name, podcast_audio_url, podcast_music_url, podcast_thumbnail_url, podcast_banner_url, topic_source) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(podcastId, topicName, audioUrl, "", thumbUrl, bannerUrl, topicSource).run();

    const statsData = JSON.stringify({
      latestPodcastID: podcastId,
      latestPodcastName: topicName,
      latestPodcastThumbnail: thumbUrl,
      latestPodcastBanner: bannerUrl,
      gradientColor: backup.gradient_color || "#1a1a2e",
      timelineUrl,
      timeline,
      carouselImages: imageTimeline,
      duration,
    });
    await db.prepare("INSERT OR REPLACE INTO gen_stats (key, data) VALUES (?, ?)").bind("podcast", statsData).run();

    // Save URLs to backup
    Object.assign(backup, {
      thumbnail_url: thumbUrl, banner_url: bannerUrl, audio_url: audioUrl,
      timeline_url: timelineUrl, carousel_urls: carouselUrls, status: "complete",
    });

    // Metadata
    writeJSON(path.join(TMP_ROOT, "metadata.json"), {
      id: podcastId, name: topicName, source: topicSource,
      date: new Date().toISOString(), duration,
      gradient_color: backup.gradient_color,
      audio_url: audioUrl, timeline_url: timelineUrl,
      thumbnail_url: thumbUrl, banner_url: bannerUrl,
      carousel: imageTimeline,
    });

    logBackup(backup);
    console.log("✅ Podcast pipeline complete!");
  }
}
