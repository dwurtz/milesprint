import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

// ─── State ─────────────────────────────────────────────────────
let currentColor = '#4fc3f7';
let currentMaterial = 'standard';

// ─── Three.js setup ────────────────────────────────────────────
const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a1a');
scene.fog = new THREE.Fog('#1a1a1a', 600, 1200);

const camera = new THREE.PerspectiveCamera(50, 1, 1, 2000);
camera.position.set(250, 200, 300);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);

// ─── Lighting (scaled for mm) ──────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(300, 500, 300);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -150;
dirLight.shadow.camera.right = 150;
dirLight.shadow.camera.top = 150;
dirLight.shadow.camera.bottom = -150;
dirLight.shadow.camera.near = 100;
dirLight.shadow.camera.far = 1000;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xcccccc, 0.3);
fillLight.position.set(-300, 150, -300);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0xff8844, 0.4, 800);
rimLight.position.set(-200, 300, -200);
scene.add(rimLight);

// ─── Build volume ─────────────────────────────────────────────
let buildSize = { x: 256, y: 256, z: 256 }; // mm
const buildVolumeGroup = new THREE.Group();
scene.add(buildVolumeGroup);

let gridHelper, axesHelper;

function makeTextSprite(text, fontSize = 18) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const ctx = c.getContext('2d');
  ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#555555';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 24);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0.6 });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(35, 8, 1);
  return sprite;
}

function rebuildBuildVolume() {
  // Clear old
  while (buildVolumeGroup.children.length) {
    const child = buildVolumeGroup.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
    buildVolumeGroup.remove(child);
  }

  const sx = buildSize.x;
  const sy = buildSize.y; // height
  const sz = buildSize.z;
  const hx = sx / 2;
  const hz = sz / 2;

  // Grid on ground
  const divisions = Math.round(Math.max(sx, sz) / 10);
  gridHelper = new THREE.GridHelper(Math.max(sx, sz), divisions, 0x383838, 0x2a2a2a);
  buildVolumeGroup.add(gridHelper);

  // Axes
  axesHelper = new THREE.AxesHelper(Math.min(sx, sz) * 0.15);
  buildVolumeGroup.add(axesHelper);

  // Build plate outline (bottom)
  const lineMat = new THREE.LineBasicMaterial({ color: 0x444444 });
  const plateOutline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hx, 0.1, -hz),
      new THREE.Vector3(hx, 0.1, -hz),
      new THREE.Vector3(hx, 0.1, hz),
      new THREE.Vector3(-hx, 0.1, hz),
    ]),
    lineMat,
  );
  buildVolumeGroup.add(plateOutline);

  // Height volume wireframe (4 vertical edges + top rectangle)
  const volMat = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4 });

  // 4 vertical edges
  const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  corners.forEach(([cx, cz]) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, 0, cz),
      new THREE.Vector3(cx, sy, cz),
    ]);
    buildVolumeGroup.add(new THREE.Line(geo, volMat));
  });

  // Top rectangle
  const topOutline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hx, sy, -hz),
      new THREE.Vector3(hx, sy, -hz),
      new THREE.Vector3(hx, sy, hz),
      new THREE.Vector3(-hx, sy, hz),
    ]),
    volMat,
  );
  buildVolumeGroup.add(topOutline);

  // Dimension labels — small and subtle
  const xLabel = makeTextSprite(`${sx}mm`);
  xLabel.position.set(0, -2, hz + 12);
  buildVolumeGroup.add(xLabel);

  const zLabel = makeTextSprite(`${sz}mm`);
  zLabel.position.set(hx + 12, -2, 0);
  buildVolumeGroup.add(zLabel);

  const yLabel = makeTextSprite(`${sy}mm`);
  yLabel.position.set(-hx - 12, sy / 2, -hz);
  buildVolumeGroup.add(yLabel);
}

// Ground plane (shadow receiver) — static, large
const groundGeo = new THREE.PlaneGeometry(600, 600);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.1;
ground.receiveShadow = true;
scene.add(ground);

rebuildBuildVolume();

// ─── Scene object ──────────────────────────────────────────────
let sceneObject = null;
let currentCode = null;

function clearSceneObject() {
  if (sceneObject) {
    sceneObject.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
    scene.remove(sceneObject);
    sceneObject = null;
  }
  // Disable iterate button when no object exists
  if (aiIterateBtn) {
    aiIterateBtn.disabled = true;
  }
}

function buildFromCode(code) {
  clearSceneObject();
  currentCode = code;

  const fn = new Function('THREE', code);
  const result = fn(THREE);

  if (result instanceof THREE.Object3D) {
    sceneObject = result instanceof THREE.Group ? result : new THREE.Group().add(result);
  } else {
    throw new Error('Code must return a THREE.Group or THREE.Object3D');
  }

  sceneObject.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(sceneObject);

  // Enable iterate button now that we have an object
  if (aiIterateBtn && !isIterating) {
    aiIterateBtn.disabled = false;
  }
}

// ─── Settings panel ────────────────────────────────────────────
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const settingsClose = document.getElementById('settings-close');

settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

settingsClose.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

document.getElementById('color-picker').addEventListener('input', (e) => {
  currentColor = e.target.value;
});

document.getElementById('material-select').addEventListener('change', (e) => {
  currentMaterial = e.target.value;
});

document.getElementById('toggle-grid').addEventListener('change', (e) => {
  if (gridHelper) gridHelper.visible = e.target.checked;
});

document.getElementById('toggle-axes').addEventListener('change', (e) => {
  if (axesHelper) axesHelper.visible = e.target.checked;
});

// Build size inputs
const sizeInputX = document.getElementById('max-size-x');
const sizeInputY = document.getElementById('max-size-y');
const sizeInputZ = document.getElementById('max-size-z');

function onSizeChange() {
  buildSize.x = Math.max(10, parseInt(sizeInputX.value) || 256);
  buildSize.y = Math.max(10, parseInt(sizeInputY.value) || 256);
  buildSize.z = Math.max(10, parseInt(sizeInputZ.value) || 256);
  rebuildBuildVolume();
  // Restore grid/axes visibility from toggle state
  if (gridHelper) gridHelper.visible = document.getElementById('toggle-grid').checked;
  if (axesHelper) axesHelper.visible = document.getElementById('toggle-axes').checked;
}

sizeInputX.addEventListener('change', onSizeChange);
sizeInputY.addEventListener('change', onSizeChange);
sizeInputZ.addEventListener('change', onSizeChange);

document.getElementById('toggle-wireframe').addEventListener('change', () => {
  // toggle wireframe overlay on current scene object
  if (!sceneObject) return;
  const checked = document.getElementById('toggle-wireframe').checked;
  // remove existing wireframe overlays
  const toRemove = [];
  sceneObject.traverse((c) => {
    if (c.isMesh && c.userData._wireframeOverlay) toRemove.push(c);
  });
  toRemove.forEach((c) => {
    c.geometry.dispose();
    c.material.dispose();
    c.parent.remove(c);
  });
  // add if checked
  if (checked) {
    const meshes = [];
    sceneObject.traverse((c) => {
      if (c.isMesh && !c.userData._wireframeOverlay) meshes.push(c);
    });
    meshes.forEach((m) => {
      const wf = new THREE.Mesh(
        m.geometry.clone(),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          wireframe: true,
          transparent: true,
          opacity: 0.15,
        }),
      );
      wf.userData._wireframeOverlay = true;
      wf.position.copy(m.position);
      wf.rotation.copy(m.rotation);
      wf.scale.copy(m.scale);
      m.parent.add(wf);
    });
  }
});

document.getElementById('reset-camera').addEventListener('click', () => {
  camera.position.set(250, 200, 300);
  controls.target.set(0, 0, 0);
  controls.update();
});

// ─── Screenshot capture ────────────────────────────────────────

// Calculate bounding box of the scene object
function getObjectBounds() {
  if (!sceneObject) return null;

  const box = new THREE.Box3().setFromObject(sceneObject);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  return { box, center, size, maxDim };
}

// Position camera to frame the object properly from a given angle
function frameCameraToObject(azimuthDeg, elevationDeg, distanceMultiplier = 2.5) {
  const bounds = getObjectBounds();
  if (!bounds) return;

  const { center, maxDim } = bounds;
  const distance = maxDim * distanceMultiplier;

  // Convert angles to radians
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;

  // Calculate camera position using spherical coordinates
  const x = center.x + distance * Math.cos(elevation) * Math.sin(azimuth);
  const y = center.y + distance * Math.sin(elevation);
  const z = center.z + distance * Math.cos(elevation) * Math.cos(azimuth);

  camera.position.set(x, y, z);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

// Capture a single screenshot
async function captureSingleScreenshot() {
  controls.update();
  renderer.render(scene, camera);
  await new Promise(resolve => requestAnimationFrame(resolve));
  const raw = renderer.domElement.toDataURL('image/png', 1.0);
  // Compress to reduce API payload
  const compressed = await compressImage(raw, 800, 0.75);
  return compressed;
}

// Capture multiple screenshots from different angles
async function captureMultiAngleScreenshots() {
  if (!sceneObject) return null;

  // Save current camera position
  const originalPosition = camera.position.clone();
  const originalTarget = controls.target.clone();

  const screenshots = [];

  // Define viewpoints: [azimuth, elevation, label]
  // Orthographic views + 1 isometric for context
  const viewpoints = [
    [0, 0, 'Front'],        // Straight front view
    [90, 0, 'Left'],        // Left side view
    [0, 90, 'Top'],         // Top-down view
    [45, 30, 'Isometric'],  // Angled view for context
  ];

  for (const [azimuth, elevation, label] of viewpoints) {
    frameCameraToObject(azimuth, elevation);
    const screenshot = await captureSingleScreenshot();
    screenshots.push({ screenshot, label });

    // Small delay between captures
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Restore original camera position
  camera.position.copy(originalPosition);
  controls.target.copy(originalTarget);
  controls.update();
  renderer.render(scene, camera);

  return screenshots;
}

// ─── AI prompt ─────────────────────────────────────────────────
const aiPrompt = document.getElementById('ai-prompt');
const aiBtn = document.getElementById('ai-generate');
const aiBtnText = document.getElementById('ai-btn-text');
const aiSpinner = document.getElementById('ai-spinner');
const aiStatus = document.getElementById('ai-status');

// Iterate button elements
const aiIterateBtn = document.getElementById('ai-iterate');
const aiIterateText = document.getElementById('ai-iterate-text');
const aiIterateSpinner = document.getElementById('ai-iterate-spinner');
const iterationStatus = document.getElementById('iteration-status');
const iterationScreenshot = document.getElementById('iteration-screenshot');

// Reference image elements
const referenceImageBtn = document.getElementById('reference-image-btn');
const referenceImageInput = document.getElementById('reference-image-input');
const referenceImagePreview = document.getElementById('reference-image-preview');
const referenceImageImg = document.getElementById('reference-image-img');
const referenceImageRemove = document.getElementById('reference-image-remove');

// Iteration state
let isIterating = false;
let iterationCount = 0;
const maxIterations = 5;
let stopRequested = false;

// Reference image state
let referenceImageData = null;

// Thinking panel
const thinkingPanel = document.getElementById('thinking-panel');
const thinkingTitle = document.getElementById('thinking-title');
const thinkingContent = document.getElementById('thinking-content');
const thinkingClose = document.getElementById('thinking-close');
const thinkingDot = thinkingPanel.querySelector('.thinking-dot');

thinkingClose.addEventListener('click', () => {
  // Don't allow closing during iteration
  if (isIterating) return;
  thinkingPanel.classList.add('hidden');
});

function showThinkingPanel() {
  thinkingContent.textContent = '';
  thinkingTitle.textContent = 'Thinking…';
  thinkingDot.classList.remove('done');
  thinkingPanel.classList.remove('hidden');
}

function appendThinking(text) {
  thinkingContent.textContent += text;
  thinkingContent.scrollTop = thinkingContent.scrollHeight;
}

function setThinkingStatus(label, done = false) {
  thinkingTitle.textContent = label;
  if (done) thinkingDot.classList.add('done');
}

function setAiLoading(loading) {
  aiBtn.disabled = loading;
  aiIterateBtn.disabled = loading || !sceneObject;
  aiBtnText.textContent = loading ? 'Thinking…' : 'Generate';
  aiSpinner.classList.toggle('hidden', !loading);
}

function setAiStatus(msg, type = '') {
  aiStatus.textContent = msg;
  aiStatus.className = `ai-status ${type}`;
}

// Stream SSE from /api/iterate with vision, returns parsed result object
async function callIterateApiStream(prompt, currentState, screenshots, referenceImage = null) {
  console.log('[Frontend] Calling /api/iterate', {
    hasPrompt: !!prompt,
    hasScreenshots: !!screenshots,
    screenshotCount: screenshots ? screenshots.length : 0,
    hasReferenceImage: !!referenceImage,
  });

  let res;
  try {
    res = await fetch('/api/iterate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, currentState, screenshots, referenceImage }),
    });
    console.log('[Frontend] /api/iterate response:', res.status, res.statusText);
  } catch (fetchErr) {
    console.error('[Frontend] Fetch error:', fetchErr);
    throw new Error(`Network error: ${fetchErr.message}`);
  }

  // If server returned JSON (error before streaming started)
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // Parse SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop(); // keep incomplete

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        switch (event.type) {
          case 'thinking_start':
            setThinkingStatus('Analyzing screenshot…');
            break;
          case 'thinking':
            appendThinking(event.text);
            break;
          case 'thinking_done':
            setThinkingStatus('Generating improved code…');
            break;
          case 'status':
            setThinkingStatus(event.text);
            break;
          case 'result':
            result = event;
            setThinkingStatus('Done', true);
            break;
          case 'error':
            throw new Error(event.message || 'Stream error');
        }
      }
    }
  }

  if (!result) throw new Error('No result received from stream');
  return result;
}

// Stream SSE from /api/generate, returns parsed result object
async function callApiStream(prompt, currentState, referenceImage = null) {
  console.log('[Frontend] Calling /api/generate', {
    hasPrompt: !!prompt,
    hasReferenceImage: !!referenceImage,
    referenceImageSize: referenceImage ? referenceImage.length : 0
  });

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentState, referenceImage }),
  });

  console.log('[Frontend] Response status:', res.status, res.statusText);

  // If server returned JSON (error before streaming started)
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // Parse SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop(); // keep incomplete

    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        switch (event.type) {
          case 'thinking_start':
            setThinkingStatus('Thinking…');
            break;
          case 'thinking':
            appendThinking(event.text);
            break;
          case 'thinking_done':
            setThinkingStatus('Generating code…');
            break;
          case 'status':
            setThinkingStatus(event.text);
            break;
          case 'result':
            result = event;
            setThinkingStatus('Done', true);
            break;
          case 'error':
            throw new Error(event.message || 'Stream error');
        }
      }
    }
  }

  if (!result) throw new Error('No result received from stream');
  return result;
}

async function handleAiGenerate() {
  const prompt = aiPrompt.value.trim();
  if (!prompt && !referenceImageData) {
    setAiStatus('Please enter a prompt or upload a reference image', 'error');
    return;
  }

  setAiLoading(true);
  setAiStatus('');
  showThinkingPanel();

  // Show reference image in the screenshot area if present
  if (referenceImageData) {
    displayReferenceImage(referenceImageData);
    appendThinking('📸 Analyzing reference image...\n\n');
  }

  const MAX_RETRIES = 2;

  try {
    const currentState = currentCode
      ? { mode: 'code', code: currentCode, buildSize }
      : { mode: 'empty', buildSize };

    let data = await callApiStream(prompt, currentState, referenceImageData);
    let lastError = null;

    // Try executing, auto-retry on runtime errors
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (!data.code) throw new Error('AI did not return code');

      try {
        buildFromCode(data.code);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[Attempt ${attempt + 1}] Code error:`, err.message);

        if (attempt < MAX_RETRIES) {
          setAiStatus(`Runtime error, retrying (${attempt + 1}/${MAX_RETRIES})…`, 'error');
          appendThinking(`\n\n⚠ Runtime error: ${err.message}\nRetrying…\n\n`);
          setThinkingStatus('Retrying…');
          thinkingDot.classList.remove('done');
          const fixPrompt = `The code you generated threw this error:\n${err.message}\n\nPlease fix the code. Here is the broken code:\n${data.code}`;
          data = await callApiStream(fixPrompt, { mode: 'empty', buildSize }, referenceImageData);
        }
      }
    }

    if (lastError) throw lastError;

    const name = data.name || 'object';
    let meshCount = 0;
    if (sceneObject) {
      sceneObject.traverse((c) => {
        if (c.isMesh) meshCount++;
      });
    }
    setAiStatus(`→ ${name} (${meshCount} meshes)`, 'success');
    setThinkingStatus('Done', true);

    // Hide reference image preview but keep data for iterations
    if (referenceImageData) {
      referenceImagePreview.classList.add('hidden');
    }
  } catch (err) {
    console.error('AI error:', err);
    setAiStatus(err.message, 'error');
    setThinkingStatus('Error', true);
  } finally {
    setAiLoading(false);
  }
}

aiBtn.addEventListener('click', handleAiGenerate);
aiPrompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleAiGenerate();
  }
});

// Auto-resize textarea
aiPrompt.addEventListener('input', () => {
  aiPrompt.style.height = 'auto';
  aiPrompt.style.height = Math.min(aiPrompt.scrollHeight, 120) + 'px';
});

// ─── Reference image upload ────────────────────────────────────
referenceImageBtn.addEventListener('click', () => {
  referenceImageInput.click();
});

referenceImageInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    setAiStatus('Please upload an image file', 'error');
    return;
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    setAiStatus('Image too large. Please upload an image smaller than 10MB', 'error');
    return;
  }

  try {
    // Convert to base64 with compression
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // Compress the image before storing
        const compressed = await compressImage(event.target.result, 1024, 0.8);
        referenceImageData = compressed;
        referenceImageImg.src = compressed;
        referenceImagePreview.classList.remove('hidden');
        setAiStatus('Reference image uploaded. Click Generate to create a 3D version.', 'success');
      } catch (compressionErr) {
        console.error('Image compression error:', compressionErr);
        setAiStatus('Failed to process image', 'error');
      }
    };
    reader.onerror = () => {
      setAiStatus('Failed to read image file', 'error');
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('Image upload error:', err);
    setAiStatus('Failed to upload image', 'error');
  }

  // Clear the input so the same file can be selected again
  e.target.value = '';
});

referenceImageRemove.addEventListener('click', () => {
  clearReferenceImage();
});

function clearReferenceImage() {
  referenceImageData = null;
  referenceImageImg.src = '';
  referenceImagePreview.classList.add('hidden');
  referenceImageInput.value = '';
  setAiStatus('');
}

// Compress image to reduce API payload size
async function compressImage(dataUrl, maxSize = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize;
          width = maxSize;
        } else {
          width = (width / height) * maxSize;
          height = maxSize;
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to JPEG with specified quality
      const compressed = canvas.toDataURL('image/jpeg', quality);
      console.log(`[Image] Compressed from ${(dataUrl.length / 1024).toFixed(1)}KB to ${(compressed.length / 1024).toFixed(1)}KB`);
      resolve(compressed);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ─── Iteration helper functions ────────────────────────────────
function setIterateButtonState(active) {
  aiIterateBtn.classList.toggle('active', active);
  aiIterateText.textContent = active ? 'Stop Iteration' : 'Iterate & Improve';
  aiIterateSpinner.classList.toggle('hidden', !active);
  aiBtn.disabled = active;

  // Update thinking panel close button state
  if (thinkingClose) {
    thinkingClose.style.opacity = active ? '0.3' : '1';
    thinkingClose.style.cursor = active ? 'not-allowed' : 'pointer';
  }
}

function updateIterationStatus(count, max, message = '') {
  if (message) {
    iterationStatus.textContent = message;
  } else if (count > 0) {
    iterationStatus.textContent = `Iteration ${count}/${max}`;
  } else {
    iterationStatus.textContent = '';
  }
}

function displayScreenshot(dataURL) {
  const img = document.createElement('img');
  img.src = dataURL;
  iterationScreenshot.innerHTML = '';
  iterationScreenshot.appendChild(img);
}

function displayMultipleScreenshots(screenshots, referenceImage = null) {
  iterationScreenshot.innerHTML = '';

  // Create a grid container
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
  grid.style.gap = '8px';

  // Add reference image first if available
  if (referenceImage) {
    const container = document.createElement('div');
    container.style.position = 'relative';

    const img = document.createElement('img');
    img.src = referenceImage;
    img.style.width = '100%';
    img.style.borderRadius = '4px';
    img.style.border = '2px solid #ff9800'; // Orange border to highlight reference

    const labelDiv = document.createElement('div');
    labelDiv.textContent = 'REFERENCE';
    labelDiv.style.position = 'absolute';
    labelDiv.style.bottom = '4px';
    labelDiv.style.left = '4px';
    labelDiv.style.fontSize = '9px';
    labelDiv.style.padding = '2px 6px';
    labelDiv.style.background = '#ff9800';
    labelDiv.style.color = '#000';
    labelDiv.style.borderRadius = '3px';
    labelDiv.style.fontWeight = '700';
    labelDiv.style.textTransform = 'uppercase';
    labelDiv.style.letterSpacing = '0.5px';

    container.appendChild(img);
    container.appendChild(labelDiv);
    grid.appendChild(container);
  }

  // Add current 3D model screenshots
  screenshots.forEach(({ screenshot, label }) => {
    const container = document.createElement('div');
    container.style.position = 'relative';

    const img = document.createElement('img');
    img.src = screenshot;
    img.style.width = '100%';
    img.style.borderRadius = '4px';
    img.style.border = '1px solid rgba(255, 255, 255, 0.1)';

    const labelDiv = document.createElement('div');
    labelDiv.textContent = label;
    labelDiv.style.position = 'absolute';
    labelDiv.style.bottom = '4px';
    labelDiv.style.left = '4px';
    labelDiv.style.fontSize = '9px';
    labelDiv.style.padding = '2px 6px';
    labelDiv.style.background = 'rgba(0, 0, 0, 0.7)';
    labelDiv.style.color = '#aaa';
    labelDiv.style.borderRadius = '3px';
    labelDiv.style.fontWeight = '600';
    labelDiv.style.textTransform = 'uppercase';
    labelDiv.style.letterSpacing = '0.5px';

    container.appendChild(img);
    container.appendChild(labelDiv);
    grid.appendChild(container);
  });

  iterationScreenshot.appendChild(grid);
}

function displayReferenceImage(imageData) {
  iterationScreenshot.innerHTML = '';

  const container = document.createElement('div');
  container.style.position = 'relative';

  const label = document.createElement('div');
  label.textContent = 'Reference Image';
  label.style.fontSize = '10px';
  label.style.color = '#999';
  label.style.marginBottom = '6px';
  label.style.fontWeight = '600';
  label.style.textTransform = 'uppercase';
  label.style.letterSpacing = '0.5px';

  const img = document.createElement('img');
  img.src = imageData;
  img.style.width = '100%';
  img.style.borderRadius = '6px';
  img.style.border = '1px solid rgba(255, 255, 255, 0.1)';

  container.appendChild(label);
  container.appendChild(img);
  iterationScreenshot.appendChild(container);
}

function requestStopIteration() {
  stopRequested = true;
  updateIterationStatus(iterationCount, maxIterations, 'Stopping after this iteration…');
}

// ─── Iterative improvement loop ────────────────────────────────
async function handleIterativeImprovement() {
  if (!sceneObject || !currentCode) {
    setAiStatus('No object to improve. Generate something first!', 'error');
    return;
  }

  isIterating = true;
  iterationCount = 0;
  stopRequested = false;
  setIterateButtonState(true);
  showThinkingPanel();
  setAiStatus('');

  // Keep thinking panel open during iteration
  thinkingPanel.classList.remove('hidden');

  const MAX_RETRIES = 2;

  // If there's a reference image, use it to guide iterations
  let iterationPrompt;
  if (referenceImageData) {
    iterationPrompt = aiPrompt.value.trim() || 'Make this 3D model match the reference image more closely. Improve accuracy, proportions, and details.';
  } else {
    iterationPrompt = aiPrompt.value.trim() || 'Improve this 3D object to make it more detailed and visually appealing';
  }

  try {
    while (iterationCount < maxIterations && !stopRequested) {
      iterationCount++;
      updateIterationStatus(iterationCount, maxIterations);

      // Capture multiple screenshots from different angles
      setThinkingStatus(`Capturing screenshots (${iterationCount}/${maxIterations})…`);
      let screenshots;
      try {
        screenshots = await captureMultiAngleScreenshots();
        if (!screenshots || screenshots.length === 0) {
          throw new Error('No screenshots captured');
        }
        // Display screenshots with reference image if available
        displayMultipleScreenshots(screenshots, referenceImageData);
      } catch (err) {
        throw new Error(`Screenshot capture failed: ${err.message}`);
      }

      // Call vision API with all screenshots (and reference image if available)
      thinkingContent.textContent += `\n\n─── Iteration ${iterationCount}/${maxIterations} ───\n`;
      thinkingContent.textContent += `📸 Captured ${screenshots.length} angles: ${screenshots.map(s => s.label).join(', ')}\n`;
      if (referenceImageData) {
        thinkingContent.textContent += `🎯 Using reference image to guide improvements\n`;
      }
      thinkingContent.textContent += `\n`;
      thinkingContent.scrollTop = thinkingContent.scrollHeight;

      // Update status to show we're calling the API
      setThinkingStatus(`Analyzing (${iterationCount}/${maxIterations})...`);
      thinkingDot.classList.remove('done');

      const currentState = { mode: 'code', code: currentCode, buildSize };

      // Include reference image in iteration if it exists
      let data;
      try {
        data = await callIterateApiStream(iterationPrompt, currentState, screenshots, referenceImageData);
      } catch (apiErr) {
        appendThinking(`\n\n❌ API Error: ${apiErr.message}\n\n`);
        throw apiErr;
      }

      // Show observations if provided
      if (data.observations) {
        thinkingContent.textContent += `\n📊 Observations: ${data.observations}\n\n`;
        thinkingContent.scrollTop = thinkingContent.scrollHeight;
      }

      // Save the current working code before attempting new code
      const previousCode = currentCode;
      let lastError = null;

      // Try executing, auto-retry on runtime errors
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (!data.code) throw new Error('AI did not return code');

        try {
          buildFromCode(data.code);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          console.warn(`[Iteration ${iterationCount}, Attempt ${attempt + 1}] Code error:`, err.message);

          if (attempt < MAX_RETRIES) {
            appendThinking(`\n\n⚠ Runtime error: ${err.message}\nRetrying…\n\n`);
            setThinkingStatus('Retrying…');
            thinkingDot.classList.remove('done');
            const fixPrompt = `The code you generated threw this error:\n${err.message}\n\nPlease fix the code. Here is the broken code:\n${data.code}`;
            // Pass previous working code as context for retry
            data = await callIterateApiStream(fixPrompt, { mode: 'code', code: previousCode, buildSize }, screenshots, referenceImageData);
          } else {
            // Final retry failed - restore previous working code
            appendThinking(`\n\n⚠ All retry attempts failed. Keeping iteration ${iterationCount - 1} result.\n\n`);
            try {
              buildFromCode(previousCode);
              lastError = null; // Don't throw - we recovered
            } catch (restoreErr) {
              throw new Error(`Failed to restore previous code: ${restoreErr.message}`);
            }
            break;
          }
        }
      }

      if (lastError) throw lastError;

      // Small delay between iterations
      if (iterationCount < maxIterations && !stopRequested) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Final status
    if (stopRequested) {
      updateIterationStatus(iterationCount, maxIterations, `Stopped at iteration ${iterationCount}/${maxIterations}`);
      setAiStatus(`Stopped at iteration ${iterationCount}/${maxIterations}`, 'success');
    } else {
      updateIterationStatus(iterationCount, maxIterations, `Completed ${maxIterations} iterations`);
      setAiStatus(`Completed ${maxIterations} iterations`, 'success');
    }
    setThinkingStatus('Done', true);
  } catch (err) {
    console.error('Iteration error:', err);
    updateIterationStatus(iterationCount, maxIterations, 'Error during iteration');
    setAiStatus(err.message, 'error');
    setThinkingStatus('Error', true);
  } finally {
    isIterating = false;
    stopRequested = false;
    setIterateButtonState(false);
  }
}

aiIterateBtn.addEventListener('click', () => {
  if (isIterating) {
    requestStopIteration();
  } else {
    handleIterativeImprovement();
  }
});

// Auto-resize textarea
aiPrompt.addEventListener('input', () => {
  aiPrompt.style.height = 'auto';
  aiPrompt.style.height = Math.min(aiPrompt.scrollHeight, 120) + 'px';
});

// ─── STL Export ────────────────────────────────────────────────
document.getElementById('export-stl').addEventListener('click', () => {
  if (!sceneObject) return;
  const exporter = new STLExporter();

  const result = exporter.parse(sceneObject, { binary: true });
  const blob = new Blob([result], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'generated.stl';
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Resize ────────────────────────────────────────────────────
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w > 0 && h > 0 && (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio)) {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// ─── Animate ───────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  resize();
  renderer.render(scene, camera);
}

// ─── Init ──────────────────────────────────────────────────────
resize();
animate();
