import pandas as pd

# Load the gibberish and meaningful datasets
gibberish_df = pd.read_csv(r'C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\non-sensical.csv')  # Assuming label = 0
meaningful_df = pd.read_csv(r'C:\Users\ELIXPO\Desktop\elixpo.ai\Dataset\prompts_collection.csv')  # Assuming label = 1

# Combine both datasets
combined_df = pd.concat([gibberish_df, meaningful_df])

# Save combined dataset as final.csv
combined_df.to_csv('Combined-non_sensical-meaningful.csv', index=False)

print("Final dataset saved as Combined-non_sensical-meaningful.csv")
