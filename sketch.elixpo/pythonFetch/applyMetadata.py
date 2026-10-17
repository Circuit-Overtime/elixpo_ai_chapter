import os
import json
import asyncio
import aiohttp
import time
from tqdm.asyncio import tqdm_asyncio

ICONS_FOLDER = 'all_icons/icons' 
OUTPUT_JSON = 'metadata3.json'
DONE_FILE = 'completed3.txt'
API_URL = "https://text.pollinations.ai/openai"
SEMAPHORE_LIMIT = 3

HEADERS = {
    "Content-Type": "application/json"
}

SYSTEM_PROMPT = """
You are a helpful assistant for a developer writing an icon search API.
For any given SVG filename (converted from kebab-case to normal words),
you will extract 6-8 relevant **keywords** related to the icon meaning or visual concept or company

ALWAYS include the filename itself (without .svg or underscores) as a keyword.

put categories like "technology", "tech", "general", "icons", "logos" etc..

Respond ONLY in this JSON format:
{
    "keywords": [...],
    "category": "category_name",
    "description": "Short description about this icon purpose."
}

Be concise and relevant to iconography, design, and UI.
"""

async def ask_ai(session, semaphore, filename):
    async with semaphore:
        icon_name = filename.replace('.svg', '').replace('_', ' ')
        filename_keyword = filename.replace('.svg', '').replace('_', '')
        user_prompt = f"Generate keywords, category, and description for an icon named '{icon_name}'."

        payload = {
            "model": "openai",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT.strip()},
                {"role": "user", "content": user_prompt}
            ],
            "seed": 101,
            "temperature": 0.5,
            "token": "fEWo70t94146ZYgk"
        }

        try:
            async with session.post(API_URL, headers=HEADERS, json=payload) as response:
                response.raise_for_status()
                result = await response.json()
                reply = result['choices'][0]['message']['content']
                try:
                    parsed = json.loads(reply)
                    parsed['keywords'].append(filename_keyword)
                    return filename, parsed
                except Exception as e:
                    print(f"⚠️ Failed to parse JSON for {filename}: {reply}")
                    return filename, None
        except Exception as e:
            print(f"❌ Error while fetching {filename}: {e}")
            return filename, None

def load_completed():
    if os.path.exists(DONE_FILE):
        with open(DONE_FILE, 'r') as f:
            return set(f.read().splitlines())
    return set()

def save_completed(filename):
    with open(DONE_FILE, 'a') as f:
        f.write(filename + '\n')

def save_metadata(metadata):
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(metadata, f, indent=2)

def split_batches(data, n):
    k, m = divmod(len(data), n)
    return [data[i * k + min(i, m):(i + 1) * k + min(i + 1, m)] for i in range(n)]

async def process_batch(batch, metadata, completed):
    semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)
    async with aiohttp.ClientSession() as session:
        tasks = [ask_ai(session, semaphore, filename) for filename in batch]
        for coro in tqdm_asyncio.as_completed(tasks, desc="Processing batch"):
            filename, result = await coro
            if result:
                metadata[filename] = result
                save_metadata(metadata)
                save_completed(filename)

async def main_async():
    all_files = [f for f in os.listdir(ICONS_FOLDER) if f.endswith('.svg')]
    completed = load_completed()
    to_process = [f for f in all_files if f not in completed]

    if os.path.exists(OUTPUT_JSON):
        with open(OUTPUT_JSON, 'r') as f:
            metadata = json.load(f)
    else:
        metadata = {}

    batches = split_batches(to_process, 5)

    for idx, batch in enumerate(batches):
        print(f"\n🚀 Processing batch {idx + 1}/{len(batches)} with {len(batch)} files...")
        await process_batch(batch, metadata, completed)

    print(f"\n✅ Done. Metadata saved to {OUTPUT_JSON}")

# 🔁 Retry if crash
if __name__ == "__main__":
    while True:
        try:
            asyncio.run(main_async())
            break  # Exit loop on success
        except Exception as e:
            print(f"\n🔥 Crash detected: {e}\n⏳ Retrying in 2 seconds...\n")
            time.sleep(2)
