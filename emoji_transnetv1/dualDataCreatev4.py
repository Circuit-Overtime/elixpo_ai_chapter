import pandas as pd
import subprocess
import json
import time
import os
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Thread

# Constants
DATASET_PATH = "Training/mt5_training_data.csv"
PROGRESS_PATH_FORWARD = "Training/re_train/progressTrackerv3.json"
PROGRESS_PATH_BACKWARD = "Training/re_train/progressTrackerBackv3.json"
OUTPUT_PATH = "Training/re_train/emoji_context_enhanced_dataset.csv"
FAILED_PATH = "Training/re_train/failed_rows.csv"
NUM_THREADS = 5
MAX_RETRIES = 3
START_ROW_BACKWARD = 5000
END_ROW_BACKWARD = 10000
END_ROW_FORWARD = 4999

# Load dataset
df = pd.read_csv(DATASET_PATH)
total_rows = len(df)

# Ensure range boundaries are within dataset size
START_ROW_BACKWARD = max(0, START_ROW_BACKWARD)
END_ROW_BACKWARD = min(total_rows - 1, END_ROW_BACKWARD)
END_ROW_FORWARD = min(total_rows - 1, END_ROW_FORWARD)

# Load progress (Forward)
if os.path.exists(PROGRESS_PATH_FORWARD):
    with open(PROGRESS_PATH_FORWARD, "r") as f:
        progress_forward = json.load(f)
        start_index_forward = progress_forward.get("last_completed_index", -1) + 1
else:
    start_index_forward = 0

# Load progress (Backward)
if os.path.exists(PROGRESS_PATH_BACKWARD):
    with open(PROGRESS_PATH_BACKWARD, "r") as f:
        progress_backward = json.load(f)
        last_completed_index_backward = progress_backward.get("last_completed_index", END_ROW_BACKWARD + 1)
        if START_ROW_BACKWARD <= last_completed_index_backward <= END_ROW_BACKWARD:
            start_index_backward = last_completed_index_backward - 1
        else:
            start_index_backward = END_ROW_BACKWARD
else:
    start_index_backward = END_ROW_BACKWARD

# Write output headers if needed
if not os.path.exists(OUTPUT_PATH):
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("input_text,target_text\n")

lock = Lock()
failed_rows = []

import requests

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

    headers = {"Content-Type": "application/json"}

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.post("https://text.pollinations.ai/openai", json=payload, headers=headers, timeout=15)
            if response.status_code == 200:
                reply = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                return reply.strip()
            else:
                print(f"[Attempt {attempt+1}] ❌ HTTP {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"[Attempt {attempt+1}] ⚠️ Request failed: {e}")
        time.sleep(1.5)
    return None


def process_row(idx, direction):
    input_text = df.loc[idx, "input_text"]
    enhanced = query_pollinations(input_text)

    with lock:
        if enhanced:
            # Save result
            with open(OUTPUT_PATH, "a", encoding="utf-8") as f_out:
                f_out.write(f'"{input_text}","{enhanced}"\n')

            # Update progress
            progress_path = PROGRESS_PATH_FORWARD if direction == "forward" else PROGRESS_PATH_BACKWARD
            with open(progress_path, "w") as f:
                json.dump({"last_completed_index": idx}, f)

            # print(f"\n({direction}) 📝 Input:    {input_text}")
            # print(f"({direction}) ✨ Enhanced: {enhanced}\n")
        else:
            failed_rows.append(idx)

def run_forward():
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        forward_range = range(start_index_forward, END_ROW_FORWARD + 1)
        futures = [executor.submit(process_row, i, "forward") for i in forward_range]
        with tqdm(total=len(forward_range), desc="Forward", ncols=80) as pbar:
            for future in as_completed(futures):
                pbar.update(1)

def run_backward():
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        backward_range = range(start_index_backward, START_ROW_BACKWARD - 1, -1)
        futures = [executor.submit(process_row, i, "backward") for i in backward_range]
        with tqdm(total=len(backward_range), desc="Backward", ncols=80) as pbar:
            for future in as_completed(futures):
                pbar.update(1)

# Launch forward and backward processors in parallel threads
thread_forward = Thread(target=run_forward)
thread_backward = Thread(target=run_backward)

thread_forward.start()
thread_backward.start()

thread_forward.join()
thread_backward.join()

# Save failed rows if any
if failed_rows:
    with open(FAILED_PATH, "w", encoding="utf-8") as f:
        f.write("row_index,input_text\n")
        for idx in failed_rows:
            input_text = df.loc[idx, "input_text"]
            f.write(f'{idx},"{input_text}"\n')

print(f"\n✅ Done. Output saved to: {OUTPUT_PATH}")
if failed_rows:
    print(f"⚠️ Failed rows written to: {FAILED_PATH} ({len(failed_rows)} failures)")
