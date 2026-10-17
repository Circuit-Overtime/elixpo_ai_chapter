import os
import requests
from tqdm import tqdm

API_BASE = "https://api.github.com/repos/atisawd/boxicons/contents/svg"
RAW_BASE = "https://raw.githubusercontent.com/atisawd/boxicons/master/svg"
DEST_FOLDER = "all_icons"
os.makedirs(DEST_FOLDER, exist_ok=True)


def get_svg_files(category):
    url = f"{API_BASE}/{category}"
    res = requests.get(url)
    files = res.json()

    svg_files = [file['name'] for file in files if file['name'].endswith('.svg')]
    return svg_files


def clean_filename(category, filename):
    prefix = {'regular': 'bx-', 'solid': 'bxs-', 'logos': 'bxl-'}[category]
    name = filename.replace(prefix, '').replace('.svg', '')
    name = name.replace('-', '_')
    return name + '.svg'


def download_file(category, filename):
    raw_url = f"{RAW_BASE}/{category}/{filename}"
    cleaned_name = clean_filename(category, filename)
    dest_path = os.path.join(DEST_FOLDER, cleaned_name)

    response = requests.get(raw_url)
    if response.status_code == 200:
        with open(dest_path, 'wb') as f:
            f.write(response.content)
    else:
        print(f"❌ Failed to download: {raw_url}")


def main():
    categories = ['regular', 'solid', 'logos']
    for category in categories:
        svg_files = get_svg_files(category)
        for filename in tqdm(svg_files, desc=f"Downloading {category} icons"):
            download_file(category, filename)

    print(f"✅ All icons saved to: {DEST_FOLDER}/")


if __name__ == "__main__":
    main()
