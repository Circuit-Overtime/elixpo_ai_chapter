import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.pipeline import Pipeline
from sklearn.utils import class_weight
import joblib

# Step 1: Load the data, handling potential parsing errors
df = pd.read_csv(r'C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\combined.csv', on_bad_lines='skip', engine='python')

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
    ('clf', MultinomialNB(class_prior=[0.5, 0.5]))
])

# Step 5: Train the model with GridSearchCV for hyperparameter tuning
parameters = {
    'tfidf__ngram_range': [(1, 1), (1, 2)],
    'clf__alpha': [0.001, 0.01, 0.1, 1]
}
grid_search = GridSearchCV(pipeline, parameters, cv=10, n_jobs=-1)
grid_search.fit(X_train, y_train)

# Step 6: Evaluate the model
y_pred = grid_search.predict(X_test)
print("Best parameters found:", grid_search.best_params_)
print("Accuracy:", accuracy_score(y_test, y_pred))
print("Confusion Matrix:\n", confusion_matrix(y_test, y_pred))
print("Classification Report:\n", classification_report(y_test, y_pred))

# Step 7: Cross-validation for stability across different data splits
cross_val_scores = cross_val_score(grid_search.best_estimator_, x, y, cv=10, n_jobs=-1)
print("Cross-validation scores:", cross_val_scores)
print("Mean cross-validation accuracy:", cross_val_scores.mean())

# Step 8: Save the trained model
joblib.dump(grid_search, 'text_classifier_model.pkl')
print("Model saved as 'text_classifier_model.pkl'")

loaded_model = joblib.load('text_classifier_model.pkl')

# Function to classify new text
def classify_text(text):
    text = text.lower()
    prediction = grid_search.predict([text])
    return prediction[0]

# Example usage
input_text = "A Wonderful Bird in the sky with fiery wings"
result = classify_text(input_text)
print(f"The input text is classified as: {result}")
