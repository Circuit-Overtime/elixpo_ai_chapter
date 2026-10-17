import pandas as pd
import subprocess
import json
import time
import os
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

# Constants
DATASET_PATH = "Training/re_train/failed_rows.csv"
PROGRESS_PATH = "Training/re_train/progressTrackerv3.json"
OUTPUT_PATH = "Training/re_train/emoji_context_enhanced_dataset2.csv"
FAILED_PATH = "Training/re_train/failed_rows2.csv"
NUM_THREADS = 5
MAX_RETRIES = 3

# Load dataset
df = pd.read_csv(DATASET_PATH)
total_rows = len(df)

# Load progress
if os.path.exists(PROGRESS_PATH):
    with open(PROGRESS_PATH, "r") as f:
        progress = json.load(f)
        start_index = progress.get("last_completed_index", -1) + 1
else:
    start_index = 0

# Write headers if starting fresh
if start_index == 0:
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("input_text,target_text\n")

lock = Lock()
failed_rows = []

def query_pollinations(input_text):
    payload = {
        "model": "openai",
        "messages": [
            {"role": "system", "content": (
                "Rewrite this sentence by translating the emojis into their "
                "full emotional or contextual meaning, and preserve the message. "
                "Make sure you add new words to give the sentence a second perspective, "
                "DON'T PUT ANY COMMA (,) IN YOUR RESPONSE(VERY IMPORTANT), "
                "and don't use any emojis. "
                "Keep it within 5-12 words based on the context."
            )},
            {"role": "user", "content": input_text}
        ],
        "seed": int(time.time() * 1000)
    }

    for attempt in range(MAX_RETRIES):
        try:
            result = subprocess.run(
                [
                    "curl", "https://text.pollinations.ai/openai",
                    "-H", "Content-Type: application/json",
                    "-d", json.dumps(payload)
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                response_json = json.loads(result.stdout)
                reply = response_json.get("choices", [{}])[0].get("message", {}).get("content", "")
                return reply.strip()
        except Exception as e:
            pass
        time.sleep(1.5)
    return None

def process_row(idx):
    input_text = df.loc[idx, "input_text"]
    enhanced = query_pollinations(input_text)

    with lock:
        if enhanced:
            # Save result
            with open(OUTPUT_PATH, "a", encoding="utf-8") as f_out:
                f_out.write(f'"{input_text}","{enhanced}"\n')
            # Update progress
            with open(PROGRESS_PATH, "w") as f:
                json.dump({"last_completed_index": idx}, f)
            # Display
            print(f"\n📝 Input:    {input_text}")
            print(f"✨ Enhanced: {enhanced}\n")
        else:
            failed_rows.append(idx)

# Run multithreaded processing
with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
    futures = [executor.submit(process_row, i) for i in range(start_index, total_rows)]

    with tqdm(total=total_rows - start_index, desc="Enhancing", ncols=80) as pbar:
        for future in as_completed(futures):
            pbar.update(1)

# Save failed rows for retry
if failed_rows:
    with open(FAILED_PATH, "w", encoding="utf-8") as f:
        f.write("row_index,input_text\n")
        for idx in failed_rows:
            input_text = df.loc[idx, "input_text"]
            f.write(f'{idx},"{input_text}"\n')

print(f"✅ Done. Output saved to: {OUTPUT_PATH}")
if failed_rows:
    print(f"⚠️ Failed rows written to: {FAILED_PATH} ({len(failed_rows)} failures)")
