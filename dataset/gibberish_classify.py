import pandas as pd

# File paths
gibberish_file = r'C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\Gibberish.csv'
non_sensical_file = r'C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\non_senscical.csv'
output_file = 'non_sensical_combined.csv'

# Read the gibberish dataset
# Read the gibberish dataset with a different encoding
try:
    gibberish_df = pd.read_csv(gibberish_file, encoding='ISO-8859-1')  # or 'latin1'
except Exception as e:
    print(f"Error reading gibberish file: {e}")
    raise

# Extract the Response column and create a new DataFrame with label 0
gibberish_responses = gibberish_df[['Response']].copy()
gibberish_responses['Label'] = 0

# Ensure no extra commas or incorrect formatting
gibberish_responses = gibberish_responses.dropna()  # Remove any NaN values
gibberish_responses = gibberish_responses.rename(columns={'Response': 'response', 'Label': 'label'})

# Read the non-sensical dataset with proper encoding
try:
    non_sensical_df = pd.read_csv(non_sensical_file)
except Exception as e:
    print(f"Error reading non-sensical file: {e}")
    raise

# Ensure headers are correct for non-sensical file
non_sensical_df.columns = ['response', 'label']

# Combine datasets
combined_df = pd.concat([non_sensical_df, gibberish_responses], ignore_index=True)

# Save the combined dataset to a new CSV file
combined_df.to_csv(output_file, index=False)
