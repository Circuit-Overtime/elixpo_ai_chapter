import { client, PERMISSIONS, getPermissionName } from './bot.js';
import { DISCORD_TOKEN, POLLINATIONS_TOKEN, TEST_GUILD_ID } from './config.js';
import { setCache, getCache, deleteCache, cleanupCache, imageCache } from './cache.js';
import { remixCommand } from './commands/remix.js';
import { handleGenerate } from './commands/generate.js';
import { handleEdit } from './commands/edit.js';
import { handlePing } from './commands/ping.js';
import { handleHelp } from './commands/help.js';
import { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Semaphore } from './semaphore.js';

let queue = [];
let isProcessing = false;

setInterval(cleanupCache, 10 * 60 * 1000);
const commandSemaphore = new Semaphore(5);
client.on('interactionCreate', async interaction => {
  // if (interaction.guildId !== TEST_GUILD_ID) {
  //   try {
  //     await interaction.reply({
  //       content: "🚧 The bot is currently under development and only available in the test server.",
  //       ephemeral: true
  //     });
  //   } catch (e) {
  //     console.error("Error sending dev-only message:", e);
  //   }
  //   return;
  // }

  if (interaction.isChatInputCommand()) {
    if (interaction.user.bot) return;

    const channel = interaction.channel;
    const botMember = interaction.guild?.members.me;
    if (!channel || !botMember) {
      try {
        await interaction.reply({
          content: "Could not determine the channel or bot permissions for this interaction.",
          ephemeral: true
        });
      } catch (e) { console.error("Error sending null channel/member error:", e); }
      return;
    }

    const botPermissions = channel.permissionsFor(botMember);
    if (!botPermissions) {
      try {
        await interaction.reply({
          content: "Could not determine bot permissions for this channel.",
          ephemeral: true
        });
      } catch (e) { console.error("Error sending permissions check error:", e); }
      return;
    }

    if (['generate', 'edit', 'remix'].includes(interaction.commandName)) {
      await interaction.deferReply({ ephemeral: false }); // <-- FIXED
      await commandSemaphore.acquire();
      try {
        if (interaction.commandName === 'generate') {
          await handleGenerate(interaction);
        } else if (interaction.commandName === 'edit') {
          await handleEdit(interaction);
        } else if (interaction.commandName === 'remix') {
          await remixCommand(interaction);
        }
      } finally {
        commandSemaphore.release();
      }
      return;
    }
  
    // Other commands (help, ping, etc.) can run without limit
    if (interaction.commandName === 'help') {
      await handleHelp(interaction);
      return;
    }
    if (interaction.commandName === 'ping') {
      await handlePing(interaction);
      return;
    }
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId === 'edit_image') {
      try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.deferUpdate();
        } else if (interaction.deferred) {
            await interaction.followUp({ content: "Please use the `/edit` command.", ephemeral: true });
            return;
        }

        const channel = interaction.channel;
        const botMember = interaction.guild?.members.me;
        if (channel && botMember && channel.permissionsFor(botMember)?.has(PERMISSIONS.SendMessages)) {
            await interaction.followUp({
              content: "To edit an image, use the `/edit` command and provide the Message ID and Image **index** (e.g., `1` for the first image) from the original message as options.",
              ephemeral: true
            });
        } else {
            console.warn(`Cannot reply to edit button interaction due to missing SendMessages permission in channel ${interaction.channel?.id}`);
        }
      } catch (e) {
        console.error("Error handling edit button interaction:", e);
      }
      return;
    }

    if (customId.startsWith('download_')) {
      try {
          if (!interaction.replied && !interaction.deferred) {
              await interaction.deferReply({ ephemeral: true });
          }
      } catch (e) {
          console.error("Failed to deferReply for download button:", e);
      }

      const channel = interaction.channel;
      const botMember = interaction.guild?.members.me;

      const requiredDownloadFlags = [PERMISSIONS.ViewChannel, PERMISSIONS.SendMessages, PERMISSIONS.AttachFiles];
      const missingDownload = requiredDownloadFlags.filter(flag => !botMember?.permissionsIn(channel).has(flag));

      if (missingDownload.length > 0) {
        const permissionNames = missingDownload.map(getPermissionName).join(', ');
        try {
          if (interaction.replied || interaction.deferred) {
             await interaction.editReply({
               content: `I do not have the necessary permissions (**${permissionNames}**) in this channel to provide the image file for download.`,
             });
          } else {
             await interaction.reply({
               content: `I do not have the necessary permissions (**${permissionNames}**) in this channel to provide the image file for download.`,
               ephemeral: true
             });
          }
        } catch (e) { console.error("Error sending fallback permission error for download button:", e); }
        return;
      }

      const parts = customId.split('_');
      if (parts.length !== 3 || parts[0] !== 'download' || !/^\d+$/.test(parts[1]) || isNaN(parseInt(parts[2], 10))) {
        try {
           if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: "Could not process the download request due to an invalid button ID format.",
                });
           } else {
               await interaction.reply({
                   content: "Could not process the download request due to an invalid button ID format.",
                   ephemeral: true
               });
           }
        } catch (e) { console.error("Error replying to invalid download button:", e); }
        return;
      }

      const originalInteractionId = parts[1];
      const imageIndex = parseInt(parts[2], 10);

      const cacheEntry = getCache(originalInteractionId);

      if (!cacheEntry || !cacheEntry.data || !Array.isArray(cacheEntry.data)) {
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: "Sorry, the image data for this download button has expired or was not found in the cache, or its format is unexpected. Please try generating or remixing the image again.",
                });
            } else {
                await interaction.reply({
                   content: "Sorry, the image data for this download button has expired or was not found in the cache, or its format is unexpected. Please try generating or remixing the image again.",
                   ephemeral: true
               });
            }
        } catch (e) { console.error("Error replying when image data not found:", e); }
        return;
      }

      const cachedImages = cacheEntry.data;

      if (imageIndex < 0 || imageIndex >= cachedImages.length) {
         try {
            if (interaction.replied || interaction.deferred) {
                 await interaction.editReply({
                     content: `Sorry, the image index (#${imageIndex + 1}) for this download button is invalid for the original message.`,
                 });
             } else {
                 await interaction.reply({
                    content: `Sorry, the image index (#${imageIndex + 1}) for this download button is invalid for the original message.`,
                    ephemeral: true
                });
             }
         } catch (e) { console.error("Error replying when image index is out of bounds:", e); }
         return;
      }

      const imageItem = cachedImages[imageIndex];

      if (!imageItem || !(imageItem.attachment instanceof AttachmentBuilder)) {
         try {
            if (interaction.replied || interaction.deferred) {
                 await interaction.editReply({
                     content: `Sorry, the attachment data for image #${imageIndex + 1} from the cache is missing or corrupted.`,
                 });
             } else {
                 await interaction.reply({
                   content: `Sorry, the attachment data for image #${imageIndex + 1} from the cache is missing or corrupted.`,
                   ephemeral: true
               });
             }
         } catch (e) { console.error("Error replying when attachment data is missing:", e); }
         return;
      }

      const attachmentToSend = imageItem.attachment;

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: `Here is image #${imageIndex + 1}:`,
            files: [attachmentToSend],
            ephemeral: true
          });
        } else {
           await interaction.reply({
             content: `Here is image #${imageIndex + 1}:`,
             files: [attachmentToSend],
             ephemeral: true
           });
        }
        // console.log(`Successfully sent image #${imageIndex + 1} for interaction ${originalInteractionId} via button click.`);
      } catch (e) {
        console.error(`Error replying with image #${imageIndex + 1} for interaction ${originalInteractionId}:`, e);
        try {
           if (interaction.replied || interaction.deferred) {
              await interaction.editReply({
                 content: `Failed to send image #${imageIndex + 1}. An error occurred.`,
                 ephemeral: true
              });
           } else {
              await interaction.reply({
                 content: `Failed to send image #${imageIndex + 1}. An error occurred.`,
                 ephemeral: true
              });
           }
        } catch (e2) { console.error("Error sending fallback error for download button:", e2); }
      }
      return;
    }
  }
});

async function processQueueDiscord() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }

  if (isProcessing) {
      return;
  }

  isProcessing = true;
  const interaction = queue[0];

  try {
    if (!interaction.deferred && !interaction.replied) {
         console.warn(`Interaction ${interaction.id} became invalid (not deferred/replied) before processing. Skipping.`);
         queue.shift();
         isProcessing = false;
         processQueueDiscord();
         return;
    }

    if (interaction.commandName === 'generate') {
        // console.log(`Processing generate command for interaction ${interaction.id}`);
        await handleGenerate(interaction);
    } else if (interaction.commandName === 'edit') {
        // console.log(`Processing edit command for interaction ${interaction.id}`);
        await handleEdit(interaction);
    }
    else if(interaction.commandName === "remix")
    {
      await remixCommand(interaction);
    }
    else {
         console.warn(`Unknown command in queue: ${interaction.commandName} for interaction ${interaction.id}. Skipping.`);
         try {
             await interaction.editReply({ content: `An internal error occurred: Unknown command \`${interaction.commandName}\` found in queue.` });
         } catch (e) { console.error("Failed to send unknown command error reply:", e); }
         queue.shift();
         isProcessing = false;
         processQueueDiscord();
         return;
    }

  } catch (error) {
    console.error(`Error processing interaction ${interaction.id} (Type: ${interaction.commandName}):`, error);

    try {
        if (!interaction.deferred && !interaction.replied) {
             console.warn(`Interaction ${interaction.id} became invalid during error handling. Cannot send error reply.`);
        } else {
             await interaction.editReply({
                 content: `⚠️ An unexpected error occurred while processing your request for \`${interaction.commandName}\`. Please try again later. Error details have been logged.`,
             });
        }
    } catch (editError) {
      console.error(`Failed to edit reply for interaction ${interaction.id} during main error handling:`, editError);
    }

    if (queue.length > 0 && queue[0] === interaction) {
        queue.shift();
    } else {
        console.warn(`Queue head mismatch during error handling. Expected interaction ${interaction.id}, found ${queue.length > 0 ? queue[0].id : 'none'}. Clearing queue head defensively.`);
        if (queue.length > 0) {
             queue.shift();
        }
    }

    isProcessing = false;
    if (queue.length > 0) {
         process.nextTick(processQueueDiscord);
    }


  } finally {

    if (queue.length > 0 && queue[0] === interaction) {
         queue.shift();
    }

    isProcessing = false;

    if (queue.length > 0) {
         process.nextTick(processQueueDiscord);
    }
  }
}

function addToQueue(interaction) {
  queue.push(interaction);
  console.log(`Added interaction ${interaction.id} (Type: ${interaction.commandName}) to queue. Queue size: ${queue.length}`);
  if (!isProcessing) {
    // console.log("Queue is not processing, starting processQueueDiscord.");
    process.nextTick(processQueueDiscord);
  } else {
    // console.log("Queue is already processing.");
  }
}

if (!DISCORD_TOKEN) {
    console.error("FATAL ERROR: Discord bot token not found in environment variables (DISCORD_TOKEN).");
    process.exit(1);
}
if (!POLLINATIONS_TOKEN) {
     console.warn("Pollinations API token not found in environment variables (POLLINATIONS_TOKEN).");
}

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

client.login(DISCORD_TOKEN).catch(err => {
    console.error("FATAL ERROR: Failed to login to Discord.", err);
    process.exit(1);
});