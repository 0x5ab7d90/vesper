"""Render the drop mascot (rest pose) as favicon.svg plus the PNG sizes.

Run from apps/site: python scripts/gen-favicon.py [--fill #7A3FE4]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

FILL = sys.argv[sys.argv.index("--fill") + 1] if "--fill" in sys.argv else "#7A3FE4"
BG = "#121212"  # apple touch icons need an opaque background
BODY = "M-44.0 -39.8 A62.2 62.2 0 1 0 44.0 -39.8 L10.6 -73.2 A15.0 15.0 0 0 0 -10.6 -73.2 Z"
BOX = 150
CX, CY = 75, 79
TILT = -23
EYES = [(31.7 - 14, -8.3), (31.7 + 14, -8.3)]
EYE_W, EYE_H = 14.5, 32
PUBLIC = Path(__file__).resolve().parent.parent / "public"

# --- SVG ---
eyes = "".join(
    f'<rect x="{x - EYE_W / 2:.2f}" y="{y - EYE_H / 2:.2f}" width="{EYE_W}" height="{EYE_H}" rx="{EYE_W / 2}" fill="#fff"/>'
    for x, y in EYES
)
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BOX} {BOX}">'
    f'<defs><clipPath id="c"><path d="{BODY}"/></clipPath></defs>'
    f'<g transform="translate({CX} {CY}) rotate({TILT})">'
    f'<path d="{BODY}" fill="{FILL}"/>'
    f'<g clip-path="url(#c)">{eyes}</g>'
    f"</g></svg>\n"
)
(PUBLIC / "favicon.svg").write_text(svg, encoding="utf-8", newline="\n")

# --- PNG ---
S = 8
W = BOX * S


def draw_drop() -> Image.Image:
    body = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(body)
    ox, oy = CX * S, CY * S

    def P(x, y):
        return (ox + x * S, oy + y * S)

    def circle(cx, cy, r):
        d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], fill=255)

    circle(0, 4.2, 62.2)
    circle(0, -62.6, 15)
    d.polygon([P(-44, -39.8), P(44, -39.8), P(10.6, -73.2), P(-10.6, -73.2)], fill=255)

    eyes = Image.new("L", (W, W), 0)
    e = ImageDraw.Draw(eyes)
    for x, y in EYES:
        e.rounded_rectangle(
            [P(x - EYE_W / 2, y - EYE_H / 2), P(x + EYE_W / 2, y + EYE_H / 2)],
            radius=EYE_W / 2 * S,
            fill=255,
        )
    eyes = Image.composite(eyes, Image.new("L", (W, W), 0), body)

    out = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (W, W), FILL), mask=body)
    out.paste(Image.new("RGBA", (W, W), "#ffffff"), mask=eyes)
    return out


art = draw_drop().rotate(-TILT, resample=Image.BICUBIC, center=(CX * S, CY * S))


def save(name: str, size: int, bg: str | None = None) -> None:
    img = art.resize((size, size), Image.LANCZOS)
    if bg:
        base = Image.new("RGBA", (size, size), bg)
        base.alpha_composite(img)
        img = base.convert("RGB")
    img.save(PUBLIC / name, optimize=True)
    print(name, size)


save("favicon.png", 32)
save("favicon-192.png", 192)
save("apple-touch-icon.png", 180, bg=BG)
