
from minecraft_palette import MINECRAFT_PALETTE
import os
from PIL import Image
import numpy as np
from nbtlib import File, Compound, ByteArray, Int, String, Byte, Short


def closest_color_index(color, palette):
    r1, g1, b1 = map(int, color)  # Cast to signed ints
    distances = [((r1 - int(r2)) ** 2 + (g1 - int(g2)) ** 2 + (b1 - int(b2)) ** 2) for (r2, g2, b2) in palette]
    return int(np.argmin(distances))

def to_signed_byte(val):
    return val - 256 if val > 127 else val

# Convert a single image to .dat file
def image_to_map_dat(image_path, map_id, palette_rgb, output_dir="tiles/map"):
    img = Image.open(image_path).convert("RGB").resize((128, 128))
    pixels = np.array(img)

    # Convert pixels to Minecraft palette indices
    colors = []
    for row in pixels:
        for pixel in row:
            index = closest_color_index(tuple(pixel), palette_rgb)
            colors.append(to_signed_byte(index))
    os.makedirs(output_dir, exist_ok=True)

    tag = Compound({
    "data": Compound({
        "xCenter": Int(0),
        "zCenter": Int(0),
        "dimension": String("minecraft:overworld"),
        "scale": Byte(0),
        "trackingPosition": Byte(0),
        "locked": Byte(1),
        "height": Short(128),   
        "width": Short(128),    
        "colors": ByteArray(colors)
    })
})

    nbt_file = File(tag, root_name="data")
    output_path = os.path.join(output_dir, f"map_{map_id}.dat")
    nbt_file.save(output_path)
    return output_path

# Main runner to iterate over all _mc.png files and convert
def batch_convert_tiles_to_dat(palette_rgb, tiles_dir="tiles", output_dir="tiles/map"):
    files = sorted(f for f in os.listdir(tiles_dir) if f.endswith("_mc.png"))
    converted_files = []

    for i, file in enumerate(files, start=1):
        full_path = os.path.join(tiles_dir, file)
        dat_path = image_to_map_dat(full_path, map_id=i, palette_rgb=palette_rgb, output_dir=output_dir)
        converted_files.append(dat_path)

    return converted_files

if __name__ == "__main__":
    converted_paths = batch_convert_tiles_to_dat(MINECRAFT_PALETTE, tiles_dir="tiles", output_dir="tiles/map")
    print("Generated map dat files:")
    for path in converted_paths:
        print(path)
