#!/usr/bin/env python3
"""Generate the extension's PNG icons with no third-party dependencies.

Draws a rounded LinkedIn-blue tile with a white "filter funnel" mark (three
stacked bars of decreasing width). Uses only the Python standard library so it
can be run anywhere without installing Pillow.

Usage:  python3 tools/gen_icons.py
Output: icons/icon16.png, icons/icon48.png, icons/icon128.png
"""
import os
import struct
import zlib

BLUE = (10, 102, 194)   # #0A66C2
WHITE = (255, 255, 255)


def _png(width, height, pixels):
    """Encode RGBA pixels (flat list of (r,g,b,a)) into PNG bytes."""
    def chunk(typ, data):
        body = typ + data
        return (struct.pack(">I", len(data)) + body +
                struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None) per scanline
        for x in range(width):
            r, g, b, a = pixels[y * width + x]
            raw += bytes((r, g, b, a))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _in_rounded_rect(x, y, size, radius):
    """True if pixel center lies inside a square with rounded corners."""
    cx = min(max(x, radius), size - 1 - radius)
    cy = min(max(y, radius), size - 1 - radius)
    dx = x - cx
    dy = y - cy
    return (dx * dx + dy * dy) <= (radius * radius)


def make_icon(size):
    radius = max(1, round(size * 0.18))

    # Three centered bars forming a funnel: widths shrink top -> bottom.
    bar_h = max(1, round(size * 0.12))
    gap = max(1, round(size * 0.10))
    total = bar_h * 3 + gap * 2
    top = (size - total) // 2
    widths = [round(size * 0.58), round(size * 0.40), round(size * 0.22)]
    bars = []
    for i, w in enumerate(widths):
        y0 = top + i * (bar_h + gap)
        x0 = (size - w) // 2
        bars.append((x0, y0, x0 + w, y0 + bar_h))

    pixels = []
    for y in range(size):
        for x in range(size):
            if not _in_rounded_rect(x, y, size, radius):
                pixels.append((0, 0, 0, 0))  # transparent outside the tile
                continue
            color = BLUE
            for (bx0, by0, bx1, by1) in bars:
                if bx0 <= x < bx1 and by0 <= y < by1:
                    color = WHITE
                    break
            pixels.append((color[0], color[1], color[2], 255))

    return _png(size, size, pixels)


def main():
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 48, 128):
        path = os.path.join(out_dir, "icon%d.png" % size)
        with open(path, "wb") as f:
            f.write(make_icon(size))
        print("wrote", path)


if __name__ == "__main__":
    main()
