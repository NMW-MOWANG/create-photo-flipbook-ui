#!/usr/bin/env python3
"""AI-redrawn pages that keep the original faces.

For each spread: compose.py renders the layout (without type) plus an RGBA layer holding the
original photographs and type. 即梦 redraws the page from that layout reference, then the layer
is laid back over the result, so every photograph and every word is the original pixel data.
The raw AI output is kept in assets/spreads/raw/ for review.

Usage: python3 production/hybrid.py <book-id> [--only cover s01 ...]
Needs IMAGE_PROVIDER=volc, VOLC_AK, VOLC_SK (see README.md).
"""
import argparse, io, json, os, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compose, generate  # noqa: E402

PROMPT = ("图1是一张双页摄影杂志跨页的版式稿，比例3:2，中缝在正中。严格保持图1的构图："
          "每张照片的位置、大小、形状和裁切完全不变，照片内容保持原样，不要移动、缩放或重画照片，不要增加人物。"
          "只重新绘制照片以外的页面部分，让它更有设计感和印刷质感：{edit}。"
          "不要添加任何文字、字母、数字、logo或水印。平面扫描效果，画面铺满，"
          "不要书本透视、页面卷曲、装订阴影或桌面背景。")


def png_bytes(img, fmt="PNG"):
    buf = io.BytesIO()
    img.save(buf, fmt)
    return buf.getvalue()


def render(book_id, sid):
    """Return (layout reference without type, RGBA layer of original photos and type)."""
    compose.LAYER = Image.new("RGBA", (compose.W, compose.H), (0, 0, 0, 0))
    compose.TEXT_ON_CANVAS = False
    try:
        layout = compose.grain(compose.BOOKS[book_id][sid]())
        layer = compose.LAYER
    finally:
        compose.LAYER, compose.TEXT_ON_CANVAS = None, True
    return layout, layer


def overlay(ai, layer):
    """Lay the original photographs and type over the AI page, pixel for pixel."""
    out = ai.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("book")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    generate.load_env_file()
    if os.environ.get("IMAGE_PROVIDER") != "volc" or not (os.environ.get("VOLC_AK") and os.environ.get("VOLC_SK")):
        raise SystemExit("hybrid.py needs IMAGE_PROVIDER=volc with VOLC_AK and VOLC_SK")

    prod = generate.ROOT / "production" / args.book
    book = json.loads((prod / "spreads.json").read_text(encoding="utf-8"))
    out_dir = generate.ROOT / "books" / args.book
    spreads_dir = out_dir / "assets" / "spreads"
    (spreads_dir / "raw").mkdir(parents=True, exist_ok=True)
    (prod / "layers").mkdir(exist_ok=True)
    (prod / "prompts").mkdir(exist_ok=True)
    manifest_path = prod / "generation-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    for spread in book["spreads"]:
        sid = spread["id"]
        if args.only and sid not in args.only:
            continue
        if "edit_short" not in spread:
            raise SystemExit(f"{sid}: add edit_short to spreads.json")
        layout, layer = render(args.book, sid)
        layout.save(prod / "layers" / f"{sid}-layout.png")
        layer.save(prod / "layers" / f"{sid}-layer.png")
        prompt = PROMPT.format(edit=spread["edit_short"])
        if len(prompt) > generate.VOLC_PROMPT_LIMIT:
            raise SystemExit(f"{sid}: prompt is {len(prompt)} chars")
        print(f"{args.book}/{sid}: generating ...", flush=True)
        data, label = generate.volc_image(book, spread, prompt=prompt,
                                          images=[png_bytes(layout.convert("RGB"), "JPEG")])
        raw = spreads_dir / "raw" / f"{sid}.png"
        generate.save_master(book, spread, data, raw, label)
        final = overlay(Image.open(raw), layer)
        final.save(spreads_dir / f"{sid}.png")
        (prod / "prompts" / f"{sid}-hybrid.txt").write_text(prompt, encoding="utf-8")
        manifest[sid] = {"tool": f"{label} page + original photos and type overlaid (production/hybrid.py)",
                         "sources": spread["sources"], "prompt": f"prompts/{sid}-hybrid.txt",
                         "reference": f"layers/{sid}-layout.png", "overlay": f"layers/{sid}-layer.png",
                         "raw": f"assets/spreads/raw/{sid}.png", "master": f"assets/spreads/{sid}.png"}
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        print(f"{args.book}/{sid}: saved", flush=True)
    generate.assemble(book, out_dir, manifest)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
