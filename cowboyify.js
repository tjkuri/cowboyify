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
const flipBtn = $('flip-assets');

let assets = null;
let userImage = null;
let hatXY = { x: 0, y: 0 };
let gunXY = { x: 0, y: 0 };
let flashOn = false;
let lastFlashToggle = 0;
let dragging = null;   // { kind: 'hat'|'gun', dx, dy }  or null
let facing = 'right';  // 'right' | 'left'

async function loadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

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
  const hatBB = facing === 'left' ? assets.hatBBoxFlipped : assets.hatBBox;
  const gunBB = facing === 'left' ? assets.gunBBoxFlipped : assets.gunBBox;
  // Gun is topmost in z-order in composeFrame, so test it first.
  if (inBox(gunXY, gunBB)) return 'gun';
  if (inBox(hatXY, hatBB)) return 'hat';
  return null;
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
  const hatImg = facing === 'left' ? assets.hatFlipped : assets.hat;
  const gunImg = facing === 'left'
    ? (fOn ? assets.gunFlashFlipped : assets.gunIdleFlipped)
    : (fOn ? assets.gunFlash : assets.gunIdle);
  c.drawImage(hatImg, hatXY.x, hatXY.y);
  c.drawImage(gunImg, gunXY.x, gunXY.y);
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
  flipBtn.addEventListener('click', () => {
    facing = facing === 'right' ? 'left' : 'right';
  });
  downloadBtn.addEventListener('click', exportGif);
}

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

async function init() {
  try {
    const [hat, gunIdle, gunFlash] = await Promise.all([
      loadImage('assets/hat.png'),
      loadImage('assets/gun_idle.png'),
      loadImage('assets/gun_flash.png'),
    ]);
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
    wireInputs();
    wireDrag();
    statusEl.textContent = 'Drop an image to begin.';
    requestAnimationFrame(tick);
  } catch (err) {
    statusEl.textContent = `Failed to load assets: ${err.message}`;
    console.error(err);
  }
}

init();
