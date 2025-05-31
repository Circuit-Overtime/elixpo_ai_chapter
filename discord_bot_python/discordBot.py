import discord
from discord.ext import commands
from discord import app_commands
import os
from dotenv import load_dotenv
import aiohttp
import io
import asyncio
import time
import re
import random
from urllib.parse import urlencode, quote_plus
# Ensure these imports are correct based on your file structure
try:
    from imageBytes import fetch_image_bytes
except ImportError:
    print("Error: Could not import fetch_image_bytes from imageBytes.py")
    fetch_image_bytes = None # Set to None or raise error
try:
    from suffixPrompts import get_suffix_prompt as gsp
except ImportError:
    print("Error: Could not import get_suffix_prompt from suffixPrompts.py")
    gsp = lambda theme: "" # Provide a dummy function if import fails
try:
    from sanitizeText import sanitize_text
except ImportError:
    print("Error: Could not import sanitize_text from sanitizeText.py")
    sanitize_text = lambda text: text # Provide a dummy function if import fails


load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
POLLINATIONS_TOKEN = os.getenv('POLLINATIONS_TOKEN')
POLLINATIONS_REFERRER = os.getenv('POLLINATIONS_REFERRER')

if not DISCORD_TOKEN:
    print("FATAL ERROR: Discord bot token not found in environment variables (DISCORD_TOKEN).")
    exit(1)

# Optional Pollinations tokens check - add warnings if missing
if not POLLINATIONS_TOKEN:
    print("Warning: POLLINATIONS_TOKEN not found in environment variables. Image generation may fail or be limited.")
if not POLLINATIONS_REFERRER:
    print("Warning: POLLINATIONS_REFERRER not found in environment variables. Using default referrer 'elixpoart'.")
    POLLINATIONS_REFERRER = "elixpoart"


intents = discord.Intents.default()
# Intents.message_content is not strictly needed for slash commands or button clicks
# but it *is* needed if you ever want to read the content of a message (/edit currently relies on embed footer)
# If you ever planned to read message content for /edit, keep this True.
# For now, relying on embed footer is safer permission-wise.
# Let's disable it unless proven necessary to reduce required permissions.
# intents.message_content = True
bot = commands.Bot(command_prefix="/", intents=intents)


queue = []
queue_lock = asyncio.Lock()
is_processing = False

# Cache structure: dict<interaction_id, { 'data': [ { 'attachment': discord.File, 'url': str }, ... ], 'timestamp': float }>
image_cache = {}
CACHE_DURATION = 30 * 60 # 30 minutes


# Renamed permission checks to use string names consistently with discord.Permissions attributes
REQUIRED_PERMISSIONS_FATAL = [
    'view_channel',
    'send_messages',
    'attach_files',
]
# For /edit, you also need to be able to fetch the original message.
# 'read_message_history' is the permission needed to fetch old messages.
REQUIRED_PERMISSIONS_EDIT_FATAL = REQUIRED_PERMISSIONS_FATAL + [
    'read_message_history',
]
# These are permissions that don't stop the command but result in a degraded experience (warnings)
OPTIONAL_PERMISSIONS = {
    'Embed Links': 'embed_links', # Needed for nice embeds
    # 'Read Message Content': 'read_message_content', # Only needed if you parse message content
}

# Helper function to get missing permissions using string names
def get_missing_permissions(channel_perms, required_permission_names):
    """Checks channel permissions object against a list of string permission names."""
    missing = []
    if channel_perms:
        for name in required_permission_names:
            # Use getattr to check the permission attribute by string name
            if not getattr(channel_perms, name, False): # Use False as default if attribute somehow doesn't exist
                missing.append(name)
    else:
         # If channel_perms is None, assume all are missing
         missing = required_permission_names[:]
    return missing


async def cleanup_cache():
    """Cleanup function for the cache, runs periodically."""
    await bot.wait_until_ready()
    while not bot.is_closed():
        # Run cleanup every 10 minutes
        await asyncio.sleep(10 * 60)
        now = time.time()
        keys_to_delete = []
        for key, value in image_cache.items():
            if now - value['timestamp'] > CACHE_DURATION:
                print(f"Cleaning up cache for interaction {key}")
                keys_to_delete.append(key)

        for key in keys_to_delete:
            del image_cache[key]
        print("Cache cleanup finished.")


async def generate_text(prompt_content, system_content, model="evil", seed=23, referrer="elixpoart"):
    """Generates text using the Pollinations text API."""
    # Validate inputs (basic check)
    if not prompt_content:
        print("Warning: generate_text called with empty prompt_content.")
        return None
    if not system_content:
         print("Warning: generate_text called with empty system_content.")
         # Maybe allow empty system content? Or use a default? Let's allow for now.

    text_url = "https://text.pollinations.ai/openai"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_content},
            {"role": "user", "content": prompt_content},
        ],
        "seed": seed,
        "referrer": referrer or "elixpoart", # Use provided referrer or default
    }

    async with aiohttp.ClientSession() as session:
        try:
            # Set a reasonable timeout
            async with session.post(text_url, json=payload, timeout=30) as response: # Added timeout
                # Pollinations API uses 200 for success, check for other statuses
                if response.status != 200:
                    error_body = await response.text()
                    print(f"Error generating text (status {response.status}): {response.reason}", error_body)
                    return None
                # Check content type if possible, expect application/json
                if 'application/json' not in response.headers.get('Content-Type', ''):
                     print(f"Warning: Text API returned unexpected content type: {response.headers.get('Content-Type')}")
                     # Attempt to read as JSON anyway
                     try:
                         text_result = await response.json()
                     except aiohttp.ContentTypeError:
                          print("Error: Text API response was not JSON.")
                          return None
                else:
                    text_result = await response.json()

                # Safely navigate the dictionary structure
                content = text_result.get('choices', [{}])[0].get('message', {}).get('content')

                # Basic validation of content
                if not isinstance(content, str) or not content.strip():
                     print(f"Warning: Text API returned empty or non-string content: {content}")
                     return None

                return content

        except asyncio.TimeoutError: # Handle timeout specifically
             print(f"Timeout error during text generation after 30 seconds.")
             return None
        except aiohttp.ClientError as e:
            print(f"Network or API error during text generation: {e}")
            return None
        except Exception as e: # Catch any other unexpected errors
             print(f"An unexpected error occurred during text generation: {e}")
             import traceback
             traceback.print_exc()
             return None


async def generate_intermediate_text(prompt_content):
    """Generates intermediate text using the text API."""
    # Ensure prompt_content is not empty before calling the API
    if not prompt_content or not prompt_content.strip():
        return 'Summoning the creative spirits...' # Fallback message
        
    system_content = "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly sarcastic remark related to the user's prompt, indicating that the image is being generated/processed. Keep it concise and engaging, ideally one or two sentences. Feel free to use **bold** or *italics* for emphasis within the text. Avoid standard bot responses. Be creative and slightly dramatic about the process. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
    # Use the environment variable referrer
    text = await generate_text(prompt_content, system_content, referrer=POLLINATIONS_REFERRER)
    # Use sanitize_text only if text was successfully generated
    return sanitize_text(text) if text else 'Summoning the creative spirits...'


async def generate_conclusion_text(prompt_content):
    """Generates conclusion text using the text API."""
     # Ensure prompt_content is not empty before calling the API
    if not prompt_content or not prompt_content.strip():
        return 'Behold the creation!' # Fallback message

    system_content = "You are a witty and humorous assistant for an AI image generation bot. Respond with a playful, quirky, or slightly dramatic flourish acknowledging that the image based on the user's prompt is complete and ready to be viewed. Keep it concise and fun, ideally one sentence, like a reveal. Feel free to use **bold** or *italics* for emphasis. Do not ask questions or continue the conversation. Just a short, punchy statement about the completion. Do NOT include any links, URLs, code blocks (`...` or ```...```), lists, quotes (>), or special characters that might mess up Discord formatting outside of allowed markdown like *, **, _, ~."
    # Use the environment variable referrer
    text = await generate_text(f'The image based on "{prompt_content}" is now complete.', system_content, referrer=POLLINATIONS_REFERRER)
    # Use sanitize_text only if text was successfully generated
    return sanitize_text(text) if text else 'Behold the creation!'


async def generate_image(prompt: str, num_images_to_generate: int, aspect_ratio: str, theme: str, enhancement: bool, model: str, seed_value: int | None):
    """Generates images using the Pollinations image API."""
    # Ensure fetch_image_bytes is available
    if fetch_image_bytes is None:
        print("Error: fetch_image_bytes function is not available.")
        return []

    # Validate prompt
    if not prompt or not prompt.strip():
        print("Warning: generate_image called with empty prompt.")
        return []

    base_seed = seed_value if seed_value is not None else int(time.time() * 1000) % 100000000

    # Default to 3:2 if aspect_ratio is None or invalid
    if aspect_ratio not in ['16:9', '9:16', '1:1', '4:3', '3:2']:
         print(f"Warning: Invalid or None aspect_ratio '{aspect_ratio}', defaulting to 3:2")
         aspect_ratio = '3:2'

    width, height = 1024, 683
    if aspect_ratio == '16:9': width, height = 1024, 576
    elif aspect_ratio == '9:16': width, height = 576, 1024
    elif aspect_ratio == '1:1': width, height = 1024, 1024
    elif aspect_ratio == '4:3': width, height = 1024, 768
    # 3:2 is already the default

    # Get suffix prompt (use the helper)
    suffix_prompt = gsp(theme) if gsp else "" # Check if gsp was imported successfully
    encoded_prompt = f"{prompt.strip()} {suffix_prompt}".strip()

    images_with_urls = []

    # Ensure num_images_to_generate is within a reasonable range (already checked in queue processing, but good to be safe)
    num_images_to_generate = max(1, min(4, num_images_to_generate))

    # Use the Pollinations token and referrer from environment variables
    token_param = POLLINATIONS_TOKEN if POLLINATIONS_TOKEN else None # Only add token if available
    referrer_param = POLLINATIONS_REFERRER or "elixpoart" # Use env var or default

    for i in range(num_images_to_generate):
        # Use base_seed + i for variation if seed_value was not provided, otherwise use seed_value + i
        current_seed = seed_value if seed_value is not None else base_seed + i
        # Ensure seed is within Pollinations' expected range (often 0 to 100000000, or just non-negative)
        # Simple modulo to keep it somewhat within range if base_seed is large
        current_seed = current_seed % 100000000 if current_seed is not None else None


        base_url = "https://image.pollinations.ai/prompt/"
        prompt_path = quote_plus(encoded_prompt)

        query_params = {
            'width': width,
            'height': height,
            'model': model or "flux", # Default to flux if model is None or empty
            'enhance': 'true' if enhancement else 'false',
            'nologo': 'true', # Usually desired to remove logo
            'referrer': referrer_param,
        }
        if current_seed is not None:
            query_params['seed'] = current_seed
        if token_param:
             query_params['token'] = token_param # Only add token if it exists

        query_string = urlencode(query_params)
        img_url = f"{base_url}{prompt_path}?{query_string}"

        print(f"[Generate] Attempting to fetch image {i + 1}/{num_images_to_generate} from: {img_url}")

        # Add error handling for fetch_image_bytes
        try:
            image_bytes = await fetch_image_bytes(img_url)
            if image_bytes:
                image_file = io.BytesIO(image_bytes)
                attachment = discord.File(image_file, filename=f"elixpo_ai_image_{i + 1}.jpg")
                images_with_urls.append({'attachment': attachment, 'url': img_url})
                print(f"[Generate] Successfully fetched image {i + 1}. Bytes: {len(image_bytes)}")
            else:
                 print(f"[Generate] Failed to fetch image {i + 1} - received no bytes from {img_url}")
                 # Continue loop to try fetching other images if generating multiple
        except Exception as e:
            print(f"[Generate] Error fetching image {i + 1} from {img_url}: {e}")
            # Continue loop to try fetching other images if generating multiple


    return images_with_urls


async def generate_remix_image(prompt: str, num_images_to_generate: int, seed_value: int | None, source_image_url: str):
    """Generates remixed images using the Pollinations gptimage model."""
     # Ensure fetch_image_bytes is available
    if fetch_image_bytes is None:
        print("Error: fetch_image_bytes function is not available.")
        return []

    # Validate prompt and source_image_url
    if not prompt or not prompt.strip():
        print("Warning: generate_remix_image called with empty prompt.")
        return []
    if not source_image_url or not source_image_url.strip():
        print("Warning: generate_remix_image called with empty source_image_url.")
        return []

    images_with_urls = []

    # Ensure num_images_to_generate is within a reasonable range
    num_images_to_generate = max(1, min(4, num_images_to_generate))

    # Use the Pollinations token and referrer from environment variables
    # Note: gptimage often requires a specific token different from the main image one.
    # Your code had a hardcoded token 'fEWo70t94146ZYgk'.
    # It's best to use an env var for this too if possible, or confirm the hardcoded one is correct/intended.
    # For now, let's use the hardcoded one but flag it.
    REMIX_POLLINATIONS_TOKEN = 'fEWo70t94146ZYgk' # <-- **VERIFY THIS TOKEN**
    referrer_param = POLLINATIONS_REFERRER or "elixpoart" # Use env var or default


    for i in range(num_images_to_generate):
        # Use seed_value + i for variation if seed provided, otherwise generate a new seed each time
        current_seed = seed_value + i if seed_value is not None else int(time.time() * 1000) % 100000000 + i
        # Ensure seed is within range
        current_seed = current_seed % 100000000 if current_seed is not None else None


        base_url = "https://image.pollinations.ai/prompt/"
        prompt_path = quote_plus(prompt.strip())

        query_params = {
            'model': 'gptimage', # Model is fixed for remix
            'private': 'true', # Often used with gptimage
            'nologo': 'true',
            'referrer': referrer_param,
        }
        if current_seed is not None:
            query_params['seed'] = current_seed
        if REMIX_POLLINATIONS_TOKEN: # Add the remix token if available
             query_params['token'] = REMIX_POLLINATIONS_TOKEN

        # Add the source image URL as a query parameter
        if source_image_url:
             query_params['image'] = quote_plus(source_image_url)

        query_string = urlencode(query_params)
        img_url = f"{base_url}{prompt_path}?{query_string}"

        print(f"[Remix] Attempting to fetch image {i + 1}/{num_images_to_generate} from: {img_url}")

        # Add error handling for fetch_image_bytes
        try:
            image_bytes = await fetch_image_bytes(img_url)
            if image_bytes:
                image_file = io.BytesIO(image_bytes)
                attachment = discord.File(image_file, filename=f"elixpo_ai_remix_{i + 1}.jpg")
                images_with_urls.append({'attachment': attachment, 'url': img_url})
                print(f"[Remix] Successfully fetched image {i + 1}. Bytes: {len(image_bytes)}")
            else:
                 print(f"[Remix] Failed to fetch image {i + 1} - received no bytes from {img_url}")
        except Exception as e:
            print(f"[Remix] Error fetching image {i + 1} from {img_url}: {e}")


    return images_with_urls


# --- Queue Processing ---

async def process_queue_discord():
    """Processes interactions from the queue asynchronously."""
    global is_processing
    async with queue_lock:
        if not queue:
            is_processing = False
            return
        # Get the full payload dictionary from the queue
        payload = queue.pop(0)
        # Extract the interaction object, command name, and options dictionary from the payload
        interaction = payload.get('interaction')
        command_name = payload.get('command_name')
        options = payload.get('options', {}) # Default to empty dict if options key is missing

    # Basic check that we got essential info from the payload
    if not interaction or not command_name:
        print(f"Error: Missing interaction or command_name in payload. Skipping item. Payload: {payload}")
        # Schedule the next item processing before returning
        async with queue_lock:
             if queue:
                  await asyncio.sleep(1)
                  asyncio.create_task(process_queue_discord())
             else:
                  is_processing = False
        return


    print(f"Processing interaction {interaction.id} (Type: {command_name}) from queue. Queue size: {len(queue)}")

    # Retrieve non-fatal permission info
    bot_member = interaction.guild.me if interaction.guild else None
    channel_perms = interaction.channel.permissions_for(bot_member) if interaction.channel and bot_member else None

    # Check against actual permissions object using string names from OPTIONAL_PERMISSIONS
    missing_embeds = False
    missing_message_content = False # Initialize flag

    if channel_perms:
         # Use getattr to check the permission attribute by string name
         missing_embeds = not getattr(channel_perms, OPTIONAL_PERMISSIONS['Embed Links'], False)
         # Read Message Content check only relevant for /edit if parsing message content (currently not)
         # But keep the warning check based on the optional permissions list for consistency
         # Note: Interaction.options extraction doesn't need this permission, but fetching original message *might*
         # The check for fetching message uses read_message_history (fatal).
         # This warning is perhaps less critical but can stay if desired.
         # Let's skip the message_content warning unless we actually use message_content
         # missing_message_content = command_name == 'edit' and not getattr(channel_perms, OPTIONAL_PERMISSIONS['Read Message Content'], False)
         pass # Skip message content warning for now

    else:
        # Assume missing if channel_perms couldn't be retrieved
        missing_embeds = True
        # missing_message_content = command_name == 'edit' # Assume missing if cannot check
        pass # Skip message content warning for now


    intermediate_text = ''
    conclusion_text = ''
    formatted_intermediate_text = ''
    formatted_conclusion_text = ''

    generated_images_with_urls = []
    final_content = ''
    embeds_to_send = []
    # components_to_send = [] # List of discord.ui.View - handled by creating and adding View object

    try:
        # Use initial_status_content as before, referring to command_name
        initial_status_content = ''
        # Add warnings based on checks performed above
        if missing_embeds:
             initial_status_content += f"⚠️ I am missing the **{OPTIONAL_PERMISSIONS['Embed Links'].replace('_', ' ').title()}** permission, so the rich embed won't display full details.\n\n"
        # If we ever need Read Message Content warning:
        # if missing_message_content:
        #      initial_status_content += f"⚠️ I am missing the **{OPTIONAL_PERMISSIONS['Read Message Content'].replace('_', ' ').title()}** permission, which might limit understanding of the original message's content.\n\n"

        # Use command_name extracted from payload
        initial_status_content += '✨ Wowza I see.. Your request is on the way!' if command_name == 'generate' else '🪄 Getting ready to remix your creation!'

        # Get option values from the 'options' dictionary pulled from the payload
        # Use .get() with appropriate defaults based on command definitions
        prompt_string = options.get("prompt") # Prompt is required, handle None case later

        # Use .get() with default values as defined in the command decorators or sensible fallbacks
        # Ensure range checking for numbers
        num_images_to_generate = max(1, min(4, options.get("number_of_images", 1)))
        aspect_ratio = options.get("aspect_ratio", "3:2")
        theme = options.get("theme", "normal")
        enhancement = options.get("enhancement", False)
        model = options.get("model", "flux") # Default model for /generate is flux
        seed_value = options.get("seed") # Seed is optional, default None

        # Now use prompt_string, num_images_to_generate, etc. variables

        if not prompt_string:
            # This check should theoretically not be hit if command options are correctly marked required in decorator
            # and Discord enforces it, but good practice to double-check.
            final_content = f"{initial_status_content}\n\n❌ Critical Error: Prompt option is missing from the command payload."
            # Use interaction.edit_original_response
            await interaction.edit_original_response(content=final_content)
            print(f"[processQueueDiscord] Prompt option missing for interaction {interaction.id}")
            return # Exit processing for this interaction

        # --- Generate text and format ---
        # Await these calls
        intermediate_text = sanitize_text(await generate_intermediate_text(prompt_string))
        conclusion_text = sanitize_text(await generate_conclusion_text(prompt_string))

        # Format the text, handle empty results gracefully
        formatted_intermediate_text = f"*{intermediate_text.rstrip('.') .strip()}*" if intermediate_text else ''
        formatted_conclusion_text = f"*{conclusion_text.rstrip('.') .strip()}*" if conclusion_text else ''
        # --- End text generation/formatting ---

        # Update status message after potential text generation
        generation_status_content = initial_status_content
        if formatted_intermediate_text:
            generation_status_content += f"\n\n{formatted_intermediate_text}"
        # Use command_name extracted from payload
        generation_status_content += f"\n\n{'🎨 Generating your image(s)...' if command_name == 'generate' else '🔄 Remixing your image(s)...'}"

        # Use interaction.edit_original_response (already deferred)
        await interaction.edit_original_response(content=generation_status_content)


        # --- Image Generation Logic ---
        if command_name == 'generate':
            # Pass extracted options to generate_image
            generated_images_with_urls = await generate_image(
                prompt=prompt_string,
                num_images_to_generate=num_images_to_generate,
                aspect_ratio=aspect_ratio,
                theme=theme,
                enhancement=enhancement,
                model=model,
                seed_value=seed_value
            )
            model_used = model or "flux" # Store the actual model used for the embed

        elif command_name == 'edit':
           # Get edit-specific options from the 'options' dictionary
           target_message_id = options.get("message_id")
           requested_index = options.get("index")
           # num_images_to_generate, seed_value, aspect_ratio, theme, enhancement already extracted from general options above

           # Check if required options are present for /edit
           # message_id, index, and prompt are required for /edit based on decorator
           if not target_message_id or requested_index is None or prompt_string is None:
               print(f"[processQueueDiscord][/edit] Required options missing in payload for interaction {interaction.id}: message_id={target_message_id}, index={requested_index}, prompt={prompt_string}")
               final_content = f"{initial_status_content}\n\n❌ Critical Error: Required options (`message_id`, `index`, `prompt`) were not found in the command payload. Please ensure the command is used correctly."
               await interaction.edit_original_response(content=final_content)
               return

           referenced_message = None
           try:
               print(f"[processQueueDiscord][/edit] Attempting to fetch message with ID: {target_message_id} for user {interaction.user.id}")
               # Use interaction.channel to fetch the message
               referenced_message = await interaction.channel.fetch_message(int(target_message_id))
               print(f"[processQueueDiscord][/edit] Successfully fetched message ID: {target_message_id}")
           except (discord.NotFound, discord.Forbidden, discord.HTTPException) as fetch_error:
               print(f"Failed to fetch message ID {target_message_id} for user {interaction.user.id}:", fetch_error)
               # Check specific permission error
               missing_perm_name = "Unknown Error"
               if isinstance(fetch_error, discord.Forbidden):
                   # Use the string name from the fatal list
                   missing_perm_name = 'read_message_history'.replace('_', ' ').title()

               final_content = f"{initial_status_content}\n\n❌ Could not find the message with ID `{target_message_id}`. It might have been deleted, is too old, or I lack permissions (**{missing_perm_name}**)."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               # Use interaction.edit_original_response
               await interaction.edit_original_response(content=final_content)
               return

           # Basic checks on the fetched message
           if referenced_message.author.id != bot.user.id or not referenced_message.embeds:
               final_content = f"{initial_status_content}\n\n❌ The message with ID `{target_message_id}` does not appear to be one of my image generation results (missing bot author or embed). Please provide the ID of one of my image messages."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               await interaction.edit_original_response(content=final_content)
               print(f"/edit provided message ID {target_message_id} which is not a bot/image message by user {interaction.user.id}")
               return

           # Try to get the original interaction ID from the footer of the first embed
           original_embed = referenced_message.embeds[0]
           footer_text = original_embed.footer.text if original_embed.footer else None
           # Assuming footer format is "Created by Elixpo AI | ID: <interaction_id>"
           original_interaction_id = None
           if footer_text:
                id_match = re.search(r'ID: (\d+)', footer_text)
                if id_match:
                    original_interaction_id = int(id_match.group(1)) # Convert to int

           if not original_interaction_id:
               final_content = f"{initial_status_content}\n\n❌ Could not find the necessary information (original interaction ID) in the embed footer of message ID `{target_message_id}`. The message format might be outdated or corrupted."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               await interaction.edit_original_response(content=final_content)
               print(f"Could not parse original interaction ID from footer '{footer_text}' for user {interaction.user.id} (message ID: {target_message_id})")
               return

           # Retrieve the original image data from the cache using the parsed interaction ID
           original_cache_entry = image_cache.get(original_interaction_id)

           if not original_cache_entry or 'data' not in original_cache_entry or not original_cache_entry.get('data'):
               final_content = f"{initial_status_content}\n\n❌ The data for the original image from message ID `{target_message_id}` has expired from the cache. Please try generating the original image again and then use the `/edit` command with the new message ID."
               if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
               await interaction.edit_original_response(content=final_content)
               print(f"Original cache data not found for interaction {original_interaction_id} (via message ID {target_message_id}). User {interaction.user.id} requested edit.")
               # Log cache state for debugging
               print(f"Current cache keys: {list(image_cache.keys())}")
               return

           # Validate the index against the available images in the cache (requested_index is 1-based)
           # requested_index is 1-based, list index is 0-based
           if requested_index < 1 or requested_index > len(original_cache_entry['data']):
                final_content = f"{initial_status_content}\n\n❌ Invalid image index `{requested_index}` for message ID `{target_message_id}`. Please provide an index between 1 and {len(original_cache_entry['data'])} for that message."
                if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
                await interaction.edit_original_response(content=final_content)
                print(f"Invalid image index {requested_index} provided by user {interaction.user.id} for message ID {target_message_id}. Max index was {len(original_cache_entry['data'])}")
                return

           # Get the source image URL from the cache using the 0-indexed value
           source_image_item = original_cache_entry['data'][requested_index - 1] # Adjust index
           source_image_url = source_image_item.get('url')

           if not source_image_url:
                final_content = f"{initial_status_content}\n\n❌ Could not retrieve the URL for the selected image from the cache for message ID `{target_message_id}`."
                if formatted_conclusion_text: final_content += f"\n\n{formatted_conclusion_text}"
                await interaction.edit_original_response(content=final_content)
                print(f"Could not get URL for image {requested_index} from cache for interaction {original_interaction_id} (via message ID {target_message_id}).")
                return

           print(f"User {interaction.user.name} is editing image {requested_index} from message ID {target_message_id} (original interaction {original_interaction_id}) using source URL: {source_image_url}")

           # Generate the new image(s) using the remix function
           # Pass extracted options and source_image_url to generate_remix_image
           generated_images_with_urls = await generate_remix_image(
               prompt=prompt_string,
               num_images_to_generate=num_images_to_generate,
               seed_value=seed_value, # Pass the extracted seed
               source_image_url=source_image_url # Pass the source URL
           )
           model_used = "gptimage" # Store the model used for the embed (fixed for remix)

           # --- End /edit logic ---

        # Prepare attachments from generated images
        generated_attachments = [item['attachment'] for item in generated_images_with_urls if item.get('attachment')]

        # --- Send the final reply ---
        if generated_attachments:
           actual_num_images = len(generated_attachments)

           # Construct final content string
           final_content = ''
           # Add warnings based on checks performed above
           if missing_embeds: final_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Embed Links'].replace('_', ' ').title()}** permission, so the rich embed won't display full details.\n\n"
           # if missing_message_content: final_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Read Message Content'].replace('_', ' ').title()}** permission.\n\n" # Skip for now

           if formatted_intermediate_text: final_content += formatted_intermediate_text

           # Use command_name extracted from payload
           if command_name == 'generate':
                final_content += f"\n\n✨ Your images have been successfully generated!" if final_content else "✨ Your images have been successfully generated!"
           elif command_name == 'edit':
                 final_content += f"\n\n✨ Your image(s) have been successfully remixed!" if final_content else "✨ Your image(s) have been successfully remixed!"


           if formatted_conclusion_text:
               final_content += f"\n\n{formatted_conclusion_text}" if final_content else formatted_conclusion_text


           # Build Embed (only if permission allows)
           if not missing_embeds:
               embed = discord.Embed(
                  title='🖼️ Image Generated Successfully' if command_name == 'generate' else '🔄 Image Remixed Successfully',
                  description=f"**🎨 Prompt:**\n> {prompt_string}", # Use extracted prompt_string
                  color=discord.Color.blue() if command_name == 'generate' else discord.Color.red() # Using discord.Color enum
               )
               # Use the interaction object pulled from the payload
               embed.set_author(
                 name=interaction.user.display_name, # Use display_name for server nickname if available
                 icon_url=interaction.user.display_avatar.url # Use display_avatar
               )
               # Use extracted parameters for the field
               embed.add_field(
                 name='🛠️ Generation Parameters',
                 value=f"• **Theme**: `{theme}`\n"
                       f"• **Model**: `{model_used}`\n"
                       f"• **Aspect Ratio**: `{aspect_ratio}`\n" # Note: remix model might ignore this, but we show what was requested
                       f"• **Enhanced**: `{'Yes' if enhancement else 'No'}`\n" # Note: remix model might ignore this
                       f"• **Images**: `{actual_num_images}{f' (Requested {num_images_to_generate})' if num_images_to_generate != actual_num_images else ''}`"
                       f"{f'\n• **Seed**: `{seed_value}`' if seed_value is not None else ''}",
                 inline=False
               )
               embed.set_timestamp()
               # Store the *current* interaction ID in the footer for future edits/downloads
               embed.set_footer(
                 text=f"Created by Elixpo AI | ID: {interaction.id}", # Use the current interaction.id
                 icon_url=bot.user.display_avatar.url
               )

               # For /edit, add source field
               if command_name == 'edit':
                    # target_message_id, requested_index already extracted
                    # Construct message link (guild/channel/message) using interaction.guild.id and interaction.channel.id
                    # Handle potential DM (interaction.guild is None)
                    if interaction.guild:
                         target_message_link = f"https://discord.com/channels/{interaction.guild.id}/{interaction.channel.id}/{target_message_id}"
                    else: # Assuming it's a DM channel
                         target_message_link = f"https://discord.com/channels/@me/{interaction.channel.id}/{target_message_id}"

                    embed.add_field(
                        name='Source',
                        value=f"Remixed from image **#{requested_index}** in [this message]({target_message_link}) (ID: `{target_message_id}`).",
                        inline=False
                    )

               embeds_to_send.append(embed)
           else:
               # Add parameters to content if embeds are missing
               final_content += f"\n\n**🛠️ Generation Parameters:**\n" + \
                                f"• **Theme**: `{theme}`\n" + \
                                f"• **Model**: `{model_used}`\n" + \
                                f"• **Aspect Ratio**: `{aspect_ratio}`\n" + \
                                f"• **Enhanced**: `{'Yes' if enhancement else 'No'}`\n" + \
                                f"• **Images**: `{actual_num_images}{f' (Requested {num_images_to_generate})' if num_images_to_generate != actual_num_images else ''}`" + \
                                (f"\n• **Seed**: `{seed_value}`" if seed_value is not None else "")

               if command_name == 'edit':
                    # target_message_id, requested_index already extracted
                    final_content += f"\n• **Source**: Remixed from image #{requested_index} in message ID `{target_message_id}`."


           # --- Add Buttons ---
           # Create a View to hold buttons
           view = discord.ui.View(timeout=None) # Buttons should persist across restarts

           # Add Edit button - This button doesn't need data, its custom_id is static
           edit_button = discord.ui.Button(
               label='Edit / Remix',
               style=discord.ButtonStyle.secondary,
               custom_id='edit_image' # Static Custom ID
           )
           view.add_item(edit_button)

           # Add Download buttons
           actual_num_images = len(generated_images_with_urls) # Use the list with URLs/attachments
           if actual_num_images > 0:
                # Discord Link Button URL length limit (check if URL fits in a Link button)
                DISCORD_LINK_BUTTON_MAX_URL_LENGTH = 512
                if actual_num_images == 1:
                     first_image_url = generated_images_with_urls[0].get('url')
                     if first_image_url and len(first_image_url) <= DISCORD_LINK_BUTTON_MAX_URL_LENGTH:
                        # Use Link style button if single image and URL is short enough
                        download_button = discord.ui.Button(
                            label='Download',
                            style=discord.ButtonStyle.link, # Link style opens URL directly
                            url=first_image_url
                        )
                        view.add_item(download_button)
                        print(f"[processQueueDiscord] Added Link button for single image (URL length: {len(first_image_url)}).")
                     else:
                         # Fallback to custom ID button if URL too long or unavailable
                         print(f"[processQueueDiscord] URL too long ({len(first_image_url) if first_image_url else 'N/A'} > {DISCORD_LINK_BUTTON_MAX_URL_LENGTH}) or unavailable for single image. Using Primary button with Custom ID.")
                         download_button = discord.ui.Button(
                            label='Download',
                            style=discord.ButtonStyle.primary,
                            # Use the *current* interaction ID and 0-index for custom_id
                            custom_id=f'download_{interaction.id}_0' # Custom ID for handler (0-indexed)
                         )
                         view.add_item(download_button)
                else: # Multiple images, always use custom ID buttons to avoid multiple link buttons/limit issues
                    for i in range(actual_num_images):
                        download_button = discord.ui.Button(
                            label=f'Download #{i + 1}',
                            style=discord.ButtonStyle.primary,
                             # Use the *current* interaction ID and index for custom_id
                            custom_id=f'download_{interaction.id}_{i}' # Custom ID for handler (0-indexed)
                        )
                        view.add_item(download_button)
                    print(f"[processQueueDiscord] Added {actual_num_images} Primary buttons for multiple images.")
           # else: no images, no download buttons needed.


           # components_to_send will be the View object if it has children
           # Handled directly in the edit_original_response call below

           # Cache if any images were generated. Key by the *current* interaction ID.
           if generated_images_with_urls:
               image_cache[interaction.id] = { # Use the *current* interaction.id as the key
                   'data': generated_images_with_urls,
                   'timestamp': time.time() # Use time.time() for float timestamp
               }
               print(f"Stored {len(generated_images_with_urls)} images in cache for interaction {interaction.id} (Type: {command_name}).")
           else:
               print(f"No images generated for interaction {interaction.id} (Type: {command_name}). Nothing to cache.")


           # Final editReply includes content, embed (if available), files, and components (buttons)
           final_edit_options = {
             'content': final_content,
             'files': generated_attachments,
             'view': view if view.children else None, # Pass the View object if it has children
           }
           if embeds_to_send:
               final_edit_options['embeds'] = embeds_to_send # Pass the list of embeds

           # Use interaction.edit_original_response (this works because interaction was deferred)
           await interaction.edit_original_response(**final_edit_options)

        else:
           # If no attachments were generated, send error message
           error_content = ''
           # Add warnings based on checks performed above
           if missing_embeds: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Embed Links'].replace('_', ' ').title()}** permission.\n\n"
           # if missing_message_content: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Read Message Content'].replace('_', ' ').title()}** permission.\n\n" # Skip for now

           if formatted_intermediate_text: error_content += formatted_intermediate_text

           # Use command_name extracted from payload
           if command_name == 'generate':
                error_content += f"\n\n⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data." if error_content else "⚠️ Failed to generate images. The image service might be temporarily unavailable or returned no valid image data."
           elif command_name == 'edit':
                 error_content += f"\n\n⚠️ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data." if error_content else "⚠️ Failed to remix the image. The image service might be temporarily unavailable or returned no valid image data."
           error_content += " Please try again later."

           if formatted_conclusion_text:
               error_content += f"\n\n{formatted_conclusion_text}" if error_content else formatted_conclusion_text

           # Use interaction.edit_original_response (this works because interaction was deferred)
           await interaction.edit_original_response(content=error_content)
           print(f"Image generation/remix failed for interaction {interaction.id} (Type: {command_name}). No attachments generated.")

    except Exception as e:
        print(f'Error processing queue / generating/remixing image for interaction {interaction.id} (Type: {command_name}):', e)
        import traceback
        traceback.print_exc() # Print the full traceback for better debugging
        try:
            # formatted_intermediate_text and formatted_conclusion_text are in scope from earlier
            error_content = ''
            # Add warnings based on checks performed above
            if missing_embeds: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Embed Links'].replace('_', ' ').title()}** permission.\n\n"
            # if missing_message_content: error_content += f"⚠️ Missing **{OPTIONAL_PERMISSIONS['Read Message Content'].replace('_', ' ').title()}** permission.\n\n" # Skip for now
            if formatted_intermediate_text: error_content += formatted_intermediate_text

            error_content += f"\n\n⚠️ An unexpected error occurred while processing your request. Please try again later." if error_content else "⚠️ An unexpected error occurred while processing your request. Please try again later."
            if formatted_conclusion_text:
               error_content += f"\n\n{formatted_conclusion_text}" if error_content else formatted_conclusion_text

            # Use edit_original_response as interaction was deferred
            # Add a safety check to see if the interaction response can still be edited
            try:
                # interaction.response.is_done() check might not be reliable after deferral,
                # but catching exceptions from edit_original_response is the main defense.
                await interaction.edit_original_response(content=error_content)
            except discord.errors.NotFound:
                 print(f"Original response for interaction {interaction.id} not found, likely already edited or timed out.")
            except discord.errors.Forbidden:
                 print(f"Forbidden to edit original response for interaction {interaction.id}. Missing permissions?")
            except Exception as edit_error:
                 print(f"Failed to edit reply with error message for interaction {interaction.id}:", edit_error)


        except Exception as outer_edit_error:
            print(f"CRITICAL: Failed to handle error and send final error message for interaction {interaction.id}:", outer_edit_error)

    finally:
        # Schedule the next item processing regardless of success or failure
        async with queue_lock:
            if queue:
                 # Small delay before processing next item to avoid potential rate limits/thrashing
                 await asyncio.sleep(1)
                 asyncio.create_task(process_queue_discord())
            else:
                 is_processing = False


# Change the signature to accept the full payload dictionary
def add_to_queue(payload: dict):
    """Adds an interaction payload (interaction object + command name + options) to the queue and starts processing if not already running."""
    global is_processing
    # Append the dictionary payload
    queue.append(payload)
    # Use payload['interaction'].id and payload['command_name'] for logging
    # Use .get() for safer access in logging too
    interaction_id_log = payload.get('interaction').id if payload.get('interaction') else 'Unknown ID'
    command_name_log = payload.get('command_name', 'Unknown Command')
    print(f"Added interaction {interaction_id_log} (Type: {command_name_log}) to queue. Queue size: {len(queue)}")
    # Safely start processing using the flag and task creation
    with queue_lock: # Use lock when checking/setting is_processing
        if not is_processing:
            print("Queue is not processing, starting process_queue_discord.")
            is_processing = True # Mark as processing *before* creating task
            asyncio.create_task(process_queue_discord()) # Schedule the processing task
        else:
            print("Queue is already processing.")
# --- Discord Events ---

@bot.event
async def on_ready():
    print(f'{bot.user} is online and ready!')
    # Sync commands globally or per guild as needed
    try:
        synced_commands = await bot.tree.sync() # Sync globally
        # For faster testing, sync to a specific guild:
        # test_guild_id = int(os.getenv('TEST_GUILD_ID')) # Add TEST_GUILD_ID to .env
        # test_guild = discord.Object(id=test_guild_id)
        # synced_commands = await bot.tree.sync(guild=test_guild)
        print(f"Synced {len(synced_commands)} slash commands.")
    except Exception as e:
        print(f"Failed to sync slash commands: {e}")

    # Start background tasks
    bot.loop.create_task(cleanup_cache())
    bot.loop.create_task(activity_loop())
    # If the bot crashed while processing, try to restart queue processing
    # This might not be perfect if the state was corrupted, but can help recovery
    async with queue_lock:
        if queue and not is_processing:
            print("Queue has items from before restart, attempting to resume processing.")
            is_processing = True
            asyncio.create_task(process_queue_discord())


async def activity_loop():
    """Rotates bot activity status."""
    await bot.wait_until_ready()
    while not bot.is_closed():
        activities = [
            discord.Activity(type=discord.ActivityType.watching, name="Generating Images for You"),
            discord.Activity(type=discord.ActivityType.playing, name="AI Art Creation"),
            discord.Activity(type=discord.ActivityType.listening, name="Your Commands"),
            discord.Activity(type=discord.ActivityType.watching, name=f"{len(queue)} jobs in queue"), # Add queue size to activity
        ]
        # Safely choose a random activity
        try:
            # Update the queue size activity dynamically
            activities[-1] = discord.Activity(type=discord.ActivityType.watching, name=f"{len(queue)} jobs in queue")
            random_activity = random.choice(activities)
            await bot.change_presence(activity=random_activity)
        except Exception as e:
            print(f"Error setting bot activity: {e}")

        await asyncio.sleep(10 * 60) # Change activity every 10 minutes


@bot.event
async def on_interaction(interaction: discord.Interaction):
    """Handles all interactions (slash commands and components)."""

    # Ignore bots
    if interaction.user.bot:
        return

    # --- Permission Checks (Crucial before any action) ---
    channel = interaction.channel
    # Get the bot's member object in the guild if available
    bot_member = interaction.guild.me if interaction.guild else None

    if not channel or not bot_member:
        print(f"Interaction occurred in a null channel or botMember is null. ID: {interaction.id}. Guild: {interaction.guild} Channel: {interaction.channel}")
        # Cannot reply if channel/member is null, just log and return
        return

    # Use channel.permissions_for() which returns a Permissions object for the bot in that channel
    bot_permissions = channel.permissions_for(bot_member)

    if not bot_permissions:
        print(f"Could not get permissions for bot in channel. ID: {interaction.id}. Channel: {channel.id}")
        # Attempt to send an ephemeral reply if permissions check fails early
        try:
            await interaction.response.send_message(
                "Could not determine bot permissions for this channel. Please check bot permissions.",
                ephemeral=True
            )
        except Exception as e: print("Error sending permissions check error (early failure):", e)
        return


    # --- Handle Chat Input Commands ---
    if interaction.type == discord.InteractionType.application_command and interaction.command:

       # Handle simple commands first (/help, /ping) - these don't need the queue
       if interaction.command.name in ['help', 'ping']:
           # Essential permissions for *any* reply (even ephemeral usually requires send_messages)
           # Use string names for consistency with get_missing_permissions
           essential_permissions_simple = [
                'view_channel', # Must be able to see the channel
                'send_messages', # Must be able to send messages
           ]
           # Check Permissions object directly using get_missing_permissions helper
           missing_perms = get_missing_permissions(bot_permissions, essential_permissions_simple)


           if missing_perms:
               try:
                   # Join missing permission names for the message
                   missing_names = [p.replace('_', ' ').title() for p in missing_perms]
                   # Use interaction.response.send_message for initial reply
                   await interaction.response.send_message(
                       f"⚠️ I am missing the following required permissions to respond in this channel: **{', '.join(missing_names)}**\nPlease ensure I have these permissions.",
                       ephemeral=True # Send ephemerally to avoid clutter if permissions are truly missing
                   )
               except Exception as e: print("Error sending missing permissions message for simple command:", e)
               return # Stop processing this command

           if interaction.command.name == 'help':
               help_message = """
**Elixpo Discord Bot Commands:**

- **`/generate`** - Generate images based on a prompt.
  **Options:** `prompt` (required), `theme`, `model`, `aspect_ratio`, `enhancement`, `number_of_images` (1-4), `seed`.

- **`/edit`** - Remix or edit an existing image. **Use the `message_id` and `index` options to specify the image.**
  **Options:** `message_id` (required), `prompt` (required), `index` (1-4, required), `number_of_images` (1-4, required), `seed`, `aspect_ratio`, `theme`, `enhancement`. Note: `model` is fixed to `gptimage` for remixing and not a user option here.

- **`/help`** - Display this help message.
- **`/ping`** - Check if the bot is online.
"""
               # Use interaction.response.send_message
               try: await interaction.response.send_message(help_message, ephemeral=False) # Help can be public
               except Exception as e: print("Error sending help message:", e)

           elif interaction.command.name == 'ping':
               # Use interaction.response.send_message
               try: await interaction.response.send_message("Yooo! I'm ready to paint xD", ephemeral=False) # Ping can be public
               except Exception as e: print("Error sending ping message:", e)

           return # Command handled, exit interaction handler


       # Handle commands that need queueing (/generate, /edit)
       if interaction.command.name in ['generate', 'edit']:
            # --- Fatal Permissions Check (MUST happen before deferring) ---
            # Use string names for consistency
            required_flags = REQUIRED_PERMISSIONS_EDIT_FATAL if interaction.command.name == 'edit' else REQUIRED_PERMISSIONS_FATAL
            missing_fatal = get_missing_permissions(bot_permissions, required_flags)

            if missing_fatal:
                 try:
                     missing_names = [p.replace('_', ' ').title() for p in missing_fatal]
                     # Use interaction.response.send_message
                     await interaction.response.send_message(
                         f"⚠️ I am missing the following **required** permissions in this channel: **{', '.join(missing_names)}**.\n\nPlease ensure I have them before using the `/{interaction.command.name}` command.",
                         ephemeral=True # Send ephemerally
                     )
                 except Exception as e:
                     print(f"Error sending FATAL missing permissions message for {interaction.command.name}:", e)
                 return # Stop processing this command

            # --- Non-Fatal Permissions Check (for warnings later) ---
            # These are checked inside process_queue_discord to add warnings to the final message
            # We just need to know if the fatal checks passed to get here.

            try:
                # Defer the reply BEFORE adding to queue
                # This gives the bot 15 minutes to respond
                await interaction.response.defer(ephemeral=False) # Set ephemeral=False so the response is visible

                # Extract option *values* here because interaction.options is available now
                # Create a simple dictionary of option names to their values
                command_options = {}
                # interaction.options is a list of dicts, extract name and value
                # Safely access interaction.options attribute
                options_list = getattr(interaction, 'options', [])

                # options_list is a list of AppCommandOption objects, each has .name and .value
                # Let's iterate over the list and build the dict
                if options_list: # Check if the list is not empty
                     for option in options_list:
                         # Access name and value directly from AppCommandOption object
                         option_name = option.name
                         option_value = option.value
                         # Print for debugging
                         # print(f"  Extracted Option: Name={option_name}, Value={option_value} (Type: {type(option_value)})")
                         # Add to the dictionary
                         command_options[option_name] = option_value


                # Construct the data payload to add to the queue
                # This includes the interaction object itself and the extracted options dictionary
                queue_payload = {
                    'interaction': interaction, # Keep the interaction object for later edits etc.
                    'command_name': interaction.command.name,
                    'options': command_options, # Store the extracted option values dictionary
                }

                # Add the prepared payload to the queue
                add_to_queue(queue_payload)

            except Exception as e:
                # This catches errors during deferral or payload preparation
                print(f"Fatal: Could not defer interaction or prepare queue payload for interaction {interaction.id}:", e)
                # Attempt to send an ephemeral error message if possible
                try:
                    # Check if response has been sent/deferred before attempting to send a new message
                    # interaction.response.is_done() indicates if the initial response (defer or send_message) has happened
                    if not interaction.response.is_done():
                         # Use interaction.response.send_message if defer failed
                         await interaction.response.send_message("An error occurred while trying to process your command. Please try again later.", ephemeral=True)
                    else:
                         # If defer succeeded but subsequent steps failed, try followup
                         # This might still fail depending on when the error occurred
                         await interaction.followup.send("An error occurred after deferring. Please try again later.", ephemeral=True)
                         print(f"Attempted followup error for interaction {interaction.id}.")

                except Exception as followup_error:
                     print(f"Error sending fallback error message for interaction {interaction.id}:", followup_error)
                return # Cannot proceed, exit interaction handler

            return # Interaction added to queue, exit handler


    # --- Handle Component Interactions (Buttons) ---
    elif interaction.type == discord.InteractionType.component:
        custom_id = interaction.data.get('custom_id')

        # Handle the Edit button click
        if custom_id == 'edit_image':
            try:
                # Check SendMessages permission before replying
                # Use channel.permissions_for().has_permissions()
                can_send_messages = False
                if interaction.channel and interaction.guild: # Ensure channel and guild exist
                     channel_perms = interaction.channel.permissions_for(interaction.guild.me)
                     if channel_perms:
                         can_send_messages = channel_perms.has_permissions(send_messages=True)

                if can_send_messages:
                    # Use interaction.response.send_message for the initial ephemeral response
                    await interaction.response.send_message(
                        "To edit an image, use the `/edit` command and provide the Message ID and Image Index as options. The Message ID can be found by right-clicking the message (or long-pressing on mobile) and selecting 'Copy Message ID' (Developer Mode must be enabled in Discord settings). The Index is the number below the image.",
                        ephemeral=True
                    )
                else:
                    print(f"Cannot reply to edit button interaction due to missing SendMessages permission in channel {channel.id if channel else 'unknown'}")
            except Exception as e:
                print("Error replying to edit button interaction:", e)
            return # Button handled

        # Handle Download buttons
        if custom_id and custom_id.startswith('download_'):
            # Check essential permissions for sending files (even ephemeral needs these)
            # Use string names for consistency
            required_download_flags = [
                 'send_messages', # Needed to send the reply message
                 'attach_files', # Needed to include the image file
            ]
            missing_download_perms = get_missing_permissions(bot_permissions, required_download_flags)

            if missing_download_perms:
                try:
                     missing_names = [p.replace('_', ' ').title() for p in missing_download_perms]
                     # Use interaction.response.send_message for initial ephemeral response
                     await interaction.response.send_message(
                         f"I do not have the necessary permissions (**{', '.join(missing_names)}**) to provide the image file for download in this channel.",
                         ephemeral=True # Send ephemerally
                     )
                except Exception as e: print("Error sending fallback permission error for download button:", e)
                return # Cannot proceed without permissions

            # Parse the custom_id: "download_<interaction_id>_<index>"
            parts = custom_id.split('_')
            # Expecting exactly 3 parts: ['download', 'interaction_id', 'index']
            if len(parts) != 3 or parts[0] != 'download':
                 print(f"Invalid download button customId format: {custom_id}")
                 try:
                      # Use interaction.response.send_message
                     await interaction.response.send_message(
                         "Could not process the download request due to an invalid button ID format.",
                         ephemeral=True
                     )
                 except Exception as e: print("Error replying to invalid download button:", e)
                 return

            try:
                # Convert interaction ID part to int (it was stored as int)
                original_interaction_id = int(parts[1])
                # Convert index part to int (0-indexed)
                image_index = int(parts[2]) # 0-indexed index from custom_id
            except ValueError:
                 print(f"Invalid interaction ID or index value in customId: {custom_id}")
                 try:
                      # Use interaction.response.send_message
                     await interaction.response.send_message(
                         "Could not process the download request due to invalid ID/index in the button.",
                         ephemeral=True
                     )
                 except Exception as e: print("Error replying to invalid download button ID:", e)
                 return

            # Look up the data in the cache using the original interaction ID
            cache_entry = image_cache.get(original_interaction_id)

            # Validate cache entry and index
            if not cache_entry or 'data' not in cache_entry or image_index < 0 or image_index >= len(cache_entry['data']):
                print(f"Image data not found or index out of range in cache for interaction {original_interaction_id}, index {image_index}. Cache keys: {list(image_cache.keys())}")
                try:
                    # Use interaction.response.send_message
                    await interaction.response.send_message(
                        "Sorry, the image data for this download button has expired or was not found in the cache. Please try generating the image again.",
                        ephemeral=True
                    )
                except Exception as e: print("Error replying when image data not found:", e)
                return # Cannot provide the image

            image_item = cache_entry['data'][image_index] # Get the specific image data object (dict)

            # Fetch the image bytes again using the URL from the cache item
            image_url_to_fetch = image_item.get('url')
            if not image_url_to_fetch:
                 print(f"No URL found in cache for image #{image_index + 1} of interaction {original_interaction_id}")
                 try:
                      # Use interaction.response.send_message
                      await interaction.response.send_message(
                          f"Failed to get the URL for image #{image_index + 1}. An error occurred.",
                          ephemeral=True
                      )
                 except Exception as e: print("Error sending fallback URL error for download button:", e)
                 return # Cannot fetch without URL


            # Check if fetch_image_bytes function was imported
            if fetch_image_bytes is None:
                 print("Error: fetch_image_bytes is not available. Cannot fulfill download.")
                 try:
                      await interaction.response.send_message(
                           f"Bot configuration error: Image fetching is unavailable. Cannot provide download for image #{image_index + 1}.",
                           ephemeral=True
                      )
                 except Exception as e: print("Error sending fallback fetch_image_bytes error:", e)
                 return


            # Fetch the bytes
            image_bytes = await fetch_image_bytes(image_url_to_fetch)

            if not image_bytes:
                 print(f"Failed to refetch image bytes for download button for interaction {original_interaction_id} index {image_index} from URL: {image_url_to_fetch}")
                 try:
                      # Use interaction.response.send_message
                      await interaction.response.send_message(
                          f"Failed to fetch image #{image_index + 1} for download. The image source might be unavailable.",
                          ephemeral=True
                      )
                 except Exception as e: print("Error sending fallback fetch error for download button:", e)
                 return # Cannot provide the image if fetch fails

            try:
                image_file = io.BytesIO(image_bytes)
                # Use the original filename format or create a new one
                filename = image_item.get('attachment').filename if image_item.get('attachment') and hasattr(image_item.get('attachment'), 'filename') else f"elixpo_ai_image_{image_index + 1}.jpg"
                attachment = discord.File(image_file, filename=filename)

                # Use interaction.response.send_message for the initial ephemeral response with the file
                # This is usually the only way to send a file as an initial response
                await interaction.response.send_message(
                    content=f"Here is image #{image_index + 1}:",
                    files=[attachment], # files takes a list
                    ephemeral=True # Send files ephemerally for user's privacy/cleanliness
                )
                print(f"Successfully sent image #{image_index + 1} for interaction {original_interaction_id} via button click.")
            except Exception as e:
                print(f"Error replying with image #{image_index + 1} for interaction {original_interaction_id}:", e)
                # If sending the response with the file failed, try a simple text reply
                try:
                    # Check if the initial response failed before trying to send a text one
                     if not interaction.response.is_done():
                         await interaction.response.send_message(
                            content=f"Failed to send image #{image_index + 1}. An error occurred.",
                            ephemeral=True
                         )
                     else:
                          # If response was already sent (e.g., content part went through but file failed),
                          # followup might be needed, but ephemeral followups are tricky.
                          # Log and accept failure for simplicity here.
                          print(f"Could not send fallback text message for download button interaction {interaction.id}")

                except Exception as e2: print("Error sending fallback error for download button:", e2)

            return # Button handled

        # If it's a button we don't recognise
        print(f"Received unhandled button interaction with custom_id: {custom_id}")
        # Optional: reply to unhandled button clicks ephemeral to prevent "This interaction failed" message
        try:
             # Use interaction.response.send_message
             await interaction.response.send_message("This button is not currently active or is for a different interaction.", ephemeral=True)
        except Exception as e: print("Error replying to unhandled button:", e)


# --- Slash Command Definitions ---
# Use @bot.tree.command decorator
# The arguments to the command function correspond to the command options

# The command functions themselves no longer contain the logic,
# they just exist for the decorator to register the command structure.
# The actual handling is in on_interaction and process_queue_discord.

@bot.tree.command(name="generate", description="Generate images based on a prompt.")
@app_commands.describe(
    prompt="The description of the image you want to generate (required)",
    theme="Apply a specific artistic theme (optional)",
    model="Choose a specific generation model (optional, defaults to flux)",
    aspect_ratio="Set the image aspect ratio (optional, defaults to 3:2)",
    enhancement="Apply automatic image enhancements (optional, defaults to False)",
    number_of_images="Number of images to generate (1-4, optional, defaults to 1)",
    seed="Specify a seed for reproducible results (optional, defaults to random)",
)
@app_commands.choices(
    theme=[
        app_commands.Choice(name="Normal", value="normal"),
        app_commands.Choice(name="Fantasy", value="fantasy"),
        app_commands.Choice(name="Halloween", value="halloween"),
        app_commands.Choice(name="Structure", value="structure"),
        app_commands.Choice(name="Crayon", value="crayon"),
        app_commands.Choice(name="Space", value="space"),
        app_commands.Choice(name="Chromatic", value="chromatic"),
        app_commands.Choice(name="Cyberpunk", value="cyberpunk"),
        app_commands.Choice(name="Anime", value="anime"),
        app_commands.Choice(name="Landscape", value="landscape"),
        app_commands.Choice(name="Samurai", value="samurai"),
        app_commands.Choice(name="WPAP", value="wpap"),
        app_commands.Choice(name="Vintage", value="vintage"),
        app_commands.Choice(name="Pixel", value="pixel"),
        app_commands.Choice(name="Synthwave", value="synthwave"),
    ],
     model=[
        app_commands.Choice(name="Flux", value="flux"),
        app_commands.Choice(name="OpenJourney", value="openjourney"),
        app_commands.Choice(name="GPTImage", value="gptimage"), # Allow user to select, but process_queue might override or handle differently
     ],
     aspect_ratio=[
        app_commands.Choice(name="16:9", value="16:9"),
        app_commands.Choice(name="9:16", value="9:16"),
        app_commands.Choice(name="1:1", value="1:1"),
        app_commands.Choice(name="4:3", value="4:3"),
        app_commands.Choice(name="3:2", value="3:2"),
     ]
)
async def generate_command(
    interaction: discord.Interaction,
    prompt: str, # Required option, will be validated by Discord
    theme: app_commands.Choice[str] = None, # Optional, default handled in process_queue
    model: app_commands.Choice[str] = None, # Optional, default handled in process_queue
    aspect_ratio: app_commands.Choice[str] = None, # Optional, default handled in process_queue
    enhancement: bool = False, # Optional, default False
    number_of_images: app_commands.Range[int, 1, 4] = 1, # Optional, default 1, Discord enforces range
    seed: int = None, # Optional, default None
):
    # This function is just triggered by the command.
    # The actual processing (permission checks, defer, queueing) happens in on_interaction.
    # The options values are automatically available in interaction.options and extracted there.
    pass # The command definition registers the command structure with Discord


@bot.tree.command(name="edit", description="Remix or edit an existing image from a message.")
@app_commands.describe(
    message_id="The ID of the message containing the image embed (required)",
    index="The index of the image within the message (1-4, required)",
    prompt="The new prompt for remixing (required)",
    number_of_images="Number of new images to generate (1-4, optional, defaults to 1)",
    seed="Specify a seed for reproducible results (optional, defaults to original or random)",
    aspect_ratio="Set the new image aspect ratio (optional, defaults to original or 3:2)", # Note: Remix model might ignore this
    theme="Apply a new artistic theme (optional)", # Note: Remix model might ignore this
    enhancement="Apply automatic image enhancements (optional)", # Note: Remix model might ignore this
    # model is not an option here as it's fixed to gptimage for remix
)
# Choices are optional but good for user experience
@app_commands.choices(
    theme=[
        app_commands.Choice(name="Normal", value="normal"),
        app_commands.Choice(name="Fantasy", value="fantasy"),
        app_commands.Choice(name="Halloween", value="halloween"),
        app_commands.Choice(name="Structure", value="structure"),
        app_commands.Choice(name="Crayon", value="crayon"),
        app_commands.Choice(name="Space", value="space"),
        app_commands.Choice(name="Chromatic", value="chromatic"),
        app_commands.Choice(name="Cyberpunk", value="cyberpunk"),
        app_commands.Choice(name="Anime", value="anime"),
        app_commands.Choice(name="Landscape", value="landscape"),
        app_commands.Choice(name="Samurai", value="samurai"),
        app_commands.Choice(name="WPAP", value="wpap"),
        app_commands.Choice(name="Vintage", value="vintage"),
        app_commands.Choice(name="Pixel", value="pixel"),
        app_commands.Choice(name="Synthwave", value="synthwave"),
    ],
     aspect_ratio=[ # Still allow selection even if remix API might ignore
        app_commands.Choice(name="16:9", value="16:9"),
        app_commands.Choice(name="9:16", value="9:16"),
        app_commands.Choice(name="1:1", value="1:1"),
        app_commands.Choice(name="4:3", value="4:3"),
        app_commands.Choice(name="3:2", value="3:2"),
     ]
)
async def edit_command(
    interaction: discord.Interaction,
    message_id: str, # Required option, validated by Discord
    index: app_commands.Range[int, 1, 4], # Required, range 1-4, validated by Discord
    prompt: str, # Required option, validated by Discord
    number_of_images: app_commands.Range[int, 1, 4] = 1, # Optional, default 1, validated by Discord
    seed: int = None, # Optional, default None
    aspect_ratio: app_commands.Choice[str] = None, # Optional, default handled in process_queue
    theme: app_commands.Choice[str] = None, # Optional, default handled in process_queue
    enhancement: bool = False, # Optional, default False
):
    # This function is just triggered by the command.
    # The actual processing (permission checks, defer, queueing) happens in on_interaction.
    # The options values are automatically available in interaction.options and extracted there.
    pass # The command definition registers the command structure with Discord


@bot.tree.command(name="help", description="Show help information for the bot.")
async def help_command(interaction: discord.Interaction):
    # This command is handled directly in on_interaction,
    # this function exists solely for the decorator to register the command.
    pass

@bot.tree.command(name="ping", description="Check if the bot is online.")
async def ping_command(interaction: discord.Interaction):
     # This command is handled directly in on_interaction,
    # this function exists solely for the decorator to register the command.
    pass


# Check if fetch_image_bytes was successfully imported before running the bot
if fetch_image_bytes is None:
    print("FATAL ERROR: Necessary utility functions were not imported. Exiting.")
    exit(1)

print("Starting bot...")
bot.run(DISCORD_TOKEN)