import os
import torch
import time
import requests
from flask import Flask, request, jsonify
from PIL import Image
from io import BytesIO
from upscaler import upscale_image
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Configurations
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5MB limit
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg"}

# Ensure upload folder exists
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

def allowed_file(filename):
    """Check if the uploaded file is allowed."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route("/upscale", methods=["POST"])
def upscale():
    """Handles image upscaling."""
    start_time = time.time()
    
    # Check if image is provided via URL
    image_url = request.json.get("image_url") if request.json else None
    file = request.files.get("image")

    if not image_url and not file:
        return jsonify({"error": "No image provided. Use 'image_url' or 'image' field."}), 400

    try:
        # Load image from URL
        if image_url:
            response = requests.get(image_url, stream=True, timeout=5)
            if response.status_code != 200:
                return jsonify({"error": "Failed to fetch image from URL"}), 400
            img = Image.open(BytesIO(response.content)).convert("RGB")

        # Load image from uploaded file
        elif file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(file_path)
            img = Image.open(file_path).convert("RGB")

        else:
            return jsonify({"error": "Invalid file format"}), 400

        # Run upscaling
        upscaled_image_path = upscale_image(img)
        
        elapsed_time = round(time.time() - start_time, 2)
        return jsonify({
            "message": "Upscaling complete!",
            "upscaled_image_url": f"https://your-cdn.com/{upscaled_image_path}",
            "processing_time": f"{elapsed_time} sec"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
