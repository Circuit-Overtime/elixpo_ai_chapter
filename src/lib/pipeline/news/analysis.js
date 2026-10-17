import { chatCompletion } from "../pollinations.js";
import { MODELS, PODCAST_HOST_FEMALE, PODCAST_HOST_MALE } from "../config.js";

export async function generateNewsAnalysis(newsTitle) {
  console.log(`🔬 Researching '${newsTitle}'...`);
  const content = await chatCompletion({
    model: MODELS.research,
    messages: [
      { role: "user", content: `Give me the latest detailed news for the topic: ${newsTitle}` },
    ],
  });
  if (!content) throw new Error("Research returned empty content");
  console.log("✅ Analysis received.");
  return content;
}

/**
 * Parse tagged script into sections: { type: "male"|"female", content }[]
 */
export function parseNewsScript(raw) {
  const sections = [];
  const tagRegex = /\[(MALE|FEMALE)\]/gi;
  let lastIndex = 0;
  let currentVoice = "female";
  let match;

  while ((match = tagRegex.exec(raw)) !== null) {
    const text = raw.slice(lastIndex, match.index).trim();
    if (text) sections.push({ type: currentVoice, content: text });
    currentVoice = match[1].toUpperCase() === "MALE" ? "male" : "female";
    lastIndex = tagRegex.lastIndex;
  }
  const remaining = raw.slice(lastIndex).trim();
  if (remaining) sections.push({ type: currentVoice, content: remaining });
  return sections;
}

export async function generateNewsScript(analysisContent, prevTopic, nextTopic, index, total) {
  console.log("📝 Generating news script...");

  let contextHint = "";
  // Every story must announce its topic naturally at the start
  const topicIntro = `The anchor speaking first MUST name the topic at the start — something like "Next up, we're looking at..." or "Alright, this one's about..." or "So here's what's happening with..." followed by the topic in plain words. The listener needs to know what this story is about within the first sentence. `;

  if (index === 0) {
    contextHint =
      `This is the FIRST story in today's Elixpo Daily (${total} stories total). ` +
      `ONE anchor opens: "Hey everyone, welcome to Elixpo Daily! I'm [name], and with me is [other name]." Then they introduce the first topic naturally. ` +
      `The other responds with ONE short line then they dive into the story. `;
  } else if (index === total - 1) {
    contextHint = `This is the LAST story. ` + topicIntro;
    if (prevTopic) contextHint += `${PODCAST_HOST_FEMALE} or ${PODCAST_HOST_MALE} transitions from the previous story about "${prevTopic}". `;
    contextHint += `End with a warm sign-off from both anchors — thank listeners, invite them back tomorrow. `;
  } else {
    contextHint = topicIntro;
    if (prevTopic) contextHint += `Transition from the previous story about "${prevTopic}" — one anchor hands off to the other naturally while naming the new topic. `;
  }

  if (nextTopic && index < total - 1) {
    contextHint += `Before this story ends, one anchor teases the next story to the other: something like "And ${PODCAST_HOST_MALE}, coming up next..." or "Stay with us ${PODCAST_HOST_FEMALE}, because next we've got..." referencing "${nextTopic}". `;
  }

  const systemPrompt =
    `You are writing a news script for 'Elixpo Daily' — a two-anchor show. The anchors are ${PODCAST_HOST_FEMALE} (female) and ${PODCAST_HOST_MALE} (male). ` +
    `Current date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.\n\n` +
    "Use these tags:\n" +
    `  [FEMALE] — before ${PODCAST_HOST_FEMALE}'s lines\n` +
    `  [MALE] — before ${PODCAST_HOST_MALE}'s lines\n\n` +
    contextHint + "\n" +
    "RULES:\n" +
    "- Alternate between anchors naturally — one delivers the main facts (2-3 sentences), the other reacts, adds context, or asks a question.\n" +
    "- They refer to each other by name occasionally.\n" +
    "- Keep it conversational, punchy, engaging. Short sentences. This is spoken, not written.\n" +
    "- NO repeated greetings after the opening. Each turn starts by reacting to what was just said.\n" +
    "- NO overlapping content — each anchor adds NEW info.\n" +
    "- STRICT WORD LIMIT: 100-120 words total. This produces ~1-1.3 minutes of audio.\n" +
    "- CRITICAL: Output ONLY the exact spoken words with [MALE]/[FEMALE] tags. NO markdown, NO bold, NO asterisks, NO stage directions, NO parentheticals, NO words like (pause), (laughs), (sighs). The script will be read VERBATIM by a TTS engine — every word you write will be spoken out loud, so write ONLY words meant to be heard.\n" +
    'Return as JSON: {"script": "...", "source_link": "..."}';

  const raw = await chatCompletion({
    model: MODELS.scriptWriter,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Create a two-anchor news script based on this analysis: ${analysisContent}` },
    ],
    json: true,
    seed: 123 + index,
  });

  const parsed = JSON.parse(raw);
  if (!parsed.script) throw new Error("Script generation returned no script");

  const sections = parseNewsScript(parsed.script);
  const wordCount = sections.reduce((s, sec) => s + sec.content.split(/\s+/).length, 0);
  console.log(`✅ News script: ${wordCount} words, ${sections.length} sections`);

  return { script: parsed.script, source_link: parsed.source_link, sections };
}
