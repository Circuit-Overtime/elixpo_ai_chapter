import { POLLINATIONS_BASE, POLLINATIONS_API_KEY, MODELS } from "./config.js";

export async function chatCompletion({ model, messages, json = false, seed, temperature }) {
  const body = { model, messages };
  if (json) body.response_format = { type: "json_object" };
  if (seed !== undefined) body.seed = seed;
  if (temperature !== undefined) body.temperature = temperature;

  const res = await fetch(`${POLLINATIONS_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${POLLINATIONS_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Pollinations chat error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function generateAudio({ script, voice = "shimmer", developerPrompt }) {
  const body = {
    model: "openai-audio",
    modalities: ["text", "audio"],
    audio: { voice, format: "wav" },
    messages: [
      { role: "developer", content: developerPrompt },
      { role: "user", content: script },
    ],
  };

  const res = await fetch(`${POLLINATIONS_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${POLLINATIONS_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Pollinations audio error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const base64Audio = data.choices?.[0]?.message?.audio?.data;
  if (!base64Audio) throw new Error("No audio data returned");
  return base64Audio;
}

/**
 * Transcribe a single audio chunk via Pollinations whisper.
 */
async function transcribeChunk(chunkBuffer, filename) {
  const formData = new FormData();
  formData.append("file", new Blob([chunkBuffer]), filename);
  formData.append("model", MODELS.transcription);

  const res = await fetch(`${POLLINATIONS_BASE}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`Transcription error ${res.status}: ${await res.text()}`);
  return await res.json();
}

/**
 * Split a WAV buffer into chunks of ~maxSeconds each.
 * Returns array of { buffer, offsetSeconds }.
 */
function splitWavBuffer(wavBuffer, maxSeconds = 120) {
  // WAV header: first 44 bytes
  if (wavBuffer.length < 44) return [{ buffer: wavBuffer, offsetSeconds: 0 }];

  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const numChannels = wavBuffer.readUInt16LE(22);
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const dataStart = 44;
  const dataLength = wavBuffer.length - dataStart;
  const totalSeconds = dataLength / bytesPerSecond;

  if (totalSeconds <= maxSeconds) {
    return [{ buffer: wavBuffer, offsetSeconds: 0 }];
  }

  const chunks = [];
  const chunkBytes = Math.floor(maxSeconds * bytesPerSecond);
  let offset = 0;

  while (offset < dataLength) {
    const end = Math.min(offset + chunkBytes, dataLength);
    const chunkDataLength = end - offset;

    // Build a new WAV with its own header
    const chunkWav = Buffer.alloc(44 + chunkDataLength);
    // Copy original header
    wavBuffer.copy(chunkWav, 0, 0, 44);
    // Fix data size fields
    chunkWav.writeUInt32LE(36 + chunkDataLength, 4);  // RIFF chunk size
    chunkWav.writeUInt32LE(chunkDataLength, 40);       // data chunk size
    // Copy audio data
    wavBuffer.copy(chunkWav, 44, dataStart + offset, dataStart + end);

    chunks.push({
      buffer: chunkWav,
      offsetSeconds: offset / bytesPerSecond,
    });

    offset = end;
  }

  console.log(`  📎 Split audio into ${chunks.length} chunks (${Math.round(totalSeconds)}s total, ${maxSeconds}s each)`);
  return chunks;
}

/**
 * Check if a buffer is a WAV file by looking for the RIFF header.
 */
function isWav(buffer) {
  return buffer.length > 44 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 &&
    buffer[2] === 0x46 && buffer[3] === 0x46; // "RIFF"
}

/**
 * Transcribe audio via Pollinations whisper, chunking WAV if needed.
 * MP3 and other formats are sent as-is (already compressed/small).
 * @param {Buffer} audioBuffer - Audio bytes (WAV or MP3)
 * @param {string} filename - Filename for identification
 * @returns {{ text: string, segments: Array<{ start: number, end: number, text: string }> }}
 */
export async function transcribeAudio(audioBuffer, filename = "audio.wav") {
  // Only chunk raw WAV — MP3 is already small enough
  const chunks = isWav(audioBuffer) ? splitWavBuffer(audioBuffer, 120) : [{ buffer: audioBuffer, offsetSeconds: 0 }];

  let allText = "";
  const allSegments = [];

  for (let i = 0; i < chunks.length; i++) {
    const { buffer: chunkBuf, offsetSeconds } = chunks[i];
    console.log(`  🎧 Transcribing chunk ${i + 1}/${chunks.length} (offset ${Math.round(offsetSeconds)}s)...`);

    const result = await transcribeChunk(chunkBuf, `${filename}_chunk${i}.wav`);
    const chunkText = result.text || "";
    const chunkSegments = (result.segments || []).map((seg) => ({
      start: seg.start + offsetSeconds,
      end: seg.end + offsetSeconds,
      text: seg.text,
    }));

    allText += (allText ? " " : "") + chunkText;
    allSegments.push(...chunkSegments);
  }

  return { text: allText, segments: allSegments };
}

export async function generateImage({ prompt, width = 1024, height = 1024, model = "flux", seed = 42 }) {
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: "zimage",
    seed: String(seed),
    nologo: "true",
    private: "true",
    key: POLLINATIONS_API_KEY,
  });

  const url = `${POLLINATIONS_BASE}/image/${encodeURIComponent(prompt)}?${params}`;
  const res = await fetch(url, { timeout: 120000 });
  if (!res.ok) throw new Error(`Image gen error ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
