import os
import shutil

def copy_svg_icons():
    source_dir = r"C:\Users\ayush\Desktop\lucide\icons"
    dest_dir = "all_icons/tech"
    
    # Create destination directory if it doesn't exist
    os.makedirs(dest_dir, exist_ok=True)
    
    # Get existing files in destination (with _ instead of -)
    existing_files = set()
    if os.path.exists(dest_dir):
        for file in os.listdir(dest_dir):
            if file.endswith('.svg'):
                existing_files.add(file.replace('-', '_'))
    
    # Process source directory
    if os.path.exists(source_dir):
        for file in os.listdir(source_dir):
            if file.endswith('.svg'):
                # Convert filename for comparison
                normalized_name = file.replace('-', '_')
                
                # Skip if file already exists
                if normalized_name in existing_files:
                    print(f"Skipping {file} - already exists")
                    continue
                
                # Copy file with converted name
                source_path = os.path.join(source_dir, file)
                dest_filename = file.replace('-', '_')
                dest_path = os.path.join(dest_dir, dest_filename)
                
                shutil.copy2(source_path, dest_path)
                print(f"Copied {file} -> {dest_filename}")
    else:
        print(f"Source directory not found: {source_dir}")

if __name__ == "__main__":
    copy_svg_icons()