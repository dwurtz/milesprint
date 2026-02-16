#!/bin/bash

# TripoSR Backend Setup Script

set -e

echo "=========================================="
echo "  TripoSR Backend Setup"
echo "=========================================="
echo ""

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not found"
    echo "   Please install Python 3.10+ first"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1-2)
echo "✅ Found Python $PYTHON_VERSION"

# Check for CUDA
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected"
    nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
else
    echo "⚠️  No NVIDIA GPU detected - will use CPU (slower)"
fi

echo ""
echo "Creating virtual environment..."
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo ""
echo "Installing dependencies..."
echo "(This may take 5-10 minutes)"
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "Cloning TripoSR repository..."
if [ ! -d "TripoSR" ]; then
    git clone https://github.com/VAST-AI-Research/TripoSR.git
    echo "✅ TripoSR cloned"
else
    echo "✅ TripoSR already exists"
fi

echo ""
echo "Installing torchmcubes (required for TripoSR)..."
pip install torchmcubes

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo "=========================================="
echo ""
echo "To start the TripoSR service:"
echo "  1. cd backend"
echo "  2. source venv/bin/activate"
echo "  3. python triposr_service.py"
echo ""
echo "The service will run on http://localhost:5000"
echo ""
