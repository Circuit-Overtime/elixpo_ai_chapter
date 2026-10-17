# Emoji Contextual Translator

This project leverages a fine-tuned T5 model to translate emoji sentences into plain English. The model was trained to understand contextual emoji usage and provide natural language translations.

## Model Overview

The model is based on the T5 (Text-to-Text Transfer Transformer) architecture, fine-tuned on a custom dataset containing emoji-sentiment sentences. It accepts emoji-rich sentences and translates them into a meaningful plain-text description.

## Files

- `t5-emoji-model-final-retrain2/`: Contains the fine-tuned T5 model and tokenizer.
- `test_inference.py`: A script for performing inference using the trained model.
- `test_rouge.py`: A script for evaluating the model’s output using ROUGE metrics and plotting results.

## Requirements

- Python 3.7+
- PyTorch
- HuggingFace Transformers
- matplotlib
- rouge_score

You can install the necessary dependencies with the following:

```bash
pip install torch transformers matplotlib rouge-score
```

# Usage 
## Running Inference 
- To run the inference, get the code followup!
```python
from transformers import T5Tokenizer, T5ForConditionalGeneration
import torch

# Load the hosted model and tokenizer
model_name = "Elixpo/Emoji-Contextual-Translator"
tokenizer = T5Tokenizer.from_pretrained(model_name)
model = T5ForConditionalGeneration.from_pretrained(model_name)

# Set model to evaluation mode
model.eval()

# Check for GPU availability
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

# Example emoji sentences for inference
emoji_inputs = [
    "Translate the emoji sentence to plain English: I just got my first job 😎💼",
    "Translate the emoji sentence to plain English: Feeling so relaxed after yoga 🧘‍♀️✨",
    "Translate the emoji sentence to plain English: Celebrating my friend's birthday 🎂🎉",
    "Translate the emoji sentence to plain English: Watching a beautiful sunset 🌅❤️",
    "Translate the emoji sentence to plain English: So proud of my accomplishments 🏆🎉",
    "Translate the emoji sentence to plain English: Eating my favorite pizza 🍕😍",
    "Translate the emoji sentence to plain English: Going on a fun road trip 🚗🎶",
    "Translate the emoji sentence to plain English: Finally home after a long day 🏡😌",
    "Translate the emoji sentence to plain English: Feeling adventurous today 🌍✈️",
    "Translate the emoji sentence to plain English: Spending time with family 💕👨‍👩‍👧‍👦",
    "Translate the emoji sentence to plain English: Getting ready for a workout 🏋️‍♀️💪",
    "Translate the emoji sentence to plain English: Taking a break with some coffee ☕📖",
    "Translate the emoji sentence to plain English: Happy to be outdoors 🌳🌞",
    "Translate the emoji sentence to plain English: Enjoying a rainy day indoors 🌧️📚",
    "Translate the emoji sentence to plain English: Excited for the new season of my favorite show 📺🍿",
    "Translate the emoji sentence to plain English: I am feeling confident today 💁‍♂️💫",
    "Translate the emoji sentence to plain English: Can't wait to see my friends this weekend 👯‍♂️🍻",
    "Translate the emoji sentence to plain English: I love spending time at the beach 🏖️🌊",
    "Translate the emoji sentence to plain English: I'm so proud of my hard work 💼💪",
    "Translate the emoji sentence to plain English: Taking a stroll in the park 🌳🚶‍♂️"
]

# Run inference on the emoji inputs
for input_text in emoji_inputs:
    # Tokenize the input text
    input_ids = tokenizer.encode(input_text, return_tensors="pt", truncation=True).to(device)
    
    # Generate output using the model
    output_ids = model.generate(
        input_ids,
        max_length=20,
        num_beams=5,  # Beam search for better quality
        no_repeat_ngram_size=1,  # Prevent repetition of n-grams
        temperature=0.7,  # Higher temperature for more varied outputs
        top_p=0.9,  # Top-p sampling to avoid too repetitive or deterministic outputs
        top_k=70,  # Restrict to the top k most likely tokens
        early_stopping=True
    )
    
    # Decode and print the output text
    output_text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    print(f"\nInput: {input_text}\nOutput: {output_text}")
```

## Running ROUGE Evaluation
- To evaluate the model’s performance on a set of example sentences using the ROUGE metric, use the following script:
```python
from rouge_score import rouge_scorer
from transformers import T5Tokenizer, T5ForConditionalGeneration
import torch

# Load the hosted model and tokenizer
model_name = "Elixpo/Emoji-Contextual-Translator"
tokenizer = T5Tokenizer.from_pretrained(model_name)
model = T5ForConditionalGeneration.from_pretrained(model_name)

# Set model to evaluation mode
model.eval()

# Check for GPU availability
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

# Example emoji sentences for inference
emoji_inputs = [
    "Translate the emoji sentence to plain English: I just got my first job 😎💼",
    "Translate the emoji sentence to plain English: Feeling so relaxed after yoga 🧘‍♀️✨",
    "Translate the emoji sentence to plain English: Celebrating my friend's birthday 🎂🎉",
    "Translate the emoji sentence to plain English: Watching a beautiful sunset 🌅❤️",
    "Translate the emoji sentence to plain English: So proud of my accomplishments 🏆🎉",
    "Translate the emoji sentence to plain English: Eating my favorite pizza 🍕😍",
    "Translate the emoji sentence to plain English: Going on a fun road trip 🚗🎶",
    "Translate the emoji sentence to plain English: Finally home after a long day 🏡😌",
    "Translate the emoji sentence to plain English: Feeling adventurous today 🌍✈️",
    "Translate the emoji sentence to plain English: Spending time with family 💕👨‍👩‍👧‍👦",
    "Translate the emoji sentence to plain English: Getting ready for a workout 🏋️‍♀️💪",
    "Translate the emoji sentence to plain English: Taking a break with some coffee ☕📖",
    "Translate the emoji sentence to plain English: Happy to be outdoors 🌳🌞",
    "Translate the emoji sentence to plain English: Enjoying a rainy day indoors 🌧️📚",
    "Translate the emoji sentence to plain English: Excited for the new season of my favorite show 📺🍿",
    "Translate the emoji sentence to plain English: I am feeling confident today 💁‍♂️💫",
    "Translate the emoji sentence to plain English: Can't wait to see my friends this weekend 👯‍♂️🍻",
    "Translate the emoji sentence to plain English: I love spending time at the beach 🏖️🌊",
    "Translate the emoji sentence to plain English: I'm so proud of my hard work 💼💪",
    "Translate the emoji sentence to plain English: Taking a stroll in the park 🌳🚶‍♂️"
]

# Initialize the ROUGE scorer
scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)

# Store the ROUGE scores
rouge1_scores = []
rouge2_scores = []
rougeL_scores = []
for input_text in emoji_inputs:
    # Tokenize the input text
    input_ids = tokenizer.encode(input_text, return_tensors="pt", truncation=True).to(device)
    
    # Generate output using the model
    output_ids = model.generate(
        input_ids,
        max_length=20,
        num_beams=5,  # Beam search for better quality
        no_repeat_ngram_size=1,  # Prevent repetition of n-grams
        temperature=0.7,  # Higher temperature for more varied outputs
        top_p=0.9,  # Top-p sampling to avoid too repetitive or deterministic outputs
        top_k=70,  # Restrict to the top k most likely tokens
        early_stopping=True
    )
    
    # Decode the generated output
    output_text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    
    # For metric evaluation: decode the input text (to compare against) and compute ROUGE scores
    decoded_input_text = input_text.split(": ")[1]  # Remove the instruction part
    scores = scorer.score(decoded_input_text, output_text)
    
    rouge1_scores.append(scores["rouge1"].fmeasure)
    rouge2_scores.append(scores["rouge2"].fmeasure)
    rougeL_scores.append(scores["rougeL"].fmeasure)
    
    print(f"\nInput: {input_text}\nOutput: {output_text}")
    print(f"ROUGE-1: {scores['rouge1'].fmeasure:.4f}, ROUGE-2: {scores['rouge2'].fmeasure:.4f}, ROUGE-L: {scores['rougeL'].fmeasure:.4f}")

# Step 2: Plotting the ROUGE Scores
import matplotlib.pyplot as plt

epochs = list(range(1, len(rouge1_scores) + 1))
plt.figure(figsize=(10, 6))
plt.plot(epochs, rouge1_scores, label="ROUGE-1", color="blue", marker="o")
plt.plot(epochs, rouge2_scores, label="ROUGE-2", color="green", marker="x")
plt.plot(epochs, rougeL_scores, label="ROUGE-L", color="red", marker="s")
plt.xlabel("Sample Index")
plt.ylabel("ROUGE Score")
plt.title("ROUGE Scores for Emoji to Text Translation")
plt.legend()
plt.grid(True)
plt.show()
```



# Training Instructions

To retrain or fine-tune the model, use the scripts provided in the repository, which require a dataset of emoji-sentiment sentences. Make sure your dataset is formatted properly before starting the fine-tuning process.

---

Feel free to adapt this README to fit your exact project details, and let me know if there are any adjustments you need!
