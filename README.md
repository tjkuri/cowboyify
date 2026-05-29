# cowboyify

A tiny browser tool that turns any image into an animated Slack emoji — adds a cowboy hat and a flickering revolver, exports as a 112×112 looping GIF.

**Live demo:** https://tjkuri.github.io/cowboyify/

## How to use

1. Open the live site (or `index.html` from a local server).
2. Drop an image (or click to pick one).
3. Drag the hat and gun to position them on the canvas.
4. Use the **Hat** / **Gun** sliders to scale them.
5. Click **Flip ⇄** to face the other direction.
6. Click **Download .gif** to save the 112×112 looping GIF.
7. Upload it as a custom emoji in Slack.

## How it works

Pure client-side — no backend, no build step. Vanilla JS + HTML5 Canvas + [gif.js](https://github.com/jnordberg/gif.js) (vendored). The hat and gun PNGs were extracted from a reference Slack emoji.

## Customization

To swap in different gear, replace the three files in `assets/`:

- `hat.png` — overlaid on top
- `gun_idle.png` — gun without muzzle flash
- `gun_flash.png` — gun with muzzle flash

All three should be 112×112 with transparent backgrounds. The runtime auto-computes their hit-test boxes from each PNG's opaque pixels.

## Running locally

```bash
python3 -m http.server 8765
# then open http://localhost:8765
```

Opening `index.html` directly via `file://` mostly works but the GIF encoder uses a web worker that some browsers block on local files — the local server avoids that.
