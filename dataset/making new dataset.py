import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd
import pickle

# Initialize Firebase
cred = credentials.Certificate("./elixpoai-firebase-adminsdk-poswc-728c25f591.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# Fetch all prompts from the "server" collection
server_ref = db.collection("ImageGen")
server_docs = server_ref.stream()

# Prepare new data with label 1
new_prompts = []
for doc in server_docs:
    prompt = doc.to_dict().get("prompt", "")
    if prompt:
        new_prompts.append((prompt, 1))  # (response, label)

# Create a DataFrame for new data
new_data_df = pd.DataFrame(new_prompts, columns=['response', 'label'])
new_data_df.to_csv('new_data.csv', index=False)





