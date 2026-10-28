#!/usr/bin/env python3
"""Publish one cautious batch of attributed Wikimedia Commons editorial photos.

No API keys or paid AI APIs. Never claim photos show the owner's fleet.
Only add an image to an existing article with no meaningful image.
"""
from __future__ import annotations
import hashlib
import html
import importlib.util
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://commons.wikimedia.org/w/api.php"
UA = "HanoiEditorialImagePublisher/1.0 (https://app.rentbikehanoi.com/; nguyentuantu2482@gmail.com)"
MAX_ITEMS = 50
MAX_CANDIDATES = 16

spec = importlib.util.spec_from_file_location("previous_image_publisher", ROOT / "tools/publish-image-batch.py")
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)

def norm(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(c))

def clean(value, limit=150):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))).strip()[:limit]

def request_bytes(url, max_bytes=15_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,image/*;q=0.9,*/*;q=0.5"})
    with urllib.request.urlopen(req, timeout=35) as response:
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("Download exceeds maximum permitted size")
        return data

def search(query):
    params = {
        "action": "query", "format": "json", "formatversion": "2",
        "generator": "search", "gsrsearch": query,
        "gsrnamespace": "6", "gsrlimit": "50",
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": "1600",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    result = json.loads(request_bytes(url, max_bytes=3_000_000).decode("utf-8"))
    if "error" in result:
        raise ValueError("Wikimedia API: " + clean(result["error"].get("info", ""), 180))
    return result.get("query", {}).get("pages", [])

def acceptable(page, anchor):
    infos = page.get("imageinfo") or []
    if not infos:
        return None
    info = infos[0]
    title = page.get("title", "")
    ext = info.get("extmetadata") or {}
    mime = info.get("mime", "")
    license_name = clean((ext.get("LicenseShortName") or {}).get("value", ""), 80)
    license_url = (ext.get("LicenseUrl") or {}).get("value", "")
    lic = license_name.lower()
    allowed = lic.startswith("cc by ") or lic.startswith("cc by-sa ") or lic.startswith("cc0") or lic in ("public domain", "pd")
    if not allowed:
        return None
    if "cc by-nc" in lic or "cc by-nd" in lic:
        return None
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        return None
    if info.get("width", 0) < 1100 or info.get("height", 0) < 740:
        return None
    ratio = info["width"] / info["height"]
    if not 1.18 <= ratio <= 2.2:
        return None
    # Exclude biological specimens, wartime/destruction and archival material
    # from present-day travel/rental guides even when a place name matches.
    if re.search(r"(?i)\b(map|diagram|flag|logo|icon|poster|drawing|screenshot|ai.generated|midjourney|moth|hypeniinae|butterfly|insect|beetle|bird|snake|lizard|frog|orchid|flower|fungus|mushroom|species|specimen|destroyed|bombed|wartime|tonkin|photogr|archival|vintage)\b", title):
        return None
    if re.search(r"\b(?:18[0-9]{2}|19[0-8][0-9])\b", title):
        return None
    description = clean((ext.get("ImageDescription") or {}).get("value", ""), 500)
    anchor_terms = [norm(term.strip()) for term in anchor.split("|") if term.strip()]
    # Require the actual location in the file title; metadata alone can mention
    # a place even when the picture shows an unrelated animal or object.
    normalized_title = norm(title)
    if not anchor_terms or not any(term in normalized_title for term in anchor_terms):
        return None
    if "french quarter" in anchor_terms and "old quarter" in normalized_title:
        return None
    url = info.get("thumburl") or info.get("url", "")
    if not url.startswith("https://upload.wikimedia.org/"):
        return None
    page_url = info.get("descriptionurl", "")
    if not page_url.startswith("https://commons.wikimedia.org/"):
        return None
    artist_html = (ext.get("Artist") or {}).get("value", "")
    artist = clean(artist_html, 110) or "Wikimedia Commons contributor"
    match = re.search(r'href="(https?://[^"]+)"', artist_html)
    artist_url = html.unescape(match.group(1)) if match else page_url
    if not artist_url.startswith("https://"):
        artist_url = page_url
    if not license_url.startswith("https://"):
        license_url = page_url
    return {
        "title": title, "url": url, "page_url": page_url,
        "artist": artist, "artist_url": artist_url,
        "license": license_name, "license_url": license_url,
        "description": description,
    }

def figure(item, source, width, height):
    e = lambda s: html.escape(str(s), quote=True)
    topic = item["primary_keyword"]
    title = clean(source["title"].removeprefix("File:").rsplit(".", 1)[0], 125)
    alt = (title + " — illustrative image for " + topic)[:180]
    caption = (
        'Illustrative Wikimedia Commons photograph, not a photo of our rental fleet. '
        f'Image: <a href="{e(source["page_url"])}" rel="noopener noreferrer">{e(title)}</a>; '
        f'by <a href="{e(source["artist_url"])}" rel="noopener noreferrer">{e(source["artist"])}</a>; '
        f'license <a href="{e(source["license_url"])}" rel="noopener noreferrer">{e(source["license"])}</a>. '
        'Cropped and compressed for this article.'
    )
    return (
        '    <figure class="article-feature-image" style="margin:1.25rem 0 1.5rem;">\n'
        f'      <img src="{e(item["image_path"])}" width="{width}" height="{height}" '
        f'alt="{e(alt)}" loading="lazy" decoding="async" '
        'style="display:block;width:100%;height:auto;border-radius:12px;">\n'
        f'      <figcaption style="font-size:0.875rem;opacity:0.75;margin-top:0.4rem;">{caption}</figcaption>\n'
        '    </figure>\n\n'
    ), alt

def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: publish-commons-image-batch.py docs/image-batches/batch-002.json")
    manifest_path = (ROOT / sys.argv[1]).resolve()
    if not manifest_path.is_relative_to(ROOT / "docs/image-batches"):
        raise ValueError("Manifest outside allowed directory")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("batch_id") != "web-images-002" or len(manifest["items"]) > MAX_ITEMS:
        raise ValueError("Wrong batch or more than 50 items")
    report_path = manifest_path.with_name("batch-002-report.json")
    existing = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {"published": []}
    published = list(existing.get("published", []))
    seen = {x.get("commons_title") for x in published}
    hashes = {x.get("sha256") for x in published}
    failures = []
    skipped = []
    for i, item in enumerate(manifest["items"], 1):
        article = ROOT / item["article"]
        target = ROOT / item["image_path"].lstrip("/")
        try:
            if not article.is_file():
                raise FileNotFoundError(item["article"])
            body = article.read_text(encoding="utf-8")
            match = re.search(r"<article\b[^>]*>(.*?)</article>", body, re.I | re.S)
            if not match:
                raise ValueError("Article element missing")
            if item.get("status") in ("PUBLISHED_PENDING_DEPLOY", "LIVE_VERIFIED") and item["image_path"] in body and target.exists():
                print(f"ALREADY PUBLISHED {item['content_id']}", flush=True)
                continue
            if previous.has_meaningful_image(match.group(1)):
                item["status"] = "SKIPPED_ALREADY_ILLUSTRATED"
                skipped.append({"id": item["content_id"], "reason": "Article already has meaningful image"})
                continue
            if target.exists():
                raise ValueError("Image path already exists; do not overwrite")
            candidates = []
            for q in item["search_queries"][:2]:
                try:
                    candidates += search(q)
                except Exception as exc:
                    print(f"SEARCH WARNING {item['content_id']} {str(exc)[:150]}", flush=True)
                # Always check both location queries: the first results may be
                # dominated by biological specimens or historical archives.
                time.sleep(0.4)
            valid = []
            used_titles = set()
            for p in candidates:
                src = acceptable(p, item["subject_anchor"])
                if src and src["title"] not in seen and src["title"] not in used_titles:
                    valid.append(src)
                    used_titles.add(src["title"])
            if not valid:
                raise ValueError("No relevant reusable-license landscape photograph found")
            chosen = None
            errors = []
            for src in valid[:MAX_CANDIDATES]:
                try:
                    raw = request_bytes(src["url"])
                    webp, width, height = previous.render_webp(raw)
                    digest = hashlib.sha256(webp).hexdigest()
                    if digest in hashes:
                        continue
                    chosen = (src, webp, width, height, digest)
                    break
                except Exception as exc:
                    errors.append(str(exc)[:90])
            if chosen is None:
                raise ValueError("No valid image download/encoding: " + "; ".join(errors[:3]))
            src, webp, width, height, digest = chosen
            markup, alt = figure(item, src, width, height)
            if not previous.insert_before_first_h2(article, markup, item["image_path"]):
                raise ValueError("Article already illustrated during run")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(webp)
            seen.add(src["title"])
            hashes.add(digest)
            item.update({
                "status": "PUBLISHED_PENDING_DEPLOY", "source_type": "Wikimedia Commons stock photograph",
                "commons_title": src["title"], "commons_url": src["page_url"],
                "license": src["license"], "artist": src["artist"],
                "image_bytes": len(webp), "image_sha256": digest,
                "width": width, "height": height, "alt": alt
            })
            published.append({
                "id": item["content_id"], "url": item["url"],
                "article": item["article"], "image_path": item["image_path"],
                "bytes": len(webp), "sha256": digest,
                "commons_title": src["title"], "commons_url": src["page_url"],
                "artist": src["artist"], "license": src["license"]
            })
            print(f"OK {i:02d} {len(webp)} bytes {item['content_id']} {src['title']}", flush=True)
        except Exception as exc:
            item["status"] = "FAILED_RETRYABLE"
            failures.append({"id": item["content_id"], "error": str(exc)[:220]})
            print(f"FAILED {i:02d} {item['content_id']}: {str(exc)[:160]}", flush=True)
        time.sleep(0.3)
    manifest["status"] = "PUBLISHED_PENDING_DEPLOY" if not failures else "PARTIAL_PENDING_DEPLOY"
    manifest["published_count"] = len(published)
    manifest["failed_count"] = len(failures)
    manifest["skipped_count"] = len(skipped)
    manifest["last_attempt_at"] = datetime.now(timezone.utc).isoformat()
    manifest["source_note"] = "Attributed Wikimedia Commons stock photography, not AI-generated or the owner's fleet photos; live status must be verified separately."
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "batch_id": manifest["batch_id"], "status": manifest["status"],
        "generated_at": manifest["last_attempt_at"], "source_type": "Wikimedia Commons stock photos",
        "published_count": len(published), "failed_count": len(failures),
        "skipped_count": len(skipped), "published": published,
        "failed": failures, "skipped": skipped,
        "disclaimer": "Not live verified until GitHub Pages deploy and public URL checks."
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"RESULT published={len(published)} failed={len(failures)} skipped={len(skipped)}", flush=True)
    if not published:
        raise RuntimeError("No new image generated; refuse a misleading success commit")

if __name__ == "__main__":
    main()
