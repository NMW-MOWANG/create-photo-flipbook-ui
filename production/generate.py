#!/usr/bin/env python3
"""Generate photobook spread masters with an OpenAI-compatible image edit API,
then split them into leaves and write the book's book-data.js.

Usage: python3 production/generate.py <book-id> [--only cover s01 ...] [--dry-run] [--assemble-only]
Env:   IMAGE_PROVIDER=volc uses Volcengine 即梦 with VOLC_AK, VOLC_SK,
       VOLC_REQ_KEY (default jimeng_seedream46_cvtob), VOLC_SIZE (default 2304x1536).
       Otherwise an OpenAI-compatible /images/edits endpoint:
       IMAGE_API_BASE, IMAGE_API_KEY, IMAGE_MODEL (default gpt-image-2),
       IMAGE_QUALITY (default high), IMAGE_INPUT_FIDELITY (default unset),
       IMAGE_FIELD (multipart field for reference images, default image)
"""
import argparse, base64, hashlib, hmac, io, json, os, shutil, ssl, sys, time, uuid
import urllib.error, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image

try:  # python.org builds on macOS ship without system CA certificates
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT.parent / "christmas-tree-main" / "public" / "default-photos"
RUNTIME = ROOT / "books" / "death-valley"
HEADER = ("Create one flat scan-like reproduction of a designed double-page photo-zine layout, "
          "spread ratio 3:2 (two portrait pages of 3:4 side by side, fold at the exact vertical center).")
FOOTER = ("Keep faces and all text clear of the center fold. The page surface fills the whole canvas; "
          "preserve the designed internal margins and image boundaries. Render Chinese text exactly as quoted, "
          "with no extra words, letters, logos or watermarks. No book mockup, perspective, page curl, "
          "binding shadow, desk, or external presentation surround.")


def load_env_file():
    """Fill missing IMAGE_* variables from ~/.config/my-photo-album/image.env (KEY=value lines)."""
    path = Path.home() / ".config" / "my-photo-album" / "image.env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


VOLC_PROMPT_LIMIT = 800


def build_prompt(book, spread):
    if os.environ.get("IMAGE_PROVIDER") == "volc":  # 即梦 rejects prompts over 800 characters
        if "prompt_short" not in spread or "brief_short" not in book:
            raise SystemExit(f"{spread['id']}: add brief_short / prompt_short (<= {VOLC_PROMPT_LIMIT} chars) to spreads.json")
        prompt = book["brief_short"] + "\n" + spread["prompt_short"]
        if len(prompt) > VOLC_PROMPT_LIMIT:
            raise SystemExit(f"{spread['id']}: short prompt is {len(prompt)} chars, limit {VOLC_PROMPT_LIMIT}")
        return prompt
    return "\n".join([HEADER, book["brief"], book["arc"], spread["prompt"], FOOTER])


def reference_bytes(name):
    img = Image.open(PHOTOS / name).convert("RGB")
    img.thumbnail((1536, 1536), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=92)
    return buf.getvalue()


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = io.BytesIO()
    for key, value in fields.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    for key, filename, data in files:
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'
                  f"Content-Type: image/jpeg\r\n\r\n".encode())
        out.write(data + b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


def volc_call(action, body):
    """Signed POST to the Volcengine visual API (HMAC-SHA256 V4, as the official SDK does)."""
    ak, sk = os.environ["VOLC_AK"], os.environ["VOLC_SK"]
    host, region, service, version = "visual.volcengineapi.com", "cn-north-1", "cv", "2022-08-31"
    payload = json.dumps(body).encode()
    now = time.gmtime()
    xdate, day = time.strftime("%Y%m%dT%H%M%SZ", now), time.strftime("%Y%m%d", now)
    query = urllib.parse.urlencode(sorted({"Action": action, "Version": version}.items()))
    body_hash = hashlib.sha256(payload).hexdigest()
    headers = {"content-type": "application/json", "host": host, "x-content-sha256": body_hash, "x-date": xdate}
    signed = ";".join(headers)
    canonical = "\n".join(["POST", "/", query, "".join(f"{k}:{v}\n" for k, v in headers.items()), signed, body_hash])
    scope = f"{day}/{region}/{service}/request"
    to_sign = "\n".join(["HMAC-SHA256", xdate, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    key = sk.encode()
    for part in (day, region, service, "request"):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    headers["Authorization"] = f"HMAC-SHA256 Credential={ak}/{scope}, SignedHeaders={signed}, Signature={signature}"
    req = urllib.request.Request(f"https://{host}/?{query}", data=payload, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120, context=SSL_CONTEXT) as resp:
            out = json.load(resp)
    except urllib.error.HTTPError as err:
        text = err.read().decode(errors="replace")
        try:
            out = json.loads(text)
        except ValueError:
            return {"code": err.code, "message": text[:600]}
    error = (out.get("ResponseMetadata") or {}).get("Error")
    if error and "code" not in out:  # gateway-level failures such as a bad signature or access key
        out = {"code": error.get("Code"), "message": error.get("Message")}
    return out


def volc_image(book, spread):
    """即梦 (Seedream) via CVSync2AsyncSubmitTask / CVSync2AsyncGetResult; returns (png bytes, label)."""
    req_key = os.environ.get("VOLC_REQ_KEY", "jimeng_seedream46_cvtob")
    width, height = (int(v) for v in os.environ.get("VOLC_SIZE", "2304x1536").split("x"))
    form = {"req_key": req_key, "prompt": build_prompt(book, spread), "width": width, "height": height,
            "force_single": True,
            "binary_data_base64": [base64.b64encode(reference_bytes(n)).decode() for n in spread["sources"]]}
    for attempt in range(4):
        resp = volc_call("CVSync2AsyncSubmitTask", form)
        if resp.get("code") == 10000:
            break
        if resp.get("code") not in (50429, 50430, 50500, 50501) or attempt == 3:
            raise SystemExit(f"{spread['id']}: submit failed: {resp.get('code')} {resp.get('message')}")
        time.sleep(15 * (attempt + 1))
    task_id = resp["data"]["task_id"]
    query = {"req_key": req_key, "task_id": task_id, "req_json": json.dumps({"return_url": False})}
    for _ in range(120):
        time.sleep(5)
        resp = volc_call("CVSync2AsyncGetResult", query)
        data = resp.get("data") or {}
        status = data.get("status")
        if resp.get("code") == 10000 and status == "done" and data.get("binary_data_base64"):
            return base64.b64decode(data["binary_data_base64"][0]), f"volcengine {req_key}"
        if resp.get("code") not in (10000, 50429, 50430) or status in ("not_found", "expired"):
            raise SystemExit(f"{spread['id']}: task {task_id} failed: {resp.get('code')} {resp.get('message')} {status}")
    raise SystemExit(f"{spread['id']}: task {task_id} still running after 10 minutes")


def generate(book, spread, master_path):
    if os.environ.get("IMAGE_PROVIDER") == "volc":
        data, label = volc_image(book, spread)
        return save_master(book, spread, data, master_path, label)
    base = os.environ["IMAGE_API_BASE"].rstrip("/")
    key = os.environ["IMAGE_API_KEY"]
    fields = {"model": os.environ.get("IMAGE_MODEL", "gpt-image-2"), "prompt": build_prompt(book, spread),
              "size": book["size"], "n": "1", "quality": os.environ.get("IMAGE_QUALITY", "high"),
              "response_format": "b64_json"}
    fidelity = os.environ.get("IMAGE_INPUT_FIDELITY", "")
    if fidelity:
        fields["input_fidelity"] = fidelity
    field = os.environ.get("IMAGE_FIELD", "image")
    files = [(field, name, reference_bytes(name)) for name in spread["sources"]]
    body, ctype = multipart(fields, files)
    req = urllib.request.Request(f"{base}/images/edits", data=body, method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": ctype})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600, context=SSL_CONTEXT) as resp:
                payload = json.load(resp)
            break
        except urllib.error.HTTPError as err:
            detail = err.read().decode(errors="replace")[:600]
            if err.code < 500 or attempt == 2:
                raise SystemExit(f"{spread['id']}: HTTP {err.code}: {detail}")
        except (urllib.error.URLError, TimeoutError) as err:
            if attempt == 2:
                raise SystemExit(f"{spread['id']}: {err}")
        time.sleep(10 * (attempt + 1))
    item = payload["data"][0]
    if item.get("b64_json"):
        data = base64.b64decode(item["b64_json"])
    else:
        with urllib.request.urlopen(item["url"], timeout=120, context=SSL_CONTEXT) as resp:
            data = resp.read()
    return save_master(book, spread, data, master_path, f"images/edits {fields['model']}")


def save_master(book, spread, data, master_path, label):
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = book["leaf"][0] * 2, book["leaf"][1]
    if abs(img.width / img.height - w / h) > 0.01:
        raise SystemExit(f"{spread['id']}: returned {img.width}x{img.height}, not 3:2; regenerate it")
    if img.size != (w, h):
        img = img.resize((w, h), Image.LANCZOS)
    master_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(master_path)
    return label


def assemble(book, out_dir, manifest):
    pages = out_dir / "assets" / "pages"
    pages.mkdir(parents=True, exist_ok=True)
    lw = book["leaf"][0]
    faces = {}
    for spread in book["spreads"]:
        master = out_dir / "assets" / "spreads" / f"{spread['id']}.png"
        if not master.exists():
            continue
        img = Image.open(master)
        for side, box in (("left", (0, 0, lw, img.height)), ("right", (lw, 0, lw * 2, img.height))):
            name = f"{spread['id']}-{side}.png"
            img.crop(box).save(pages / name)
            faces[(spread["id"], side)] = name
            manifest.setdefault(spread["id"], {})[side] = f"assets/pages/{name}"
    missing = [s["id"] for s in book["spreads"] if (s["id"], "left") not in faces]
    if missing:
        print("missing spreads, book-data.js not written:", " ".join(missing))
        return False
    alt = lambda sid, side: f"{book['title']}，{sid} {'左页' if side == 'left' else '右页'}。"
    data = {
        "id": book["id"], "title": book["title"], "pageWidth": lw, "pageHeight": book["leaf"][1],
        "frontCover": {"file": faces[("cover", "right")], "alt": f"《{book['title']}》封面。"},
        "spreads": [{"id": s["id"],
                     "left": {"file": faces[(s["id"], "left")], "alt": alt(s["id"], "left")},
                     "right": {"file": faces[(s["id"], "right")], "alt": alt(s["id"], "right")}}
                    for s in book["spreads"] if s["kind"] == "spread"],
        "backCover": {"file": faces[("cover", "left")], "alt": f"《{book['title']}》封底。"},
    }
    (out_dir / "book-data.js").write_text(
        "// Generated by production/generate.py from accepted spread masters.\n"
        f"window.PHOTOBOOK = {json.dumps(data, ensure_ascii=False, indent=2)};\n", encoding="utf-8")
    print("wrote", out_dir / "book-data.js")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("book")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--assemble-only", action="store_true")
    args = ap.parse_args()
    load_env_file()
    need = ("VOLC_AK", "VOLC_SK") if os.environ.get("IMAGE_PROVIDER") == "volc" else ("IMAGE_API_BASE", "IMAGE_API_KEY")
    if not args.dry_run and not args.assemble_only and not all(os.environ.get(k) for k in need):
        raise SystemExit(f"Set {' and '.join(need)}, or put them in ~/.config/my-photo-album/image.env")

    prod = ROOT / "production" / args.book
    book = json.loads((prod / "spreads.json").read_text(encoding="utf-8"))
    out_dir = ROOT / "books" / book["id"]
    if not out_dir.exists() and not args.dry_run:
        shutil.copytree(RUNTIME, out_dir, ignore=shutil.ignore_patterns("pages", "book-data.js"))
    manifest_path = prod / "generation-manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    if not args.assemble_only:
        targets = [s for s in book["spreads"] if not args.only or s["id"] in args.only]
        for spread in targets:
            prompt = build_prompt(book, spread)
            if args.dry_run:
                print(f"== {spread['id']} refs={spread['sources']} chars={len(prompt)}\n{prompt}\n")
                continue
            master = out_dir / "assets" / "spreads" / f"{spread['id']}.png"
            print(f"generating {spread['id']} ...", flush=True)
            tool = generate(book, spread, master)
            (prod / "prompts").mkdir(exist_ok=True)
            (prod / "prompts" / f"{spread['id']}.txt").write_text(prompt, encoding="utf-8")
            manifest[spread["id"]] = {"tool": tool, "sources": spread["sources"],
                                      "prompt": f"prompts/{spread['id']}.txt",
                                      "master": f"assets/spreads/{spread['id']}.png"}
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
            print("saved", master)
    if not args.dry_run:
        assemble(book, out_dir, manifest)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
