#!/usr/bin/env python3
"""Fallback renderer: compose spread masters in code when the image API is unavailable.

Follows each book's sequence-plan.md with the original photographs (faces untouched),
then reuses generate.py to split leaves and write book-data.js. Masters recorded in the
manifest as produced by images/edits are left alone unless --force is given.

Usage: python3 production/compose.py <book-id|all> [--only cover s01 ...] [--force]
"""
import argparse, json, math, random, shutil, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageStat

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate  # noqa: E402

W, H, LW = 1536, 1024, 768
FONT_SONG = ("/System/Library/Fonts/Supplemental/Songti.ttc", 6)
FONT_HEI_LIGHT = ("/System/Library/Fonts/STHeiti Light.ttc", 1)
FONT_HEI_MEDIUM = ("/System/Library/Fonts/STHeiti Medium.ttc", 1)

# Approximate subject centers (fractions of width/height), read from the contact sheet.
FOCUS = {
    "photo1.jpg": (0.62, 0.36), "photo2.jpg": (0.52, 0.30), "photo3.jpg": (0.32, 0.40),
    "photo4.jpg": (0.54, 0.45), "photo5.jpg": (0.52, 0.45), "photo6.jpg": (0.50, 0.45),
    "photo7.jpg": (0.56, 0.45), "photo8.jpg": (0.51, 0.50), "photo9.jpg": (0.53, 0.45),
    "photo10.jpg": (0.60, 0.45), "photo11.jpg": (0.55, 0.40), "photo12.jpg": (0.53, 0.45),
    "photo13.jpg": (0.50, 0.55), "photo14.jpg": (0.53, 0.50), "photo15.jpg": (0.54, 0.40),
    "photo16.jpg": (0.52, 0.45), "photo17.jpg": (0.49, 0.40), "photo18.jpg": (0.56, 0.50),
}
_cache = {}


def rgb(hexstr):
    hexstr = hexstr.lstrip("#")
    return tuple(int(hexstr[i:i + 2], 16) for i in (0, 2, 4))


def photo(name):
    if name not in _cache:
        _cache[name] = ImageOps.exif_transpose(Image.open(generate.PHOTOS / name)).convert("RGB")
    return _cache[name]


def crop(name, w, h, focus=None, zoom=1.0):
    """Crop to w:h around focus (fractions), zoom > 1 crops tighter; returns (image, box)."""
    img = photo(name)
    fx, fy = focus or FOCUS[name]
    scale = min(img.width / w, img.height / h) / zoom
    cw, ch = w * scale, h * scale
    x0 = min(max(fx * img.width - cw / 2, 0), img.width - cw)
    y0 = min(max(fy * img.height - ch / 2, 0), img.height - ch)
    box = (x0, y0, x0 + cw, y0 + ch)
    return img.resize((w, h), Image.LANCZOS, box=box), box


def font(spec, size):
    return ImageFont.truetype(spec[0], size, index=spec[1])


def text(canvas, xy, s, spec, size, fill, anchor="la", tracking=0):
    draw, f = ImageDraw.Draw(canvas), font(spec, size)
    if not tracking:
        draw.text(xy, s, font=f, fill=fill, anchor=anchor)
        return
    widths = [f.getlength(c) for c in s]
    total = sum(widths) + tracking * (len(s) - 1)
    x = xy[0] - (total / 2 if anchor[0] == "m" else total if anchor[0] == "r" else 0)
    for c, cw in zip(s, widths):
        draw.text((x, xy[1]), c, font=f, fill=fill, anchor="l" + anchor[1])
        x += cw + tracking


def vtext(canvas, x, y, s, spec, size, fill, gap=1.3):
    draw, f = ImageDraw.Draw(canvas), font(spec, size)
    for i, c in enumerate(s):
        draw.text((x, y + i * size * gap), c, font=f, fill=fill, anchor="mt")


def leaf(cx, cy, length, width, angle, steps=18):
    pts = []
    for side in (1, -1):
        rng = range(steps + 1) if side == 1 else range(steps, -1, -1)
        for i in rng:
            t = i / steps
            pts.append((t * length - length / 2, side * width / 2 * math.sin(math.pi * t) ** 0.8))
    ca, sa = math.cos(angle), math.sin(angle)
    return [(cx + px * ca - py * sa, cy + px * sa + py * ca) for px, py in pts]


def leaf_cluster(mask, cx, cy, rx, ry, rnd, n=26, size=(70, 150), core=0.62, fill=255):
    draw = ImageDraw.Draw(mask)
    draw.ellipse((cx - rx * core, cy - ry * core, cx + rx * core, cy + ry * core), fill=fill)
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.35, 0.85)
        x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
        length = rnd.uniform(*size)
        draw.polygon(leaf(x, y, length, length * 0.42, a + rnd.uniform(-0.7, 0.7)), fill=fill)


def circle(img, d):
    mask = Image.new("L", (d * 4, d * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d * 4 - 1, d * 4 - 1), fill=255)
    return img.resize((d, d), Image.LANCZOS), mask.resize((d, d), Image.LANCZOS)


def plane(name, box, size, flat=0.6, blur=3):
    """A flat surface in the colour and texture of a patch of the photo (box as fractions)."""
    img = photo(name)
    b = (box[0] * img.width, box[1] * img.height, box[2] * img.width, box[3] * img.height)
    patch = img.crop(tuple(int(v) for v in b))
    tex = patch.resize(size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(blur))
    mean = tuple(int(v) for v in ImageStat.Stat(patch).median)
    return Image.blend(tex, Image.new("RGB", size, mean), flat), mean


def ramp(w, h, side, length):
    """Alpha mask that is opaque except for a fade of `length` px on one side."""
    m = Image.new("L", (w, h), 255)
    px = m.load()
    for i in range(length):
        v = int(255 * (i / length) ** 1.4)
        for j in range(h if side in ("left", "right") else w):
            if side == "left": px[i, j] = v
            elif side == "right": px[w - 1 - i, j] = v
            elif side == "top": px[j, i] = v
            else: px[j, h - 1 - i] = v
    return m


def grain(img, sigma=14, strength=0.35):
    """Fine monochrome paper grain; overlay with mid-grey noise leaves tones unchanged on average."""
    noise = Image.merge("RGB", (Image.effect_noise(img.size, sigma),) * 3)
    return Image.blend(img, ImageChops.overlay(img, noise), strength)


def border(img, px, color):
    out = Image.new("RGB", (img.width + 2 * px, img.height + 2 * px), color)
    out.paste(img, (px, px))
    return out

# ---- books ----

def where(name, box, size, pt):
    """Map a point given as fractions of the source photo into a crop of `size`."""
    img = photo(name)
    return ((pt[0] * img.width - box[0]) / (box[2] - box[0]) * size[0],
            (pt[1] * img.height - box[1]) / (box[3] - box[1]) * size[1])


def bezier(p0, p1, p2, p3, n=80):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]


def pen(canvas, pts, fill, width=3, wobble=0.0, seed=3):
    rnd = random.Random(seed)
    if wobble:
        pts = [(x + rnd.uniform(-wobble, wobble), y + rnd.uniform(-wobble, wobble)) for x, y in pts]
    ImageDraw.Draw(canvas).line(pts, fill=fill, width=width, joint="curve")


# 绿荫: leaf-shadow mask over photographs; colour opens in spread 3.
PINE, SHADE, CREAM, BRICK, JADE = rgb("1f2e24"), rgb("121b15"), rgb("e9e4d4"), rgb("6b2a1f"), rgb("2f8f83")


def lvyin_cover():
    c = Image.new("RGB", (W, H), PINE)
    rnd = random.Random(11)
    flower, _ = crop("photo12.jpg", 240, 240, focus=(0.64, 0.28), zoom=4.5)
    m = Image.new("L", (240, 240), 0)
    leaf_cluster(m, 120, 120, 95, 105, rnd, n=12, size=(45, 85))
    c.paste(flower, (250, 650), m)
    front, box = crop("photo7.jpg", LW, H, focus=(0.60, 0.42), zoom=1.55)
    fx, fy = where("photo7.jpg", box, (LW, H), (0.56, 0.42))
    m = Image.new("L", (LW, H), 0)
    leaf_cluster(m, fx, fy + 60, 230, 310, rnd, n=34, size=(80, 170))
    for _ in range(16):
        leaf_cluster(m, rnd.uniform(30, LW - 30), rnd.uniform(40, H - 40), 26, 30, rnd, n=4, size=(25, 55))
    c.paste(front, (LW, 0), m)
    vtext(c, LW + 668, 110, "绿荫", FONT_SONG, 112, CREAM, gap=1.35)
    return c


def lvyin_s01():
    c = Image.new("RGB", (W, H), BRICK)
    ph, _ = crop("photo6.jpg", 576, 768)
    c.paste(ph, (96, 128))
    text(c, (LW + 96, 790), "影子比人先到。", FONT_SONG, 30, CREAM, tracking=5)
    return c


def lvyin_s02():
    c = Image.new("RGB", (W, H), PINE)
    rnd = random.Random(23)
    ph7, _ = crop("photo7.jpg", 470, 800)
    c.paste(ph7, (90, 110))
    shade = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(shade)
    for _ in range(34):
        x, y = rnd.uniform(500, 830), rnd.uniform(130, 900)
        length = rnd.uniform(70, 160)
        draw.polygon(leaf(x, y, length, length * 0.42, rnd.uniform(0, math.pi)), fill=255)
    c.paste(SHADE, (0, 0), shade)
    ph1, box = crop("photo1.jpg", 560, 720, zoom=1.35)
    fx, fy = where("photo1.jpg", box, (560, 720), (0.62, 0.36))
    m = Image.new("L", (560, 720), 0)
    leaf_cluster(m, fx, fy + 70, 220, 290, rnd, n=34, size=(80, 160))
    c.paste(ph1, (870, 100), m)
    text(c, (1150, 900), "站在亮的地方。", FONT_SONG, 30, CREAM, anchor="mm", tracking=5)
    return c


def lvyin_s03():
    c = Image.new("RGB", (W, H), JADE)
    ph8, _ = crop("photo8.jpg", 600, 338)
    c.paste(ph8, (84, 96))
    size, origin = (680, 900), (812, 62)
    ph12, box = crop("photo12.jpg", *size)
    c.paste(ph12, origin)
    (x0, y0), (x1, y1) = (where("photo12.jpg", box, size, p) for p in ((0.18, 0.47), (0.95, 0.58)))
    slope = (y1 - y0) / (x1 - x0)
    ys = lambda x: origin[1] + y0 + slope * (x - origin[0] - x0)
    pts = [(x, ys(x)) for x in range(origin[0], 150, -8)]
    pen(c, pts, rgb("161816"), width=3, wobble=0.8)
    return c


def lvyin_s04():
    c = Image.new("RGB", (W, H), PINE)
    detail, _ = crop("photo6.jpg", 180, 180, focus=(0.30, 0.15), zoom=6)
    c.paste(detail, (294, 360))
    text(c, (LW + 384, 940), "绿荫 · 五张照片", FONT_SONG, 22, CREAM, anchor="ms", tracking=6)
    return c

# ---- kafeiguan ----
# 咖啡馆: a coffee-brown contour line joins arm's-length close-ups to whole-room views.
BEIGE, BROWN, ESPRESSO, MILK = rgb("d9c6a8"), rgb("5a3a28"), rgb("3a2418"), rgb("efe4d0")


def glass_outline(canvas, x, top, w, h, fill, width=3):
    """A tall milkshake glass in single-weight line: rim ellipse, tapering sides, foot, straw."""
    draw = ImageDraw.Draw(canvas)
    rim = h * 0.06
    draw.ellipse((x - w / 2, top - rim / 2, x + w / 2, top + rim / 2), outline=fill, width=width)
    bw, base = w * 0.78, top + h * 0.82
    draw.line([(x - w / 2, top), (x - bw / 2, base)], fill=fill, width=width)
    draw.line([(x + w / 2, top), (x + bw / 2, base)], fill=fill, width=width)
    draw.arc((x - bw / 2, base - rim / 2, x + bw / 2, base + rim / 2), 0, 180, fill=fill, width=width)
    draw.line([(x, base + rim / 2), (x, top + h * 0.95)], fill=fill, width=width)
    draw.ellipse((x - w * 0.42, top + h * 0.93, x + w * 0.42, top + h), outline=fill, width=width)
    draw.line([(x + w * 0.12, top + rim), (x + w * 0.32, top - h * 0.2)], fill=fill, width=width)


def kafeiguan_cover():
    c = Image.new("RGB", (W, H), BEIGE)
    rim, _ = crop("photo14.jpg", 400, 400, focus=(0.43, 0.58), zoom=4)
    img, m = circle(rim, 220)
    c.paste(img, (200, 650), m)
    size, origin = (600, 640), (LW + 84, 300)
    ph, box = crop("photo3.jpg", *size, focus=(0.42, 0.50), zoom=1.15)
    c.paste(ph, origin)
    cup = where("photo3.jpg", box, size, (0.30, 0.62))
    start = (origin[0] + cup[0], origin[1] + cup[1])
    pen(c, bezier(start, (origin[0] - 60, start[1] - 40), (origin[0] - 40, 230), (LW + 250, 220)), BROWN, 3)
    text(c, (LW + 384, 150), "咖啡馆", FONT_HEI_LIGHT, 60, BROWN, anchor="mm", tracking=26)
    return c


def kafeiguan_s01():
    c = Image.new("RGB", (W, H), BEIGE)
    size, origin = (660, 860), (0, 82)
    ph, box = crop("photo3.jpg", *size, focus=(0.42, 0.58), zoom=1.25)
    c.paste(ph, origin)
    straw = where("photo3.jpg", box, size, (0.50, 0.48))
    start = (origin[0] + straw[0], origin[1] + straw[1])
    small, sorigin = (280, 373), (LW + 180, 290)
    end = (sorigin[0], sorigin[1] + small[1] * 0.6)
    pen(c, bezier(start, (start[0] + 260, start[1] - 260), (end[0] - 220, end[1] + 120), end), BROWN, 3)
    ph5, _ = crop("photo5.jpg", *small)
    c.paste(ph5, sorigin)
    text(c, (sorigin[0], 740), "吸管、杯子、手机，都在一臂之内。", FONT_HEI_LIGHT, 24, BROWN, tracking=3)
    return c


def kafeiguan_s02():
    c = Image.new("RGB", (W, H), BEIGE)
    base, d = 720, 230
    ph4, _ = crop("photo4.jpg", 300, 420)
    c.paste(ph4, (80, base - 420))
    hand, _ = crop("photo4.jpg", 400, 400, focus=(0.48, 0.12), zoom=3.2)
    img, m = circle(hand, d)
    c.paste(img, (420, base - d), m)
    ph11, _ = crop("photo11.jpg", 300, 420)
    c.paste(ph11, (LW + 60, base - 420))
    finger, _ = crop("photo11.jpg", 400, 400, focus=(0.64, 0.56), zoom=3)
    img, m = circle(finger, d)
    c.paste(img, (LW + 420, base - d), m)
    return c


def kafeiguan_s03():
    c = Image.new("RGB", (W, H), ESPRESSO)
    ph14, _ = crop("photo14.jpg", 440, 620)
    c.paste(ph14, (60, 110))
    glass_outline(c, 560, 360, 150, 500, MILK, width=3)
    text(c, (60, 930), "天黑以后，灯是暖的。", FONT_HEI_LIGHT, 24, MILK, tracking=3)
    ph16, _ = crop("photo16.jpg", 680, 900)
    c.paste(ph16, (LW + 44, 62))
    return c


def kafeiguan_s04():
    c = Image.new("RGB", (W, H), BEIGE)
    ImageDraw.Draw(c).ellipse((329, 400, 439, 440), outline=BROWN, width=3)
    text(c, (LW + 384, 940), "咖啡馆 · 六张照片", FONT_HEI_LIGHT, 20, BROWN, anchor="ms", tracking=6)
    return c


# ---- jiejiao ----
# 街角: the wall or ground of each photo extends into the page; one edge merges, one is cut.
INK, RED, PAPER = rgb("1d1d1b"), rgb("b3262d"), rgb("e8e4dc")


def merged(c, name, size, origin, side, fade, focus=None, zoom=1.0):
    ph, box = crop(name, *size, focus=focus, zoom=zoom)
    c.paste(ph, origin, ramp(*size, side, fade))
    return box


def square(c, x, y, s=32):
    ImageDraw.Draw(c).rectangle((x, y, x + s, y + s), fill=RED)


def jiejiao_cover():
    c = Image.new("RGB", (W, H))
    back, _ = plane("photo2.jpg", (0.08, 0.05, 0.45, 0.35), (LW, H))
    c.paste(back, (0, 0))
    square(c, 600, 860, 30)
    wall, _ = plane("photo17.jpg", (0.02, 0.25, 0.20, 0.60), (LW, H))
    c.paste(wall, (LW, 0))
    size, origin = (600, 760), (LW + 168, H - 760)
    box = merged(c, "photo17.jpg", size, origin, "left", 150, focus=(0.55, 0.5))
    bow = where("photo17.jpg", box, size, (0.38, 0.13))
    square(c, LW + 60, int(origin[1] + bow[1]) - 16)
    text(c, (LW + 70, 90), "街角", FONT_HEI_MEDIUM, 120, INK, tracking=4)
    return c


def jiejiao_s01():
    c = Image.new("RGB", (W, H))
    wall, _ = plane("photo2.jpg", (0.08, 0.05, 0.45, 0.35), (W, H), flat=0.5)
    c.paste(wall, (0, 0))
    merged(c, "photo2.jpg", (LW, H), (LW, 0), "left", 220, focus=(0.55, 0.5))
    return c


def jiejiao_s02():
    c = Image.new("RGB", (W, H), PAPER)
    line, ph = 880, 512
    for name, patch, x in (("photo15.jpg", (0.04, 0.03, 0.30, 0.42), 0),
                           ("photo17.jpg", (0.02, 0.25, 0.20, 0.60), LW)):
        wall, _ = plane(name, patch, (LW, line))
        c.paste(wall, (x, 0))
        if name == "photo17.jpg":
            merged(c, name, (600, ph + 120), (x + 168, line - ph - 120), "left", 150, focus=(0.55, 0.5))
        else:
            merged(c, name, (LW, ph), (x, line - ph), "top", 160)
    square(c, 110, 200)
    text(c, (164, 216), "白墙，灰墙。", FONT_HEI_LIGHT, 28, INK, anchor="lm", tracking=4)
    return c


def jiejiao_s03():
    turf = photo("photo13.jpg").crop((0, int(0.62 * 1280), 640, 1280))
    mean = ImageStat.Stat(turf).median
    light = tuple(min(255, int(v * 1.12)) for v in mean)
    dark = tuple(int(v * 0.84) for v in mean)
    c = Image.new("RGB", (W, H), dark)
    draw = ImageDraw.Draw(c)
    for i in range(0, 16, 2):
        draw.rectangle((i * 96, 0, i * 96 + 95, H), fill=light)
    tex = turf.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))
    c = Image.blend(c, ImageChops.overlay(c, ImageOps.grayscale(tex).convert("RGB")), 0.35)
    for name, size, origin in (("photo13.jpg", (300, 200), (LW + 300, 560)),
                               ("photo9.jpg", (150, 200), (150, 220)),
                               ("photo10.jpg", (130, 173), (430, 650))):
        ph, _ = crop(name, *size)
        c.paste(ph, origin)
    return c


def jiejiao_s04():
    c = Image.new("RGB", (W, H), PAPER)
    wall, _ = crop("photo18.jpg", LW, H, focus=(0.5, 0.18), zoom=2.6)
    c.paste(wall, (0, 0))
    ph, _ = crop("photo18.jpg", 520, 693)
    c.paste(ph, (LW + 124, 100))
    text(c, (LW + 124, 870), "这一次，面向墙。", FONT_HEI_LIGHT, 28, INK, tracking=4)
    text(c, (LW + 124, 920), "街角 · 七张照片", FONT_HEI_LIGHT, 20, INK, tracking=6)
    return c


BOOKS = {
    "lvyin": {"cover": lvyin_cover, "s01": lvyin_s01, "s02": lvyin_s02, "s03": lvyin_s03, "s04": lvyin_s04},
    "kafeiguan": {"cover": kafeiguan_cover, "s01": kafeiguan_s01, "s02": kafeiguan_s02,
                  "s03": kafeiguan_s03, "s04": kafeiguan_s04},
    "jiejiao": {"cover": jiejiao_cover, "s01": jiejiao_s01, "s02": jiejiao_s02,
                "s03": jiejiao_s03, "s04": jiejiao_s04},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("book")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true", help="also replace masters made by the image API")
    args = ap.parse_args()
    for book_id in (BOOKS if args.book == "all" else [args.book]):
        prod = generate.ROOT / "production" / book_id
        book = json.loads((prod / "spreads.json").read_text(encoding="utf-8"))
        out_dir = generate.ROOT / "books" / book_id
        if not out_dir.exists():
            shutil.copytree(generate.RUNTIME, out_dir, ignore=shutil.ignore_patterns("pages", "book-data.js"))
        manifest_path = prod / "generation-manifest.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        for spread in book["spreads"]:
            sid = spread["id"]
            if args.only and sid not in args.only:
                continue
            if not manifest.get(sid, {}).get("tool", "code-composite").startswith("code-composite") and not args.force:
                print(f"{book_id}/{sid}: keeping image-API master")
                continue
            img = grain(BOOKS[book_id][sid]())
            master = out_dir / "assets" / "spreads" / f"{sid}.png"
            master.parent.mkdir(parents=True, exist_ok=True)
            img.save(master)
            manifest[sid] = {"tool": "code-composite production/compose.py (fallback, not ImageGen)",
                             "sources": spread["sources"], "master": f"assets/spreads/{sid}.png"}
            print(f"{book_id}/{sid}: composed")
        generate.assemble(book, out_dir, manifest)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
