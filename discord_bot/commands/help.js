/**
 * Handles the /help command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function handleHelp(interaction) {
    const helpMessage = `
**Elixpo Discord Bot Commands:**

- **\`/generate\`** — Generate an image based on a prompt. \n
  **Options:** 
    - \`prompt\` (required): The prompt to generate images from
    - \`number_of_images\` (required): Number of images to generate (1-4)
    - \`seed\`: Seed for random generation (10-1000000)
    - \`aspect_ratio\`: Image aspect ratio (16:9, 9:16, 1:1, 4:3, 3:2)
    - \`theme\`: Theme (fantasy, normal, halloween, structure, crayon, space, chromatic, cyberpunk, anime, landscape, samurai, wpap, vintage, pixel, synthwave)
    - \`enhancement\`: Enhance image quality (true/false)
    - \`model\`: Model used (flux, turbo, gptimage)

- **\`/edit\`** — Edit an existing image. \n
  **Options:** 
    - \`prompt\` (required): New prompt to edit the image with
    - \`original_picture_message_id\` (required): Message ID of the image to edit
    - \`img_index_to_edit\` (required): Index of the image to edit (1-4)
    - \`seed\`: Seed for random generation (10-1000000)
    - \`aspect_ratio\`: Image aspect ratio (16:9, 9:16, 1:1, 4:3, 3:2)
    - \`theme\`: Theme (fantasy, normal, halloween, structure, crayon, space, chromatic, cyberpunk, anime, landscape, samurai, wpap, vintage, pixel, synthwave)
    - \`enhancement\`: Enhance image quality (true/false)

- **\`/remix\`** — Remix existing images on user upload (max 3). \n
  **Options:**
    - \`prompt\` (required): How do you want the images to be remixed?
    - \`image_1\` (required): The first image to remix
    - \`image_2\`: The second image to remix (optional)
    - \`image_3\`: The third image to remix (optional)
    - \`seed\`: Seed for random generation (10-1000000)
    - \`aspect_ratio\`: Image aspect ratio (16:9, 9:16, 1:1, 4:3, 3:2)
    - \`theme\`: Theme (fantasy, normal, halloween, structure, crayon, space, chromatic, cyberpunk, anime, landscape, samurai, wpap, vintage, pixel, synthwave)

- **\`/help\`** — Display this help message.
    `;
    try {
        await interaction.reply({ content: helpMessage, ephemeral: false });
    } catch (e) {
        console.error("Error sending help message:", e);
        try {
            await interaction.reply({ content: "Oops! Something went wrong with the help command.", ephemeral: true });
        } catch {}
    }
}