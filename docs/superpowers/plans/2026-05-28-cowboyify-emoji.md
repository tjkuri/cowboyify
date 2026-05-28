# cowboyify-emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file browser tool that takes any image and emits a 112×112 looping GIF in the style of the user's favorite cowboy-checkmark Slack emoji (hat overlay + revolver with muzzle-flash flicker).

**Architecture:** Pure-client static page (`index.html` + `cowboyify.js`). Three transparent PNG assets — `hat.png`, `gun_idle.png`, `gun_flash.png` — are extracted *once* at build time from the reference GIF by a Python script (`tools/extract_assets.py`) and committed to `assets/`. At runtime the page composites the user image with the hat + gun on a 112×112 canvas, runs a live preview loop alternating the flash, and exports two-frame GIFs via a vendored `gif.js` worker.

**Tech Stack:** Vanilla JavaScript (ES2020), HTML5 Canvas, [gif.js](https://github.com/jnordberg/gif.js) for in-browser GIF encoding. Python 3 + Pillow + NumPy for the one-shot asset-extraction script. No build step.

**Testing approach:** Per the spec, this project deliberately has no automated test suite. Verification is manual: open the page in a browser, drop in test images, eyeball the live preview, download the GIF, confirm it animates, and (optional) upload to a Slack scratch channel. Each task ends with a concrete manual check.

---

## File Structure

```
cowboyify/
├── index.html              (Task 3)  page scaffolding, drop zone, canvas, buttons
├── cowboyify.js            (Tasks 4–8) all runtime logic, in one file
├── assets/                 (Task 1)  outputs of extract_assets.py
│   ├── hat.png
│   ├── gun_idle.png
│   └── gun_flash.png
├── vendor/                 (Task 2)  pinned gif.js
│   ├── gif.js
│   └── gif.worker.js
├── tools/
│   └── extract_assets.py   (Task 1)  one-shot, not loaded at runtime
├── reference/
│   └── approved-cowboy-gun.gif       (already committed)
└── docs/superpowers/
    ├── specs/2026-05-28-cowboyify-emoji-design.md   (already committed)
    └── plans/2026-05-28-cowboyify-emoji.md          (this file)
```

`cowboyify.js` stays in one file on purpose — the runtime is small enough that splitting it adds more confusion than it removes. If it grows past ~400 lines, that's the time to split.

---

## Task 1: Asset extraction script

**Files:**
- Create: `tools/extract_assets.py`
- Create (as output of running the script): `assets/hat.png`, `assets/gun_idle.png`, `assets/gun_flash.png`

- [ ] **Step 1: Confirm Python deps are available**

Run:
```bash
cd /Users/tkuri/Documents/misc/cowboyify
python3 -c "import PIL, numpy; print(PIL.__version__, numpy.__version__)"
```
Expected: prints two version strings, no `ModuleNotFoundError`.

If missing, install in a venv:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install Pillow numpy
python3 -c "import PIL, numpy; print(PIL.__version__, numpy.__version__)"
```

- [ ] **Step 2: Write `tools/extract_assets.py`**

Create `tools/extract_assets.py` with this exact content:

```python
#!/usr/bin/env python3
"""Extract hat.png, gun_idle.png, gun_flash.png from the reference GIF.

This is a one-shot tool. The three output PNGs are committed to assets/
and the runtime never re-runs this script.

Approach:
  1. Load every frame of the reference GIF as an RGBA numpy array.
  2. Sample the center pixel of frame 0 to get the green-checkmark color.
  3. Zero alpha for any pixel within GREEN_TOLERANCE of that color.
  4. Pick an "idle" frame (most central in pixel-space among the
     gun region) and a "flash" frame (most different from idle).
  5. Split each frame at SPLIT_Y into hat region (top) and gun region
     (bottom). Save the three composite PNGs.

If the outputs look wrong, tune SPLIT_Y or GREEN_TOLERANCE and rerun.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REFERENCE_GIF = PROJECT_ROOT / "reference" / "approved-cowboy-gun.gif"
ASSETS_DIR = PROJECT_ROOT / "assets"

# Pixels above SPLIT_Y go into the hat asset; at or below go into the gun.
SPLIT_Y = 45

# RGB Euclidean distance below which a pixel is considered "checkmark green".
GREEN_TOLERANCE = 35


def load_frames(gif_path: Path) -> list[np.ndarray]:
    img = Image.open(gif_path)
    frames = []
    for frame in ImageSequence.Iterator(img):
        frames.append(np.array(frame.convert("RGBA")))
    return frames


def mask_color(frame: np.ndarray, color: tuple[int, int, int], tol: int) -> np.ndarray:
    diff = frame[..., :3].astype(np.int32) - np.array(color, dtype=np.int32)
    dist = np.sqrt((diff ** 2).sum(axis=-1))
    out = frame.copy()
    out[..., 3] = np.where(dist <= tol, 0, out[..., 3])
    return out


def find_idle_and_flash(frames: list[np.ndarray]) -> tuple[int, int]:
    """Returns (idle_idx, flash_idx). Uses only the right half (gun region)."""
    h, w = frames[0].shape[:2]
    right = [f[:, w // 2:, :3].astype(np.int32) for f in frames]
    n = len(frames)
    dists = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            dists[i, j] = np.abs(right[i] - right[j]).sum()
    idle_idx = int(dists.sum(axis=1).argmin())
    flash_idx = int(dists[idle_idx].argmax())
    return idle_idx, flash_idx


def crop_band(frame: np.ndarray, y_from: int, y_to: int) -> np.ndarray:
    out = frame.copy()
    if y_from > 0:
        out[:y_from, :, 3] = 0
    if y_to < out.shape[0]:
        out[y_to:, :, 3] = 0
    return out


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    frames = load_frames(REFERENCE_GIF)
    print(f"Loaded {len(frames)} frames, shape {frames[0].shape}")

    h, w = frames[0].shape[:2]
    green = tuple(int(c) for c in frames[0][h // 2, w // 2, :3])
    print(f"Sampled checkmark color: RGB{green}")

    masked = [mask_color(f, green, GREEN_TOLERANCE) for f in frames]
    idle_idx, flash_idx = find_idle_and_flash(masked)
    print(f"Idle frame index: {idle_idx}, flash frame index: {flash_idx}")

    hat = crop_band(masked[idle_idx], 0, SPLIT_Y)
    gun_idle = crop_band(masked[idle_idx], SPLIT_Y, h)
    gun_flash = crop_band(masked[flash_idx], SPLIT_Y, h)

    out_paths = {
        ASSETS_DIR / "hat.png": hat,
        ASSETS_DIR / "gun_idle.png": gun_idle,
        ASSETS_DIR / "gun_flash.png": gun_flash,
    }
    for path, arr in out_paths.items():
        Image.fromarray(arr, "RGBA").save(path)
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the script**

Run:
```bash
cd /Users/tkuri/Documents/misc/cowboyify
python3 tools/extract_assets.py
```
Expected output (numbers may vary slightly):
```
Loaded N frames, shape (112, 112, 4)
Sampled checkmark color: RGB(...)
Idle frame index: ...
Flash frame index: ...
Wrote .../assets/hat.png
Wrote .../assets/gun_idle.png
Wrote .../assets/gun_flash.png
```
Then:
```bash
ls -l assets/
```
Expected: three PNG files, each non-zero size.

- [ ] **Step 4: Eyeball the extracted assets**

Open each PNG in Preview.app (or any image viewer that shows transparency):
```bash
open assets/hat.png assets/gun_idle.png assets/gun_flash.png
```

Verify, by eye:
- `hat.png` shows just the cowboy hat on transparent background, **no green checkmark, no gun**.
- `gun_idle.png` shows the gun with **no muzzle flash**, no green, no hat.
- `gun_flash.png` shows the gun **with** a yellow muzzle flash, no green, no hat.

If anything is wrong:
- Green bleeding into the hat/gun → lower `GREEN_TOLERANCE` (e.g. 25) and rerun.
- Hat clipping the gun or vice versa → adjust `SPLIT_Y` and rerun.
- Wrong frame chosen as idle/flash → the heuristic is wrong for this gif; manually override by adding `idle_idx = N; flash_idx = M` after `find_idle_and_flash` and rerun.

Stop here if the outputs are usable, even if imperfect — the runtime can drag/reposition.

- [ ] **Step 5: Commit**

```bash
git add tools/extract_assets.py assets/hat.png assets/gun_idle.png assets/gun_flash.png
git commit -m "Add extract_assets.py and the three runtime PNGs"
```

---

## Task 2: Vendor gif.js

**Files:**
- Create: `vendor/gif.js`
- Create: `vendor/gif.worker.js`

- [ ] **Step 1: Download pinned files from jsDelivr**

Use the `0.2.0` release (the last published version; stable):

```bash
cd /Users/tkuri/Documents/misc/cowboyify
mkdir -p vendor
curl -fsSL -o vendor/gif.js \
  https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js
curl -fsSL -o vendor/gif.worker.js \
  https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js
```
Expected: both `curl` calls succeed (exit 0).

- [ ] **Step 2: Verify**

```bash
ls -l vendor/
head -5 vendor/gif.js
```
Expected: both files exist, non-empty. `gif.js` starts with a comment or `(function...)` IIFE header. Neither file is an HTML error page.

If a download landed an HTML error page, switch to a different CDN URL such as `https://unpkg.com/gif.js@0.2.0/dist/gif.js` and `https://unpkg.com/gif.js@0.2.0/dist/gif.worker.js`, then re-verify.

- [ ] **Step 3: Commit**

```bash
git add vendor/gif.js vendor/gif.worker.js
git commit -m "Vendor gif.js 0.2.0"
```

---

## Task 3: HTML scaffolding

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write `index.html`**

Create `index.html` with this exact content:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>cowboyify-emoji</title>
  <style>
    :root { color-scheme: dark light; font-family: system-ui, sans-serif; }
    body {
      margin: 0; padding: 32px;
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      background: #1c1c1c; color: #eee;
    }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    #drop-zone {
      width: 320px; padding: 24px;
      border: 2px dashed #666; border-radius: 8px;
      text-align: center; color: #aaa; cursor: pointer;
      transition: border-color 120ms, color 120ms;
    }
    #drop-zone.hover { border-color: #6bd; color: #cde; }
    #preview {
      width: 224px; height: 224px;          /* render at 2× CSS size */
      image-rendering: pixelated;
      background:
        linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%) 0 0 / 16px 16px,
        linear-gradient(45deg, #2a2a2a 25%, transparent 25%, transparent 75%, #2a2a2a 75%) 8px 8px / 16px 16px,
        #222;
      cursor: grab;
    }
    #preview.dragging { cursor: grabbing; }
    .row { display: flex; gap: 8px; }
    button {
      padding: 8px 14px; border: 1px solid #555; border-radius: 6px;
      background: #2c2c2c; color: #eee; cursor: pointer; font: inherit;
    }
    button:disabled { opacity: 0.5; cursor: default; }
    button.primary { background: #2b6cb0; border-color: #2b6cb0; }
    #status { min-height: 1.4em; color: #aaa; font-size: 13px; }
    input[type=file] { display: none; }
  </style>
</head>
<body>
  <h1>cowboyify-emoji</h1>
  <div id="drop-zone">Drop an image here, or click to pick a file</div>
  <input id="file-input" type="file" accept="image/*">
  <canvas id="preview" width="112" height="112"></canvas>
  <div class="row">
    <button id="reset-positions" type="button">Reset positions</button>
    <button id="download" class="primary" type="button" disabled>Download .gif</button>
  </div>
  <div id="status">Drop an image to begin.</div>

  <script src="vendor/gif.js"></script>
  <script src="cowboyify.js"></script>
</body>
</html>
```

- [ ] **Step 2: Open in the browser to verify static layout**

```bash
open /Users/tkuri/Documents/misc/cowboyify/index.html
```

Verify by eye:
- Page loads with the title, drop zone, a checkered 224×224 canvas, and two buttons.
- "Download .gif" is disabled (greyed out).
- Browser DevTools console (Cmd+Option+J in Chrome) shows one error about `cowboyify.js` 404 — that's expected, we haven't written it yet.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Add page scaffolding"
```

---

## Task 4: Runtime — asset loading + idle render

**Files:**
- Create: `cowboyify.js`

- [ ] **Step 1: Write the initial `cowboyify.js`**

Create `cowboyify.js` with this exact content:

```javascript
'use strict';

const CANVAS_SIZE = 112;

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');
const statusEl = $('status');

let assets = null;

async function loadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

async function opaqueBBox(bitmap) {
  const off = new OffscreenCanvas(bitmap.width, bitmap.height);
  const octx = off.getContext('2d');
  octx.drawImage(bitmap, 0, 0);
  const data = octx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let minX = bitmap.width, minY = bitmap.height, maxX = -1, maxY = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (data[(y * bitmap.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function init() {
  try {
    const [hat, gunIdle, gunFlash] = await Promise.all([
      loadImage('assets/hat.png'),
      loadImage('assets/gun_idle.png'),
      loadImage('assets/gun_flash.png'),
    ]);
    assets = {
      hat, gunIdle, gunFlash,
      hatBBox: await opaqueBBox(hat),
      gunBBox: await opaqueBBox(gunIdle),
    };
    drawPlaceholder();
    statusEl.textContent = 'Drop an image to begin.';
  } catch (err) {
    statusEl.textContent = `Failed to load assets: ${err.message}`;
    console.error(err);
  }
}

function drawPlaceholder() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.drawImage(assets.hat, 0, 0);
  ctx.drawImage(assets.gunIdle, 0, 0);
}

init();
```

- [ ] **Step 2: Verify in the browser**

```bash
open /Users/tkuri/Documents/misc/cowboyify/index.html
```

Verify by eye:
- The canvas now shows the hat + gun_idle composite (no user image yet, no green checkmark — just hat & gun floating on the checkered background).
- Status text reads "Drop an image to begin."
- DevTools console shows no errors.

If the canvas is still blank, check the console — most likely an `assets/` path issue or a missing file from Task 1.

- [ ] **Step 3: Commit**

```bash
git add cowboyify.js
git commit -m "Load runtime assets and render hat+gun preview"
```

---

## Task 5: Runtime — accept user image + compose frame

**Files:**
- Modify: `cowboyify.js`

- [ ] **Step 1: Add image input + composition logic to `cowboyify.js`**

Replace the entire `cowboyify.js` file with this content:

```javascript
'use strict';

const CANVAS_SIZE = 112;

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');
const statusEl = $('status');
const dropZone = $('drop-zone');
const fileInput = $('file-input');
const downloadBtn = $('download');
const resetBtn = $('reset-positions');

let assets = null;
let userImage = null;
let hatXY = { x: 0, y: 0 };
let gunXY = { x: 0, y: 0 };

async function loadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

async function opaqueBBox(bitmap) {
  const off = new OffscreenCanvas(bitmap.width, bitmap.height);
  const octx = off.getContext('2d');
  octx.drawImage(bitmap, 0, 0);
  const data = octx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let minX = bitmap.width, minY = bitmap.height, maxX = -1, maxY = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (data[(y * bitmap.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function drawContain(c, bm) {
  const scale = Math.min(CANVAS_SIZE / bm.width, CANVAS_SIZE / bm.height);
  const w = bm.width * scale;
  const h = bm.height * scale;
  c.drawImage(bm, (CANVAS_SIZE - w) / 2, (CANVAS_SIZE - h) / 2, w, h);
}

function composeFrame(c, flashOn) {
  c.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  if (userImage) drawContain(c, userImage);
  if (!assets) return;
  c.drawImage(assets.hat, hatXY.x, hatXY.y);
  c.drawImage(flashOn ? assets.gunFlash : assets.gunIdle, gunXY.x, gunXY.y);
}

async function setInputFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    statusEl.textContent = "Couldn't read that file — try a PNG, JPG, or GIF.";
    return;
  }
  try {
    userImage = await createImageBitmap(file);
    hatXY = { x: 0, y: 0 };
    gunXY = { x: 0, y: 0 };
    downloadBtn.disabled = false;
    statusEl.textContent = `Loaded ${file.name} (${userImage.width}×${userImage.height}).`;
    composeFrame(ctx, false);
  } catch (err) {
    statusEl.textContent = `Couldn't decode that image: ${err.message}`;
    console.error(err);
  }
}

function wireInputs() {
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) setInputFile(f);
  });
  ['dragenter', 'dragover'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add('hover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove('hover');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setInputFile(f);
  });
  resetBtn.addEventListener('click', () => {
    hatXY = { x: 0, y: 0 };
    gunXY = { x: 0, y: 0 };
    composeFrame(ctx, false);
  });
}

async function init() {
  try {
    const [hat, gunIdle, gunFlash] = await Promise.all([
      loadImage('assets/hat.png'),
      loadImage('assets/gun_idle.png'),
      loadImage('assets/gun_flash.png'),
    ]);
    assets = {
      hat, gunIdle, gunFlash,
      hatBBox: await opaqueBBox(hat),
      gunBBox: await opaqueBBox(gunIdle),
    };
    wireInputs();
    composeFrame(ctx, false);
    statusEl.textContent = 'Drop an image to begin.';
  } catch (err) {
    statusEl.textContent = `Failed to load assets: ${err.message}`;
    console.error(err);
  }
}

init();
```

- [ ] **Step 2: Verify in the browser**

Reload `index.html` in the browser. Then:

1. Click the drop zone → a file picker opens. Pick any image (PNG/JPG). The canvas should redraw with your image scaled-to-fit, with the hat + idle gun on top. "Download .gif" becomes enabled.
2. Drag a file from Finder onto the drop zone → same behavior, drop zone briefly highlights.
3. Click "Reset positions" → no visible change yet (positions are still 0,0), but no console error.

DevTools console: no errors.

- [ ] **Step 3: Commit**

```bash
git add cowboyify.js
git commit -m "Accept user image and render composite"
```

---

## Task 6: Runtime — live preview animation loop

**Files:**
- Modify: `cowboyify.js`

- [ ] **Step 1: Add a flash-toggling animation loop**

In `cowboyify.js`, add a flash-period constant and animation-state variables near the top, and add a `tick` function plus an RAF kickoff in `init`.

Add after `const CANVAS_SIZE = 112;`:

```javascript
const FLASH_PERIOD_MS = 80;
let flashOn = false;
let lastFlashToggle = 0;
```

Replace the body of `composeFrame` so it's unchanged but used by the tick loop. Then add this `tick` function after `composeFrame`:

```javascript
function tick(now) {
  if (now - lastFlashToggle >= FLASH_PERIOD_MS) {
    flashOn = !flashOn;
    lastFlashToggle = now;
  }
  composeFrame(ctx, flashOn);
  requestAnimationFrame(tick);
}
```

At the end of `init()` (after `statusEl.textContent = ...`), add:

```javascript
    requestAnimationFrame(tick);
```

Also remove the now-redundant explicit `composeFrame(ctx, false)` calls inside `setInputFile` and `resetBtn`'s handler (the tick loop will redraw on the next frame). The full file should now look like this end-to-end:

```javascript
'use strict';

const CANVAS_SIZE = 112;
const FLASH_PERIOD_MS = 80;

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');
const statusEl = $('status');
const dropZone = $('drop-zone');
const fileInput = $('file-input');
const downloadBtn = $('download');
const resetBtn = $('reset-positions');

let assets = null;
let userImage = null;
let hatXY = { x: 0, y: 0 };
let gunXY = { x: 0, y: 0 };
let flashOn = false;
let lastFlashToggle = 0;

async function loadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

async function opaqueBBox(bitmap) {
  const off = new OffscreenCanvas(bitmap.width, bitmap.height);
  const octx = off.getContext('2d');
  octx.drawImage(bitmap, 0, 0);
  const data = octx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let minX = bitmap.width, minY = bitmap.height, maxX = -1, maxY = -1;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (data[(y * bitmap.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function drawContain(c, bm) {
  const scale = Math.min(CANVAS_SIZE / bm.width, CANVAS_SIZE / bm.height);
  const w = bm.width * scale;
  const h = bm.height * scale;
  c.drawImage(bm, (CANVAS_SIZE - w) / 2, (CANVAS_SIZE - h) / 2, w, h);
}

function composeFrame(c, fOn) {
  c.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  if (userImage) drawContain(c, userImage);
  if (!assets) return;
  c.drawImage(assets.hat, hatXY.x, hatXY.y);
  c.drawImage(fOn ? assets.gunFlash : assets.gunIdle, gunXY.x, gunXY.y);
}

function tick(now) {
  if (now - lastFlashToggle >= FLASH_PERIOD_MS) {
    flashOn = !flashOn;
    lastFlashToggle = now;
  }
  composeFrame(ctx, flashOn);
  requestAnimationFrame(tick);
}

async function setInputFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    statusEl.textContent = "Couldn't read that file — try a PNG, JPG, or GIF.";
    return;
  }
  try {
    userImage = await createImageBitmap(file);
    hatXY = { x: 0, y: 0 };
    gunXY = { x: 0, y: 0 };
    downloadBtn.disabled = false;
    statusEl.textContent = `Loaded ${file.name} (${userImage.width}×${userImage.height}).`;
  } catch (err) {
    statusEl.textContent = `Couldn't decode that image: ${err.message}`;
    console.error(err);
  }
}

function wireInputs() {
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) setInputFile(f);
  });
  ['dragenter', 'dragover'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add('hover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove('hover');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setInputFile(f);
  });
  resetBtn.addEventListener('click', () => {
    hatXY = { x: 0, y: 0 };
    gunXY = { x: 0, y: 0 };
  });
}

async function init() {
  try {
    const [hat, gunIdle, gunFlash] = await Promise.all([
      loadImage('assets/hat.png'),
      loadImage('assets/gun_idle.png'),
      loadImage('assets/gun_flash.png'),
    ]);
    assets = {
      hat, gunIdle, gunFlash,
      hatBBox: await opaqueBBox(hat),
      gunBBox: await opaqueBBox(gunIdle),
    };
    wireInputs();
    statusEl.textContent = 'Drop an image to begin.';
    requestAnimationFrame(tick);
  } catch (err) {
    statusEl.textContent = `Failed to load assets: ${err.message}`;
    console.error(err);
  }
}

init();
```

- [ ] **Step 2: Verify the live flash**

Reload `index.html`. Verify:
- The canvas now shows a continuously firing gun (idle ↔ flash alternation every ~80ms).
- Drop a user image — preview still animates, with your image underneath.
- No console errors.

- [ ] **Step 3: Commit**

```bash
git add cowboyify.js
git commit -m "Live preview loop alternating muzzle flash"
```

---

## Task 7: Runtime — drag-to-adjust hat & gun

**Files:**
- Modify: `cowboyify.js`

- [ ] **Step 1: Add pointer-event handlers and hit-testing**

In `cowboyify.js`, add a `dragging` state variable next to the other `let` declarations:

```javascript
let dragging = null;   // { kind: 'hat'|'gun', dx, dy }  or null
```

Add this helper function (place it after `opaqueBBox`):

```javascript
function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

function hitTest(p) {
  if (!assets) return null;
  const inBox = (xy, bb) =>
    p.x >= xy.x + bb.x && p.x < xy.x + bb.x + bb.w &&
    p.y >= xy.y + bb.y && p.y < xy.y + bb.y + bb.h;
  // Gun is topmost in z-order in composeFrame, so test it first.
  if (inBox(gunXY, assets.gunBBox)) return 'gun';
  if (inBox(hatXY, assets.hatBBox)) return 'hat';
  return null;
}
```

Add this `wireDrag` function (place it after `wireInputs`):

```javascript
function wireDrag() {
  canvas.addEventListener('pointerdown', (e) => {
    const p = canvasPointFromEvent(e);
    const kind = hitTest(p);
    if (!kind) return;
    const xy = kind === 'gun' ? gunXY : hatXY;
    dragging = { kind, dx: p.x - xy.x, dy: p.y - xy.y };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = canvasPointFromEvent(e);
    const xy = dragging.kind === 'gun' ? gunXY : hatXY;
    xy.x = Math.round(p.x - dragging.dx);
    xy.y = Math.round(p.y - dragging.dy);
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = null;
    canvas.releasePointerCapture(e.pointerId);
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
```

Call `wireDrag()` from `init()`, right after `wireInputs();`:

```javascript
    wireInputs();
    wireDrag();
```

- [ ] **Step 2: Verify drag works**

Reload `index.html`. With an image loaded:
- Press and hold over the hat → drag → hat follows the cursor and the live preview shows it moving.
- Press and hold over the gun → drag → gun follows the cursor.
- Pressing on empty canvas → nothing happens, no error.
- "Reset positions" → hat and gun snap back to (0, 0).
- Cursor changes to `grabbing` while dragging, `grab` otherwise.

- [ ] **Step 3: Commit**

```bash
git add cowboyify.js
git commit -m "Drag-to-adjust hat and gun positions"
```

---

## Task 8: Runtime — GIF export via gif.js

**Files:**
- Modify: `cowboyify.js`

- [ ] **Step 1: Add export logic**

In `cowboyify.js`, add this `exportGif` function (place it after `wireDrag`):

```javascript
function buildFrameCanvas(fOn) {
  const off = document.createElement('canvas');
  off.width = CANVAS_SIZE;
  off.height = CANVAS_SIZE;
  composeFrame(off.getContext('2d'), fOn);
  return off;
}

function exportGif() {
  if (!assets || !userImage) return;
  downloadBtn.disabled = true;
  statusEl.textContent = 'Encoding GIF…';

  const gif = new GIF({
    workers: 2,
    quality: 10,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    workerScript: 'vendor/gif.worker.js',
    transparent: 0x000000,
  });

  gif.addFrame(buildFrameCanvas(false), { delay: 80, copy: true });
  gif.addFrame(buildFrameCanvas(true), { delay: 80, copy: true });

  gif.on('progress', (p) => {
    statusEl.textContent = `Encoding GIF… ${Math.round(p * 100)}%`;
  });
  gif.on('finished', (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cowboyified.gif';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    statusEl.textContent = `Done — ${(blob.size / 1024).toFixed(1)} KB.`;
    downloadBtn.disabled = false;
  });

  try {
    gif.render();
  } catch (err) {
    statusEl.textContent = `Encoding failed: ${err.message}. Try opening the page from a local server (python3 -m http.server).`;
    downloadBtn.disabled = false;
    console.error(err);
  }
}
```

Wire the button in `wireInputs` — add this line at the bottom of `wireInputs`, just before its closing brace:

```javascript
  downloadBtn.addEventListener('click', exportGif);
```

- [ ] **Step 2: Verify export**

Reload `index.html`. With an image loaded:
1. Click "Download .gif". Status shows progress, then "Done — X.X KB."
2. A file `cowboyified.gif` lands in your Downloads folder.
3. Open it: `open ~/Downloads/cowboyified.gif`. It should animate the cowboy emoji (hat + flashing gun + your image underneath), loop forever.
4. Check the file size — expect well under 128KB. If it's larger, the spec said this is the Slack limit.

Known issue: if the page is opened via `file://` and the browser refuses to start the worker, the status will show the "Try opening the page from a local server" message. To recover:
```bash
cd /Users/tkuri/Documents/misc/cowboyify
python3 -m http.server 8000
```
Then open `http://localhost:8000/`.

- [ ] **Step 3: Commit**

```bash
git add cowboyify.js
git commit -m "Export two-frame looping GIF via gif.js"
```

---

## Task 9: End-to-end smoke test

**Files:** None (verification only)

- [ ] **Step 1: Test across browsers**

Open `index.html` in **Chrome** and **Safari** (and Firefox if convenient) and run through the same checklist in each:

- [ ] Drop a square transparent-background PNG → preview shows it scaled-to-fit, hat & gun on top, flash animates.
- [ ] Drop a non-square JPG → preview shows it letterboxed (centered, aspect preserved), hat & gun on top.
- [ ] Drop a tiny image (e.g., 32×32) → scales up cleanly.
- [ ] Drop a huge image (e.g., 2000×2000) → scales down cleanly.
- [ ] Drop a non-image (e.g., a `.txt` file) → status shows the friendly error, previous preview unchanged.
- [ ] Drag the hat around, drag the gun around, reset.
- [ ] Click "Download .gif" → file lands, opens, animates, loops, < 128KB.

- [ ] **Step 2: Upload to Slack**

Upload one of the downloaded `.gif`s as a custom emoji in a Slack scratch channel (or DM yourself). Confirm:
- Slack accepts it (file size and dimension fit).
- The emoji animates in the message composer and in posted messages.

If Slack scales it down weirdly or breaks the loop, note which input image caused it and check the file size / dimensions of the offending GIF — most likely the input was an edge case.

- [ ] **Step 3: Mark the project done**

If everything works, you're done. No commit needed — this task is verification only.

---

## Task 10 (stretch): Paste from clipboard

**Files:**
- Modify: `cowboyify.js`

Only do this if Task 9 passed and you feel like one more bit.

- [ ] **Step 1: Add a `paste` listener**

In `cowboyify.js`, add this inside `wireInputs` (anywhere after the click handler):

```javascript
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setInputFile(file);
          return;
        }
      }
    }
  });
```

- [ ] **Step 2: Verify**

Copy an image to your clipboard (e.g., screenshot a region with Cmd+Ctrl+Shift+4, or right-click → Copy Image on a webpage). Switch to the cowboyify page and press Cmd+V. The image should load and start cowboying.

- [ ] **Step 3: Commit**

```bash
git add cowboyify.js
git commit -m "Accept pasted images from clipboard"
```

---

## Notes for the implementer

- The spec deliberately rules out automated tests. Don't add a test framework. If a step says "verify in the browser," that's the real verification.
- If `extract_assets.py` produces obviously-wrong PNGs and tweaking `SPLIT_Y`/`GREEN_TOLERANCE` doesn't help within ~10 minutes, just open the extracted PNGs in any image editor (Preview supports basic instant-alpha; Pixelmator/Photoshop is fine) and clean them up by hand. The spec explicitly allows this.
- `gif.js`'s `transparent: 0x000000` setting can make true-black pixels in user images go transparent. If that's a real problem in practice, drop the `transparent:` option from `exportGif` — the cost is a black background on transparent emoji uploads. Pick whichever looks better with your real inputs during Task 9.
- `cowboyify.js` is intentionally a single file. If you split it, keep `assets`, `userImage`, and the position state in one module; they're shared by every function.
