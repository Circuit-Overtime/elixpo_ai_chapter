import { chatCompletion, generateImage } from "../pollinations.js";
import { MODELS } from "../config.js";
import { PODCAST_THUMBNAIL_SYSTEM, PODCAST_BANNER_SYSTEM, THUMBNAIL_STYLE, BANNER_STYLE } from "../prompts.js";

export async function generatePodcastThumbnail(topic) {
  console.log("🎨 Generating thumbnail prompt...");
  const prompt = await chatCompletion({
    model: MODELS.promptWriter,
    messages: [
      { role: "system", content: PODCAST_THUMBNAIL_SYSTEM },
      { role: "user", content: topic },
    ],
    seed: 111,
  });
  console.log("🎨 Generating podcast thumbnail image...");
  return generateImage({
    prompt: `${prompt} ${THUMBNAIL_STYLE}`,
    width: 512,
    height: 512,
    model: MODELS.imageGen,
    seed: 111,
  });
}

export async function generatePodcastBanner(topic) {
  console.log("🖼️ Generating banner prompt...");
  const prompt = await chatCompletion({
    model: MODELS.promptWriter,
    messages: [
      { role: "system", content: PODCAST_BANNER_SYSTEM },
      { role: "user", content: topic },
    ],
    seed: 222,
  });
  console.log("🖼️ Generating podcast banner image...");
  return generateImage({
    prompt: `${prompt} ${BANNER_STYLE}`,
    width: 1280,
    height: 720,
    model: MODELS.imageGen,
    seed: 222,
  });
}
