import { chatCompletion, generateImage } from "../pollinations.js";
import { MODELS } from "../config.js";
import { NEWS_BANNER_SYSTEM, NEWS_THUMBNAIL_SYSTEM, NEWS_SUMMARY_SYSTEM, BANNER_STYLE, THUMBNAIL_STYLE } from "../prompts.js";

export async function generateVisualPrompt(topic) {
  return chatCompletion({
    model: MODELS.promptWriter,
    messages: [
      { role: "system", content: NEWS_BANNER_SYSTEM },
      { role: "user", content: topic },
    ],
    seed: 42,
  });
}

export async function generateBannerImage(prompt) {
  console.log("🖼️ Generating banner image...");
  return generateImage({
    prompt: `${prompt} ${BANNER_STYLE}`,
    width: 1280,
    height: 720,
    model: MODELS.imageGen,
    seed: 22545,
  });
}

export async function createCombinedVisualPrompt(topics) {
  const combined = Array.isArray(topics) ? topics.join(" | ") : topics;
  return chatCompletion({
    model: MODELS.promptWriter,
    messages: [
      { role: "system", content: NEWS_THUMBNAIL_SYSTEM },
      { role: "user", content: combined },
    ],
    seed: 22545,
    temperature: 0.4,
  });
}

export async function generateThumbnailImage(prompt) {
  console.log("🎨 Generating thumbnail image...");
  return generateImage({
    prompt: `${prompt} ${THUMBNAIL_STYLE}`,
    width: 512,
    height: 512,
    model: MODELS.imageGen,
    seed: 42,
  });
}

export async function createCombinedNewsSummary(topics) {
  const combined = Array.isArray(topics) ? topics.join(" | ") : topics;
  return chatCompletion({
    model: MODELS.promptWriter,
    messages: [
      { role: "system", content: NEWS_SUMMARY_SYSTEM },
      { role: "user", content: combined },
    ],
    seed: 42,
    temperature: 0.4,
  });
}
