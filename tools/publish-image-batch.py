#!/usr/bin/env python3
"""Publish one verified batch of attributed illustrative stock photos to existing article HTML.
This does not claim stock images are genuine photos of the rental fleet.
"""
from __future__ import annotations
import hashlib
import html
import io
import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/image-batches/batch-001.json"
REPORT = ROOT / "docs/image-batches/batch-001-report.json"
SOURCES = [
    ROOT / "docs/image-batches/stock-sources-part-1.json",
    ROOT / "docs/image-batches/stock-sources-part-2.json",
    ROOT / "docs/image-batches/stock-sources-part-3.json",
]
MIN_SIZE, MAX_SIZE = 100_000, 300_000
MAX_IMAGES = 50

def download(url: str) -> bytes:
    if not url.startswith("https://images.unsplash.com/photo-"):
        raise ValueError("Source URL is not a recognized Unsplash image")
    with tempfile.NamedTemporaryFile(suffix=".jpg") as temp:
        subprocess.run([
            "curl", "--fail", "--location", "--silent", "--show-error",
            "--retry", "3", "--retry-delay", "2", "--max-time", "55",
            "--user-agent", "Mozilla/5.0 (compatible; HanoiEditorialImagePublisher/1.0)",
            url, "--output", temp.name
        ], check=True, timeout=90)
        data = Path(temp.name).read_bytes()
    if len(data) < 12_000:
        raise ValueError("Downloaded image suspiciously small")
    return data

def render_webp(data: bytes) -> tuple[bytes, int, int]:
    with Image.open(io.BytesIO(data)) as original:
        im = ImageOps.exif_transpose(original).convert("RGB")
    if min(im.size) < 420:
        raise ValueError(f"Source too small for quality image: {im.size}")
    candidates = []
    for width, height in [(1200, 800), (1400, 933), (1536, 1024), (1050, 700)]:
        ratio = im.width / im.height
        if ratio < 1.16 or ratio > 2.1:
            background = ImageOps.fit(im, (width, height), method=Image.Resampling.LANCZOS)
            background = background.filter(ImageFilter.GaussianBlur(radius=25))
            foreground = ImageOps.contain(im, (width - 50, height - 50), method=Image.Resampling.LANCZOS)
            background.paste(foreground, ((width - foreground.width)//2, (height - foreground.height)//2))
            result = background
        else:
            result = ImageOps.fit(im, (width, height), method=Image.Resampling.LANCZOS)
        for quality in [90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 95]:
            out = io.BytesIO()
            result.save(out, format="WEBP", quality=quality, method=6)
            raw = out.getvalue()
            if MIN_SIZE <= len(raw) <= MAX_SIZE:
                candidates.append((quality, width, height, raw))
        if candidates:
            break
    if not candidates:
        raise ValueError("Cannot reach 100-300 KB without unacceptable compression")
    quality, width, height, raw = max(candidates, key=lambda x: x[0])
    with Image.open(io.BytesIO(raw)) as check:
        check.verify()
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        raise ValueError("Output is not a WebP file")
    return raw, width, height

def build_figure(item: dict, source: dict, width: int, height: int) -> str:
    src = html.escape(item["image_path"], quote=True)
    desc = source["desc"].strip(" .")
    alt = html.escape(desc[:150].capitalize(), quote=True)
    photographer = html.escape(source["photographer"], quote=True)
    profile = html.escape(source["profile"], quote=True)
    return (
        '    <figure class="article-feature-image" style="margin:1.25rem 0 1.5rem;">\n'
        f'      <img src="{src}" width="{width}" height="{height}" alt="{alt}" '
        'loading="lazy" decoding="async" style="display:block;width:100%;height:auto;border-radius:12px;">\n'
        '      <figcaption style="font-size:0.875rem;opacity:0.75;margin-top:0.4rem;">'
        'Illustrative stock photograph, not a photo of our rental fleet. '
        f'Photo by <a href="{profile}" rel="noopener noreferrer">{photographer}</a> '
        'on <a href="https://unsplash.com/?utm_source=rentbikehanoi&amp;utm_medium=referral" '
        'rel="noopener noreferrer">Unsplash</a>.'
        '</figcaption>\n'
        '    </figure>\n\n'
    )

def has_meaningful_image(body: str) -> bool:
    for match in re.finditer(r'<img\\b[^>]*>', body, re.I):
        tag = match.group(0)
        if 'post-author-logo' in tag or '/assets/img/logo-116.png' in tag:
            continue
        return True
    return False

def insert_before_first_h2(article_path: Path, figure: str, image_path: str) -> bool:
    original = article_path.read_text(encoding="utf-8")
    match = re.search(r'<article\b[^>]*>(.*?)</article>', original, re.I | re.S)
    if not match:
        raise ValueError("Missing article element")
    body = match.group(1)
    if image_path in original or re.search(r'<img\b', body, re.I):
        return False
    h2 = re.search(r'(?m)^[ \t]*<h2\b', body, re.I)
    if not h2:
        raise ValueError("No first H2 found in article")
    idx = match.start(1) + h2.start()
    modified = original[:idx] + figure + original[idx:]
    if modified.count(image_path) != 1:
        raise ValueError("Image reference not unique")
    article_path.write_text(modified, encoding="utf-8")
    return True

def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sources = {}
    for part in SOURCES:
        for photo in json.loads(part.read_text(encoding="utf-8"))["photos"]:
            sources[photo["position"]] = photo
    if len(manifest["items"]) != 50 or len(sources) != 50:
        raise ValueError(f"Expected 50 manifest items and unique sources, got {len(manifest['items'])}/{len(sources)}")
    if len({p["id"] for p in sources.values()}) != 50:
        raise ValueError("Duplicate Unsplash photo IDs in batch")
    previous = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {"published": []}
    published = list(previous.get("published", []))
    failed, skipped = [], []
    seen_sha = set()
    for item in manifest["items"][:MAX_IMAGES]:
        pos = item["batch_position"]
        source = sources[pos]
        article_path = ROOT / item["article"]
        target = ROOT / item["image_path"].lstrip("/")
        try:
            if not article_path.is_file():
                raise FileNotFoundError(str(article_path))
            page = article_path.read_text(encoding="utf-8")
            m = re.search(r'<article\b[^>]*>(.*?)</article>', page, re.I | re.S)
            if not m:
                raise ValueError("Missing article element")
            if item["image_path"] in page or re.search(r'<img\b', m.group(1), re.I):
                skipped.append({"position":pos,"article":item["article"],"reason":"Existing article image; no overwrite"})
                item["status"] = "SKIPPED_ALREADY_ILLUSTRATED"
                continue
            if target.exists():
                raise ValueError("Target image exists but article does not reference it")
            raw = download(source["url"])
            webp, width, height = render_webp(raw)
            digest = hashlib.sha256(webp).hexdigest()
            if digest in seen_sha:
                raise ValueError("Duplicate image bytes")
            seen_sha.add(digest)
            figure = build_figure(item, source, width, height)
            if not insert_before_first_h2(article_path, figure, item["image_path"]):
                raise ValueError("Article became illustrated during batch")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(webp)
            item["status"] = "PUBLISHED_PENDING_DEPLOY"
            item["source_type"] = "Unsplash stock photo, not AI generated"
            item["photo_id"] = source["id"]
            item["image_bytes"] = len(webp)
            item["image_sha256"] = digest
            item["photographer"] = source["photographer"]
            item["alt"] = source["desc"].strip(" .").capitalize()[:150]
            published.append({
                "position":pos, "article":item["article"], "url":item["url"],
                "image_path":item["image_path"], "bytes":len(webp), "sha256":digest,
                "photo_id":source["id"], "photographer":source["photographer"]
            })
            print(f"OK {pos:02d} {len(webp)} bytes {item['article']}", flush=True)
        except Exception as error:
            item["status"] = "FAILED_RETRYABLE"
            failed.append({"position":pos,"article":item["article"],"error":str(error)[:400]})
            print(f"FAILED {pos:02d}: {str(error)[:180]}", flush=True)
    if not published:
        raise RuntimeError("No images published; do not create a false success commit")
    manifest["status"] = "PUBLISHED_PENDING_DEPLOY" if not failed else "PARTIAL_PENDING_DEPLOY"
    manifest["published_count"] = len(published)
    manifest["failed_count"] = len(failed)
    manifest["skipped_count"] = len(skipped)
    manifest["source_note"] = "Curated real Unsplash stock photos, not AI-generated and not photographs of the shop's own motorbikes; these do not satisfy the SEO audit's owner-real-photo requirement."
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    report = {
        "batch_id":manifest["batch_id"],
        "generated_at":datetime.now(timezone.utc).isoformat(),
        "status":manifest["status"],
        "source_type":"Curated attributed Unsplash stock photos (not AI-generated)",
        "published_count":len(published),
        "failed_count":len(failed),
        "skipped_count":len(skipped),
        "published":published, "failed":failed, "skipped":skipped,
        "disclaimer":"PUBLISHED_PENDING_DEPLOY is not a live website verification. Confirm GitHub Pages deployment and public URLs separately."
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"RESULT published={len(published)} failed={len(failed)} skipped={len(skipped)}", flush=True)

if __name__ == "__main__":
    main()
