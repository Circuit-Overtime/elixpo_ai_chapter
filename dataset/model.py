import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
import matplotlib.pyplot as plt
import seaborn as sns


df = pd.read_csv(r'C:\Users\ELIXPO\Desktop\elixpo.ai\dataset\combined.csv')
df.dropna()


#converting the labels to lowercase
df['response'] = df['response'].str.lower()

x = df['response']
y = df['label']
# Split the data into training, validation, and test sets
x_train, x_temp, y_train, y_temp = train_test_split(x, y, test_size=0.2, random_state=42)
x_val, x_test, y_val, y_test = train_test_split(x_temp, y_temp, test_size=0.5, random_state=42)

# Create DataFrames for each dataset
train_data = pd.DataFrame({"Text": x_train, "label": y_train, "Dataset": "train"})
val_data = pd.DataFrame({"Text": x_val, "label": y_val, "Dataset": "validation"})
test_data = pd.DataFrame({"Text": x_test, "label": y_test, "Dataset": "test"})

# Combine all datasets into one DataFrame for visualization
combined_data = pd.concat([train_data, val_data, test_data])


#heresplitting the data into training , validating and testing data
#x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)


#create a dataframe object
#train_data = pd.DataFrame({"Text": x_train, "label": y_train, "Dataset": "train"})
#test_data = pd.DataFrame({"Text": x_test, "label": y_test, "Dataset": "test"})
#combined_data = pd.concat([train_data, test_data])here

#plot the distribution of the labels
# x axis = label, y axis = count, sns hue = dataset, data- combined_data
sns.countplot(x='label', hue='Dataset', data=combined_data)
plt.figure(figsize=(12, 8))
plt.title('Distribution of Labels in the Dataset')
plt.xlabel('label')
plt.ylabel('count')
plt.legend(title='Dataset')
plt.show()


#visualizing the distribution of the labels
sample_train = x_train.sample(5, random_state=42)    #randomly select 5 samples from the training data
sample_test = x_test.sample(5, random_state=42)    #randomly select 5 samples from the testing data
sample_val = x_val.sample(5, random_state=42)    #randomly select 5 samples from the validation data



print("Sample Text from Training Set:")
print(sample_train.to_list())
print("\nSample Text from Testing Set:")
print(sample_test.to_list())
print("\nSample Text from Validation Set:")
print(sample_val.to_list())


#testing for stash changes