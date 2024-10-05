# aws written as a matadata upscale changer for images with upto 4MP perfection
from PIL import Image

def upscale_image(input_path, output_path, target_pixels=4000000):
    # Open the image file
    with Image.open(input_path) as img:
        # Get the original dimensions
        original_width, original_height = img.size
        aspect_ratio = original_width / original_height
        
        # Calculate the new dimensions for 4MP while preserving aspect ratio
        new_height = int((target_pixels / aspect_ratio) ** 0.5)
        new_width = int(new_height * aspect_ratio)
        
        # Resize the image to the new dimensions using LANCZOS filter
        upscaled_img = img.resize((new_width, new_height), Image.LANCZOS)
        
        # Save the upscaled image to the output path
        upscaled_img.save(output_path)
        print(f"Image saved to {output_path} with size {new_width}x{new_height}")

# Example usage
input_image_path = r"path to original image"
output_image_path = r"image.jpg"

upscale_image(input_image_path, output_image_path)
