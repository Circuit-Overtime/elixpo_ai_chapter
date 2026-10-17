import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { generateAudio, chatCompletion } from "../pollinations.js";
import { compressAudio } from "../compress.js";
import { NEWS_TTS_PROMPT } from "../prompts.js";
import { MODELS, PODCAST_VOICE_FEMALE, PODCAST_VOICE_MALE } from "../config.js";

const TRIGGER_WORDS = /\b(psychosis|suicide|suicidal|self-harm|kill|murder|assault|abuse|rape|violence|drug abuse|overdose|terrorist|terrorism|bomb|shoot|weapon|extremist)\b/gi;

function sanitizeForParaphrase(text) {
  return text.replace(TRIGGER_WORDS, "[topic]");
}

/**
 * Generate multi-voice news audio + timeline from parsed sections.
 * @param {Array<{type: "male"|"female", content: string}>} sections
 * @param {number} newsIndex
 * @returns {{ buffer: Buffer, timeline: Array }}
 */
export async function generateVoiceover(sections, newsIndex) {
  const itemDir = path.resolve(`tmp/news/item_${newsIndex}`);
  if (!fs.existsSync(itemDir)) fs.mkdirSync(itemDir, { recursive: true });

  const segmentPaths = [];
  const segmentDurations = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const voice = section.type === "male" ? PODCAST_VOICE_MALE : PODCAST_VOICE_FEMALE;
    const segPath = path.join(itemDir, `seg_${i}.mp3`);

    console.log(`  🎙️ [${i + 1}/${sections.length}] ${section.type} (${voice})...`);

    let text = section.content;
    let base64 = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        base64 = await generateAudio({ script: text, voice, developerPrompt: NEWS_TTS_PROMPT });
        break;
      } catch (err) {
        const isFilter = err.message?.includes("content management policy") || err.message?.includes("filtered");
        if (!isFilter || attempt === 2) throw err;
        console.warn(`  ⚠️ Content filter, paraphrasing...`);
        text = await chatCompletion({
          model: MODELS.promptWriter,
          messages: [
            { role: "system", content: "Rewrite to be safe for all audiences. Keep same tone and length. Output only rewritten text." },
            { role: "user", content: sanitizeForParaphrase(text) },
          ],
        });
      }
    }

    const rawBuf = Buffer.from(base64, "base64");
    const compressed = compressAudio(rawBuf, path.join(itemDir, `seg_${i}`));
    fs.writeFileSync(segPath, compressed);
    segmentPaths.push(segPath);

    let dur = 0;
    try {
      dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${segPath}" 2>/dev/null`).toString().trim()) || 0;
    } catch { /* */ }
    segmentDurations.push(dur);
  }

  // Concatenate with crossfade
  const finalPath = path.join(itemDir, "audio.mp3");
  try {
    if (segmentPaths.length === 1) {
      execSync(`ffmpeg -y -i "${segmentPaths[0]}" -codec:a libmp3lame -b:a 128k "${finalPath}" 2>/dev/null`);
    } else {
      const inputs = segmentPaths.map((p) => `-i "${p}"`).join(" ");
      const filters = [];
      let chain = "[0:a]";
      for (let i = 1; i < segmentPaths.length; i++) {
        const out = i === segmentPaths.length - 1 ? "" : `[a${i}]`;
        filters.push(`${chain}[${i}:a]acrossfade=d=0.1:c1=tri:c2=tri${out}`);
        chain = `[a${i}]`;
      }
      execSync(`ffmpeg -y ${inputs} -filter_complex "${filters.join(";")}" -codec:a libmp3lame -b:a 128k "${finalPath}" 2>/dev/null`);
    }
  } catch {
    fs.writeFileSync(finalPath, Buffer.concat(segmentPaths.map((p) => fs.readFileSync(p))));
  }

  const buffer = fs.readFileSync(finalPath);

  // Build timeline
  const timeline = [];
  let runningTime = 0;
  for (let i = 0; i < sections.length; i++) {
    const dur = segmentDurations[i] || 0;
    timeline.push({
      type: sections[i].type,
      content: sections[i].content,
      start: Math.round(runningTime * 100) / 100,
      end: Math.round((runningTime + dur) * 100) / 100,
    });
    runningTime += dur;
  }

  // Save timeline
  fs.writeFileSync(path.join(itemDir, "timeline.json"), JSON.stringify(timeline, null, 2));

  // Cleanup segments
  for (const p of segmentPaths) if (fs.existsSync(p)) fs.unlinkSync(p);

  console.log(`  ✅ News ${newsIndex} audio: ${(buffer.length / 1024).toFixed(0)}KB, ${timeline.length} timeline entries`);
  return { buffer, timeline };
}
