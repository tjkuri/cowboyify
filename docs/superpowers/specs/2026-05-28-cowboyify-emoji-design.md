# cowboyify-emoji — Design

**Date:** 2026-05-28
**Status:** Approved (brainstorming) — pending implementation plan

## Purpose

A tiny browser tool that takes any image (a Slack-emoji candidate) and produces an animated GIF emoji in the style of the user's favorite cowboy-checkmark emoji: a tilted brown cowboy hat overlaid on top, plus a revolver protruding from the side with a flickering yellow muzzle-flash animation.

The output is a 112×112 looping GIF suitable for uploading as a Slack custom emoji.

## Reference

The source emoji being emulated is `/Users/tkuri/Downloads/approved-cowboy-gun.gif` (112×112 GIF89a). The hat, gun, and muzzle-flash artwork are extracted from this reference once at build time and shipped as static PNG assets.

## Non-goals

- Generating original hat/gun art (we reuse the reference's art).
- Cowboyifying arbitrary content with computer vision (no face/head detection — see Placement).
- Backend or server-side processing — everything runs in the user's browser.
- Bulk batch processing, accounts, history, gallery, or sharing features.
- Cross-browser hardening beyond "works in current Chrome/Safari/Firefox."

## Form factor

A single static page: `index.html` + `cowboyify.js` + a vendored `gif.js` dependency + an `assets/` folder of PNGs. No build step. Opening the HTML file directly (`file://`) works. Hosting it on GitHub Pages later is a trivial follow-on.

## Architecture

```
┌─ index.html ───────────────────────────────────────────────┐
│  drop-zone  →  <canvas id="preview">  →  [Download .gif]   │
└──┬──────────────────────────────────────────────────────────┘
   │
   ▼
┌─ cowboyify.js ─────────────────────────────────────────────┐
│  loadAssets()       ← hat.png, gun_idle.png, gun_flash.png │
│  setInput(file)     ← decodes user image to ImageBitmap    │
│  composeFrame(flashOn) → draws one 112×112 frame           │
│  startPreviewLoop() – animates the canvas live (~80ms/fr)  │
│  exportGif()        – uses gif.js worker → Blob → download │
│  pointer handlers   – drag hat and gun on the canvas       │
└─────────────────────────────────────────────────────────────┘

┌─ tools/extract_assets.py (one-shot, not shipped at runtime) ─┐
│  reads approved-cowboy-gun.gif                               │
│  separates the GIF frames                                    │
│  masks out the green-checkmark layer (known solid color)     │
│  writes:                                                     │
│    assets/hat.png        (transparent PNG, hat only)         │
│    assets/gun_idle.png   (transparent PNG, gun no flash)     │
│    assets/gun_flash.png  (transparent PNG, gun + flash)      │
└───────────────────────────────────────────────────────────────┘
```

## Components

### Asset extraction (`tools/extract_assets.py`)

A Python 3 script using Pillow. Run once by the developer; the resulting PNGs are committed to `assets/`. Not part of the runtime.

Approach:

1. Open the reference GIF, iterate frames.
2. The reference uses a flat green for the checkmark body. Build a mask of "green checkmark pixels" by sampling that color (with a small tolerance) and zero those pixels' alpha.
3. The cowboy hat is static across frames — take any frame, isolate the hat region (a fixed bounding box determined empirically by inspecting the gif), save as `hat.png`.
4. The gun has at least two visual states (idle vs. firing/muzzle-flash). Identify the two distinct gun frames by clustering frames on the right-half pixel signature; save the no-flash representative as `gun_idle.png` and a flash-on representative as `gun_flash.png`.
5. All output PNGs are 112×112 with transparency, so the runtime can simply `drawImage` them at `(0,0)` and they overlay correctly. (We trade a bit of file size for compositing simplicity.)

If automatic separation produces artifacts, the developer fixes the PNGs by hand once. This is a one-shot tool; over-engineering it is not worth it.

### Runtime page (`index.html` + `cowboyify.js`)

**Load phase.** On page load: fetch `assets/hat.png`, `assets/gun_idle.png`, `assets/gun_flash.png` into `ImageBitmap`s. Render an empty 112×112 canvas with placeholder text inviting the user to drop an image.

**Input phase.** Accept input via:
- Drag-and-drop onto the page.
- A hidden `<input type="file" accept="image/*">` triggered by clicking the drop zone.
- Paste from clipboard (`paste` event listener on the document). Stretch — implement if the rest of the page is working; defer otherwise.

The input image is decoded via `createImageBitmap` and stored. Initial hat/gun positions are reset to the reference defaults.

**Compositing.** `composeFrame(flashOn)` runs on a 112×112 canvas:
1. Clear.
2. Draw the user image, scaled to fit inside 112×112 preserving aspect ratio, centered.
3. Draw `hat.png` at `hatXY` (default: matches the reference's hat position).
4. Draw `gun_flash.png` if `flashOn` else `gun_idle.png`, at `gunXY` (default: matches the reference).

**Live preview.** A `requestAnimationFrame` loop alternates `flashOn` on a ~160ms cycle (80ms on, 80ms off) so the preview shows what the exported GIF will look like.

**Drag-to-adjust.** Pointerdown on the canvas hit-tests against the hat and gun *opaque-pixel bounding boxes* (computed once at asset-load time by scanning each PNG's alpha channel for the tight rect of non-transparent pixels — not the full 112×112 frame). The topmost hit captures the pointer; pointermove updates `hatXY` or `gunXY`; pointerup releases. The live preview reflects changes immediately.

A "reset positions" button reverts to defaults.

**Export.** Clicking "Download .gif":
1. Build the two output frames by calling `composeFrame(false)` and `composeFrame(true)` and reading back `ImageData`.
2. Feed both frames to a `GIF` instance (gif.js) with `delay: 80`, `repeat: 0` (loop forever), `quality: 10`, `width: 112`, `height: 112`, `workers: 2`, `workerScript: 'vendor/gif.worker.js'`.
3. On `finished`, get the Blob and trigger a download as `cowboyified.gif`.

Show a small spinner / progress bar during encoding — gif.js emits progress events.

### Dependencies

- **gif.js** — vendored under `vendor/gif.js` and `vendor/gif.worker.js`. Pinned. (~30KB.) Chosen because it's the standard in-browser GIF encoder, has no build step, and works from `file://` URLs.
- No other JS dependencies. No framework. Vanilla JS.
- Python side: Pillow only, for `tools/extract_assets.py`.

## Data flow

```
   user drops image
        │
        ▼
   ImageBitmap (in memory)
        │
        ├─────► live preview loop ──► <canvas>  (alternates flash on/off)
        │
        ▼
   click "Download .gif"
        │
        ▼
   composeFrame(false)  ─┐
   composeFrame(true)   ─┴──► gif.js worker ──► Blob ──► <a download>
```

## File layout

```
cowboyify/
├── index.html
├── cowboyify.js
├── styles.css                  (small, optional — inline is fine)
├── assets/
│   ├── hat.png
│   ├── gun_idle.png
│   └── gun_flash.png
├── vendor/
│   ├── gif.js
│   └── gif.worker.js
├── tools/
│   └── extract_assets.py
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-28-cowboyify-emoji-design.md
└── reference/
    └── approved-cowboy-gun.gif  (copy of the user's source emoji,
                                   committed so extract_assets.py is
                                   reproducible)
```

## Error handling

Scoped to the realistic failure modes:

- **Asset PNGs fail to load** (developer error): log to console, show a one-line error in the page. The app is broken without them; no graceful degradation.
- **User drops a non-image / unsupported file**: catch the decode error, show "couldn't read that file — try a PNG, JPG, or GIF" inline. Don't clear the existing preview.
- **gif.js worker fails to start** (e.g., served from a context that blocks workers): catch and show a message suggesting they open `index.html` from a local server. Don't try to fall back to a non-worker path.

Out of scope: handling animated-GIF inputs (we treat them as the first frame), enormous inputs (the browser will downscale via canvas anyway), or input images larger than reasonable Slack-emoji sources.

## Testing

This is a vibe-coded project and the surface area is small, so the testing plan is correspondingly small:

- **Manual smoke test:** open `index.html` in Chrome and Safari, drop a few sample images (a square logo, a non-square photo, a transparent PNG, a JPG), confirm the live preview animates, drag the hat and gun, click download, verify the resulting `.gif` opens and animates correctly, upload it to a Slack scratch channel as a custom emoji and confirm it renders.
- **Asset extraction test:** after running `tools/extract_assets.py`, open the three output PNGs and eyeball them for clean transparency around the hat and gun.

No automated test suite. If the project grows, that's the time to add one.

## Open questions

None blocking. The next step is to write the implementation plan.

## Constraints noted for the plan

- Slack emoji size limit is 128KB. Two frames at 112×112 with reasonable gif.js quality settings will land well under this; verify during the manual smoke test.
- Slack emoji max display size is 128×128. We render at 112×112 to match the reference exactly.
- The page must work from `file://` (no required local server). gif.js workers do work from `file://` in current browsers; if a future browser blocks this, fall back to "open with a local server" rather than re-architecting.
