import os
import sys
import ast
import pandas as pd
from pathlib import Path
from utils import log_info

# Add root directory to sys.path to import tokenizer
ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

from tokenizer import split_into_sentences, clean_and_tokenize

def main():
    csv_path = Path("C:/Users/user/Desktop/AI projects/cooking dataset/full_dataset.csv")
    output_path = ROOT_DIR / "recipes_5m.txt"
    reports_dir = ROOT_DIR / "reports"
    reports_dir.mkdir(exist_ok=True)
    report_path = reports_dir / "recipes_dataset_stats.md"
    
    if not csv_path.exists():
        print(f"Error: Cooking dataset not found at {csv_path}")
        sys.exit(1)
        
    log_info("Starting extraction of ~5,000,000 characters of recipe directions...")
    
    extracted_recipes = []
    total_chars = 0
    target_chars = 5000000
    
    # Track raw list instruction counts/lengths for Phase 2
    raw_instruction_counts = []
    raw_instruction_lengths = []
    
    chunk_size = 5000
    reader = pd.read_csv(csv_path, chunksize=chunk_size)
    
    finished = False
    for chunk_idx, chunk in enumerate(reader):
        if finished:
            break
        
        # Filter null directions
        chunk = chunk[chunk['directions'].notna()]
        
        for idx, row in chunk.iterrows():
            dir_str = row['directions']
            try:
                directions_list = ast.literal_eval(dir_str)
            except Exception:
                try:
                    import json
                    directions_list = json.loads(dir_str)
                except Exception:
                    continue
            
            if not isinstance(directions_list, list) or not directions_list:
                continue
                
            # Clean directions: strip spaces
            cleaned_directions = [d.strip() for d in directions_list if d.strip()]
            if not cleaned_directions:
                continue
                
            # Format recipe: join with double newlines
            recipe_text = "\n\n".join(cleaned_directions)
            
            extracted_recipes.append(recipe_text)
            
            # Record instructions stats
            raw_instruction_counts.append(len(cleaned_directions))
            for inst in cleaned_directions:
                # Approximate word count in raw instruction
                raw_instruction_lengths.append(len(inst.split()))
            
            # Character count including separator
            total_chars += len(recipe_text) + len("\n\n<|endoftext|>\n")
            
            if total_chars >= target_chars:
                log_info(f"Reached {total_chars} characters. Ending extraction.")
                finished = True
                break
                
        log_info(f"Processed chunk {chunk_idx + 1}, extracted recipes: {len(extracted_recipes)}, total characters so far: {total_chars}")
        
    # Join with separator
    separator = "\n\n<|endoftext|>\n"
    output_text = separator.join(extracted_recipes) + separator
    
    # Save text
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_text)
    log_info(f"Extracted corpus saved to {output_path}")
    
    # Compute Statistics for Phase 2
    char_count = len(output_text)
    recipe_count = len(extracted_recipes)
    
    log_info("Analyzing extracted recipe statistics (running spaCy sentence splitter)...")
    all_sentences = []
    word_count = 0
    recipe_lengths_sentences = []
    recipe_lengths_words = []
    
    for recipe in extracted_recipes:
        sents = split_into_sentences(recipe)
        all_sentences.extend(sents)
        recipe_lengths_sentences.append(len(sents))
        
        recipe_words = 0
        for sent in sents:
            tokens = clean_and_tokenize(sent)
            recipe_words += len(tokens)
        recipe_lengths_words.append(recipe_words)
        word_count += recipe_words
        
    sentence_count = len(all_sentences)
    avg_recipe_len_sents = sum(recipe_lengths_sentences) / recipe_count if recipe_count else 0.0
    avg_recipe_len_words = sum(recipe_lengths_words) / recipe_count if recipe_count else 0.0
    
    avg_instruction_count = sum(raw_instruction_counts) / recipe_count if recipe_count else 0.0
    avg_instruction_length = sum(raw_instruction_lengths) / len(raw_instruction_lengths) if raw_instruction_lengths else 0.0
    
    # Write report
    sample_recipes_content = ""
    for i in range(min(3, len(extracted_recipes))):
        sample_recipes_content += f"### Recipe {i + 1}\n```text\n{extracted_recipes[i]}\n```\n\n"
        
    report_content = f"""# Cooking Recipes 5M Dataset Statistics

This report documents the characteristics of the subset extracted from the cooking recipe directions dataset.

## Corpus Statistics
* **Character Count**: {char_count:,} characters (including boundaries)
* **Word Count**: {word_count:,} words (cleaned/tokenized)
* **Recipe Count**: {recipe_count:,} complete recipes
* **Sentence Count**: {sentence_count:,} sentences (tokenized by spaCy)

## Average Lengths
* **Average Recipe Length**:
  * `{avg_recipe_len_sents:.2f}` sentences
  * `{avg_recipe_len_words:.2f}` words
* **Average Instruction Count (Steps per Recipe)**: `{avg_instruction_count:.2f}` steps
* **Average Instruction Length**: `{avg_instruction_length:.2f}` words

## Sample Recipes
{sample_recipes_content}
"""
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)
        
    log_info(f"Statistics report successfully written to {report_path}")
    print("\n--- Statistics Summary ---")
    print(f"Recipes: {recipe_count}")
    print(f"Sentences: {sentence_count}")
    print(f"Words: {word_count}")
    print(f"Characters: {char_count}")
    print(f"Avg Recipe Length: {avg_recipe_len_sents:.1f} sents, {avg_recipe_len_words:.1f} words")
    print(f"Avg Instruction Count: {avg_instruction_count:.1f} steps")
    print(f"Avg Instruction Length: {avg_instruction_length:.1f} words")

if __name__ == "__main__":
    main()
