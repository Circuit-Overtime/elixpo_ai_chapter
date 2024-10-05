import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# Step 1: Load the data
df = pd.read_csv(r'E:\elixpo.ai\dataset\combined.csv')

# Step 2: Preprocess the data
df = df.dropna()
df['response'] = df['response'].str.lower()
df = df.drop_duplicates()


# Step 3: Split the data into training and testing sets
x = df['response']
y = df['label']
X_train, X_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)

# Step 4: Create a pipeline for text vectorization and model training
pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(stop_words='english', max_features=5000)),
    ('clf', LogisticRegression(max_iter=1000, class_weight='balanced'))
])

# Step 5: Train the model with GridSearchCV for hyperparameter tuning
parameters = {
    'tfidf__ngram_range': [(1, 1), (1, 2)],  # Unigrams and bigrams
    'clf__C': [0.1, 1, 10]  # Regularization strength
}
grid_search = GridSearchCV(pipeline, parameters, cv=5, n_jobs=-1)
grid_search.fit(X_train, y_train)

# Step 6: Evaluate the model
y_pred = grid_search.predict(X_test)
print("Best parameters found:", grid_search.best_params_)
print("Accuracy:", accuracy_score(y_test, y_pred))
print("Confusion Matrix:\n", confusion_matrix(y_test, y_pred))
print("Classification Report:\n", classification_report(y_test, y_pred))



def classify_text(text):
    text = text.lower()
    prediction = grid_search.predict([text])
    return prediction[0]

# Example usage
input_text = "This is a sample text."
result = classify_text(input_text)
print(f"The input text is classified as: {result}")