# cowboyify-emoji — Mirror Assets — Design

**Date:** 2026-05-28
**Status:** Approved (brainstorming) — pending implementation plan

## Purpose

Add a toggle that horizontally flips the hat and gun assets so the cowboy gear can face either direction. Default is the existing direction (gear on the right side of the canvas, as in the reference GIF). The user image itself is not flipped.

## Non-goals

- Flipping the dropped user image (out of scope — input typically already faces the desired way).
- Separate per-asset flip toggles (one toggle controls both hat and gun together).
- Generating mirrored PNG assets at build time. Flips are computed at runtime.

## Approach

Pre-render flipped canvas variants of all three assets once at load time, alongside the originals. Add a single `facing` state variable. In `composeFrame` and `hitTest`, pick the original or flipped variant based on `facing`. A "Flip ⇄" button toggles `facing`.

The hat and gun positions (`hatXY`, `gunXY`) remain 112×112 top-left coordinates and do not change when flipping. Drag math is unchanged.

## Changes

### `cowboyify.js`

**New helper.** `flipCanvas(bitmap)` returns an `OffscreenCanvas` containing the bitmap drawn mirrored horizontally:

```js
function flipCanvas(bm) {
  const off = new OffscreenCanvas(bm.width, bm.height);
  const c = off.getContext('2d');
  c.translate(bm.width, 0);
  c.scale(-1, 1);
  c.drawImage(bm, 0, 0);
  return off;
}
```

**New state.** `let facing = 'right';` (alongside the existing module-level state).

**`init()` additions.** After computing `hatBBox` and `gunBBox`, also build flipped variants and their bboxes:

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

Where `reflectBBox(bb) = { x: CANVAS_SIZE - bb.x - bb.w, y: bb.y, w: bb.w, h: bb.h }`. Defined inline or as a top-level helper.

**`composeFrame` change.** Replace the two `drawImage` calls with `facing`-aware lookups:

```js
const hatImg = facing === 'left' ? assets.hatFlipped : assets.hat;
const gunImg = facing === 'left'
  ? (fOn ? assets.gunFlashFlipped : assets.gunIdleFlipped)
  : (fOn ? assets.gunFlash : assets.gunIdle);
c.drawImage(hatImg, hatXY.x, hatXY.y);
c.drawImage(gunImg, gunXY.x, gunXY.y);
```

**`hitTest` change.** Use the `facing`-appropriate bbox:

```js
const hatBB = facing === 'left' ? assets.hatBBoxFlipped : assets.hatBBox;
const gunBB = facing === 'left' ? assets.gunBBoxFlipped : assets.gunBBox;
if (inBox(gunXY, gunBB)) return 'gun';
if (inBox(hatXY, hatBB)) return 'hat';
```

**Wire flip button.** In `wireInputs`, add:

```js
flipBtn.addEventListener('click', () => {
  facing = facing === 'right' ? 'left' : 'right';
});
```

And add `const flipBtn = $('flip-assets');` near the other DOM refs.

### `index.html`

Add one `<button id="flip-assets">Flip ⇄</button>` in the controls row next to `#reset-positions` and `#download`. No CSS changes needed — it inherits the existing button styling.

## Export behavior

The GIF export already routes through `composeFrame` via `buildFrameCanvas(fOn)`. With the changes above, the exported GIF picks up the current `facing` value automatically. No changes to `exportGif`.

## Reset button behavior

Out of scope: the existing "Reset positions" button does not touch `facing`. (If the user has flipped and then resets positions, the gear stays flipped at default coords. This matches the user mental model: position and direction are independent.)

## Initial state

`facing = 'right'` matches the reference GIF and current behavior — no visual change on load.

## Testing

Manual smoke test only (consistent with the original spec's testing approach):

- Open `index.html`, drop an image. Confirm gear shows facing right (default).
- Click "Flip ⇄". Confirm hat and gun mirror horizontally; muzzle flash still flickers; positions don't jump.
- Drag the flipped hat and gun. Confirm drag still works — clicking on the visible flipped gear picks it up.
- Click "Flip ⇄" again. Confirm it goes back to facing right.
- With facing left, click "Download .gif". Confirm the exported GIF shows the gear facing left.
- Verify exported GIF file size is still under the 128 KB Slack emoji limit.

## File layout

No new files. Only `index.html` and `cowboyify.js` are modified.
