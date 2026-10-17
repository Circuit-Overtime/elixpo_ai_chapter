import json

with open('metadata.json', 'r') as file:
    metadata = json.load(file)

# Extract categories from descriptions
categories = set()

for icon_name, icon_data in metadata.items():
    description = icon_data['category'].lower()
    print(description)

# Print all unique categories
print("Categories found:")
for category in sorted(categories):
    print(f"- {category}")
