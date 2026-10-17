import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Compress WAV audio to MP3 using ffmpeg.
 * @param {Buffer} wavBuffer - Raw WAV audio
 * @param {string} name - Full path prefix (e.g. /tmp/podcast/speech)
 * @returns {Buffer} Compressed MP3 buffer
 */
export function compressAudio(wavBuffer, name = "audio") {
  const dir = path.dirname(name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const wavPath = `${name}_raw.wav`;
  const mp3Path = `${name}.mp3`;

  fs.writeFileSync(wavPath, wavBuffer);

  try {
    // Normalize volume + compress to MP3. loudnorm boosts quiet audio to broadcast level.
    execSync(`ffmpeg -y -i "${wavPath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -codec:a libmp3lame -b:a 128k -ac 1 "${mp3Path}" 2>/dev/null`);
    const compressed = fs.readFileSync(mp3Path);
    const ratio = ((1 - compressed.length / wavBuffer.length) * 100).toFixed(1);
    console.log(`  🗜️ Audio: ${(wavBuffer.length / 1024 / 1024).toFixed(1)}MB → ${(compressed.length / 1024 / 1024).toFixed(1)}MB (${ratio}% smaller)`);
    fs.unlinkSync(wavPath);
    return compressed;
  } catch {
    console.warn(`  ⚠️ ffmpeg not available, using raw WAV`);
    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    return wavBuffer;
  }
}

/**
 * Compress thumbnail image — target ~20KB.
 * @param {Buffer} imageBuffer
 * @param {string} name - Full path prefix
 * @returns {Buffer}
 */
export function compressThumbnail(imageBuffer, name = "thumb") {
  return compressImageToTarget(imageBuffer, name, 512, 512, 20);
}

/**
 * Compress banner image — target ~50KB.
 * @param {Buffer} imageBuffer
 * @param {string} name - Full path prefix
 * @returns {Buffer}
 */
export function compressBanner(imageBuffer, name = "banner") {
  return compressImageToTarget(imageBuffer, name, 1280, 720, 50);
}

/**
 * Compress image to a target file size using ffmpeg.
 * Tries increasingly aggressive quality until target is met.
 * @param {Buffer} imageBuffer
 * @param {string} name - Full path prefix
 * @param {number} width
 * @param {number} height
 * @param {number} targetKB - Target file size in KB
 * @returns {Buffer}
 */
function compressImageToTarget(imageBuffer, name, width, height, targetKB) {
  const dir = path.dirname(name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const inputPath = `${name}_raw.jpg`;
  const outputPath = `${name}.jpg`;

  fs.writeFileSync(inputPath, imageBuffer);

  // Try quality levels from moderate to aggressive
  const qualities = [8, 12, 16, 20, 25];
  try {
    for (const q of qualities) {
      execSync(`ffmpeg -y -i "${inputPath}" -vf scale=${width}:${height} -q:v ${q} "${outputPath}" 2>/dev/null`);
      const compressed = fs.readFileSync(outputPath);
      if (compressed.length <= targetKB * 1024 || q === qualities[qualities.length - 1]) {
        console.log(`  🗜️ Image: ${(imageBuffer.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB (target ${targetKB}KB, q=${q})`);
        fs.unlinkSync(inputPath);
        return compressed;
      }
    }
    // Shouldn't reach here, but fallback
    const result = fs.readFileSync(outputPath);
    fs.unlinkSync(inputPath);
    return result;
  } catch {
    console.warn(`  ⚠️ ffmpeg not available, using raw image`);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    return imageBuffer;
  }
}

/**
 * Extract dominant color from an image buffer using ffmpeg.
 * Returns hex color string like "#2a1f3d".
 * @param {Buffer} imageBuffer
 * @param {string} name - Full path prefix for temp file
 * @returns {string} Hex color
 */
export function extractDominantColor(imageBuffer, name = "color_src") {
  const dir = path.dirname(name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const inputPath = `${name}_color.jpg`;
  fs.writeFileSync(inputPath, imageBuffer);

  try {
    // Scale down to 1x1 pixel and read the RGB value
    const raw = execSync(
      `ffmpeg -i "${inputPath}" -vf "scale=1:1" -f rawvideo -pix_fmt rgb24 pipe:1 2>/dev/null`,
      { encoding: "buffer" }
    );
    fs.unlinkSync(inputPath);

    if (raw.length >= 3) {
      const r = raw[0], g = raw[1], b = raw[2];
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      console.log(`  🎨 Dominant color: ${hex}`);
      return hex;
    }
  } catch {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
  }

  console.warn("  ⚠️ Could not extract color, using default");
  return "#1a1a2e";
}
