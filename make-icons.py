"""Erzeugt die App-Icons im Glas-Stil (PWA + Android) mit Pillow.

Aufruf:  python3 make-icons.py            -> PWA-Icons im Projektordner
         python3 make-icons.py <res-dir>  -> zusätzlich Android-Mipmaps/Splash in <res-dir>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

TOP, BOTTOM = (18, 26, 44), (7, 8, 11)


def background(size):
    img = Image.new('RGB', (size, size), BOTTOM)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = min(1, y / (size * 0.75))
        d.line([(0, y), (size, y)], fill=tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)))
    # weicher blauer Schimmer oben links
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-size * .3, -size * .35, size * .7, size * .45], fill=(42, 79, 184, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(size * .12))
    img = img.convert('RGBA')
    img.alpha_composite(glow)
    return img


def motif(size, scale=1.0):
    """3×3 Glastasten, unten rechts die weiße =-Taste. scale < 1 = sichere Zone."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    area = size * 0.56 * scale
    gap = area * 0.09
    k = (area - 2 * gap) / 3
    x0 = (size - area) / 2
    y0 = (size - area) / 2
    r = k * 0.3
    for row in range(3):
        for col in range(3):
            x, y = x0 + col * (k + gap), y0 + row * (k + gap)
            box = [x, y, x + k, y + k]
            if row == 2 and col == 2:
                d.rounded_rectangle(box, r, fill=(244, 245, 247, 255))
                lw, lh = k * 0.42, max(2, k * 0.07)  # Gleichheitszeichen
                cx, cy = x + k / 2, y + k / 2
                for dy in (-k * 0.09, k * 0.09):
                    bar = [cx - lw / 2, cy + dy - lh / 2, cx + lw / 2, cy + dy + lh / 2]
                    if lw >= 8:
                        d.rounded_rectangle(bar, lh / 2, fill=(10, 11, 15, 255))
                    else:  # sehr kleine Icons: gerade Striche
                        d.rectangle(bar, fill=(10, 11, 15, 255))
            else:
                d.rounded_rectangle(box, r, fill=(255, 255, 255, 30), outline=(255, 255, 255, 70), width=max(1, round(size / 256)))
    return layer


def icon(size, scale=1.0, rounded=True):
    img = background(size)
    img.alpha_composite(motif(size, scale))
    if not rounded:
        return img
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], size * 0.22, fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def android(res):
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for dpi, px in legacy.items():
        folder = os.path.join(res, 'mipmap-' + dpi)
        icon(px).save(os.path.join(folder, 'ic_launcher.png'))
        mask = Image.new('L', (px, px), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, px - 1, px - 1], fill=255)
        out = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        out.paste(icon(px, rounded=False), (0, 0), mask)
        out.save(os.path.join(folder, 'ic_launcher_round.png'))
        # adaptives Icon: 108dp-Ebene, Motiv in der 66dp-Zone
        icon(int(px * 108 / 48), scale=0.62, rounded=False).save(os.path.join(folder, 'ic_launcher_foreground.png'))
    # Startbildschirm: dunkler Grund, kleines Icon in der Mitte
    for root, _, files in os.walk(res):
        for f in files:
            if f == 'splash.png':
                p = os.path.join(root, f)
                w, h = Image.open(p).size
                s = Image.new('RGBA', (w, h), BOTTOM + (255,))
                i = icon(min(w, h) // 5)
                s.alpha_composite(i, ((w - i.width) // 2, (h - i.height) // 2))
                s.convert('RGB').save(p)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    icon(192).save(os.path.join(here, 'icon-192.png'))
    icon(512).save(os.path.join(here, 'icon-512.png'))
    icon(512, scale=0.8, rounded=False).save(os.path.join(here, 'icon-maskable-512.png'))
    if len(sys.argv) > 1:
        android(sys.argv[1])


if __name__ == '__main__':
    main()
