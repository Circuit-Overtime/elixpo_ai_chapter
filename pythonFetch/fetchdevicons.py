import os
import shutil

def fetch_devicons():
    source_dir = r"C:\Users\ayush\Desktop\devicon\icons"
    destination_dir = "all_icons/icons"
    
    # Create destination directory if it doesn't exist
    os.makedirs(destination_dir, exist_ok=True)
    
    # Iterate through each folder in the icons directory
    for folder_name in os.listdir(source_dir):
        folder_path = os.path.join(source_dir, folder_name)
        
        # Check if it's a directory
        if os.path.isdir(folder_path):
            # Look for SVG files in the folder
            for file_name in os.listdir(folder_path):
                if file_name.endswith('.svg'):
                    # Replace - with _ in filename
                    new_file_name = file_name.replace('-', '_')
                    
                    source_file = os.path.join(folder_path, file_name)
                    destination_file = os.path.join(destination_dir, new_file_name)
                    
                    # Copy the file
                    shutil.copy2(source_file, destination_file)
                    print(f"Copied: {file_name} -> {new_file_name}")

if __name__ == "__main__":
    fetch_devicons()