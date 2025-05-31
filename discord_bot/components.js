import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

/**
 * Creates a "Remix" button for image messages.
 * @returns {ButtonBuilder}
 */
export function createRemixButton() {
    return new ButtonBuilder()
        .setLabel('Remix')
        .setStyle(ButtonStyle.Secondary)
        .setCustomId('edit_image');
}

/**
 * Creates a "Download" button for a single image.
 * If a valid URL is provided, creates a Link button; otherwise, creates a Primary button with a custom ID.
 * @param {string} url - The image URL.
 * @param {string} interactionId - The Discord interaction ID.
 * @returns {ButtonBuilder}
 */
export function createDownloadButton(url, interactionId) {
    const DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512;
    const isValidUrl = typeof url === 'string'
        && url.startsWith('http')
        && url.length <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH;

    if (isValidUrl) {
        return new ButtonBuilder()
            .setLabel('Download')
            .setStyle(ButtonStyle.Link)
            .setURL(url);
    } else {
        return new ButtonBuilder()
            .setLabel('Download')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`download_${interactionId}_0`);
    }
}

/**
 * Creates download buttons for multiple images.
 * @param {number} count - Number of images.
 * @param {string} interactionId - The Discord interaction ID.
 * @returns {ButtonBuilder[]}
 */
export function createMultipleDownloadButtons(count, interactionId) {
    const buttons = [];
    for (let i = 0; i < count; i++) {
        buttons.push(
            new ButtonBuilder()
                .setLabel(`Download #${i + 1}`)
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`download_${interactionId}_${i}`)
        );
    }
    return buttons;
}

/**
 * Builds an ActionRow with provided buttons.
 * @param {ButtonBuilder[]} buttons
 * @returns {ActionRowBuilder}
 */
export function buildActionRow(buttons) {
    const row = new ActionRowBuilder();
    row.addComponents(...buttons);
    return row;
}