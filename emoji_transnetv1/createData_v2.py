import os
import json
import csv
import requests
from tqdm import tqdm
import time
import random
import math
import urllib.parse

# Configuration
base_path = "./synthetic_data"
os.makedirs(base_path, exist_ok=True)

output_csv_path = os.path.join(base_path, "synthetic_emoji_data.csv")
resume_file = os.path.join(base_path, "progress_tracker.txt")
base_url = "https://text.pollinations.ai/"
total_rows =  10000
model = "openai"


# Progress tracking
def read_progress():
    return int(open(resume_file).read().strip()) if os.path.exists(resume_file) else 0

def write_progress(count):
    with open(resume_file, "w") as f:
        f.write(str(count))


# Initialize CSV
def initialize_csv():
    if not os.path.exists(output_csv_path):
        with open(output_csv_path, "w", newline='', encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "original_message", "emoji_used", "emoji_context_window", "translated_meaning",
                "sentiment_detected", "emoji_category", "target_text", "message_type"
            ])


# Extract JSON from API response
def extract_json(content):
    try:
        content = content.strip()
        for line in content.splitlines():
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                return json.loads(line)
        # Fallback extraction
        brace_count, buffer = 0, []
        for char in content:
            if char == '{':
                brace_count += 1
            if brace_count > 0:
                buffer.append(char)
            if char == '}':
                brace_count -= 1
                if brace_count == 0:
                    return json.loads(''.join(buffer))
    except Exception as e:
        print("❌ JSON extraction error:", e)
    return None


# Construct GET-based prompt
def build_request_url():
    timestamp = time.time()
    random_float = random.random()
    random_int = random.randint(0, 1000000)
    seed = math.floor((timestamp * 1000000 + random_float * 1000000 + random_int) % 1000000000)

    system_prompt = (
        "You are generating highly diverse, realistic synthetic messages that combine text with emojis. "
        "Your task is to simulate natural human expression with emojis in a wide variety of settings.\n\n"

        "🔥 IMPORTANT:\n"
        "- DO NOT repeat similar messages (e.g. 'great day at the park/beach with kids/friends') more than once every 10 messages.\n"
        "- Rotate between *scenarios* like travel, food, work, emotions, hobbies, nightlife, study, weather, sports, introspection, etc.\n"
        "- Vary *locations* (home, mall, forest, space, underwater, city, bus stop, mountaintop).\n"
        "- Vary *moods* (nostalgic, surprised, sleepy, angry, excited, reflective, sarcastic).\n"
        "- Vary *time* (morning, noon, night, yesterday, next week, winter, summer, etc.).\n"
        "- Include creative or absurd combinations too (e.g. 'fighting dragons while making soup 🍜🐉🔥').\n\n"

        "💡 MESSAGE DESIGN:\n"
        "- Use emojis naturally within the sentence.\n"
        "- Avoid clichés and common openings ('Had a great day...').\n"
        "- Include diverse sentence structures, tones, and lengths.\n"
        "- Each message must feel unique, expressive, and different from the previous ones.\n\n"

        "🧠 FORMAT:\n"
        "Respond ONLY with a compact JSON object on one line. NO markdown, NO comments, NO extra text.\n"
        "Include these exact fields:\n"
        "  - original_message (string with emojis)\n"
        "  - emoji_used (list of emojis used)\n"
        "  - emoji_context_window (integer)\n"
        "  - translated_meaning (same message without emojis)\n"
        "  - sentiment_detected (positive, neutral, negative)\n"
        "  - emoji_category (list like ['emotion', 'weather', 'activity'])\n"
        "  - target_text (rephrased version of message without emojis)\n"
        "  - message_type (e.g. 'daily_status', 'emotional_reflection', 'food_update', 'creative_story')\n\n"

        "🔁 EXAMPLE OUTPUT:\n"
        "{\"original_message\":\"Spilled my coffee on the keyboard again 😭☕💻\",\"emoji_used\":[\"😭\",\"☕\",\"💻\"],"
        "\"emoji_context_window\":5,\"translated_meaning\":\"I spilled my coffee on the keyboard again and I'm upset.\","
        "\"sentiment_detected\":\"negative\",\"emoji_category\":[\"emotion\",\"object\",\"tech\"],"
        "\"target_text\":\"I spilled my coffee on the keyboard again and I'm upset.\","
        "\"message_type\":\"daily_status\"}"
    )

    prompt = "Generate one synthetic emoji-rich human message with metadata as JSON."
    query_params = {
        "model": model,
        "system": system_prompt,
        "json": "true",
        "seed": seed
    }

    full_url = f"{base_url}{urllib.parse.quote(prompt)}?{urllib.parse.urlencode(query_params)}"
    return full_url


# Main loop
def generate_data():
    current = read_progress()
    initialize_csv()

    with tqdm(total=total_rows, initial=current, desc="🚀 Generating synthetic data") as pbar:
        i = current
        while i < total_rows:
            try:
                url = build_request_url()
                response = requests.get(url)
                response.raise_for_status()
                content = response.text
                parsed = extract_json(content)

                if not parsed:
                    print(f"⚠️ Malformed response:\n{content[:300]}...")
                    raise ValueError("Failed to parse valid JSON from response.")

                with open(output_csv_path, "a", newline='', encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow([
                        parsed.get("original_message", ""),
                        parsed.get("emoji_used", ""),
                        parsed.get("emoji_context_window", ""),
                        parsed.get("translated_meaning", ""),
                        parsed.get("sentiment_detected", ""),
                        parsed.get("emoji_category", ""),
                        parsed.get("target_text", ""),
                        parsed.get("message_type", "")
                    ])

                preview = parsed.get("original_message", "")[:40]
                pbar.set_postfix({"Row": i + 1, "Message": preview})
                write_progress(i + 1)
                pbar.update(1)
                i += 1

            except Exception as e:
                print(f"❌ Error at row {i}: {e}")
                time.sleep(0.5)

            finally:
                time.sleep(0.5)


# Run the generator
generate_data()
