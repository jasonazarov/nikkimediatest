#!/usr/bin/env python3
"""
Erzeugt das Vorschaubild für geteilte Links (Open Graph, 1200 × 630) und das
Logo für die strukturierten Daten (512 × 512), im Grün-Schwarz der Seite.

    python3 tools/og_image.py

Schreibt public/img/og/nikki-media.png und public/img/og/logo.png.
Braucht Pillow (`pip install pillow`) und die Schrift Inter; fehlt Inter,
nimmt das Skript DejaVu Sans.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "img" / "og"

GREEN = (47, 224, 140)
GREEN_HI = (156, 246, 200)
TEXT = (238, 247, 241)
MUTE = (163, 184, 172)

FONT_DIRS = [Path("/usr/share/fonts/opentype/inter"), Path("/usr/share/fonts/truetype/dejavu")]


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    names = {
        "black": ["InterDisplay-Black.otf", "Inter-Black.otf", "DejaVuSans-Bold.ttf"],
        "bold": ["InterDisplay-Bold.otf", "Inter-Bold.otf", "DejaVuSans-Bold.ttf"],
        "medium": ["Inter-Medium.otf", "DejaVuSans.ttf"],
    }[weight]
    for d in FONT_DIRS:
        for n in names:
            if (d / n).exists():
                return ImageFont.truetype(str(d / n), size)
    return ImageFont.load_default()


def glow(size: tuple[int, int], center: tuple[int, int], radius: int, color: tuple[int, int, int], alpha: int) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y = center
    d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, alpha))
    return layer.filter(ImageFilter.GaussianBlur(radius // 2))


def mark(size: int) -> Image.Image:
    """Das „N“-Zeichen: abgerundetes Quadrat mit grünem Verlauf."""
    m = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    grad = Image.new("RGBA", (size, size))
    gd = ImageDraw.Draw(grad)
    for i in range(size * 2):
        t = i / (size * 2)
        c = tuple(int(a + (b - a) * t) for a, b in zip((184, 251, 217), (15, 138, 82)))
        gd.line([(i, 0), (0, i)], fill=(*c, 255), width=2)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 3.3, fill=255)
    m.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(m)
    f = font("black", int(size * 0.58))
    d.text((size / 2, size / 2 + size * 0.02), "N", font=f, fill=(2, 22, 12), anchor="mm")
    return m


def og() -> Image.Image:
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    img = Image.alpha_composite(img, glow((W, H), (140, -40), 420, GREEN, 70))
    img = Image.alpha_composite(img, glow((W, H), (1160, 640), 380, (16, 185, 129), 55))
    img = img.convert("RGB")
    d = ImageDraw.Draw(img, "RGBA")  # auf RGB mit RGBA-Farben: Halbtransparentes wird gemischt statt überschrieben

    # feines Raster
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 8))
    for y in range(0, H, 60):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 8))

    m = mark(84)
    img.paste(m, (72, 66), m)
    d.text((176, 82), "NIKKI MEDIA", font=font("bold", 34), fill=TEXT)
    d.text((176, 124), "Clipping-Agentur · DACH", font=font("medium", 22), fill=MUTE)

    d.text((72, 228), "Millionen organische Views.", font=font("black", 70), fill=TEXT)
    d.text((72, 312), "Bezahlt nur nach echten Views.", font=font("black", 70), fill=GREEN_HI)

    # Kennzahlen-Pillen
    x = 72
    for label in ["5.000+ Clipper", "1 Mio. Views = 5.000 €", "TikTok · Instagram · YouTube"]:
        f = font("medium", 26)
        w = d.textlength(label, font=f)
        d.rounded_rectangle((x, 448, x + w + 44, 504), radius=28, fill=(255, 255, 255, 14), outline=(47, 224, 140, 90), width=2)
        d.text((x + 22, 476), label, font=f, fill=TEXT, anchor="lm")
        x += w + 60

    d.text((72, 560), "nikkimedia.co", font=font("medium", 24), fill=MUTE)
    return img.convert("RGB")


def logo() -> Image.Image:
    img = Image.new("RGBA", (512, 512), (0, 0, 0, 255))
    img.alpha_composite(mark(400), (56, 56))
    return img.convert("RGB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    og().save(OUT / "nikki-media.png", optimize=True)
    logo().save(OUT / "logo.png", optimize=True)
    for f in ("nikki-media.png", "logo.png"):
        print(f"✓ {(OUT / f).relative_to(ROOT)} ({(OUT / f).stat().st_size // 1024} KB)")
