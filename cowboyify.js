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
