import os
import sys
from pathlib import Path

# Add root directory to sys.path to import tokenizer
ROOT_DIR = Path(__file__).resolve().parent
sys.path.append(str(ROOT_DIR))

from tokenizer import split_into_sentences, clean_and_tokenize
from utils import log_info

def yield_stories(filepath: Path):
    """Memory-efficient generator that yields stories separated by <|endoftext|>."""
    with open(filepath, "r", encoding="utf-8") as f:
        chunk_size = 65536
        buffer = ""
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                if buffer.strip():
                    yield buffer.strip()
                break
            buffer += chunk
            while "<|endoftext|>" in buffer:
                story, buffer = buffer.split("<|endoftext|>", 1)
                yield story.strip()

def main():
    raw_path = Path("C:/Users/user/Desktop/AI projects/1-Bit LLM/tinystories.txt")
    output_path = ROOT_DIR / "tinystories_1m.txt"
    reports_dir = ROOT_DIR / "reports"
    reports_dir.mkdir(exist_ok=True)
    report_path = reports_dir / "tinystories_dataset_stats.md"
    
    if not raw_path.exists():
        print(f"Error: Raw TinyStories dataset not found at {raw_path}")
        sys.exit(1)
        
    log_info("Starting extraction of ~1,000,000 characters from TinyStories...")
    
    extracted_stories = []
    total_chars = 0
    target_chars = 1000000
    
    for story in yield_stories(raw_path):
        if not story:
            continue
        extracted_stories.append(story)
        total_chars += len(story)
        
        if total_chars >= target_chars:
            log_info(f"Reached {total_chars} characters. Ending extraction.")
            break
            
    # Join stories with <|endoftext|> separator
    separator = "\n<|endoftext|>\n"
    output_text = separator.join(extracted_stories) + separator
    
    # Save extracted stories
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_text)
    log_info(f"Extracted subset saved to {output_path}")
    
    # Compute Statistics
    char_count = len(output_text)
    story_count = len(extracted_stories)
    
    # Sentence and word counts
    log_info("Analyzing extracted text statistics (tokenizing sentences)...")
    all_sentences = []
    word_count = 0
    story_lengths_sentences = []
    story_lengths_words = []
    
    for story in extracted_stories:
        sentences = split_into_sentences(story)
        all_sentences.extend(sentences)
        story_lengths_sentences.append(len(sentences))
        
        story_words = 0
        for sent in sentences:
            tokens = clean_and_tokenize(sent)
            story_words += len(tokens)
        story_lengths_words.append(story_words)
        word_count += story_words
        
    sentence_count = len(all_sentences)
    avg_story_len_sents = sum(story_lengths_sentences) / story_count if story_count else 0.0
    avg_story_len_words = sum(story_lengths_words) / story_count if story_count else 0.0
    avg_sent_len_words = word_count / sentence_count if sentence_count else 0.0
    
    # Write report
    report_content = f"""# TinyStories extracted 1M Dataset Statistics

This report documents the characteristics of the subset extracted from the TinyStories corpus for training AlphaLM v5.5.4.

## Core Statistics
* **Character Count**: {char_count:,} characters
* **Word Count**: {word_count:,} words (cleaned/tokenized)
* **Story Count**: {story_count:,} complete stories
* **Sentence Count**: {sentence_count:,} sentences

## Average Lengths
* **Average Story Length**: 
  * `{avg_story_len_sents:.2f}` sentences
  * `{avg_story_len_words:.2f}` words
* **Average Sentence Length**: 
  * `{avg_sent_len_words:.2f}` words

## Sample Story
The first story in the extracted dataset:
```text
{extracted_stories[0]}
```
"""
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)
        
    log_info(f"Statistics report successfully written to {report_path}")
    print("\n--- Statistics Summary ---")
    print(f"Stories: {story_count}")
    print(f"Sentences: {sentence_count}")
    print(f"Words: {word_count}")
    print(f"Characters: {char_count}")
    print(f"Avg Story Length: {avg_story_len_sents:.1f} sents, {avg_story_len_words:.1f} words")
    print(f"Avg Sentence Length: {avg_sent_len_words:.1f} words")

if __name__ == "__main__":
    main()
