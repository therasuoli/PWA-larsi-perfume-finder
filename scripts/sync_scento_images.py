#!/usr/bin/env python3
"""Extract product image URLs from Scento perfume pages.

Reads the public Scento perfume CSV and extracts image URLs from:
1) JSON-LD ProductGroup/Product (preferred)
2) og:image
3) img/source src and srcSet, including Next.js image proxy URLs.

The script is intentionally sequential and rate-limited. It checks robots.txt,
keeps a resumable manifest, and never downloads/copies image binaries.
"""
from __future__ import annotations
import argparse, csv, html, json, os, re, sys, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
CSV_URL = "https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv"
OUT = ROOT / "data" / "perfume-images.json"
UA = "PerfumeFinderImageIndexer/1.0 (+https://github.com; respectful low-rate metadata indexing)"


def fetch(url: str, timeout: int = 25) -> bytes:
    req = Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json,text/csv,*/*"})
    with urlopen(req, timeout=timeout) as response:
        return response.read()


def allowed_by_robots(url: str) -> bool:
    parts = urlparse(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    parser = RobotFileParser()
    try:
        parser.set_url(robots_url)
        parser.parse(fetch(robots_url).decode("utf-8", "replace").splitlines())
        return parser.can_fetch(UA, url)
    except Exception as exc:
        # Fail closed: if robots.txt cannot be checked, don't crawl product pages.
        print(f"Could not verify robots.txt ({exc}); skipping crawl for safety.", file=sys.stderr)
        return False


def decode_image_url(raw: str, base: str) -> str | None:
    raw = html.unescape((raw or "").strip().strip("\"'"))
    if not raw or raw.startswith("data:") or raw.startswith("blob:"):
        return None
    absolute = urljoin(base, raw)
    try:
        parsed = urlparse(absolute)
        if parsed.path == "/_next/image":
            inner = parse_qs(parsed.query).get("url", [None])[0]
            if not inner:
                return None
            inner = html.unescape(inner)
            absolute = urljoin("https://www.scento.com", inner)
            parsed = urlparse(absolute)
        if parsed.scheme != "https":
            return None
        if parsed.netloc not in {"imagedelivery.net", "www.scento.com", "scento.com"}:
            return None
        if parsed.netloc.endswith("scento.com") and not parsed.path.startswith("/images/"):
            return None
        return absolute
    except Exception:
        return None


def walk_jsonld(obj, found: list[str], page_url: str):
    if isinstance(obj, dict):
        typ = obj.get("@type")
        if typ in ("ProductGroup", "Product") or (isinstance(typ, list) and any(x in ("ProductGroup", "Product") for x in typ)):
            imgs = obj.get("image", [])
            if isinstance(imgs, str): imgs = [imgs]
            if isinstance(imgs, list):
                for item in imgs:
                    if isinstance(item, str):
                        u = decode_image_url(item, page_url)
                        if u: found.append(u)
        for key, value in obj.items():
            if key == "hasVariant" and isinstance(value, list):
                for child in value: walk_jsonld(child, found, page_url)
            elif isinstance(value, (dict, list)):
                walk_jsonld(value, found, page_url)
    elif isinstance(obj, list):
        for child in obj: walk_jsonld(child, found, page_url)


class ImageTagParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.images=[]; self.in_jsonld=False; self.jsonld=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag.lower() in ("img", "source"):
            for key in ("src", "srcset"):
                val=a.get(key)
                if val:
                    for part in val.split(","):
                        raw=part.strip().split()[0] if part.strip() else ""
                        self.images.append(raw)
        if tag.lower()=="script" and a.get("type","").lower()=="application/ld+json":
            self.in_jsonld=True; self.jsonld.append("")
        if tag.lower()=="meta" and a.get("property","").lower()=="og:image" and a.get("content"):
            self.images.insert(0,a["content"])
    def handle_data(self, data):
        if self.in_jsonld and self.jsonld:
            self.jsonld[-1]+=data
    def handle_endtag(self, tag):
        if tag.lower()=="script" and self.in_jsonld: self.in_jsonld=False


def extract_images(page_url: str, raw_html: str) -> list[str]:
    parser=ImageTagParser(); parser.feed(raw_html)
    found=[]
    for blob in parser.jsonld:
        try: walk_jsonld(json.loads(blob),found,page_url)
        except Exception: pass
    for raw in parser.images:
        # srcSet may contain Next image proxy URLs; decode each candidate.
        for candidate in raw.split(","):
            candidate=candidate.strip().split()[0] if candidate.strip() else ""
            u=decode_image_url(candidate,page_url)
            if u: found.append(u)
    unique=[]
    for u in found:
        if u not in unique: unique.append(u)
    # Transparent bottle image is the preferred card image; campaign image next.
    def rank(u):
        if u.endswith("/public") or "/public?" in u: return 0
        if u.endswith("/campaign") or "/campaign?" in u: return 1
        if "/images/" in u: return 2
        return 3
    return sorted(unique,key=rank)


def read_manifest():
    try:
        data=json.loads(OUT.read_text("utf-8"))
        return data if isinstance(data,dict) else {"images":{}}
    except Exception:
        return {"images":{}}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--delay",type=float,default=1.25,help="seconds between product page requests")
    ap.add_argument("--max-pages",type=int,default=0,help="optional test limit; 0 means all rows")
    ap.add_argument("--force",action="store_true",help="re-fetch already indexed pages")
    args=ap.parse_args()
    OUT.parent.mkdir(parents=True,exist_ok=True)
    manifest=read_manifest(); images=manifest.setdefault("images",{})
    rows=list(csv.DictReader(fetch(CSV_URL).decode("utf-8-sig","replace").splitlines()))
    if args.max_pages: rows=rows[:args.max_pages]
    print(f"Scento catalogue rows: {len(rows)}; cached image records: {len(images)}")
    checked_robots=set(); completed=0; errors=0
    for row in rows:
        pid=(row.get("id") or "").strip(); page=(row.get("url") or "").strip()
        if not pid or not page: continue
        if pid in images and not args.force: continue
        host=urlparse(page).netloc
        if host not in checked_robots:
            if not allowed_by_robots(page):
                print(f"robots.txt does not permit crawling {host}; stopping without requesting product pages.")
                break
            checked_robots.add(host)
        try:
            body=fetch(page).decode("utf-8","replace")
            urls=extract_images(page,body)
            images[pid]={"primary":urls[0] if urls else "","gallery":urls[:8],"sourcePage":page,"extractedAt":datetime.now(timezone.utc).isoformat()}
            completed+=1
            if completed % 10 == 0:
                manifest.update({"generatedAt":datetime.now(timezone.utc).isoformat(),"source":"Scento product page HTML: JSON-LD, og:image, img/srcSet","imageCount":sum(bool(v.get('primary')) for v in images.values())})
                OUT.write_text(json.dumps(manifest,ensure_ascii=False,separators=(",",":")),"utf-8")
                print(f"Indexed {completed} new pages; {len(images)} total records")
        except HTTPError as exc:
            errors+=1; print(f"HTTP {exc.code}: {page}",file=sys.stderr)
            if exc.code in (403, 429):
                print("Access throttled/denied; stopping to respect source limits.",file=sys.stderr); break
        except (URLError,TimeoutError,Exception) as exc:
            errors+=1; print(f"Skipped {page}: {exc}",file=sys.stderr)
        time.sleep(max(0.5,args.delay))
    manifest.update({"generatedAt":datetime.now(timezone.utc).isoformat(),"source":"Scento product page HTML: JSON-LD, og:image, img/srcSet","imageCount":sum(bool(v.get('primary')) for v in images.values()),"records":len(images),"errors":errors})
    OUT.write_text(json.dumps(manifest,ensure_ascii=False,separators=(",",":")),"utf-8")
    print(f"Done. New pages: {completed}; records: {len(images)}; with image: {manifest['imageCount']}; errors: {errors}")

if __name__=="__main__": main()
