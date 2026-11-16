const CACHE_VERSION='pf-v3';
const SHELL_CACHE=`${CACHE_VERSION}-shell`;
const ASSET_CACHE=`${CACHE_VERSION}-assets`;
const IMAGE_CACHE=`${CACHE_VERSION}-images`;
const CORE=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./data/perfume-images.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL_CACHE);await cache.addAll(CORE);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('pf-')&&!k.startsWith(CACHE_VERSION)).map(k=>caches.delete(k)));await self.clients.claim();const clients=await self.clients.matchAll({type:'window'});clients.forEach(c=>c.postMessage({type:'PF_UPDATE_READY',version:CACHE_VERSION}))})()));
async function trim(cacheName,max){const cache=await caches.open(cacheName),keys=await cache.keys();if(keys.length>max)await Promise.all(keys.slice(0,keys.length-max).map(k=>cache.delete(k)))}
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
 if(url.origin===location.origin){if(req.mode==='navigate'){event.respondWith((async()=>{try{const fresh=await fetch(req);const c=await caches.open(SHELL_CACHE);c.put('./index.html',fresh.clone());return fresh}catch{return await caches.match(req)||await caches.match('./index.html')}})());return}
 if(/\.(?:js|css|webmanifest|json)$/.test(url.pathname)){event.respondWith((async()=>{const cache=await caches.open(ASSET_CACHE),cached=await cache.match(req);const update=fetch(req).then(r=>{if(r.ok)cache.put(req,r.clone());return r}).catch(()=>cached);return cached||update})());return}
 }
 if(req.destination==='image'){event.respondWith((async()=>{const cache=await caches.open(IMAGE_CACHE),cached=await cache.match(req);if(cached)return cached;try{const r=await fetch(req);if(r.ok||r.type==='opaque'){await cache.put(req,r.clone());await trim(IMAGE_CACHE,300)}return r}catch{return new Response('',{status:504})}})())}
});
