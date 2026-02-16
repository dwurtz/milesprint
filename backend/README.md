# TripoSR Backend Service

Python backend service that converts reference images to high-fidelity 3D meshes using TripoSR.

## Requirements

- Python 3.10+
- CUDA-capable GPU with 6-8GB VRAM (or CPU fallback)
- ~4GB disk space for model weights

## Setup

1. Create virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Download TripoSR model weights (automatic on first run):
The model will be downloaded from Hugging Face on first startup (~2GB).

## Usage

Start the service:
```bash
python triposr_service.py
```

The service will run on `http://localhost:5000`

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "device": "cuda",
  "model": "TripoSR"
}
```

### POST /generate
Generate 3D mesh from reference image.

**Request:**
```json
{
  "image": "data:image/jpeg;base64,/9j/...",
  "resolution": 256
}
```

**Response:**
Binary GLB file (application/octet-stream)

**Parameters:**
- `image` (required): Base64-encoded image with data URL prefix
- `resolution` (optional): Marching cubes resolution (128-512, default 256)
  - 128: Fast, lower detail
  - 256: Balanced (recommended)
  - 512: Slower, highest detail

## Performance

- Cold start: ~5-10 seconds (model loading)
- Generation time:
  - GPU (RTX 3080): ~1-2 seconds per model
  - CPU: ~30-60 seconds per model

## Docker Deployment (Optional)

```dockerfile
FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3 python3-pip
COPY requirements.txt .
RUN pip3 install -r requirements.txt

COPY triposr_service.py .
EXPOSE 5000

CMD ["python3", "triposr_service.py"]
```

Build and run:
```bash
docker build -t triposr-service .
docker run --gpus all -p 5000:5000 triposr-service
```
