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
async function captureScreenshot() {
  // Ensure the scene is fully rendered
  controls.update();
  renderer.render(scene, camera);

  // Small delay to ensure render completes
  await new Promise(resolve => requestAnimationFrame(resolve));

  return renderer.domElement.toDataURL('image/png', 1.0);
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

// Iteration state
let isIterating = false;
let iterationCount = 0;
const maxIterations = 5;
let stopRequested = false;

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
async function callIterateApiStream(prompt, currentState, screenshot) {
  const res = await fetch('/api/iterate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentState, screenshot }),
  });

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
async function callApiStream(prompt, currentState) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, currentState }),
  });

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
  if (!prompt) return;

  setAiLoading(true);
  setAiStatus('');
  showThinkingPanel();

  const MAX_RETRIES = 2;

  try {
    const currentState = currentCode
      ? { mode: 'code', code: currentCode, buildSize }
      : { mode: 'empty', buildSize };

    let data = await callApiStream(prompt, currentState);
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
          data = await callApiStream(fixPrompt, { mode: 'empty', buildSize });
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
  const iterationPrompt = aiPrompt.value.trim() || 'Improve this 3D object to make it more detailed and visually appealing';

  try {
    while (iterationCount < maxIterations && !stopRequested) {
      iterationCount++;
      updateIterationStatus(iterationCount, maxIterations);

      // Capture screenshot
      setThinkingStatus(`Capturing screenshot (${iterationCount}/${maxIterations})…`);
      let screenshot;
      try {
        screenshot = await captureScreenshot();
        displayScreenshot(screenshot);
      } catch (err) {
        throw new Error(`Screenshot capture failed: ${err.message}`);
      }

      // Call vision API
      thinkingContent.textContent += `\n\n─── Iteration ${iterationCount}/${maxIterations} ───\n\n`;
      thinkingContent.scrollTop = thinkingContent.scrollHeight;
      const currentState = { mode: 'code', code: currentCode, buildSize };
      let data = await callIterateApiStream(iterationPrompt, currentState, screenshot);

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
            data = await callIterateApiStream(fixPrompt, { mode: 'code', code: previousCode, buildSize }, screenshot);
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
