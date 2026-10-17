import json
import os

def merge_metadata_files():
    # Define the input metadata files
    metadata_files = [
        'metadata.json',
        'metadata1.json', 
        'metadata2.json',
        'metadata3.json'
    ]
    
    # Initialize empty dictionary to store merged data
    merged_data = {}
    
    # Get the parent directory (one level up from pythonFetch)
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Read and merge each metadata file
    for filename in metadata_files:
        filepath = os.path.join(parent_dir, filename)
        
        try:
            with open(filepath, 'r', encoding='utf-8') as file:
                data = json.load(file)
                merged_data.update(data)
                print(f"Successfully merged {filename} - {len(data)} entries")
        except FileNotFoundError:
            print(f"Warning: {filename} not found")
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON in {filename}")
    
    # Write merged data to icons.json
    output_path = os.path.join(parent_dir, 'icons.json')
    
    try:
        with open(output_path, 'w', encoding='utf-8') as file:
            json.dump(merged_data, file, indent=2, ensure_ascii=False)
        
        print(f"\nMerge completed successfully!")
        print(f"Total entries in icons.json: {len(merged_data)}")
        print(f"Output file: {output_path}")
        
    except Exception as e:
        print(f"Error writing to icons.json: {e}")

if __name__ == "__main__":
    merge_metadata_files()