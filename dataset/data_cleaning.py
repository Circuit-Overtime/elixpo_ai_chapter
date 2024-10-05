import pandas as pd

# Load the new data
new_data_df = pd.read_csv(r'C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\non_sensical_combined.csv')

# Remove commas from the 'response' column
new_data_df['response'] = new_data_df['response'].apply(lambda x: x.replace(',', ''))
new_data_df['response'] = new_data_df['response'].apply(lambda x: x.replace('\n', ' ').replace('\r', ' ').strip())

# Save the cleaned data to a new CSV file
new_data_df.to_csv('cleaned_new_data.csv', index=False)

print("Commas have been removed from 'response' column and data has been saved to 'cleaned_new_data.csv'")
