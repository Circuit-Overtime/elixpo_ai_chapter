// Optimize generated static-export images without mutating source assets.
// Usage: node scripts/optimize-deploy-media.mjs [directory]

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const outputDir = path.resolve(process.argv[2] || "out");
const marker = path.join(outputDir, ".media-optimized");
const imageExtensions = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const videoExtensions = new Set([".m4v", ".mov", ".mp4", ".webm"]);
const imageWorkerCount = 3;

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

async function encodeImage(source, destination, extension) {
  let pipeline = sharp(source, { animated: true }).rotate();
  if (extension === ".png") {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  } else if (extension === ".jpg" || extension === ".jpeg") {
    pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
  } else if (extension === ".avif") {
    pipeline = pipeline.avif({ quality: 80, effort: 6 });
  } else {
    pipeline = pipeline.webp({ quality: 80, nearLossless: true, effort: 6, smartSubsample: true });
  }
  await pipeline.toFile(destination);
}

async function optimizeImage(file) {
  const extension = path.extname(file).toLowerCase();
  const temporary = `${file}.optimized-${process.pid}${extension}`;
  const originalSize = fs.statSync(file).size;

  try {
    await encodeImage(file, temporary, extension);
    const optimizedSize = fs.statSync(temporary).size;
    if (optimizedSize >= originalSize) {
      fs.unlinkSync(temporary);
      return { saved: 0, changed: false };
    }
    fs.renameSync(temporary, file);
    return { saved: originalSize - optimizedSize, changed: true };
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw new Error(`${path.relative(outputDir, file)}: ${error.message}`);
  }
}

function optimizeVideo(file) {
  const extension = path.extname(file).toLowerCase();
  const temporary = `${file}.optimized-${process.pid}${extension}`;
  const originalSize = fs.statSync(file).size;
  // Small source videos have already passed the asset pipeline; avoid a second
  // lossy encode after Next copies them into the static export.
  if (originalSize <= 1_250_000) return { saved: 0, changed: false };
  const codecArgs = extension === ".webm"
    ? ["-c:v", "libvpx-vp9", "-crf", "25", "-b:v", "0", "-c:a", "libopus", "-b:a", "128k"]
    : ["-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"];
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-map_metadata", "-1", ...codecArgs, temporary],
    { encoding: "utf8" },
  );

  if (result.error?.code === "ENOENT") {
    throw new Error("ffmpeg is required when the export contains video files");
  }
  if (result.status !== 0) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw new Error(`${path.relative(outputDir, file)}: ffmpeg failed: ${result.stderr.trim()}`);
  }

  const optimizedSize = fs.statSync(temporary).size;
  if (optimizedSize >= originalSize) {
    fs.unlinkSync(temporary);
    return { saved: 0, changed: false };
  }
  fs.renameSync(temporary, file);
  return { saved: originalSize - optimizedSize, changed: true };
}

async function main() {
  if (!fs.existsSync(outputDir)) throw new Error(`export directory not found: ${outputDir}`);
  if (fs.existsSync(marker)) {
    console.log(">> Export media already optimized, skipping.");
    return;
  }

  const collectedFiles = collectFiles(outputDir);
  const staleTemporaryFiles = collectedFiles.filter((file) =>
    path.basename(file).includes(".optimized-"),
  );

  for (const temporaryFile of staleTemporaryFiles) {
    fs.unlinkSync(temporaryFile);
  }

  if (staleTemporaryFiles.length > 0) {
    console.log(`>> Removed ${staleTemporaryFiles.length} interrupted optimizer files.`);
  }

  const media = collectedFiles.filter((file) => !staleTemporaryFiles.includes(file));
  const images = media.filter((file) => imageExtensions.has(path.extname(file).toLowerCase()));
  const videos = media.filter((file) => videoExtensions.has(path.extname(file).toLowerCase()));
  let changed = 0;
  let bytesSaved = 0;
  let completedImages = 0;

  console.log(`>> Optimizing ${images.length} images and ${videos.length} videos in ${outputDir}...`);

  const imageQueue = images.entries();
  const optimizeImageWorker = async () => {
    for (const [, image] of imageQueue) {
      const result = await optimizeImage(image);
      if (result.changed) changed += 1;
      bytesSaved += result.saved;
      completedImages += 1;

      if (completedImages % 10 === 0 || completedImages === images.length) {
        console.log(`>> Images: ${completedImages}/${images.length}`);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(imageWorkerCount, Math.max(images.length, 1)) },
      () => optimizeImageWorker(),
    ),
  );

  for (const [index, video] of videos.entries()) {
    console.log(`>> Video: ${index + 1}/${videos.length} (${path.relative(outputDir, video)})`);
    const result = optimizeVideo(video);
    if (result.changed) changed += 1;
    bytesSaved += result.saved;
  }

  fs.writeFileSync(marker, `${JSON.stringify({ quality: 80, images: images.length, videos: videos.length, changed, bytesSaved })}\n`);
  console.log(`>> Optimized ${changed}/${images.length + videos.length} exported media files; saved ${(bytesSaved / 1024 / 1024).toFixed(2)} MB.`);
}

main().catch((error) => {
  console.error(`Media optimization failed: ${error.message}`);
  process.exit(1);
});
