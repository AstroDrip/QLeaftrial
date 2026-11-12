"""Cuts plants out of the client's white-background studio photographs for the home page hero.

    python scripts/catalogue/hero_cutouts.py "C:\\Users\\HP\\Desktop\\plannts"

The background is found by flooding inwards from the image edges through near-white, low-saturation
pixels, so white leaves or pots inside the plant are never removed. Inside that background region the
alpha follows how much darker than white each pixel is: the soft studio shadow under the pot survives as a
real, semi-transparent shadow instead of a hard cut-out edge. Output: apps/web/public/media/hero/*.webp
(lossy WebP with alpha), cropped to the plant and its shadow. The source folder is only read.
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from process_plant_photos import photo_index  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/public/media/hero"

# name: (photo number, output height in px)
HERO_PLANTS = {
    "areca": (64, 900),
    "orbifolia": (49, 560),
    "marginata": (108, 900),
    "prince-orange": (112, 520),
    "rosso": (119, 420),
    "bird-nest": (36, 460),
    "dracaena-compacta": (102, 760),
}


def background_mask(rgb: np.ndarray) -> np.ndarray:
    height, width, _ = rgb.shape
    light = rgb.min(axis=2)
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    candidate = (light > 214) & (spread < 22)
    seen = np.zeros((height, width), dtype=bool)
    queue = deque()
    for x in range(width):
        for y in (0, height - 1):
            if candidate[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if candidate[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < height and 0 <= nx < width and candidate[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    # Pockets of studio white enclosed by leaves (between palm fronds, under a pot rim) are background too.
    # The hero plants have no pure-white foliage, so near-pure white anywhere is safe to treat as background.
    enclosed = (light > 238) & (spread < 12)
    return seen | enclosed


def cut(source: Path, target: Path, out_height: int) -> tuple[int, int]:
    image = Image.open(source).convert("RGB")
    rgb = np.asarray(image).astype(np.int16)
    background = background_mask(rgb)
    darkness = (255 - rgb.min(axis=2)).astype(np.float32)
    # In the background, a pixel 40 levels below white is a fully dark shadow; pure white is transparent.
    shadow_alpha = np.clip((darkness - 6) / 40.0, 0, 1) * 0.85
    alpha = np.where(background, shadow_alpha, 1.0)
    alpha_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    # Shadow pixels keep a neutral dark colour so they darken whatever is behind them.
    colour = np.where(background[..., None], np.array([40, 38, 30], dtype=np.int16), rgb).astype(np.uint8)
    rgba = Image.fromarray(colour).convert("RGBA")
    rgba.putalpha(alpha_img)
    box = rgba.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    rgba = rgba.crop(box)
    scale = out_height / rgba.height
    rgba = rgba.resize((max(1, round(rgba.width * scale)), out_height), Image.LANCZOS) if scale < 1 else rgba
    rgba.save(target, "WEBP", quality=80, alpha_quality=90, method=6)
    return rgba.size


def backdrop(target: Path, width: int = 1800, height: int = 1000) -> None:
    """A warm plaster wall meeting a stone floor, lit by soft daylight from the upper right.

    Built from layered noise and gradients rather than a stock photo, so it has real surface texture
    without any licensing question. The floor line sits at 80% of the height.
    """
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    wall = np.array([239, 229, 204], dtype=np.float32)
    floor = np.array([214, 196, 160], dtype=np.float32)
    horizon = height * 0.8
    base = np.where((y < horizon)[..., None], wall, floor)
    # Daylight: brighter towards the upper right, falling off softly.
    light = np.exp(-(((x - width * 0.78) / (width * 0.55)) ** 2 + ((y - height * 0.15) / (height * 0.8)) ** 2))
    base = base * (0.9 + 0.12 * light[..., None])
    # A soft contact shadow where wall meets floor.
    edge = np.exp(-((y - horizon) / 22.0) ** 2) * 0.06
    base = base * (1 - edge[..., None])
    # Plaster: fine grain plus a broader, blotchy variation.
    fine = rng.normal(0, 3.2, (height, width, 1)).astype(np.float32)
    coarse = np.asarray(Image.fromarray(rng.normal(128, 40, (height // 24, width // 24)).clip(0, 255).astype(np.uint8))
                        .resize((width, height), Image.BICUBIC)).astype(np.float32)[..., None]
    base = base + fine + (coarse - 128) * 0.035
    Image.fromarray(base.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4)).save(target, "WEBP", quality=72, method=6)


def main(source: Path):
    OUT.mkdir(parents=True, exist_ok=True)
    backdrop(OUT / "backdrop.webp")
    print("backdrop", (OUT / "backdrop.webp").stat().st_size // 1024, "KB")
    files = photo_index(source)
    for name, (number, height) in HERO_PLANTS.items():
        folder, file = files[number]
        size = cut(source / folder / file, OUT / f"{name}.webp", height)
        print(name, size, (OUT / f"{name}.webp").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
