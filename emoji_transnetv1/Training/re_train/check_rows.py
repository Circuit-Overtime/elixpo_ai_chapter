import pandas as pd
import csv

# Path to the enhanced dataset
DATASET_PATH = "emoji_context_enhanced_dataset.csv"

# Track problems
invalid_rows = []
total_rows = 0

with open(DATASET_PATH, "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    headers = next(reader)
    expected_columns = 2

    if headers != ["input_text", "target_text"]:
        print(f"❌ Header mismatch: found {headers}")
    else:
        print("✅ Header is correct")

    for i, row in enumerate(reader, start=2):  # Start at 2 to account for header
        total_rows += 1
        if len(row) != expected_columns or any(cell.strip() == "" for cell in row):
            invalid_rows.append((i, row))

print(f"\n✅ Total rows checked: {total_rows}")
if invalid_rows:
    print(f"❌ Found {len(invalid_rows)} invalid rows:")
    for line_no, row in invalid_rows[:10]:  # Show only first 10 for brevity
        print(f" - Line {line_no}: {row}")
    print("⚠️ Review or clean the invalid rows listed above.")
else:
    print("🎉 All rows are valid!")

# Optional: Save invalid rows to a separate file
if invalid_rows:
    with open("invalid_rows.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["line_number", "input_text", "target_text"])
        for line_no, row in invalid_rows:
            padded_row = row + [""] * (expected_columns - len(row))  # Pad missing cols
            writer.writerow([line_no] + padded_row)
    print("📝 Invalid rows saved to invalid_rows.csv")
