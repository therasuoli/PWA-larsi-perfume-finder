/* sw.js — Service Worker — pf-v2.1 */
const VERSION='pf-v2.1';
const SHELL=`${VERSION}-shell`;
const RUNTIME=`${VERSION}-runtime`;
const IMG_CACHE=`${VERSION}-img`;
const IMG_MAX=300;
const RUNTIME_MAX=80;

const CORE=['./','./index.html','./styles.css','./ui-v14.js','./catalog-v14.js','./app.js','./manifest.webmanifest'];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(SHELL);
    await Promise.all(CORE.map(u=>c.add(u).catch(err=>console.warn('[SW] skip',u,err&&err.message))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==SHELL&&k!==RUNTIME&&k!==IMG_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:'window'});
    clients.forEach(c=>c.postMessage({type:'SW_ACTIVATED',version:VERSION}));
  })());
});

self.addEventListener('message',e=>{
  const d=e.data;
  if(!d)return;
  if(d==='SKIP_WAITING'||(d&&d.type==='SKIP_WAITING'))self.skipWaiting();
  if(d&&d.type==='CLEAR_IMAGE_CACHE')caches.delete(IMG_CACHE);
});

async function trimCache(name,max){
  const cache=await caches.open(name);
  const keys=await cache.keys();
  if(keys.length<=max)return;
  for(let i=0;i<keys.length-max;i++)await cache.delete(keys[i]);
}

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  if(req.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const fresh=await fetch(req);
        if(fresh&&fresh.ok){const c=await caches.open(SHELL);c.put(req,fresh.clone()).catch(()=>{})}
        return fresh;
      }catch{
        return (await caches.match(req))||(await caches.match('./index.html'))||(await caches.match('./'))||new Response('',{status:504});
      }
    })());
    return;
  }

  if(req.destination==='image'){
    e.respondWith((async()=>{
      const cached=await caches.match(req);
      if(cached)return cached;
      try{
        const fresh=await fetch(req);
        if(fresh&&(fresh.ok||fresh.type==='opaque')){
          const c=await caches.open(IMG_CACHE);
          c.put(req,fresh.clone()).then(()=>trimCache(IMG_CACHE,IMG_MAX)).catch(()=>{});
        }
        return fresh;
      }catch{return new Response('',{status:504})}
    })());
    return;
  }

  if(url.origin===self.location.origin){
    e.respondWith((async()=>{
      const cached=await caches.match(req);
      const network=fetch(req).then(fresh=>{
        if(fresh&&fresh.ok){
          const p=caches.open(SHELL).then(c=>c.put(req,fresh.clone()).catch(()=>{}));
          p.then(()=>trimCache(SHELL,RUNTIME_MAX)).catch(()=>{});
        }
        return fresh;
      }).catch(()=>null);
      if(cached){network.catch(()=>{});return cached}
      const fresh=await network;
      return fresh||new Response('',{status:504});
    })());
    return;
  }

  e.respondWith(fetch(req).catch(()=>new Response('',{status:504})));
});
