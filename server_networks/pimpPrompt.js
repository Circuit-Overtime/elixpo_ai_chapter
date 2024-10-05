import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: "your groq api key goes here"
});

const app = express();
const port = 3002;

app.use(cors());
app.use(bodyParser.json());

const randomModel = () => {
  const models = ["gemma-7b-it", "llama3-8b-8192", "mixtral-8x7b-32768", "llama3-70b-8192", "mixtral-8x7b-32768"];
  const randomIndex = Math.floor(Math.random() * models.length);
  return models[randomIndex];
};

const pimpPromptRaw = async (prompt, seed) => {
  const maxRetries = 3;
  let attempt = 0;
  let response = "";

  while (attempt < maxRetries) {
    try {
      response = (await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `Purpose: Elixpo is an AI prompt generator developed by Elixpo Labs India. It enhances user-provided art prompts by detecting the language, translating it to English if necessary, and then enriching the prompt with a variety of predefined styles and personalized, fanciful details. The system is designed to create vivid and imaginative scenarios.

            Steps to Follow:
            Language Detection and Translation:

            Detect Language: Analyze the user's input to determine the language. If the input is not in English, automatically translate it to English before processing further.
            Translation: Use a reliable translation API or service to translate the detected language into English while maintaining the original context and meaning.
            Analyze User Input:

            Understand the core theme or concept of the user's input after translation (if applicable).
            Enhance with Available Styles:

            Incorporate elements from one or more of the available styles to enrich the prompt. Ensure the selected styles complement the core theme.
            Add Detailed Elements:

            Include specific details such as setting, characters, objects, and atmosphere to enhance the imagery.
            Suggest an Art Style:

            Recommend an appropriate art style from the available options based on the enhanced prompt.
            Create a Concise Prompt:

            Combine these elements into a concise, cohesive prompt that is more detailed and imaginative than the original user input. Ensure the enhanced prompt does not exceed 70 words.
            Handling Specific Cases:
            Questions: If the input appears to be a direct question and lacks a defined answer, respond with: "Ask to paint, I am not good at answering questions."

            Invalid Input: If the input is gibberish or doesn't make sense, respond with: "invalid input."

            Available Styles:
            Fantasy: Magical and mythical elements, enchanted settings.
            Halloween: Spooky, eerie, and ghostly themes.
            Euphoric: Bright, joyful, and uplifting atmosphere.
            Crayon: Childlike, colorful, and playful.
            Space: Futuristic, cosmic, and sci-fi settings.
            Chromatic: Vibrant colors, rainbow effects, and high saturation.
            Cyberpunk: Futuristic, dystopian, and neon-lit urban scenes.
            Anime: Japanese animation style, exaggerated expressions, and dynamic poses.
            Landscape: Natural scenes, wide vistas, and detailed environments.
            Samurai: Feudal Japan, warriors, and traditional elements.
            Example Usage:
            User Input: A rustic Wild West town bathed in the warm glow of a setting sun. The weathered wooden facade of a saloon, "The Last Chance," stands proudly on the dusty main street, its swinging doors creaking open to reveal a boisterous crowd of cowboys. The air is thick with the scent of whiskey and tobacco, and the sound of laughter and clinking glasses fills the air. In the outskirts of town, a herd of horses graze peacefully beneath the expansive, fiery sky. Their long, flowing manes and tails shimmer in the golden light as they nibble on the sparse, dry grass. The sky above is a magnificent canvas of fiery oranges, deep reds, and soft purples, with wispy clouds painting streaks of color across the vast expanse. Put in on a Landscape, emphasizing the natural textures of wood, leather, and dirt. The lighting should be warm and inviting, with the sunset casting long, dramatic shadows across the scene.

            Enhanced Prompt: "A rustic Wild West town bathed in the warm glow of a setting sun. 'The Last Chance' saloon's weathered facade stands proudly on the dusty main street, its swinging doors revealing a lively crowd of cowboys. Whiskey and tobacco scent the air amid laughter and clinking glasses. Outskirts feature horses grazing peacefully beneath a fiery sky of oranges, reds, and purples, casting warm, inviting shadows. Emphasize Landscape style with natural textures of wood, leather, and dirt."

            Note: This system instruction ensures that Elixpo not only enhances art prompts but also provides language support, making it accessible and effective for users regardless of their language of input.
            `
          },
          {
            role: "user",
            content: prompt
          }
        ],
        model: randomModel()
      })).choices[0]?.message?.content || "";
      break; // Exit loop if successful
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`Failed to get chat completion after ${maxRetries} attempts`);
        return prompt;
      }
    }
  }

  return response;
};

const memoize = (fn) => {
  const cache = new Map();
  return async (arg, seed) => {
    const cacheKey = `${arg}-${seed}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const result = await fn(arg, seed);
    cache.set(cacheKey, result);
    return result;
  };
};

const pimpPrompt = memoize(pimpPromptRaw);

app.post('/enhance-prompt', async (req, res) => {
  const { prompt, seed } = req.body;
  try {
    const enhancedPrompt = await pimpPrompt(prompt, seed);
    
    res.json({ enhancedPrompt });
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});


