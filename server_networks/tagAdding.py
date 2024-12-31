from flask import Flask, request, jsonify
import spacy
import asyncio
from keybert import KeyBERT

# Initialize Flask app
app = Flask(__name__)

# Load a pre-trained NLP model (spaCy model)
nlp = spacy.load('en_core_web_md')

# Initialize KeyBERT for keyword extraction
kw_model = KeyBERT('distilbert-base-nli-mean-tokens')

async def generate_keywords(prompt, num_keywords=9):
    """Generate keywords for the given prompt."""
    keywords = kw_model.extract_keywords(prompt, keyphrase_ngram_range=(1, 3), stop_words='english', top_n=num_keywords)
    return [keyword for keyword, _ in keywords]

async def generate_hashtags(prompt, num_keywords=5):
    hashtags = kw_model.extract_keywords(prompt, keyphrase_ngram_range=(1, 1), stop_words='english', top_n=num_keywords)
    return [tag for tag, _ in hashtags]

def format_matching_hashtags(prompt, hashtags):
    # Split the prompt into words
    prompt_words = prompt.split()

    # Escape markdown characters to avoid interference
    escape_md = lambda text: text.replace("*", "\\*").replace("_", "\\_").replace("~", "\\~")

    # Apply markdown formatting only to words that match hashtags
    for hashtag in hashtags:
        escaped_hashtag = escape_md(hashtag.lstrip('#'))  # Remove hashtag symbol from the word
        for word in prompt_words:
            # If the word matches a hashtag (case-insensitive), apply markdown formatting
            if word.lower() == escaped_hashtag.lower():  
                prompt = prompt.replace(word, f"**_`{escaped_hashtag}`_**")

    return prompt

async def process_prompt(prompt):

    try:
        # Generate tags and hashtags asynchronously
        new_tags = await generate_keywords(prompt, num_keywords=9)
        formatted_hashtags = await generate_hashtags(prompt, num_keywords=5)

        # Format the prompt with markdown and highlight tags
        formatted_prompt = format_matching_hashtags(prompt, new_tags)
        
        return {
            "tags": new_tags,
            "formatted_prompt": formatted_prompt,
            "hashtags": formatted_hashtags
        }

    except Exception as e:
        print(f"Error processing prompt: {e}")
        return {"tags": [], "formatted_prompt": prompt, "hashtags": []}

# Flask route to handle the tag generation request
@app.route('/tag_gen', methods=['POST'])
def tag_gen():
    data = request.get_json()
    prompt = data.get('prompt', '')

    # Run the asynchronous task for processing the prompt
    result = asyncio.run(process_prompt(prompt))

    # Return the tags, formatted prompt, and hashtags as a JSON response
    return jsonify(result)

# Run Flask server
if __name__ == '__main__':
    print("Server starting...")
    app.run(debug=False, host='0.0.0.0', port=3001)
    print("Server started")