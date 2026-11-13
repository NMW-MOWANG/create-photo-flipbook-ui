#!/usr/bin/env python3
"""Generate the fairytale shelf scene's textures with 即梦 and save them under assets/scene/.

Usage: python3 production/assets.py [name ...]
Needs IMAGE_PROVIDER=volc, VOLC_AK, VOLC_SK (see README.md).
"""
import argparse, base64, json, os, sys
from io import BytesIO
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate  # noqa: E402

OUT = generate.ROOT / "assets" / "scene"

ASSETS = {
    "backdrop": ("2048x1280",
        "一幅童话风格的室内场景背景，没有一个书柜，只有房间：左侧一扇巨大的拱形窗，窗外是薄雾中的城堡尖顶和粉色天空；"
        "墙面是奶白与淡粉色的护墙板，有金色细线描边；地面是浅色地毯；四周有樱花瓣、白色小花和飘浮的金色光点；"
        "柔和的逆光和光晕，梦幻、干净、明亮。画面里不要任何家具、书柜、书本、人物，不要文字、字母或水印。"),
    "lace": ("1536x768",
        "一条水平连续的奶油白色蕾丝花边，细密的花卉镂空图案，边缘有小扇形，浅金色勾边；"
        "正面平视，无缝横向循环，背景是均匀的奶油色。不要文字，不要阴影，不要其它物体。"),
    "ornament": ("2048x1024",
        "奶油白色底上的洛可可风格浮雕装饰，金色勾边的卷草、玫瑰和小珍珠，左右对称，浮雕感柔和；"
        "正面平视，平面均匀布光，背景均匀奶油色，边缘干净。不要文字，不要边框，不要其它物体。"),
    "wallpaper": ("1024x1024",
        "奶油粉色的无缝墙纸纹理，非常细小的金色点和浅色小碎花，均匀分布，安静不抢眼；正面平视。不要文字，不要边框。"),
    "sky": ("1024x1536",
        "透过窗户看到的景色：粉色晚霞天空、薄雾中的童话城堡尖顶、金色塔尖、飘落的花瓣，柔和梦幻的光；"
        "画面里只有窗外景色，不要窗框、窗棂、玻璃反光、墙面、人物或文字。"),
    "linen": ("1536x1024",
        "从上往下俯拍的浅象牙色亚麻桌布特写，织物纹理细腻，柔和的暖光从左上方照来，明暗过渡非常柔和；"
        "干净，没有物体、没有皱纹堆积。不要文字，不要书本，不要边缘。"),
}


def run(name):
    size, prompt = ASSETS[name]
    w, h = (int(v) for v in size.split("x"))
    req_key = os.environ.get("VOLC_REQ_KEY", "jimeng_seedream46_cvtob")
    form = {"req_key": req_key, "prompt": prompt[:800], "width": w, "height": h, "force_single": True}
    for attempt in range(4):
        resp = generate.volc_call("CVSync2AsyncSubmitTask", form)
        if resp.get("code") == 10000:
            break
        time.sleep(15 * (attempt + 1))
    else:
        raise SystemExit(f"{name}: {resp.get('code')} {resp.get('message')}")
    task = resp["data"]["task_id"]
    query = {"req_key": req_key, "task_id": task, "req_json": json.dumps({"return_url": False})}
    for _ in range(120):
        time.sleep(5)
        resp = generate.volc_call("CVSync2AsyncGetResult", query)
        data = resp.get("data") or {}
        if resp.get("code") == 10000 and data.get("status") == "done" and data.get("binary_data_base64"):
            img = Image.open(BytesIO(base64.b64decode(data["binary_data_base64"][0]))).convert("RGB")
            OUT.mkdir(parents=True, exist_ok=True)
            path = OUT / f"{name}.png"
            img.save(path)
            print(name, img.size, path)
            return
        if resp.get("code") != 10000:
            raise SystemExit(f"{name}: {resp.get('code')} {resp.get('message')}")
        if data.get("status") in ("not_found", "expired"):
            raise SystemExit(f"{name}: task {task} {data.get('status')}")
    raise SystemExit(f"{name}: task {task} did not finish")


if __name__ == "__main__":
    import time
    generate.load_env_file()
    if not (os.environ.get("VOLC_AK") and os.environ.get("VOLC_SK")):
        raise SystemExit("Set VOLC_AK and VOLC_SK in ~/.config/my-photo-album/image.env")
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", default=list(ASSETS))
    args = ap.parse_args()
    for n in args.names or list(ASSETS):
        run(n)
