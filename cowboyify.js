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
