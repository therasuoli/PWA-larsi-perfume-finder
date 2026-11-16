#!/usr/bin/env python3
"""Build data/perfume-images.json from Scento product-page HTML, politely and resumably."""
import argparse,csv,html,json,re,sys,time
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin,urlparse,parse_qs
from urllib.request import Request,urlopen
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'data'/'perfume-images.json'
CSV='https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv'; UA='PerfumeFinder/2.0 (image metadata index; respectful crawler)'
def get(url):
 req=Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/json,text/csv,*/*'})
 with urlopen(req,timeout=25) as r:return r.read()
def allowed(url):
 u=urlparse(url); robots=f'{u.scheme}://{u.netloc}/robots.txt'
 try:
  lines=get(robots).decode('utf-8','replace').splitlines(); group=[]; active=False
  for line in lines:
   line=line.split('#',1)[0].strip()
   if not line: continue
   if line.lower().startswith('user-agent:'):
    agent=line.split(':',1)[1].strip(); active=agent=='*' or 'PerfumeFinder' in agent
   elif active and line.lower().startswith('disallow:'):
    path=line.split(':',1)[1].strip()
    if path and u.path.startswith(path): return False
  return True
 except Exception as e:
  print(f'robots.txt could not be checked ({e}); stop for safety',file=sys.stderr);return False
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.json=[];self.injson=False;self.urls=[]
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if t=='meta' and a.get('property','').lower()=='og:image':self.urls.insert(0,a.get('content',''))
  if t in ('img','source'):
   for k in ('src','srcset'):
    if a.get(k):self.urls.append(a[k])
  if t=='script' and a.get('type','').lower()=='application/ld+json':self.json.append('');self.injson=True
 def handle_data(self,d):
  if self.injson and self.json:self.json[-1]+=d
 def handle_endtag(self,t):
  if t=='script':self.injson=False
def image_url(raw,page):
 raw=html.unescape((raw or '').strip().strip('"\''))
 if not raw or raw.startswith(('data:','blob:')):return None
 try:
  u=urljoin(page,raw);p=urlparse(u)
  if p.path=='/_next/image':
   inner=parse_qs(p.query).get('url',[None])[0]
   if not inner:return None
   u=urljoin('https://www.scento.com',html.unescape(inner));p=urlparse(u)
  if p.scheme!='https' or p.netloc not in ('imagedelivery.net','www.scento.com','scento.com'):return None
  if p.netloc.endswith('scento.com') and not p.path.startswith('/images/'):return None
  return u
 except:return None
def collect(obj,page,out):
 if isinstance(obj,dict):
  typ=obj.get('@type',[]);typ=[typ] if isinstance(typ,str) else typ
  if any(x in ('ProductGroup','Product') for x in typ):
   imgs=obj.get('image',[]);imgs=[imgs] if isinstance(imgs,str) else imgs
   for x in imgs if isinstance(imgs,list) else []:
    u=image_url(x,page)
    if u:out.append(u)
  for v in obj.values():collect(v,page,out)
 elif isinstance(obj,list):
  for v in obj:collect(v,page,out)
def extract(page,body):
 p=Parser();p.feed(body);out=[]
 for blob in p.json:
  try:collect(json.loads(blob),page,out)
  except:pass
 for raw in p.urls:
  for part in raw.split(','):
   u=image_url(part.strip().split()[0] if part.strip() else '',page)
   if u:out.append(u)
 uniq=list(dict.fromkeys(out));uniq.sort(key=lambda u:0 if u.endswith('/public') else 1 if u.endswith('/campaign') else 2)
 return uniq[:10]
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--delay',type=float,default=1.5);ap.add_argument('--max-pages',type=int,default=0);ap.add_argument('--force',action='store_true');a=ap.parse_args()
 try:manifest=json.loads(OUT.read_text('utf-8'))
 except:manifest={'images':{}}
 images=manifest.setdefault('images',{});rows=list(csv.DictReader(get(CSV).decode('utf-8-sig','replace').splitlines()))
 if a.max_pages:rows=rows[:a.max_pages]
 host_ok=set();done=0
 for row in rows:
  slug=(row.get('slug') or row.get('id') or '').strip();page=(row.get('url') or '').strip()
  if not slug or not page or (slug in images and not a.force):continue
  host=urlparse(page).netloc
  if host not in host_ok:
   if not allowed(page):print('Crawl not permitted by robots.txt; stopping.');break
   host_ok.add(host)
  try:
   urls=extract(page,get(page).decode('utf-8','replace'))
   images[slug]={'primary':urls[0] if urls else '', 'gallery':urls,'sourcePage':page,'extractedAt':datetime.now(timezone.utc).isoformat()};done+=1
   if done%10==0:OUT.write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'images':images},ensure_ascii=False,separators=(',',':')),'utf-8');print('indexed',done)
  except Exception as e:
   print('skip',page,e,file=sys.stderr)
   if '403' in str(e) or '429' in str(e):break
  time.sleep(max(.75,a.delay))
 OUT.write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'images':images},ensure_ascii=False,separators=(',',':')),'utf-8')
 print(f'finished: {done} pages, {len(images)} image records')
if __name__=='__main__':main()
