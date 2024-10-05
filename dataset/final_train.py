import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
import pickle

# Load datasets
nonsensical_file = r"C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\non_sensical_combined.csv"
prompt_collection_file = r"C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\prompts_collection.csv"

df_nonsensical = pd.read_csv(nonsensical_file)
df_prompt_collection = pd.read_csv(prompt_collection_file)

# Combine the datasets
df_combined = pd.concat([df_nonsensical, df_prompt_collection])

# Preprocessing: Vectorize the 'response' column
vectorizer = TfidfVectorizer(max_features=5000)
X = vectorizer.fit_transform(df_combined['response'].values.astype('U'))

# Target (labels)
y = df_combined['label']

# Split the data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train a Logistic Regression model
model = LogisticRegression()
model.fit(X_train, y_train)

# Evaluate the model
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"Model Accuracy: {accuracy * 100:.2f}%")

# Save the model as a pickle file
with open('gibberish_classifier.pkl', 'wb') as f:
    pickle.dump(model, f)

# Save the vectorizer for later use
with open('vectorizer.pkl', 'wb') as f:
    pickle.dump(vectorizer, f)
