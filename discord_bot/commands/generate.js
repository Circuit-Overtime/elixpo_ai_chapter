import { generateImage } from '../imageService.js';
import { sanitizeText } from '../utils.js';
import { generateIntermediateText, generateConclusionText } from '../textService.js';
import { getPermissionName, PERMISSIONS, client } from '../bot.js';
import { setCache, deleteCache } from '../cache.js';
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DEFAULT_ASPECT_RATIO, DEFAULT_MODEL, DEFAULT_THEME } from '../config.js';
import { createRemixButton, createDownloadButton, createMultipleDownloadButtons, buildActionRow } from '../components.js';

const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512;

export async function handleGenerate(interaction) {
    const missingEmbeds = interaction._missingEmbeds || false;

    const prompt = interaction.options.getString("prompt");
    const numberOfImagesRequested = interaction.options.getInteger("number_of_images") || 1;
    const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;
    const theme = interaction.options.getString("theme") || DEFAULT_THEME;
    const enhancement = interaction.options.getBoolean("enhancement") || false;
    const modelUsed = interaction.options.getString("model") || DEFAULT_MODEL;
    const seed = interaction.options.getInteger("seed");

    let statusContent = '';

    statusContent = `${missingEmbeds ? `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    statusContent += '✨ Wowza I see.. Your request is on the way!';
    await interaction.editReply(statusContent);

    let formattedIntermediateText = '';
    try {
       const intermediateText = sanitizeText(await generateIntermediateText(prompt));
       formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';
    } catch (err) {
       console.error(`Error generating intermediate text for generate interaction ${interaction.id}:`, err);
       formattedIntermediateText = `*Had trouble generating an intermediate thought.*`;
    }

    statusContent = `${missingEmbeds ? `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    if (formattedIntermediateText) {
        statusContent += `${statusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    statusContent += `${statusContent ? '\n\n' : ''}> 🎨 Painting my canvas!`;
    await interaction.editReply(statusContent);

    let generatedImagesWithUrls = [];
    try {
       generatedImagesWithUrls = await generateImage(interaction);
    //    console.log("Generated Images With URLs:", generatedImagesWithUrls);
    } catch (imgError) {
       console.error(`Error during generateImage for interaction ${interaction.id}:`, imgError);
       await interaction.editReply({
           content: `${statusContent}\n\n❌ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data. Error details: ${imgError.message || 'Unknown error'}`
       });
       return;
    }

    const generatedAttachments = generatedImagesWithUrls.map(item => item.attachment).filter(att => att instanceof AttachmentBuilder);
    const actualNumberOfImages = generatedAttachments.length;

    let formattedConclusionText = '';
    try {
       const conclusionText = sanitizeText(await generateConclusionText(prompt));
       formattedConclusionText = conclusionText ? `*${conclusionText.replace(/\.$/, '').trim()}*` : '';
    } catch (err) {
       console.error(`Error generating conclusion text for generate interaction ${interaction.id}:`, err);
       formattedConclusionText = `*Had trouble generating a concluding thought.*`;
    }

    let finalContent = `${missingEmbeds ? `⚠️ Missing **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    if (formattedIntermediateText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }

    if (actualNumberOfImages > 0) {
        finalContent += `${finalContent ? '\n\n' : ''}✨ Your images have been successfully generated!`;
    } else {
         finalContent += `${finalContent ? '\n\n' : ''}⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data.`;
    }

    if (formattedConclusionText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedConclusionText}`;
    }

    const embedsToSend = [];
    const actionRow = new ActionRowBuilder();

    if (!missingEmbeds && actualNumberOfImages > 0) {
        const embed = new EmbedBuilder()
          .setTitle('🖼️ Image Generated Successfully')
          .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
          .setColor('#5865F2')
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
          })
          .addFields(
            {
              name: '🛠️ Generation Parameters',
              value:
                `• **Theme**: \`${theme}\`\n` +
                `• **Model**: \`${modelUsed}\`\n` +
                `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
                `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
                `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
                `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`,
              inline: false
            }
          )
          .setTimestamp()
          .setFooter({
            text: `Created by ElixpoArt | Interaction ID: ${interaction.id}`,
            iconURL: client.user.displayAvatarURL()
          });

        embedsToSend.push(embed);
    } else if (missingEmbeds && actualNumberOfImages > 0) {
         finalContent += `${finalContent ? '\n\n' : ''}**🛠️ Generation Parameters:**\n` +
            `• **Theme**: \`${theme}\`\n` +
            `• **Model**: \`${modelUsed}\`\n` +
            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
            `• **Images**: \`${actualNumberOfImages}${numberOfImagesRequested !== actualNumberOfImages ? ` (Requested ${numberOfImagesRequested})` : ''}\`` +
            `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`;
    }

    if (actualNumberOfImages > 0) {
        actionRow.addComponents(createRemixButton());

        if (actualNumberOfImages === 1) {
            const firstImageUrl = generatedImagesWithUrls[0]?.url;

            const isValidUrlForLinkButton = typeof firstImageUrl === 'string'
                && (firstImageUrl.startsWith('http://') || firstImageUrl.startsWith('https://'))
                && firstImageUrl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;

            if (isValidUrlForLinkButton) {
                 actionRow.addComponents(new ButtonBuilder()
                    .setLabel('Download')
                    .setStyle(ButtonStyle.Link)
                    .setURL(firstImageUrl.replace("&referrer=elixpoart&token=fEWo70t94146ZYgk", "")));
                //  console.log(`Added Link button for download for interaction ${interaction.id}.`);
            } else {
                 actionRow.addComponents(createDownloadButton(null, interaction.id, 0));
                 console.warn(`Image URL too long or invalid for Link button (${firstImageUrl?.length} chars, limit ${DISCORD_LINK_BUTTON_MAX_URL_LENGTH}). Added Primary download button for interaction ${interaction.id}.`);
            }
        } else {
             const maxButtonsPerMessage = 25;
             for (let i = 0; i < Math.min(actualNumberOfImages, maxButtonsPerMessage - actionRow.components.length); i++) {
                 actionRow.addComponents(createDownloadButton(null, interaction.id, i));
             }
            //  console.log(`Added ${actionRow.components.length - 1} Primary download buttons for multiple images for interaction ${interaction.id}.`);
        }
    }

    if (generatedImagesWithUrls.length > 0) {
        setCache(interaction.id, {
          data: generatedImagesWithUrls,
          timestamp: Date.now()
        });
        // console.log(`Stored ${generatedImagesWithUrls.length} generated images in cache for interaction ${interaction.id}.`);
    } else {
         deleteCache(interaction.id);
        //  console.log(`No images generated for interaction ${interaction.id}. Nothing cached.`);
    }

    const finalEditOptions = {
        content: finalContent,
        files: generatedAttachments,
        // components: actionRow.components.length > 0 ? [actionRow] : [],
        embeds: embedsToSend.length > 0 ? embedsToSend : [],
    };

    try {
        if (finalEditOptions.files.length > 0 || finalEditOptions.embeds.length > 0 || finalEditOptions.content.trim().length > 0) {
             await interaction.editReply(finalEditOptions);
            //  console.log(`Generate command processing finished for interaction ${interaction.id}. Final reply sent.`);
        } else {
             await interaction.editReply({ content: `${statusContent}\n\n⚠️ Failed to generate images and could not construct a proper reply. Please try again.` });
             console.warn(`Generate command for interaction ${interaction.id} resulted in no files, no embeds, and empty content.`);
        }

    } catch (replyError) {
        console.error(`Failed to send final generate reply for interaction ${interaction.id}:`, replyError);
    }
}