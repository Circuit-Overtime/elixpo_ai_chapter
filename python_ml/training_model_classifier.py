#1.0 classifier between normal text and gibberish text
import numpy as np
import pickle
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.sequence import pad_sequences

# Load the trained Keras model
model = load_model(r'trained_model.h5')

# Load the tokenizer
with open(r'tokenizer.pkl', 'rb') as f:
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
    if predicted_class[0][0] == 1:
        return "Meaningful"
    else:
        return "Gibberish"

# Take user input
input_text = input("Enter a text: ")

# Get prediction
result = classify_text(input_text)

# Display the result
print(f"Text: {input_text}\nPredicted Class: {result}")
