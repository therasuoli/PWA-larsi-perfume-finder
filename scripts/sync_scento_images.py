#!/usr/bin/env python3
"""
Build data/perfume-images.json from Scento product-page HTML.
Polite, resumable, crash-safe.

Usage:
    python scripts/sync_scento_images.py                    # full crawl, skip existing
    python scripts/sync_scento_images.py --max-pages 5      # quick test
    python scripts/sync_scento_images.py --delay 2.0        # slower / safer
    python scripts/sync_scento_images.py --refresh-all      # re-crawl everything
"""

import argparse
import csv
import html
import io
import json
import os
import re
import signal
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ---------------------------------------------------------------- constants
ROOT    = Path(__file__).resolve().parents[1]
OUT     = ROOT / "data" / "perfume-images.json"
TMP     = OUT.with_suffix(".json.tmp")
CSV_URL = "https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv"
UA      = "PerfumeFinder/2.1 (image metadata index; respectful crawler; +https://github.com/therasuoli/PWA-larsi-perfume-finder)"
VERSION = 1
SOURCE  = "Scento"

ALLOWED_IMAGE_HOSTS = {"imagedelivery.net", "www.scento.com", "scento.com"}
REQUEST_TIMEOUT     = 25
RETRY_ATTEMPTS      = 3
RETRY_BACKOFF       = (2, 5, 10)  # seconds
SAVE_EVERY          = 5


# ---------------------------------------------------------------- http
def _make_request(url: str) -> Request:
    return Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/json,text/csv,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
        },
    )


def get(url: str, *, retries: int = RETRY_ATTEMPTS) -> bytes:
    """GET with retries. Raises on final failure."""
    last_err = None
    for attempt in range(retries):
        try:
            with urlopen(_make_request(url), timeout=REQUEST_TIMEOUT) as r:
                return r.read()
        except HTTPError as e:
            # 4xx → don't retry except 429
            if e.code == 429:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)] * 2
                print(f"  rate limited, sleeping {wait}s", file=sys.stderr)
                time.sleep(wait)
                last_err = e
                continue
            if 400 <= e.code < 500:
                raise
            last_err = e
        except (URLError, TimeoutError, ConnectionError) as e:
            last_err = e
        if attempt < retries - 1:
            wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
            print(f"  retry {attempt+1}/{retries} after {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise last_err  # type: ignore[misc]


# ---------------------------------------------------------------- robots
def allowed(url: str) -> bool:
    """Check robots.txt. Fail-closed: if we can't check, we don't crawl."""
    u = urlparse(url)
    robots_url = f"{u.scheme}://{u.netloc}/robots.txt"
    try:
        text = get(robots_url, retries=1).decode("utf-8", "replace")
    except HTTPError as e:
        if e.code == 404:
            return True  # no robots.txt → allowed
        print(f"robots.txt could not be checked ({e}); stop for safety", file=sys.stderr)
        return False
    except Exception as e:
        print(f"robots.txt could not be checked ({e}); stop for safety", file=sys.stderr)
        return False

    active = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.lower().startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip()
            active = agent == "*" or "PerfumeFinder" in agent
        elif active and line.lower().startswith("disallow:"):
            path = line.split(":", 1)[1].strip()
            if path and u.path.startswith(path):
                return False
        elif active and line.lower().startswith("allow:"):
            path = line.split(":", 1)[1].strip()
            if path and u.path.startswith(path):
                return True
    return True


# ---------------------------------------------------------------- HTML parse
class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.json_blobs = []
        self._in_json = False
        self.urls = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("property", "").lower() == "og:image":
            self.urls.insert(0, a.get("content", ""))
        if tag in ("img", "source"):
            for k in ("src", "srcset"):
                if a.get(k):
                    self.urls.append(a[k])
        if tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self.json_blobs.append("")
            self._in_json = True

    def handle_data(self, data):
        if self._in_json and self.json_blobs:
            self.json_blobs[-1] += data

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_json = False


def image_url(raw: str, page: str):
    """Normalize, validate and return a clean https URL (or None)."""
    raw = html.unescape((raw or "").strip().strip("\"'"))
    if not raw or raw.startswith(("data:", "blob:")):
        return None
    try:
        u = urljoin(page, raw)
        p = urlparse(u)

        # unwrap /_next/image?url=...
        if p.path == "/_next/image":
            inner = parse_qs(p.query).get("url", [None])[0]
            if not inner:
                return None
            u = urljoin("https://www.scento.com", html.unescape(inner))
            p = urlparse(u)

        if p.scheme != "https" or p.netloc not in ALLOWED_IMAGE_HOSTS:
            return None
        if p.netloc.endswith("scento.com") and not p.path.startswith("/images/"):
            return None
        return u
    except Exception:
        return None


def _walk_jsonld(obj, page, out):
    if isinstance(obj, dict):
        typ = obj.get("@type", [])
        types = [typ] if isinstance(typ, str) else typ
        if any(t in ("ProductGroup", "Product") for t in types):
            imgs = obj.get("image", [])
            imgs = [imgs] if isinstance(imgs, str) else imgs
            for x in imgs if isinstance(imgs, list) else []:
                u = image_url(x, page)
                if u:
                    out.append(u)
        for v in obj.values():
            _walk_jsonld(v, page, out)
    elif isinstance(obj, list):
        for v in obj:
            _walk_jsonld(v, page, out)


def extract(page: str, body: str) -> list:
    p = Parser()
    try:
        p.feed(body)
    except Exception as e:
        print(f"  HTML parse warning: {e}", file=sys.stderr)

    out = []
    for blob in p.json_blobs:
        try:
            _walk_jsonld(json.loads(blob), page, out)
        except Exception:
            pass

    for raw in p.urls:
        for part in raw.split(","):
            part = part.strip().split()[0] if part.strip() else ""
            u = image_url(part, page)
            if u:
                out.append(u)

    # dedupe, preferring /public (bottle) then /campaign then others
    seen, uniq = set(), []
    for u in out:
        if u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    uniq.sort(key=lambda u: 0 if u.endswith("/public") else 1 if u.endswith("/campaign") else 2)
    return uniq[:10]


# ---------------------------------------------------------------- manifest IO
def load_manifest() -> dict:
    """Load existing manifest; tolerate old schema {images: {...}}."""
    if not OUT.exists():
        return {"version": VERSION, "source": SOURCE, "images": {}}
    try:
        raw = json.loads(OUT.read_text("utf-8"))
    except Exception as e:
        print(f"existing manifest unreadable ({e}); starting fresh", file=sys.stderr)
        return {"version": VERSION, "source": SOURCE, "images": {}}

    if not isinstance(raw, dict):
        return {"version": VERSION, "source": SOURCE, "images": {}}

    if "images" not in raw:
        # legacy: the whole object IS the images map
        raw = {"images": raw}

    raw.setdefault("version", VERSION)
    raw.setdefault("source", SOURCE)
    return raw


def save_manifest(manifest: dict) -> None:
    """Atomic write with metadata + validation."""
    images = manifest.get("images", {})
    manifest["version"] = VERSION
    manifest["source"] = SOURCE
    manifest["count"] = len(images)
    manifest["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    # strict-ish validation
    for slug, entry in images.items():
        if not isinstance(entry, dict):
            raise ValueError(f"invalid entry for {slug!r}")
        if not isinstance(entry.get("primary", ""), str):
            raise ValueError(f"primary must be string for {slug!r}")
        if not isinstance(entry.get("gallery", []), list):
            raise ValueError(f"gallery must be list for {slug!r}")

    TMP.parent.mkdir(parents=True, exist_ok=True)
    TMP.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        "utf-8",
    )
    os.replace(TMP, OUT)


def load_csv_rows(url: str) -> list:
    text = get(url).decode("utf-8-sig", "replace")
    return list(csv.DictReader(io.StringIO(text)))


# ---------------------------------------------------------------- crawl
def crawl(rows: list, manifest: dict, *, delay: float, force: bool, max_pages: int) -> int:
    images = manifest.setdefault("images", {})
    rows = rows[:max_pages] if max_pages > 0 else rows

    total = len(rows)
    done = 0
    skipped = 0
    failed = 0
    host_ok: dict = {}  # netloc -> bool

    def save():
        save_manifest(manifest)

    # graceful Ctrl+C
    def _on_sigint(signum, frame):
        print("\ninterrupted; saving progress...", file=sys.stderr)
        save()
        sys.exit(130)

    old_handler = signal.signal(signal.SIGINT, _on_sigint)

    try:
        for i, row in enumerate(rows, 1):
            slug = (row.get("slug") or row.get("id") or "").strip()
            page = (row.get("url") or "").strip()

            if not slug or not page:
                continue
            if slug in images and not force:
                skipped += 1
                continue

            host = urlparse(page).netloc
            if host not in host_ok:
                host_ok[host] = allowed(page)
            if not host_ok[host]:
                print(f"crawl not permitted for {host}; stopping.", file=sys.stderr)
                break

            try:
                body = get(page).decode("utf-8", "replace")
                urls = extract(page, body)
                images[slug] = {
                    "primary": urls[0] if urls else "",
                    "gallery": urls,
                    "sourcePage": page,
                    "extractedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                }
                done += 1
                print(f"[{i}/{total}] ok {slug} ({len(urls)} image{'s' if len(urls) != 1 else ''})")
            except HTTPError as e:
                if e.code in (403, 429):
                    print(f"[{i}/{total}] {e.code} for {slug}; stopping.", file=sys.stderr)
                    break
                failed += 1
                print(f"[{i}/{total}] skip {slug}: HTTP {e.code}", file=sys.stderr)
            except Exception as e:
                failed += 1
                print(f"[{i}/{total}] skip {slug}: {type(e).__name__}: {e}", file=sys.stderr)

            if done and done % SAVE_EVERY == 0:
                save()
                print(f"  saved progress ({done} new)")

            time.sleep(max(0.75, delay))
    finally:
        signal.signal(signal.SIGINT, old_handler)
        save()

    print(f"\nfinished: crawled={done} skipped={skipped} failed={failed} total_records={len(images)}")
    return 0


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description="Build Scento image manifest.")
    ap.add_argument("--delay", type=float, default=1.5, help="seconds between requests (min 0.75)")
    ap.add_argument("--max-pages", type=int, default=0, help="limit number of pages (0 = all)")
    ap.add_argument("--refresh-all", action="store_true", help="re-crawl entries already in manifest")
    ap.add_argument("--force", action="store_true", help=argparse.SUPPRESS)  # legacy alias
    a = ap.parse_args()

    force = a.refresh_all or a.force
    delay = max(0.75, a.delay)

    manifest = load_manifest()
    print(f"existing entries: {len(manifest.get('images', {}))}")

    try:
        rows = load_csv_rows(CSV_URL)
    except Exception as e:
        print(f"could not fetch CSV: {e}", file=sys.stderr)
        return 1

    print(f"catalog rows: {len(rows)}")
    return crawl(rows, manifest, delay=delay, force=force, max_pages=a.max_pages)


if __name__ == "__main__":
    sys.exit(main())
