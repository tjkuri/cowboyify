# Mirror Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Flip ⇄ button that mirrors the hat and gun assets horizontally so the cowboy gear can face left or right.

**Architecture:** Pre-render flipped canvas variants of each asset at load time. Track facing direction in module state. `composeFrame` and `hitTest` pick the original or flipped variant based on facing. Drag/positions unchanged.

**Tech Stack:** Vanilla JS, HTML5 Canvas, OffscreenCanvas. No new dependencies.

---

### Task 1: Implement asset flipping, state, hit-test, and button

**Files:**
- Modify: `cowboyify.js` (top-level state, `init`, `composeFrame`, `hitTest`, `wireInputs`)
- Modify: `index.html` (add `<button id="flip-assets">`)

- [ ] **Step 1: Add the flip button to `index.html`**

Insert next to `#reset-positions` in the controls row. Exact text:

```html
<button id="flip-assets">Flip ⇄</button>
```

Place it immediately after the existing `<button id="reset-positions">…</button>`.

- [ ] **Step 2: Add `flipBtn` DOM reference and `facing` state in `cowboyify.js`**

Below the existing `const resetBtn = $('reset-positions');` line, add:

```js
const flipBtn = $('flip-assets');
```

Below the existing `let dragging = null;` line, add:

```js
let facing = 'right';   // 'right' | 'left'
```

- [ ] **Step 3: Add `flipCanvas` and `reflectBBox` helpers**

Insert above `opaqueBBox`:

```js
function flipCanvas(bm) {
  const off = new OffscreenCanvas(bm.width, bm.height);
  const c = off.getContext('2d');
  c.translate(bm.width, 0);
  c.scale(-1, 1);
  c.drawImage(bm, 0, 0);
  return off;
}

function reflectBBox(bb) {
  return { x: CANVAS_SIZE - bb.x - bb.w, y: bb.y, w: bb.w, h: bb.h };
}
```

- [ ] **Step 4: Populate flipped variants in `init`**

Replace the existing `assets = { ... }` block in `init` with:

```js
assets = {
  hat, gunIdle, gunFlash,
  hatFlipped: flipCanvas(hat),
  gunIdleFlipped: flipCanvas(gunIdle),
  gunFlashFlipped: flipCanvas(gunFlash),
  hatBBox: await opaqueBBox(hat),
  gunBBox: await opaqueBBox(gunIdle),
};
assets.hatBBoxFlipped = reflectBBox(assets.hatBBox);
assets.gunBBoxFlipped = reflectBBox(assets.gunBBox);
```

- [ ] **Step 5: Make `composeFrame` facing-aware**

Replace the two `drawImage` lines in `composeFrame` with:

```js
const hatImg = facing === 'left' ? assets.hatFlipped : assets.hat;
const gunImg = facing === 'left'
  ? (fOn ? assets.gunFlashFlipped : assets.gunIdleFlipped)
  : (fOn ? assets.gunFlash : assets.gunIdle);
c.drawImage(hatImg, hatXY.x, hatXY.y);
c.drawImage(gunImg, gunXY.x, gunXY.y);
```

- [ ] **Step 6: Make `hitTest` facing-aware**

Replace the two `inBox` calls in `hitTest` with:

```js
const hatBB = facing === 'left' ? assets.hatBBoxFlipped : assets.hatBBox;
const gunBB = facing === 'left' ? assets.gunBBoxFlipped : assets.gunBBox;
if (inBox(gunXY, gunBB)) return 'gun';
if (inBox(hatXY, hatBB)) return 'hat';
```

- [ ] **Step 7: Wire the flip button**

In `wireInputs`, alongside the `resetBtn` listener, add:

```js
flipBtn.addEventListener('click', () => {
  facing = facing === 'right' ? 'left' : 'right';
});
```

- [ ] **Step 8: Manual smoke test**

Start a local server (`python3 -m http.server 8765`), open the page, drop an image, click Flip ⇄, confirm:
- Gear mirrors horizontally
- Muzzle flash still flickers
- Hat and gun positions don't jump
- Dragging the flipped gear still works (clicking visible gear picks it up)
- A second click flips back
- Exporting the GIF with facing='left' produces a left-facing GIF under 128 KB

- [ ] **Step 9: Commit**

```bash
git add cowboyify.js index.html
git commit -m "Add Flip toggle to mirror hat and gun"
```
