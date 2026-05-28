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
