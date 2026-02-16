# 3D Object Studio with TripoSR

AI-powered 3D model generation from reference images using TripoSR neural reconstruction. Creates high-fidelity 3D models with curved surfaces and fine details, optimized for FDM 3D printing.

## Features

- **High-Fidelity Generation**: Uses TripoSR to create detailed 3D meshes from single images
- **Curved Surfaces**: Neural reconstruction produces smooth, organic geometry (not primitives)
- **3D Print Ready**: Validates printability constraints (overhangs, wall thickness, manifold geometry)
- **Real-Time Preview**: Interactive Three.js viewport with OrbitControls
- **STL Export**: One-click export for 3D printing
- **Multi-View Screenshots**: Capture from Front, Left, Top, and Isometric angles
- **Iterative Refinement**: Vision-guided improvement loop (future enhancement)

## Architecture

```
Frontend (Vite + Three.js)
    ↓
Reference Image Upload
    ↓
Python Backend (Flask + TripoSR)
    ↓
Generate GLB Mesh
    ↓
Load with GLTFLoader
    ↓
Validate Printability
    ↓
Display + STL Export
```

## Setup

### 1. Frontend Setup

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The frontend will run on `http://localhost:5174`

### 2. Backend Setup (TripoSR Service)

**Requirements:**
- Python 3.10+
- CUDA GPU with 6-8GB VRAM (or CPU for slower generation)
- ~4GB disk space for model weights

**Installation:**

```bash
cd backend
./setup.sh
```

Or manually:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Start the service:**

```bash
cd backend
source venv/bin/activate
python triposr_service.py
```

The backend will run on `http://localhost:5000`

## Usage

1. **Start both services:**
   - Terminal 1: `npm run dev` (frontend)
   - Terminal 2: `cd backend && python triposr_service.py` (TripoSR)

2. **Upload a reference image:**
   - Click the paperclip icon (📎)
   - Select an image of an object you want to recreate in 3D
   - Best results: clear object on plain background, good lighting

3. **Generate 3D model:**
   - Click "Generate"
   - TripoSR will process the image (~1-2 seconds on GPU)
   - The high-fidelity 3D mesh will appear in the viewport

4. **Refine and export:**
   - Use mouse to rotate/zoom the model
   - Adjust settings (color, material, wireframe) via the gear icon
   - Click "Export STL" to download for 3D printing

## Technology Stack

**Frontend:**
- **Vite** - Build tool and dev server
- **Three.js** - 3D rendering engine
- **GLTFLoader** - Load meshes from TripoSR

**Backend:**
- **Flask** - Python web framework
- **TripoSR** - State-of-the-art image-to-3D model (VAST AI Research)
- **PyTorch** - ML framework
- **Trimesh** - Mesh processing and GLB export
- **rembg** - Background removal

## Performance

- **GPU (RTX 3080):** ~1-2 seconds per model
- **CPU:** ~30-60 seconds per model
- **Model size:** ~50-200KB GLB files
- **Mesh detail:** 50K-200K triangles (configurable)

## 3D Printing Constraints

Generated models follow FDM printing requirements:
- **Overhang limit:** <45° angles (support-free when possible)
- **Wall thickness:** Minimum 1.2mm for structural integrity
- **Manifold geometry:** All meshes are watertight and printable
- **Base stability:** Models sit flat on build plate (y=0)
- **Build volume:** Configurable (default 256×256×256mm)

## Configuration

### Frontend Settings

Edit `/src/main.js`:
```javascript
const TRIPOSR_BACKEND = 'http://localhost:5000';  // Backend URL
```

### Backend Resolution

Higher resolution = more detail but slower:
- `128`: Fast, lower detail
- `256`: Balanced (recommended)
- `512`: Slower, highest detail

Edit request in frontend or backend config.

## Troubleshooting

### Backend won't start

**Issue:** `ModuleNotFoundError: No module named 'tsr'`
- **Fix:** Ensure TripoSR is installed: `pip install git+https://github.com/VAST-AI-Research/TripoSR.git`

**Issue:** `CUDA out of memory`
- **Fix:** Use lower resolution (128) or CPU mode
- **Fix:** Close other GPU-intensive applications

### Frontend can't connect to backend

**Issue:** `Failed to fetch` or CORS error
- **Fix:** Ensure backend is running on port 5000
- **Fix:** Check `TRIPOSR_BACKEND` URL in `src/main.js`

### Model looks wrong

**Issue:** Missing details or distorted geometry
- **Fix:** Use higher quality reference image (well-lit, clear object)
- **Fix:** Try removing background before upload
- **Fix:** Increase resolution to 512 in backend

## Future Enhancements

- [ ] Printability validation UI (overhang visualization)
- [ ] Mesh simplification for faster export
- [ ] Multi-resolution LOD generation
- [ ] Iterative refinement with Claude vision feedback
- [ ] Texture mapping support
- [ ] Support structure auto-generation

## Credits

- **TripoSR**: [VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR)
- **Three.js**: [threejs.org](https://threejs.org/)
- Built with Claude Sonnet 4.5

## License

MIT License (see LICENSE file)

TripoSR is licensed under MIT by VAST AI Research.
