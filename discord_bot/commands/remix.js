import fetch from 'node-fetch';
import FormData from 'form-data';
import { POLLINATIONS_TOKEN } from '../config.js';
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getPermissionName, PERMISSIONS, client } from '../bot.js';
import { sanitizeText } from '../utils.js';
import { setCache, deleteCache } from '../cache.js';
import { createDownloadButton } from '../components.js';

const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512;

async function uploadToUguu(buffer, filename) {
    const form = new FormData();
    form.append('files[]', buffer, filename); 
    const response = await fetch('https://uguu.se/upload', { 
      method: 'POST',
      body: form
    });
    const json = await response.json();
    return json.files?.[0]?.url || null;
}

export async function remixCommand(interaction) {
  const attachments = [
    interaction.options.getAttachment('image_1'),
    interaction.options.getAttachment('image_2'),
    interaction.options.getAttachment('image_3')
  ].filter(Boolean);
  const uploadedUrls = [];
  const prompt = interaction.options.getString('prompt');
  const seed = interaction.options.getInteger('seed') || Math.floor(Math.random() * 1000000);
  const aspectRatio = interaction.options.getString('aspect_ratio') || '16:9';
  const theme = interaction.options.getString('theme') || 'default';
  const model = "gptimage";
  const missingEmbeds = interaction._missingEmbeds || false;

  await interaction.editReply({
    content: `> Wowza! I am ready to remix your images! Lemme process!`
  });

  for (const [i, file] of attachments.entries()) {
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.contentType)) {
      return interaction.editReply({
        content: `🚫 Image ${i + 1} must be a PNG or JPEG.`
      });
    }
    // if (file.size > 500 * 1024) {
    //   return interaction.editReply({
    //     content: `⚠️ Image ${i + 1} exceeds the 200KB limit.`
    //   });
    // }
    try {
      const buffer = await fetch(file.url).then(res => res.buffer());
      const url = await uploadToUguu(buffer, file.name);
      if (url) {
        uploadedUrls.push(url);
        // console.log(`✅ Uploaded Image ${i + 1}: ${url}`);
      } else {
        return interaction.editReply({
          content: `❌ Failed to upload Image ${i + 1} to Uguu.`
        });
      }
    } catch (err) {
      console.error(`❌ Error uploading Image ${i + 1}:`, err);
      return interaction.editReply({
        content: `❌ Unexpected error during image ${i + 1} upload.`
      });
    }
  }

  const urlList = uploadedUrls.map((url, i) => `📷 Image ${i + 1}: ${url}`).join('\n');
  await interaction.editReply({
    content: `✨ Well.. I have processed your media files... lemme **whirpool** them! \n 
    > Takes a couple of minutes, please standby!... \n `
  });

  await remixImageStyled(interaction, uploadedUrls, prompt, seed, aspectRatio, theme, model, missingEmbeds);
}

async function remixImageStyled(interaction, uploadedUrls, prompt, seed, aspectRatio, theme, model, missingEmbeds) {
    const baseURL = "https://image.pollinations.ai/prompt/";
    const promptParam = `${prompt.trim()} with the strict aspect ratio of ${aspectRatio}`;
    const queryParams = new URLSearchParams({
        model: "gptimage",
        nologo: true,
        seed: seed,
        referrer: 'elixpoart',
        token: POLLINATIONS_TOKEN,
    });
    const urls = uploadedUrls.join(',');
    let imgurl = `${baseURL}${promptParam}?${queryParams.toString()}`;
    if (urls) {
        imgurl += `&image=${encodeURIComponent(urls)}`;
    }

    try {
        const response = await fetch(imgurl, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buffer = await response.buffer();
        if (buffer.length > 500) {
            const attachment = new AttachmentBuilder(buffer, { name: `elixpo_ai_remix.jpg` });

            // --- Build styled embed and buttons like generate.js ---
            let finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
            finalContent += `✨ Your remix is ready!`;

            const embedsToSend = [];
            const actionRow = new ActionRowBuilder();

            if (!missingEmbeds) {
                const embed = new EmbedBuilder()
                  .setTitle('🌀 Remix Complete')
                  .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
                  .setColor('#00B2FF')
                  .setAuthor({
                    name: interaction.user.tag,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                  })
                  .addFields(
                    {
                      name: '🛠️ Remix Parameters',
                      value:
                        `• **Theme**: \`${theme}\`\n` +
                        `• **Model**: \`${model}\`\n` +
                        `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                        `• **Seed**: \`${seed}\`\n` +
                        `• **Source Images**: ${uploadedUrls.length}`,
                      inline: false
                    }
                  )
                  .setTimestamp()
                  .setFooter({
                    text: `Created by ElixpoArt | Interaction ID: ${interaction.id}`,
                    iconURL: client.user.displayAvatarURL()
                  });
                embedsToSend.push(embed);
            } else {
                finalContent += `\n\n**🛠️ Remix Parameters:**\n` +
                  `• **Theme**: \`${theme}\`\n` +
                  `• **Model**: \`${model}\`\n` +
                  `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                  `• **Seed**: \`${seed}\`\n` +
                  `• **Source Images**: ${uploadedUrls.length}`;
            }

            // Download button (Link if possible)
            const isValidUrlForLinkButton = typeof imgurl === 'string'
                && (imgurl.startsWith('http://') || imgurl.startsWith('https://'))
                && imgurl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;

            if (isValidUrlForLinkButton) {
                actionRow.addComponents(new ButtonBuilder()
                    .setLabel('Download')
                    .setStyle(ButtonStyle.Link)
                    .setURL(imgurl));
            } else {
                actionRow.addComponents(createDownloadButton(null, interaction.id, 0));
            }

            // Cache the remix image for download button
            setCache(interaction.id, {
                data: [{ attachment, url: imgurl }],
                timestamp: Date.now()
            });

            const finalEditOptions = {
                content: finalContent,
                files: [attachment],
                // components: actionRow.components.length > 0 ? [actionRow] : [],
                embeds: embedsToSend.length > 0 ? embedsToSend : [],
            };

            await interaction.editReply(finalEditOptions);
        } else {
            await interaction.editReply({ content: `❌ The generated image is too small or empty.` });
        }
    } catch (error) {
        console.error(`[remixImage] Error fetching remix image:`, error);
        await interaction.editReply({ content: `❌ An error occurred while generating the remix image.` });
    }
}