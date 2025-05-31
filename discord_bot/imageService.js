import { AttachmentBuilder } from 'discord.js';
import fetch from 'node-fetch';
import { getSuffixPrompt } from './utils.js';
import { POLLINATIONS_TOKEN } from './config.js';

/**
 * Generate images using Pollinations API.
 * @param {object} interaction - Discord interaction object.
 * @returns {Promise<Array<{attachment: AttachmentBuilder, url: string}>>}
 */

export async function generateImage(interaction) {
    const prompt = interaction.options.getString("prompt");
    const numberOfImages = interaction.options.getInteger("number_of_images") || 1;
    const aspectRatio = interaction.options.getString("aspect_ratio") || "16:9";
    const theme = interaction.options.getString("theme") || "normal";
    const enhancement = interaction.options.getBoolean("enhancement") || false;
    const model = interaction.options.getString("model") || "flux";
    const userProvidedSeed = interaction.options.getInteger("seed");

    let width = 1024, height = 683;
    switch (aspectRatio) {
        case '16:9': width = 1024; height = 576; break;
        case '9:16': width = 576; height = 1024; break;
        case '1:1': width = height = 1024; break;
        case '4:3': width = 1024; height = 768; break;
        case '3:2': width = 1024; height = 683; break;
    }

    const imagesWithUrls = [];
    for (let i = 0; i < numberOfImages; i++) {
        const currentSeed = userProvidedSeed !== null && userProvidedSeed !== undefined
            ? userProvidedSeed
            : Math.floor(Math.random() * 1000000000) + 1;

        const baseURL = "https://image.pollinations.ai/prompt/";
        const promptParam = encodeURIComponent(`${prompt.trim()} ${getSuffixPrompt(theme, enhancement, model, width, height)}`);
        const queryParams = new URLSearchParams({
            seed: currentSeed.toString(),
            model,
            width: width.toString(),
            height: height.toString(),
            nologo: 'true',
            referrer: 'elixpoart',
            token: POLLINATIONS_TOKEN
        });

        const imgurl = `${baseURL}${promptParam}?${queryParams.toString()}`;
        try {
            const response = await fetch(imgurl, { method: 'GET' });
            if (!response.ok) continue;
            const buffer = await response.buffer();
            if (buffer.length > 500) {
                const attachment = new AttachmentBuilder(buffer, { name: `elixpo_ai_image_${i + 1}.jpg` });
                imagesWithUrls.push({ attachment, url: imgurl }); 
            }
        } catch (error) {
            console.error(`[imageService] Error fetching image:`, error);
        }
    }
    return imagesWithUrls;
}
/**
 * Generate a remixed image using Pollinations API.
 * @param {object} interaction - Discord interaction object.
 * @param {string} sourceImageUrl - The URL of the source image.
 * @param {string} aspectRatio - The aspect ratio for the remix.
 * @returns {Promise<Array<{attachment: AttachmentBuilder, url: string}>>}
 */

export async function generateRemixImage(interaction, sourceImageUrl, aspectRatio) {
    const prompt = interaction.options.getString("prompt");
    const userProvidedSeed = interaction.options.getInteger("seed");
    const currentSeed = userProvidedSeed !== null && userProvidedSeed !== undefined
        ? userProvidedSeed
        : Math.floor(Math.random() * 1000000000) + 1;

    const baseURL = "https://image.pollinations.ai/prompt/";
    const promptParam = `${prompt.trim()} with the stric aspect ratio of ${aspectRatio}`;
    const queryParams = new URLSearchParams({
        seed: currentSeed.toString(),
        model: 'gptimage',
        referrer: 'elixpoart',
        token: POLLINATIONS_TOKEN,
        nologo: 'true',
    });

    const remixUrl = `${baseURL}${promptParam}?${queryParams.toString()}&image=${encodeURIComponent(sourceImageUrl)}`;
    const imagesWithUrls = [];
    try {
        const response = await fetch(remixUrl, { method: 'GET' });
        if (!response.ok) throw new Error(`Remix fetch failed: ${response.status}`);
        const buffer = await response.buffer();
        if (buffer.length > 500) {
            const attachment = new AttachmentBuilder(buffer, { name: `elixpo_ai_remix.jpg` });
            imagesWithUrls.push({ attachment, url: remixUrl }); 
        }
    } catch (error) {
        console.error(`[imageService] Error fetching remix image:`, error);
    }
    return imagesWithUrls;
}