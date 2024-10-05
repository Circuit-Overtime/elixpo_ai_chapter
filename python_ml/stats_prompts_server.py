import firebase_admin
from firebase_admin import credentials, firestore
import numpy as np
import pickle
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.sequence import pad_sequences
import matplotlib.pyplot as plt

# Initialize Firebase
cred = credentials.Certificate("./elixpoai-firebase-adminsdk-poswc-728c25f591.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# References
image_ref = db.collection("ImageGen")

# Load the model
model = load_model(r'theModel.h5')

# Load the tokenizer
with open(r'prompt_classifier_tokenizer.pkl', 'rb') as f:
    tokenizer = pickle.load(f)

# Function to classify new text
def classify_text(input_text):
    # Tokenize and pad the input text
    input_text_seq = tokenizer.texts_to_sequences([input_text])
    input_text_padded = pad_sequences(input_text_seq, maxlen=100)  # Adjust maxlen as per your training setup

    # Make prediction
    prediction = model.predict(input_text_padded)

    # Convert prediction to binary (0 or 1)
    predicted_class = (prediction > 0.5).astype("int32")

    # Interpret the result
    return "Meaningful" if predicted_class[0][0] == 1 else "Gibberish"

# Variables to store counts
counts = {"Meaningful": 0, "Gibberish": 0}

# Extract and classify text from each document
docs = image_ref.stream()
for doc in docs:
    prompt = doc.to_dict().get("prompt", "")
    if prompt:
        result = classify_text(prompt)
        counts[result] += 1

# Plotting the results
categories = list(counts.keys())
values = list(counts.values())

plt.figure(figsize=(8, 6))
plt.bar(categories, values, color=['blue', 'red'])
plt.xlabel('Classification')
plt.ylabel('Number of Prompts')
plt.title('Classification of Prompts: Meaningful vs Gibberish')
plt.show()
