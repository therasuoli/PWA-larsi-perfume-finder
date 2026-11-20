#!/usr/bin/env python3
"""
Larsi Perfume Finder — product image crawler.

Builds data/perfume-images.json from the product pages listed in data/perfumes.json.
Faster than v3 but still polite:
  * a small worker pool (default 3) behind ONE global rate limiter (default 0.4 s between requests, ~2.5 req/s)
  * robots.txt is honoured; 403/429 stops the run gracefully and keeps all progress
  * resumable: already-indexed perfumes are skipped (use --force to refresh, --retry-empty-days for pages with no image)
  * atomic, incremental writes — an interrupted run never corrupts the manifest

Usage:
  python scripts/sync_images.py                      # crawl everything that is missing
  python scripts/sync_images.py --max-pages 50       # quick test
  python scripts/sync_images.py --workers 4 --interval 0.3
"""
import argparse, html, json, os, re, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data' / 'perfumes.json'
OUT = ROOT / 'data' / 'perfume-images.json'
UA = 'LarsiPerfumeFinder/4.0 (+https://lar30.com; image index; respectful crawler)'
ALLOWED_HOSTS = {'imagedelivery.net', 'www.scento.com', 'scento.com'}
REQUIRE_HTTPS = True  # tests may relax this
MAX_GALLERY = 6


class Stop(Exception):
    """Raised to stop the whole crawl (rate-limited or blocked)."""


class RateLimiter:
    def __init__(self, interval):
        self.interval, self.lock, self.next = max(0.15, interval), threading.Lock(), 0.0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            delay = self.next - now
            self.next = max(now, self.next) + self.interval
        if delay > 0:
            time.sleep(delay)


def fetch(url, timeout=25):
    req = Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5', 'Accept-Language': 'en'})
    with urlopen(req, timeout=timeout) as r:
        return r.read()


# ---------------------------------------------------------------- extraction
class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.json_blobs, self._in_json, self.urls = [], False, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta' and (a.get('property') or '').lower() == 'og:image' and a.get('content'):
            self.urls.insert(0, a['content'])
        if tag in ('img', 'source'):
            for k in ('src', 'srcset', 'data-src'):
                if a.get(k):
                    self.urls.append(a[k])
        if tag == 'script' and (a.get('type') or '').lower() == 'application/ld+json':
            self.json_blobs.append('')
            self._in_json = True

    def handle_data(self, data):
        if self._in_json and self.json_blobs:
            self.json_blobs[-1] += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self._in_json = False


def image_url(raw, page):
    raw = html.unescape((raw or '').strip().strip('"\''))
    if not raw or raw.startswith(('data:', 'blob:')):
        return None
    try:
        u = urljoin(page, raw)
        p = urlparse(u)
        if p.path == '/_next/image':  # Next.js optimiser wrapper -> real asset URL
            inner = parse_qs(p.query).get('url', [None])[0]
            if not inner:
                return None
            u = urljoin('https://www.scento.com', html.unescape(inner))
            p = urlparse(u)
        if REQUIRE_HTTPS and p.scheme != 'https':
            return None
        if p.netloc not in ALLOWED_HOSTS:
            return None
        if p.netloc.endswith('scento.com') and not p.path.startswith('/images/'):
            return None
        return u
    except Exception:
        return None


def collect_jsonld(obj, page, out):
    if isinstance(obj, dict):
        typ = obj.get('@type', [])
        typ = [typ] if isinstance(typ, str) else typ
        if any(t in ('ProductGroup', 'Product') for t in typ):
            imgs = obj.get('image', [])
            imgs = [imgs] if isinstance(imgs, str) else imgs
            for x in imgs if isinstance(imgs, list) else []:
                u = image_url(x if isinstance(x, str) else (x or {}).get('url'), page)
                if u:
                    out.append(u)
        for v in obj.values():
            collect_jsonld(v, page, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_jsonld(v, page, out)


def extract(page, body):
    """Returns image URLs, bottle shot (/public) first, then campaign shots."""
    p = PageParser()
    p.feed(body)
    out = []
    for blob in p.json_blobs:
        try:
            collect_jsonld(json.loads(blob), page, out)
        except Exception:
            pass
    for raw in p.urls:
        for part in raw.split(','):
            part = part.strip()
            u = image_url(part.split()[0] if part else '', page)
            if u:
                out.append(u)
    uniq = list(dict.fromkeys(out))
    uniq.sort(key=lambda u: 0 if u.endswith('/public') else 1 if u.endswith('/campaign') else 2)
    return uniq[:MAX_GALLERY]


# ---------------------------------------------------------------- crawl
def robots_ok(page):
    u = urlparse(page)
    rp = RobotFileParser()
    rp.set_url(f'{u.scheme}://{u.netloc}/robots.txt')
    try:
        rp.read()
    except Exception as e:
        print(f'robots.txt for {u.netloc} could not be read ({e}); stopping for safety', file=sys.stderr)
        return False
    return rp.can_fetch(UA, page) or rp.can_fetch('*', page)


def crawl_one(item, limiter, retries=2):
    page = item['url']
    for attempt in range(retries + 1):
        limiter.wait()
        try:
            urls = extract(page, fetch(page).decode('utf-8', 'replace'))
            return {'primary': urls[0] if urls else '', 'gallery': urls, 'sourcePage': page, 'extractedAt': datetime.now(timezone.utc).isoformat(timespec='seconds')}
        except HTTPError as e:
            if e.code in (403, 429):
                raise Stop(f'HTTP {e.code} from {urlparse(page).netloc}')
            if e.code == 404:
                return {'primary': '', 'gallery': [], 'sourcePage': page, 'extractedAt': datetime.now(timezone.utc).isoformat(timespec='seconds')}
            if attempt == retries:
                raise
        except (URLError, TimeoutError, ConnectionError):
            if attempt == retries:
                raise
        time.sleep(1.5 * (attempt + 1))


def save(images, partial):
    tmp = OUT.with_suffix('.tmp')
    payload = {'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'images': images}
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), 'utf-8')
    os.replace(tmp, OUT)
    return partial


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--interval', type=float, default=0.4, help='minimum seconds between request starts (global)')
    ap.add_argument('--max-pages', type=int, default=0, help='0 = no limit')
    ap.add_argument('--force', action='store_true', help='re-crawl pages that are already indexed')
    ap.add_argument('--retry-empty-days', type=float, default=7, help='re-try pages that had no image after N days')
    ap.add_argument('--catalog', default=str(CATALOG))
    a = ap.parse_args(argv)

    catalog = json.loads(Path(a.catalog).read_text('utf-8'))
    try:
        images = json.loads(OUT.read_text('utf-8')).get('images', {})
    except Exception:
        images = {}

    now = datetime.now(timezone.utc)
    def stale_empty(e):
        if e.get('primary'):
            return False
        try:
            return (now - datetime.fromisoformat(e['extractedAt'])).days >= a.retry_empty_days
        except Exception:
            return True

    todo = [p for p in catalog if p.get('url') and urlparse(p['url']).netloc in ALLOWED_HOSTS and (a.force or p['id'] not in images or stale_empty(images[p['id']]))]
    if a.max_pages:
        todo = todo[:a.max_pages]
    print(f'{len(images)} already indexed · {len(todo)} to crawl · {a.workers} workers · {a.interval}s interval')
    if not todo:
        return 0

    hosts_checked = {}
    for p in todo:
        host = urlparse(p['url']).netloc
        if host not in hosts_checked:
            hosts_checked[host] = robots_ok(p['url'])
            if not hosts_checked[host]:
                print('Crawling is not permitted by robots.txt — nothing done.')
                return 0

    limiter, done, stopped, failed = RateLimiter(a.interval), 0, None, 0
    t0 = time.time()
    try:
        with ThreadPoolExecutor(max_workers=max(1, a.workers)) as pool:
            futures = {pool.submit(crawl_one, p, limiter): p for p in todo}
            for fut in as_completed(futures):
                p = futures[fut]
                try:
                    images[p['id']] = fut.result()
                    done += 1
                except Stop as e:
                    stopped = str(e)
                    for f in futures:
                        f.cancel()
                    break
                except Exception as e:
                    failed += 1
                    print(f'skip {p["id"]}: {e}', file=sys.stderr)
                if done and done % 25 == 0:
                    save(images, True)
                    rate = done / max(1, time.time() - t0)
                    print(f'  indexed {done}/{len(todo)}  ({rate:.1f} pages/s)')
    except KeyboardInterrupt:
        stopped = 'interrupted'
    save(images, False)
    with_img = sum(1 for e in images.values() if e.get('primary'))
    print(f'finished: +{done} pages, {failed} failed · {len(images)} records · {with_img} with an image' + (f' · stopped early: {stopped}' if stopped else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
