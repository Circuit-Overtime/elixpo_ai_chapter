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
