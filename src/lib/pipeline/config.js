import dotenv from "dotenv";
dotenv.config();

// ── API ──
export const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || "";
export const POLLINATIONS_BASE = "https://gen.pollinations.ai";

// ── Cloudinary ──
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

// ── Models ──
export const MODELS = {
  research: "perplexity-fast",
  scriptWriter: "openai",
  promptWriter: "gemini-fast",
  audioSpeech: "openai-audio",
  imageGen: "zimage",
  transcription: "scribe",
};

// ── Voices & Hosts ──
export const NEWS_VOICES = ["shimmer", "ash", "shimmer", "ash", "shimmer", "ash", "shimmer"];
export const PODCAST_VOICE_FEMALE = "shimmer";
export const PODCAST_VOICE_MALE = "ash";
export const PODCAST_HOST_FEMALE = "Liza";
export const PODCAST_HOST_MALE = "Lix";

// ── Limits ──
export const MAX_NEWS_ITEMS = 7;

// ── Cloudinary paths ──
export const CLOUDINARY_NEWS_ROOT = "elixpochat/news";
export const CLOUDINARY_PODCAST_ROOT = "elixpochat/podcast";



// ── Filenames (tmp + cloudinary) ──
export const FILES = {
  news: {
    backup: "_backup.json",
    thumbnail: "thumbnail",
    metadata: "metadata.json",
    item: {
      script: "script.txt",
      banner: "banner",
      audio: "audio",
      transcript: "transcript",
      metadata: "metadata.json",
    },
  },
  podcast: {
    backup: "_backup.json",
    script: "script.txt",
    thumbnail: "thumbnail",
    banner: "banner",
    audio: "audio",
    transcript: "transcript",
    metadata: "metadata.json",
  },
};
