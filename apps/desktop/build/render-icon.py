"""Render the Vesper app icon: the drop mascot as a glossy water drop on a blue squircle.

With --preview DIR it writes icon-1024.png and a preview sheet there. With --commit it writes
build/icon-source.png, which generate-icons.mjs turns into the platform formats.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

S = 2  # supersample
N = 1024 * S
HERE = Path(__file__).resolve().parent

# Palette
BG_TOP = (140, 187, 255)
BG_BOTTOM = (57, 120, 240)
DROP_TOP = (238, 246, 255)
DROP_BOTTOM = (150, 196, 255)
SHADE = (30, 70, 170)

# Drop geometry (170-unit viewBox from the site component)
BODY_CIRCLE = (0.0, 4.2, 62.2)
TIP_CIRCLE = (0.0, -62.6, 15.0)
TANGENTS = [(-44.0, -39.8), (44.0, -39.8), (10.6, -73.2), (-10.6, -73.2)]
TILT = -23  # degrees, rest pose
EYE_W, EYE_H = 14.5 * 1.55, 32 * 1.55  # the wide eyes
EYES = [(4 - 17, -12), (4 + 17, -12)]
DROP_SCALE = 5.3 * S  # 170 units -> ~900px drop width at 1024
DROP_CENTER = (512 * S, 548 * S)


def lerp_gradient(size: int, top, bottom, gamma: float = 1.0) -> Image.Image:
    t = (np.linspace(0, 1, size) ** gamma)[:, None]
    rows = np.array(top) * (1 - t) + np.array(bottom) * t
    arr = np.repeat(rows[:, None, :], size, axis=1).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def squircle_mask(size: int, inset: float = 0.0, n: float = 5.0) -> Image.Image:
    """Superellipse |x|^n + |y|^n <= 1, the continuous-curvature square of app icons."""
    r = size / 2 - inset
    y, x = np.mgrid[0:size, 0:size]
    u = (np.abs(x + 0.5 - size / 2) / r) ** n + (np.abs(y + 0.5 - size / 2) / r) ** n
    # soft edge over ~1.5px for antialiasing
    edge = np.clip((1 - u) * r / n * 0.5 + 0.5, 0, 1)
    return Image.fromarray((edge * 255).astype(np.uint8), "L")


def blur(img: Image.Image, radius: float) -> Image.Image:
    return img.filter(ImageFilter.GaussianBlur(radius * S))


def solid(color, alpha_mask: Image.Image, alpha: float = 1.0) -> Image.Image:
    """An RGBA layer of `color` whose alpha is `alpha_mask` scaled by `alpha`."""
    a = alpha_mask.point(lambda v: int(v * alpha))
    layer = Image.new("RGBA", alpha_mask.size, color + (0,))
    layer.putalpha(a)
    return layer


def vertical_weight(size: int, start: float, end: float) -> Image.Image:
    """L mask that is 255 at `start` (0..1 of height) fading to 0 at `end`."""
    t = np.linspace(0, 1, size)
    w = np.clip((t - end) / (start - end), 0, 1)
    arr = np.repeat(w[:, None], size, axis=1)
    return Image.fromarray((arr * 255).astype(np.uint8), "L")


def drop_mask() -> Image.Image:
    """The drop silhouette, rotated into the rest pose, on an N x N canvas."""
    m = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(m)
    cx, cy = DROP_CENTER
    k = DROP_SCALE

    def P(x, y):
        return (cx + x * k, cy + y * k)

    for (x, y, r) in (BODY_CIRCLE, TIP_CIRCLE):
        d.ellipse([P(x - r, y - r), P(x + r, y + r)], fill=255)
    d.polygon([P(*p) for p in TANGENTS], fill=255)
    return m.rotate(-TILT, resample=Image.BICUBIC, center=DROP_CENTER)


def eyes_mask() -> Image.Image:
    m = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(m)
    cx, cy = DROP_CENTER
    k = DROP_SCALE
    for ex, ey in EYES:
        d.rounded_rectangle(
            [
                (cx + (ex - EYE_W / 2) * k, cy + (ey - EYE_H / 2) * k),
                (cx + (ex + EYE_W / 2) * k, cy + (ey + EYE_H / 2) * k),
            ],
            radius=EYE_W / 2 * k,
            fill=255,
        )
    return m.rotate(-TILT, resample=Image.BICUBIC, center=DROP_CENTER)


def erode(mask: Image.Image, px: float) -> Image.Image:
    """Approximate erosion by `px`: blur, then keep only the fully covered core."""
    return mask.filter(ImageFilter.GaussianBlur(px * S / 1.6)).point(lambda v: 255 if v >= 250 else 0)


def render() -> Image.Image:
    tile = squircle_mask(N)

    # ---- background plate ----------------------------------------------------------------
    plate = lerp_gradient(N, BG_TOP, BG_BOTTOM, gamma=1.15).convert("RGBA")
    # a soft light pooling at the top centre
    pool = Image.new("L", (N, N), 0)
    ImageDraw.Draw(pool).ellipse([N * 0.1, -N * 0.35, N * 0.9, N * 0.45], fill=255)
    plate.alpha_composite(solid((200, 225, 255), blur(pool, 120), 0.35))

    # ---- edge treatment: bright rim at the top, darker rim at the bottom -------------------
    rim = ImageChops.subtract(tile, erode(tile, 9))
    rim_soft = blur(rim, 6)
    plate.alpha_composite(solid((255, 255, 255), ImageChops.multiply(rim_soft, vertical_weight(N, 0.0, 0.7)), 0.75))
    plate.alpha_composite(solid(SHADE, ImageChops.multiply(rim_soft, vertical_weight(N, 1.0, 0.35)), 0.55))
    # inner vignette so the plate reads as a slab, not a flat fill
    inner = ImageChops.subtract(tile, erode(tile, 40))
    plate.alpha_composite(solid(SHADE, ImageChops.multiply(blur(inner, 30), vertical_weight(N, 1.0, 0.2)), 0.22))

    # ---- drop -------------------------------------------------------------------------------
    D = drop_mask()
    # outer glow and a shadow that settles under it
    plate.alpha_composite(solid((255, 255, 255), blur(D, 30), 0.42))
    plate.alpha_composite(solid(SHADE, blur(ImageChops.offset(D, 0, int(34 * S)), 40), 0.38))

    # translucent body: a light gradient, more opaque towards the top
    body_grad = lerp_gradient(N, DROP_TOP, DROP_BOTTOM, gamma=0.9)
    body = body_grad.convert("RGBA")
    body.putalpha(D.point(lambda v: int(v * 0.62)))
    plate.alpha_composite(body)

    # inner shading along the lower right, where the water is thickest
    shade = ImageChops.subtract(D, ImageChops.offset(D, -int(26 * S), -int(30 * S)))
    shade = ImageChops.multiply(blur(shade, 34), D)
    plate.alpha_composite(solid(SHADE, shade, 0.34))

    # frosted rim: the bright edge that makes it read as glass
    drim = ImageChops.subtract(D, erode(D, 12))
    plate.alpha_composite(solid((255, 255, 255), ImageChops.multiply(blur(drim, 14), D), 0.9))
    plate.alpha_composite(solid((255, 255, 255), ImageChops.multiply(blur(drim, 3), D), 0.55))

    # specular: a soft highlight up near the tip on the lit side
    spec = Image.new("L", (N, N), 0)
    cx, cy = DROP_CENTER
    ImageDraw.Draw(spec).ellipse([cx - 230 * S, cy - 300 * S, cx - 40 * S, cy - 130 * S], fill=255)
    spec = ImageChops.multiply(blur(spec, 60), D)
    plate.alpha_composite(solid((255, 255, 255), spec, 0.45))

    # ---- eyes: glowing white ----------------------------------------------------------------
    E = ImageChops.multiply(eyes_mask(), D)
    plate.alpha_composite(solid((255, 255, 255), blur(E, 22), 0.85))
    plate.alpha_composite(solid((255, 255, 255), blur(E, 3), 1.0))

    # ---- clip to the squircle ---------------------------------------------------------------
    out = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    out.paste(plate, mask=tile)
    return out.resize((1024, 1024), Image.LANCZOS)


def preview_sheet(icon: Image.Image, out_dir: Path) -> None:
    """Icon at several sizes on dark and light, plus a mac-style shadowed version."""
    W, H = 1400, 720
    sheet = Image.new("RGB", (W, H), (18, 18, 18))
    ImageDraw.Draw(sheet).rectangle([0, H // 2, W, H], fill=(236, 238, 242))

    def shadowed(img: Image.Image, size: int) -> Image.Image:
        pad = int(size * 0.14)
        cv = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
        sh = Image.new("RGBA", cv.size, (0, 0, 0, 0))
        m = img.resize((size, size), Image.LANCZOS).getchannel("A")
        sh.paste((0, 0, 0, 110), (pad, pad + int(size * 0.05)), m)
        sh = sh.filter(ImageFilter.GaussianBlur(size * 0.045))
        cv.alpha_composite(sh)
        cv.alpha_composite(img.resize((size, size), Image.LANCZOS), (pad, pad))
        return cv

    for row, y0 in ((0, 0), (1, H // 2)):
        x = 60
        for size in (256, 128, 64, 48, 32, 16):
            im = shadowed(icon, size)
            sheet.paste(im, (x, y0 + (H // 2 - im.height) // 2), im)
            x += im.width + 40
    sheet.save(out_dir / "icon-preview.png", optimize=True)


if __name__ == "__main__":
    icon = render()
    if "--commit" in sys.argv:
        icon.save(HERE / "icon-source.png", optimize=True)
        print("wrote", HERE / "icon-source.png")
    if "--preview" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--preview") + 1])
        out.mkdir(parents=True, exist_ok=True)
        icon.save(out / "icon-1024.png", optimize=True)
        preview_sheet(icon, out)
        print("preview in", out)
