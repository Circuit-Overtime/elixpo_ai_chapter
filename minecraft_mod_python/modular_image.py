

import os
import math
import requests
from io import BytesIO
from PIL import Image


class ImageMapConverter:
    def __init__(self, output_dir="./tiles"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def fetch_image(self, url):
        response = requests.get(url)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert("RGBA")

    def resize_image(self, image):
        w, h = image.size
        new_w = math.ceil(w / 128) * 128
        new_h = math.ceil(h / 128) * 128
        return image.resize((new_w, new_h), Image.LANCZOS), (new_w, new_h)

    def split_into_tiles(self, image, size=(128, 128)):
        w, h = image.size
        tiles = []
        count = 1

        for y in range(0, h, size[1]):
            for x in range(0, w, size[0]):
                tile = image.crop((x, y, x + size[0], y + size[1]))
                tile_filename = f"map_{count}.png"
                tile_path = os.path.join(self.output_dir, tile_filename)
                tile.save(tile_path)
                tiles.append(tile_filename)
                count += 1

        return tiles, w // size[0], h // size[1]

    def process(self, image_url):
        img = self.fetch_image(image_url)
        resized_img, new_size = self.resize_image(img)
        tiles, cols, rows = self.split_into_tiles(resized_img)
        return {
            "original_size": img.size,
            "resized_to": new_size,
            "tile_count": len(tiles),
            "tiles": tiles,
            "columns": cols,
            "rows": rows
        }


# Local test
if __name__ == "__main__":
    sample_url = "https://image.pollinations.ai/prompt/a cute girl?nologo=true&referrer=elixpoart&width=2048&height=2048&seed=12"
    converter = ImageMapConverter()
    result = converter.process(sample_url)

    print("=== Conversion Complete ===")
    print("Original size:", result["original_size"])
    print("Resized to:", result["resized_to"])
    print("Tiles generated:", result["tile_count"])
    print("Tile files:", result["tiles"])
    print("Grid layout:", result["columns"], "x", result["rows"])
