import { generateRemixImage } from '../imageService.js';
import { sanitizeText } from '../utils.js';
import { generateIntermediateText, generateConclusionText } from '../textService.js';
import { getPermissionName, PERMISSIONS, client } from '../bot.js';
import { getCache, setCache, deleteCache } from '../cache.js'; // Correctly import deleteCache
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DEFAULT_ASPECT_RATIO, DEFAULT_THEME, DISCORD_LINK_BUTTON_MAX_URL_LENGTH } from '../config.js';
import { createRemixButton, createDownloadButton, createMultipleDownloadButtons, buildActionRow } from '../components.js';


/**
 * Handles the execution logic for the /edit command after it has been deferred and queued.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
 */
export async function handleEdit(interaction) {
    const missingEmbeds = interaction._missingEmbeds || false;

    const prompt = interaction.options.getString("prompt");
    const targetMessageId = interaction.options.getString("original_picture_message_id");
    const requestedIndex = interaction.options.getInteger("img_index_to_edit"); 
    const aspectRatio = interaction.options.getString("aspect_ratio") || DEFAULT_ASPECT_RATIO;
    const theme = interaction.options.getString("theme") || DEFAULT_THEME;
    const enhancement = interaction.options.getBoolean("enhancement") || false;
    const modelUsed = "gptimage"; 
    const seed = interaction.options.getInteger("seed");

    let statusContent = ''; 
    statusContent = `${missingEmbeds ? `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    statusContent += '🪄 Getting ready to remix your creation!';
    try {
        await interaction.editReply(statusContent);
    } catch (e) {
        console.error(`Failed to edit initial reply for interaction ${interaction.id}:`, e);
        return;
    }


   
    let formattedIntermediateText = '';
    try {
       const intermediateText = sanitizeText(await generateIntermediateText(prompt));
       formattedIntermediateText = intermediateText ? `*${intermediateText.replace(/\.$/, '').trim()}*` : '';
    } catch (err) {
       console.error(`Error generating intermediate text for edit interaction ${interaction.id}:`, err);
       formattedIntermediateText = `*Had trouble generating an intermediate thought.*`; 
    }


    statusContent = `${missingEmbeds ? `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    if (formattedIntermediateText) {
        statusContent += `${statusContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }
    statusContent += `${statusContent ? '\n\n' : ''}> 🔄 Tweaking Pixels, just a moment!`;
    try {
        await interaction.editReply(statusContent);
    } catch (e) {
        console.error(`Failed to edit status reply with intermediate text for interaction ${interaction.id}:`, e);
    }



    let referencedMessage;
    try {
        referencedMessage = await interaction.channel.messages.fetch(targetMessageId);
    } catch (fetchError) {
        await interaction.editReply({
            content: `${statusContent}\n\n❌ Could not find the message with ID \`${targetMessageId}\`. It might have been deleted, is too old, or I lack permissions (**${getPermissionName(PERMISSIONS.ReadMessageHistory)}**).`
        });
        return;
    }
    if (referencedMessage.author.id !== client.user.id || !referencedMessage.embeds || referencedMessage.embeds.length === 0) {
        await interaction.editReply({
            content: `${statusContent}\n\n❌ The message with ID \`${targetMessageId}\` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages.`
        });
        return;
    }
    const originalEmbed = referencedMessage.embeds[0];
    const footerText = originalEmbed?.footer?.text;
    const idMatch = footerText?.match(/Interaction ID: (\d+)/);
    const originalInteractionId = idMatch ? idMatch[1] : null;

    if (!originalInteractionId) {
        await interaction.editReply({
            content: `${statusContent}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID \`${targetMessageId}\`. The message format might be outdated or corrupted.`
        });
        return;
    }

    const originalCacheEntry = getCache(originalInteractionId);
    if (!originalCacheEntry || !originalCacheEntry.data || !Array.isArray(originalCacheEntry.data)) {
        await interaction.editReply({
            content: `${statusContent}\n\n❌ The data for the original image from message ID \`${targetMessageId}\` has expired or was not found in the cache, or its format is unexpected. Please try generating the original image again and then use the \`/edit\` command with the new message ID.`
        });
        return;
    }

    const originalImageDataArray = originalCacheEntry.data; 
    const zeroBasedIndex = requestedIndex - 1; 

    if (zeroBasedIndex < 0 || zeroBasedIndex >= originalImageDataArray.length) {
         await interaction.editReply({
             content: `${statusContent}\n\n❌ Invalid image index \`${requestedIndex}\` for message ID \`${targetMessageId}\`. Please provide an index between 1 and ${originalImageDataArray.length} for that message.`,
         });
         return;
    }

    const sourceImageItem = originalImageDataArray[zeroBasedIndex]; 

    if (!sourceImageItem || typeof sourceImageItem.url !== 'string') {
        await interaction.editReply({
            content: `${statusContent}\n\n❌ Could not retrieve valid image data (missing URL) for the selected image from the cache for message ID \`${targetMessageId}\` (index #${requestedIndex}). The data might be corrupted.`
        });
        return;
    }

    const sourceImageUrl = sourceImageItem.url;
    let generatedImagesWithUrls = [];
    try {
        generatedImagesWithUrls = await generateRemixImage(interaction, sourceImageUrl, aspectRatio);
    } catch (imgError) {
        console.error(`Error during generateRemixImage for edit interaction ${interaction.id}:`, imgError);
        await interaction.editReply({
            content: `${statusContent}\n\n❌ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data. Error details: ${imgError.message || 'Unknown error'}`
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
       console.error(`Error generating conclusion text for edit interaction ${interaction.id}:`, err);
       formattedConclusionText = `*Had trouble generating a concluding thought.*`; 
    }


    // --- Build Final Reply ---
    let finalContent = `${missingEmbeds ? `⚠️ I am missing the **${getPermissionName(PERMISSIONS.EmbedLinks)}** permission, so the rich embed won't display full details.\n\n` : ''}`;
    if (formattedIntermediateText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedIntermediateText}`;
    }

    if (actualNumberOfImages > 0) {
        finalContent += `${finalContent ? '\n\n' : ''}✨ Your image(s) have been successfully remixed!`;
    } else {
         finalContent += `${finalContent ? '\n\n' : ''}⚠️ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data.`;
    }

    if (formattedConclusionText) {
        finalContent += `${finalContent ? '\n\n' : ''}${formattedConclusionText}`;
    }

    const embedsToSend = [];
    const actionRow = new ActionRowBuilder();

    // Build Embed if permissions allow and images were generated
    if (!missingEmbeds && actualNumberOfImages > 0) {
        const embed = new EmbedBuilder()
            .setTitle('🔄 Image Remixed Successfully')
            .setDescription(`**🎨 Prompt:**\n> ${prompt}`)
            .setColor('#E91E63') 
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
                        `• **Images**: \`${actualNumberOfImages}\`` +
                        `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: `Created by ElixpoArt | Interaction ID: ${interaction.id}`,
                iconURL: client.user.displayAvatarURL()
            });

        const targetMessageLink = interaction.guild?.id && interaction.channel?.id
             ? `[Vanilla Generation](https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${targetMessageId})`
             : `message ID \`${targetMessageId}\``;

        embed.addFields({
            name: 'Source',
            value: `Remixed from image **#${requestedIndex}** in ${targetMessageLink}.`,
            inline: false
        });

        embedsToSend.push(embed);
    } else if (missingEmbeds && actualNumberOfImages > 0) {
        // Add parameters to final content if embeds are missing and images were generated
         finalContent += `${finalContent ? '\n\n' : ''}**🛠️ Generation Parameters:**\n` +
            `• **Theme**: \`${theme}\`\n` +
            `• **Model**: \`${modelUsed}\`\n` +
            `• **Aspect Ratio**: \`${aspectRatio}\`\n` +
            `• **Enhanced**: \`${enhancement ? 'Yes' : 'No'}\`\n` +
            `• **Images**: \`${actualNumberOfImages}\`` +
            `${seed !== null && actualNumberOfImages === 1 ? `\n• **Seed**: \`${seed}\`` : ''}`;
         finalContent += `\n• **Source**: Remixed from image #${requestedIndex} in message ID \`${targetMessageId}\`.`;
    }


    // Add Remix and Download buttons if images were generated
    if (actualNumberOfImages > 0) {
        // Add Remix button always if images were generated
        actionRow.addComponents(createRemixButton());

        if (actualNumberOfImages === 1) {
            // For single image, use the URL if possible for a Link button
            const firstImageUrl = generatedImagesWithUrls[0]?.url;

            // Check if the URL is a valid HTTP(S) URL and within Discord's length limit
            const isValidUrlForLinkButton = typeof firstImageUrl === 'string'
                && (firstImageUrl.startsWith('http://') || firstImageUrl.startsWith('https://'))
                && firstImageUrl.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;

            if (isValidUrlForLinkButton) {
                 actionRow.addComponents(new ButtonBuilder()
                    .setLabel('Download')
                    .setStyle(ButtonStyle.Link)
                    .setURL(firstImageUrl));
                //  console.log(`Added Link button for download for edit interaction ${interaction.id}.`);
            } else {
                // Fallback to a Primary button if URL is invalid or too long
                 actionRow.addComponents(createDownloadButton(null, interaction.id, 0)); // Pass null URL, index 0
                 console.warn(`Remixed image URL too long or invalid for Link button (${firstImageUrl?.length} chars, limit ${DISCORD_LINK_BUTTON_MAX_URL_LENGTH}). Added Primary download button for edit interaction ${interaction.id}.`);
            }
        } else {
             // For multiple images, add a download button for each (these are always Primary buttons)
             const maxButtonsPerMessage = 25; // Discord limit for components in a single message (action rows + buttons)
             // Ensure we don't exceed button limits including the remix button already added
             for (let i = 0; i < Math.min(actualNumberOfImages, maxButtonsPerMessage - actionRow.components.length); i++) {
                 actionRow.addComponents(createDownloadButton(null, interaction.id, i)); // Pass null URL, pass index i
             }
            //  console.log(`Added ${actionRow.components.length - 1} Primary download buttons for multiple remixed images for interaction ${interaction.id}.`);
        }
    }


    // Cache images for download buttons (only if images were actually generated)
    if (generatedImagesWithUrls.length > 0) {
        // Cache using the current interaction ID, storing the { attachment, url } array
        setCache(interaction.id, {
          data: generatedImagesWithUrls,
          timestamp: Date.now()
        });
        // console.log(`Stored ${generatedImagesWithUrls.length} remixed images in cache for interaction ${interaction.id}.`);
    } else {
         // If no images were generated, ensure no partial cache entry is left
         deleteCache(interaction.id); // This call is now valid because deleteCache is imported
        //  console.log(`No remixed images generated for interaction ${interaction.id}. Nothing cached.`);
    }

    // Final editReply options
    const finalEditOptions = {
        content: finalContent,
        files: generatedAttachments, // Pass the array of AttachmentBuilders
        embeds: embedsToSend.length > 0 ? embedsToSend : [], // Embeds if available and permitted
    };

    // Send the final reply (edit the deferred reply)
    try {
         // Add a similar check as in generate.js to ensure something is being sent
         if (finalEditOptions.files.length > 0 || finalEditOptions.embeds.length > 0 || finalEditOptions.content.trim().length > 0) {
              await interaction.editReply(finalEditOptions);
            //   console.log(`Edit command processing finished for interaction ${interaction.id}. Final reply sent.`);
         } else {
             // If no images, no embed, and no substantial content, send a basic error fallback
             // Use statusContent here as it contains initial warnings/messages
             await interaction.editReply({ content: `${statusContent}\n\n⚠️ Failed to remix image and could not construct a proper reply. Please try again.` });
             console.warn(`Edit command for interaction ${interaction.id} resulted in no files, no embeds, and empty content.`);
         }
    } catch (replyError) {
        console.error(`Failed to send final edit reply for interaction ${interaction.id}:`, replyError);
        // A fallback error message is handled by the processQueueDiscord catch block in elixpo_discord_bot.js
        // The error handling in elixpo_discord_bot.js's processQueueDiscord will catch errors thrown here
        // and attempt a generic error message editReply.
    }
}