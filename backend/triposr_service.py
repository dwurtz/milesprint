"""
TripoSR Image-to-3D Backend Service

Provides a Flask API for converting images to 3D meshes using TripoSR.
"""

import os
import tempfile
import base64
from io import BytesIO
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image
import torch
import numpy as np
from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground

app = Flask(__name__)
CORS(app)

# Initialize TripoSR model (load once at startup)
print("Loading TripoSR model...")
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

model = TSR.from_pretrained(
    "stabilityai/TripoSR",
    config_name="config.yaml",
    weight_name="model.ckpt",
)
model.renderer.set_chunk_size(8192)
model.to(device)

print("TripoSR model loaded successfully!")


def process_image(image_data: str) -> Image.Image:
    """
    Process base64 image data and prepare for TripoSR.

    Args:
        image_data: Base64-encoded image string (with data:image/... prefix)

    Returns:
        PIL Image ready for TripoSR processing
    """
    # Remove data URL prefix if present
    if ',' in image_data:
        image_data = image_data.split(',', 1)[1]

    # Decode base64
    image_bytes = base64.b64decode(image_data)
    image = Image.open(BytesIO(image_bytes))

    # Convert to RGB if necessary
    if image.mode != 'RGB':
        image = image.convert('RGB')

    # Remove background (TripoSR works best with isolated objects)
    print("Removing background...")
    image = remove_background(image, rembg_session=None)

    # Resize and center the foreground
    print("Resizing foreground...")
    image = resize_foreground(image, 0.85)

    return image


def generate_mesh(image: Image.Image, mc_resolution: int = 256) -> bytes:
    """
    Generate 3D mesh from image using TripoSR.

    Args:
        image: PIL Image of object
        mc_resolution: Marching cubes resolution (higher = more detail, slower)

    Returns:
        GLB file bytes
    """
    print(f"Generating 3D mesh (resolution: {mc_resolution})...")

    with torch.no_grad():
        # Run TripoSR
        scene_codes = model([image], device=device)

        # Extract mesh using marching cubes
        meshes = model.extract_mesh(scene_codes, resolution=mc_resolution)
        mesh = meshes[0]

    # Export to GLB format
    print("Exporting to GLB...")
    with tempfile.NamedTemporaryFile(suffix='.glb', delete=False) as tmp:
        mesh.export(tmp.name, file_type='glb')
        tmp_path = tmp.name

    # Read GLB bytes
    with open(tmp_path, 'rb') as f:
        glb_bytes = f.read()

    # Cleanup temp file
    os.unlink(tmp_path)

    print(f"Mesh generated successfully! Size: {len(glb_bytes) / 1024:.1f}KB")
    return glb_bytes


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'device': device,
        'model': 'TripoSR'
    })


@app.route('/generate', methods=['POST'])
def generate():
    """
    Generate 3D mesh from reference image.

    Request JSON:
        {
            "image": "data:image/jpeg;base64,/9j/...",  // Base64 image
            "resolution": 256  // Optional: marching cubes resolution (default 256)
        }

    Response:
        GLB file (application/octet-stream)
    """
    try:
        data = request.get_json()

        if not data or 'image' not in data:
            return jsonify({'error': 'Missing image data'}), 400

        image_data = data['image']
        resolution = data.get('resolution', 256)

        # Validate resolution
        if resolution < 128 or resolution > 512:
            return jsonify({'error': 'Resolution must be between 128 and 512'}), 400

        # Process image
        print("Processing image...")
        image = process_image(image_data)

        # Generate mesh
        glb_bytes = generate_mesh(image, mc_resolution=resolution)

        # Return GLB file
        return send_file(
            BytesIO(glb_bytes),
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name='model.glb'
        )

    except Exception as e:
        print(f"Error during generation: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("TripoSR Service Ready!")
    print("="*60)
    print(f"Device: {device}")
    print("Endpoints:")
    print("  GET  /health   - Health check")
    print("  POST /generate - Generate 3D mesh from image")
    print("="*60 + "\n")

    app.run(host='0.0.0.0', port=5000, debug=False)
