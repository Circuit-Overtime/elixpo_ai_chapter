/**
 * Handles the /ping command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function handlePing(interaction) {
    try {
        await interaction.reply({
            content: "Yooo! I'm ready to paint xD",
            ephemeral: false
        });
    } catch (e) {
        console.error("Error sending ping message:", e);
        try {
            await interaction.reply({
                content: "Oops! Something went wrong with the ping.",
                ephemeral: true
            });
        } catch {}
    }
}