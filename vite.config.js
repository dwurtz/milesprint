import { defineConfig, loadEnv } from 'vite';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_VISION_MODEL = 'claude-opus-4-6';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 5174,
    },
    plugins: [
      {
        name: 'anthropic-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const isGenerate = req.url === '/api/generate' && req.method === 'POST';
            const isIterate = req.url === '/api/iterate' && req.method === 'POST';

            if (!isGenerate && !isIterate) {
              return next();
            }

            const sendJson = (status, obj) => {
              res.statusCode = status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(obj));
            };

            const sendSSE = (type, data) => {
              res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
            };

            try {
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const rawBody = Buffer.concat(chunks).toString();

              let parsed;
              try {
                parsed = JSON.parse(rawBody);
              } catch {
                return sendJson(400, { error: 'Invalid JSON body' });
              }

              const { prompt, currentState, screenshot } = parsed;
              if (!prompt) {
                return sendJson(400, { error: 'Missing prompt field' });
              }

              const isVisionMode = isIterate && screenshot;

              const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
              if (!apiKey) {
                return sendJson(500, {
                  error: 'ANTHROPIC_API_KEY not set. Add it to .env or export in your shell.',
                });
              }

              console.log(`[AI] Prompt: "${prompt}" | Mode: ${currentState?.mode} | Vision: ${isVisionMode}`);

              const visionSystemPrompt = `You are an expert Three.js 3D modeler with vision capabilities. You can see a screenshot of the current 3D object and improve it based on visual analysis.

You are looking at a screenshot of a 3D object rendered in a Three.js scene. Your task is to analyze what you see and generate improved JavaScript code to make the object more detailed, visually appealing, and realistic.

IMPORTANT: When analyzing the screenshot, consider:
- Overall shape and proportions - are they accurate?
- Level of detail - can more geometric details be added?
- Visual balance and composition
- Realism - does it look like the intended object?
- Areas that could use more refinement or complexity

You respond ONLY with a JSON object: {"name":"short_name","code":"...javascript code...","observations":"what you noticed visually"}
No markdown. No backticks. No extra explanation. Just the JSON.

The "code" field is a JavaScript function body. It will be executed as:
  new Function('THREE', code)(THREE)
It must return a THREE.Group containing all meshes.

The "observations" field should briefly describe what you saw in the screenshot and what improvements you're making.`;

              const systemPrompt = isVisionMode ? visionSystemPrompt : `You are an expert Three.js 3D modeler. Given a description, you generate JavaScript code that creates 3D objects in a Three.js scene.

You respond ONLY with a JSON object: {"name":"short_name","code":"...javascript code..."}
No markdown. No backticks. No explanation. Just the JSON.

The "code" field is a JavaScript function body. It will be executed as:
  new Function('THREE', code)(THREE)
It must return a THREE.Group containing all meshes.

## Available Three.js APIs (everything is under the THREE namespace passed as the argument):

Geometries: BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, TorusKnotGeometry, PlaneGeometry, CircleGeometry, RingGeometry, LatheGeometry, ExtrudeGeometry, TubeGeometry, BufferGeometry, IcosahedronGeometry, OctahedronGeometry, DodecahedronGeometry, TetrahedronGeometry, ShapeGeometry, CapsuleGeometry

Curves/Paths (for ExtrudeGeometry, TubeGeometry, LatheGeometry):
  Shape, Path, CatmullRomCurve3, QuadraticBezierCurve3, CubicBezierCurve3, LineCurve3

Custom geometry:
  new THREE.BufferGeometry() + setAttribute('position', new THREE.Float32BufferAttribute([...], 3))
  Call .computeVertexNormals() after setting position if no normals provided.

Materials: MeshStandardMaterial({color, roughness, metalness}), MeshPhongMaterial({color, shininess}), MeshLambertMaterial({color}), MeshBasicMaterial({color, wireframe}), MeshNormalMaterial()
  All support: transparent, opacity, side (THREE.DoubleSide, THREE.FrontSide, THREE.BackSide)

Utilities: Group, Mesh, Vector2, Vector3, Color, Matrix4, Quaternion, Euler, MathUtils

## Rules:
- Return ONLY valid JSON. The "code" value must be a string (escape newlines as \\n, quotes as \\", etc.)
- The code must end with: return group;  (where group is a THREE.Group)
- CRITICAL: All variables must be declared with const/let BEFORE use. Define materials BEFORE referencing them. The code runs in strict mode — no implicit globals.
- Use MeshStandardMaterial for most parts with realistic colors and roughness/metalness
- **UNITS ARE MILLIMETERS (mm).** 1 Three.js unit = 1mm. All dimensions must be in mm.
- Position objects so they sit on the ground plane (y=0), centered around origin
- The build volume is ${currentState.buildSize?.x || 256}mm (X) × ${currentState.buildSize?.y || 256}mm (Y/height) × ${currentState.buildSize?.z || 256}mm (Z). X goes from -${(currentState.buildSize?.x || 256) / 2} to +${(currentState.buildSize?.x || 256) / 2}, Z goes from -${(currentState.buildSize?.z || 256) / 2} to +${(currentState.buildSize?.z || 256) / 2}. Objects MUST fit within this volume.
- Typical objects should be 30-80% of the build volume height depending on what makes sense.
- BE EXTREMELY CREATIVE AND DETAILED. Use 10-40+ meshes for complex objects
- For organic/complex shapes:
  • Combine many scaled/rotated/positioned primitives to approximate form
  • Use SphereGeometry scaled non-uniformly for organic body parts
  • Use CylinderGeometry for limbs, tubes, poles
  • Use ConeGeometry for horns, spikes, claws, beaks
  • Use TorusGeometry for rings, coils
  • Use LatheGeometry for bodies of revolution (vases, bottles, bell shapes)
  • Use ExtrudeGeometry + Shape for flat-extruded parts (wings, fins, blades)
  • Use BufferGeometry for truly custom triangle meshes
  • Use CatmullRomCurve3 + TubeGeometry for tails, tentacles, curved tubes
- Use loops and math (Math.sin, Math.cos, etc.) for repetitive/parametric elements
- Use different colors for different parts to add detail and realism
- For modifications: if currentState.code exists, modify that code; otherwise create from scratch

## 3D PRINTING DESIGN RULES (CRITICAL — all objects must be printable):
The output will be exported as STL for FDM 3D printing. Follow these constraints:

- **Overhangs & Slopes:** Limit angles to less than 45° from vertical. Angles exceeding 45°-50° require support structures — avoid them when possible. Prefer self-supporting geometry.
- **Base & Stability:** Ensure a flat, stable surface on the bottom of each part (y=0 plane) for good bed adhesion. No floating geometry.
- **Wall Thickness:** All walls/shells must be at least 1.2mm thick (1.2 units). Never create paper-thin geometry — always use solid, extruded forms.
- **Bridging:** Limit horizontal bridges (unsupported spans) to max ~15mm. Avoid large flat overhangs.
- **Vertical Pins & Features:** Keep thin vertical features at least 3mm diameter. Don't create tiny fragile spikes or needles.
- **Fillets & Radii:** Prefer rounded internal corners over sharp 90° inside edges to reduce stress concentrations.
- **Minimum Feature Size:** Avoid details smaller than ~1mm. Standard 0.4mm nozzles can't resolve sub-millimeter features.
- **Manifold / Watertight Geometry:** All meshes must be closed, solid volumes. No single-face planes (PlaneGeometry, open shapes). Every part should be a proper 3D solid (box, sphere, cylinder, extruded shape, etc.) — NOT a flat plane or uncapped surface.
- **No Floating Parts:** Every piece must be connected to or resting on something. If the object is a multi-part assembly, each part should be independently stable.
- **Multi-Part Assemblies:** Complex objects can be split into separate printable parts. Use separate THREE.Group children for distinct parts that would be printed separately and assembled. BUT — when two parts would naturally fuse together (e.g. a wall and a buttress, a body and a fin), merge them into a single mesh or overlap them so they print as one solid piece.
- **Orientation:** Orient parts so high-precision features face up or sideways, not down against the build plate.
- **Hole Sizing:** Horizontal holes print slightly smaller — oversize them by ~0.2mm.

## Current state of the 3D scene:
${currentState.code ? 'Current code:\\n' + currentState.code : JSON.stringify(currentState, null, 2)}
${currentState.lastError ? 'Last error: ' + currentState.lastError : ''}

If the user says to MODIFY the current object, adjust the existing code. If they describe something new, start fresh.${isVisionMode ? '\n\nYou are in VISION MODE. Analyze the provided screenshot carefully and make improvements based on what you see.' : ''}`;

              // ── Stream response with extended thinking ──
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
              });

              // Build message content
              let messageContent;
              if (isVisionMode) {
                // Extract base64 data from data URL
                const base64Data = screenshot.split(',')[1];
                const mediaType = screenshot.match(/data:(.*?);/)?.[1] || 'image/png';

                messageContent = [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mediaType,
                      data: base64Data,
                    },
                  },
                  {
                    type: 'text',
                    text: prompt,
                  },
                ];
              } else {
                messageContent = prompt;
              }

              const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': apiKey,
                  'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                  model: isVisionMode ? CLAUDE_VISION_MODEL : CLAUDE_MODEL,
                  max_tokens: 16384,
                  stream: true,
                  thinking: {
                    type: 'enabled',
                    budget_tokens: 10000,
                  },
                  system: systemPrompt,
                  messages: [{ role: 'user', content: messageContent }],
                }),
              });

              if (!apiRes.ok) {
                const errText = await apiRes.text();
                console.error(`[AI] Anthropic API ${apiRes.status}:`, errText);
                sendSSE('error', { message: `Anthropic API error (${apiRes.status}): ${errText.slice(0, 300)}` });
                res.end();
                return;
              }

              // Parse the SSE stream from Anthropic
              const decoder = new TextDecoder();
              let sseBuffer = '';
              let responseText = '';
              let currentBlockType = null;

              const reader = apiRes.body.getReader();
              let streamDone = false;
              while (!streamDone) {
                const { done, value } = await reader.read();
                if (done) { streamDone = true; break; }
                sseBuffer += decoder.decode(value, { stream: true });

                // SSE events are separated by double newlines
                const parts = sseBuffer.split('\n\n');
                sseBuffer = parts.pop(); // keep the incomplete last part

                for (const part of parts) {
                  // Extract the data line from the SSE event
                  const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
                  if (!dataLine) continue;
                  const raw = dataLine.slice(6).trim();
                  if (raw === '[DONE]') continue;

                  let event;
                  try {
                    event = JSON.parse(raw);
                  } catch {
                    continue;
                  }

                  if (event.type === 'content_block_start') {
                    currentBlockType = event.content_block?.type;
                    if (currentBlockType === 'thinking') {
                      sendSSE('thinking_start', {});
                    } else if (currentBlockType === 'text') {
                      sendSSE('status', { text: 'Generating code…' });
                    }
                  } else if (event.type === 'content_block_delta') {
                    if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
                      sendSSE('thinking', { text: event.delta.thinking });
                    } else if (event.delta?.type === 'text_delta' && event.delta.text) {
                      responseText += event.delta.text;
                    }
                  } else if (event.type === 'content_block_stop') {
                    if (currentBlockType === 'thinking') {
                      sendSSE('thinking_done', {});
                    }
                    currentBlockType = null;
                  } else if (event.type === 'error') {
                    const errMsg = event.error?.message || 'Stream error from API';
                    console.error('[AI] Stream error:', errMsg);
                    sendSSE('error', { message: errMsg });
                    res.end();
                    return;
                  }
                }
              }

              // Parse the accumulated text response as JSON
              const text = responseText.trim();
              if (!text) {
                sendSSE('error', { message: 'Empty response from AI' });
                res.end();
                return;
              }

              console.log('[AI] Raw response:', text.slice(0, 300));

              let json;
              try {
                // Strip markdown fences if any slipped through
                let cleaned = text;
                cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
                json = JSON.parse(cleaned);
              } catch (parseErr) {
                console.error('[AI] JSON parse error:', parseErr.message);
                console.error('[AI] First 500 chars:', text.slice(0, 500));
                console.error('[AI] Last 200 chars:', text.slice(-200));

                // Fallback: try to extract name and code manually
                try {
                  const nameMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
                  const codeStart = text.indexOf('"code"');
                  if (codeStart !== -1) {
                    // Find the code string value — it starts after "code":" and we need to find its end
                    const colonPos = text.indexOf(':', codeStart);
                    const quoteStart = text.indexOf('"', colonPos + 1);
                    // Walk through the string respecting escapes
                    let i = quoteStart + 1;
                    while (i < text.length) {
                      if (text[i] === '\\') { i += 2; continue; }
                      if (text[i] === '"') break;
                      i++;
                    }
                    const codeValue = text.slice(quoteStart + 1, i);
                    // Unescape the string
                    const code = codeValue.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\t/g, '\t');
                    json = { name: nameMatch?.[1] || 'object', code };
                    console.log('[AI] Recovered JSON via fallback extraction');
                  } else {
                    throw parseErr;
                  }
                } catch {
                  sendSSE('error', { message: 'Failed to parse AI response' });
                  res.end();
                  return;
                }
              }

              sendSSE('result', json);
              res.end();
            } catch (err) {
              console.error('[AI] Unhandled error:', err);
              // If headers already sent (streaming), send SSE error
              if (res.headersSent) {
                sendSSE('error', { message: err.message || 'Internal server error' });
                res.end();
              } else {
                sendJson(500, { error: err.message || 'Internal server error' });
              }
            }
          });
        },
      },
    ],
  };
});
