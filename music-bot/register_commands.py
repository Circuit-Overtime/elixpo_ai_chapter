import os
import discord
from discord.ext import commands
from discord import app_commands
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()
TOKEN = os.getenv('TOKEN')

# Initialize bot with a prefix and intents
intents = discord.Intents.default()
intents.voice_states = True  # Required for voice state updates
bot = commands.Bot(command_prefix="/", intents=intents)

# Clear any existing commands on startup
@bot.event
async def on_ready():
    await bot.tree.sync()  # Sync slash commands with Discord if any
    print(f'{bot.user.name} has connected to Discord with commands cleared and re-registered!')

# Register slash commands

@bot.tree.command(name='play', description="Play a song by name")
async def play(interaction: discord.Interaction, song_name: str):
    await interaction.response.send_message(f"Searching and playing: {song_name}")

@bot.tree.command(name='help', description="Check out all the available commands")
async def help(interaction: discord.Interaction):
    commands_list = """
    **Available Commands:**
    /play <song_name> - Play a song by name
    /play_url <url> - Play a song from a YouTube URL
    /pause - Pause the current track
    /stop - Stop playback
    /skip - Skip to the next track
    /clear - Clear the current track
    /queue - Display the current queue
    /replay - Replay the current track
    /loop - Toggle loop mode
    /clear_queue - Clear the entire queue
    /remove <index> - Remove a track by index from the queue
    /join - Join the voice channel
    /volume <level> - Set volume level (0-100)
    /reset - Reset playback
    /shuffle - Shuffle the queue
    /now_playing - Show the current track
    /help - Check out all the available commands
    """
    await interaction.response.send_message(commands_list)

@bot.tree.command(name='ping', description="Check the bot's latency")
async def ping(interaction: discord.Interaction):
     await interaction.response.send_message("Hey Buddy! Wanna Vibe? I'm up for streaming music 🎶. Use /help to know how to interact with me")

@bot.tree.command(name='play_url', description="Play a song from a YouTube URL")
async def play_url(interaction: discord.Interaction, url: str):
    await interaction.response.send_message(f"Playing song from URL: {url}")

@bot.tree.command(name='pause', description="Pause the current track")
async def pause(interaction: discord.Interaction):
    await interaction.response.send_message("Pausing the current track")

@bot.tree.command(name='stop', description="Stop playback")
async def stop(interaction: discord.Interaction):
    await interaction.response.send_message("Stopping playback")

@bot.tree.command(name='skip', description="Skip to the next track")
async def skip(interaction: discord.Interaction):
    await interaction.response.send_message("Skipping to the next track")

@bot.tree.command(name='clear', description="Clear the current track")
async def clear(interaction: discord.Interaction):
    await interaction.response.send_message("Clearing the current track")

@bot.tree.command(name='queue', description="Display the current queue")
async def queue(interaction: discord.Interaction):
    await interaction.response.send_message("Displaying the current queue")

@bot.tree.command(name='replay', description="Replay the current track")
async def replay(interaction: discord.Interaction):
    await interaction.response.send_message("Replaying the current track")

@bot.tree.command(name='loop', description="Toggle loop mode")
async def loop(interaction: discord.Interaction):
    await interaction.response.send_message("Toggling loop mode")

@bot.tree.command(name='clear_queue', description="Clear the entire queue")
async def clear_queue(interaction: discord.Interaction):
    await interaction.response.send_message("Clearing the entire queue")

@bot.tree.command(name='disconnect', description="Disconnect from the voice channel")
async def disconnect(interaction: discord.Interaction):
    if interaction.guild.voice_client:
        await interaction.guild.voice_client.disconnect()
        await interaction.response.send_message("Disconnected from the voice channel")
    else:
        await interaction.response.send_message("I'm not connected to any voice channel")

@bot.tree.command(name='remove', description="Remove a track by index from the queue")
async def remove(interaction: discord.Interaction, index: int):
    await interaction.response.send_message(f"Removing track at position {index} from the queue")

@bot.tree.command(name='join', description="Join the voice channel")
async def join(interaction: discord.Interaction):
    if interaction.user.voice:
        channel = interaction.user.voice.channel
        await channel.connect()
        await interaction.response.send_message(f"Joined {channel}")
    else:
        await interaction.response.send_message("You need to be in a voice channel to use this command.")

@bot.tree.command(name='volume', description="Set volume level (0-100)")
async def volume(interaction: discord.Interaction, level: int):
    if 0 <= level <= 100:
        await interaction.response.send_message(f"Setting volume to {level}%")
    else:
        await interaction.response.send_message("Volume level must be between 0 and 100.")

@bot.tree.command(name='reset', description="Reset playback")
async def reset(interaction: discord.Interaction):
    await interaction.response.send_message("Resetting playback")

@bot.tree.command(name='shuffle', description="Shuffle the queue")
async def shuffle(interaction: discord.Interaction):
    await interaction.response.send_message("Shuffling the queue")

@bot.tree.command(name='now_playing', description="Show the current track")
async def now_playing(interaction: discord.Interaction):
    await interaction.response.send_message("Now playing the current track")

# Run the bot
bot.run(TOKEN)
# Configure logging
logging.basicConfig(level=logging.INFO)

# Add logging when commands are successfully updated
@bot.event
async def on_ready():
    await bot.tree.sync()  # Sync slash commands with Discord if any
    logging.info(f'{bot.user.name} has connected to Discord with commands cleared and re-registered!')
    print(f'{bot.user.name} has connected to Discord with commands cleared and re-registered!')
    exit()