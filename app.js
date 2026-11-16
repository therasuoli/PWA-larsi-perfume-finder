/* app.js — Data / API / Modal / Theme — v2.1 */
(() => {
'use strict';

const DATA_URL='https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv';
const IMAGE_MANIFEST='./data/perfume-images.json';
const API_BASE='https://www.scento.com/api/perfume/v1';
const API_TIMEOUT=8000;
const API_CACHE_MAX=200;

const UI=window.PFUI, CAT=window.PFCatalog;
const apiCache=new Map();
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const fa=n=>Number(n||0).toLocaleString('fa-IR');

const store={
  get(k,fb){try{const v=localStorage.getItem(k);return v==null?fb:JSON.parse(v)}catch{return fb}},
  raw(k,fb){try{const v=localStorage.getItem(k);return v==null?fb:v}catch{return fb}},
  set(k,v){try{localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));return true}catch{return false}}
};

const hashId=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return 'p'+Math.abs(h).toString(36)};

const state={
  items:[],
  selected:null,
  images:{},
  imageMap:new Map(),
  ratings:store.get('pf-v2-ratings',{}),
  favorites:new Set(store.get('pf-v2-favs',[])),
  theme:store.raw('pf-v2-theme','dark'),
  bankCount:0,
  brandCount:0
};

function csvParse(text){
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'&&text[i+1]==='"'&&q){cell+='"';i++}
    else if(c==='"'){q=!q}
    else if(c===','&&!q){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  const headers=(rows.shift()||[]).map(x=>x.trim());
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

function field(o,...keys){for(const k of keys){if(o[k]!=null&&o[k]!=='')return o[k]}return ''}

function normalize(raw,i){
  const name=field(raw,'name','perfume','title','perfume_name');
  const brand=field(raw,'brand','house','brand_name')||'Unknown';
  const sourceUrl=field(raw,'url','source_url','product_url');
  const slug=field(raw,'slug','url_slug')||(sourceUrl?sourceUrl.split('/').filter(Boolean).pop():'')||hashId(brand+'|'+name);
  const country=field(raw,'country','country_of_origin','origin_country','brand_country')||'نامشخص';
  const genderRaw=String(field(raw,'gender','for','target_gender')).toLowerCase();
  let gender='unisex';
  if(/women|woman|female|for her|زن/.test(genderRaw))gender='women';
  else if(/men|male|for him|مرد/.test(genderRaw))gender='men';
  const top=UI.asNotes(field(raw,'top_notes','top','topNotes'));
  const heart=UI.asNotes(field(raw,'middle_notes','heart_notes','heart','middle','heartNotes'));
  const base=UI.asNotes(field(raw,'base_notes','base','baseNotes'));
  const family=field(raw,'family','fragrance_family','olfactive_family');
  const season=UI.asNotes(field(raw,'season','seasons'));
  const timeRaw=UI.asNotes(field(raw,'time','usage_time','best_time')).join(' ').toLowerCase();
  const id=String(field(raw,'id')||slug||i);
  const _search=[name,brand,country,family,...top,...heart,...base].join(' ').toLowerCase();
  return{id,slug,name:name||'نام ثبت نشده',brand,country,gender,year:parseInt(field(raw,'year','release_year'),10)||0,top,heart,base,family,season,timeRaw,description:field(raw,'description','overview','details'),url:sourceUrl,image:field(raw,'image','image_url','photo'),_search};
}

function buildImageMap(){
  state.imageMap=new Map();
  for(const [k,v] of Object.entries(state.images||{})){
    if(!v)continue;
    state.imageMap.set(k,v);
    if(v.sourcePage)state.imageMap.set(v.sourcePage,v);
  }
}

async function apiGet(path){
  if(apiCache.has(path))return apiCache.get(path);
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),API_TIMEOUT);
  try{
    const res=await fetch(API_BASE+path,{headers:{Accept:'application/json'},signal:ctrl.signal});
    if(!res.ok)throw Error('Scento API '+res.status);
    const data=await res.json();
    if(apiCache.size>=API_CACHE_MAX){const first=apiCache.keys().next().value;if(first!==undefined)apiCache.delete(first)}
    apiCache.set(path,data);
    return data;
  }finally{clearTimeout(t)}
}

function applyPortrait(p,folio){
  const d=folio?.detail||{};const py=d.pyramid||{};
  const safe=v=>{const a=UI.asNotes(v);return a.length?a:null};
  const t=safe(py.top),h=safe(py.heart||py.middle),b=safe(py.base);
  if(t)p.top=t;if(h)p.heart=h;if(b)p.base=b;
  p.family=d.family||d.scento_family||p.family;
  p.description=folio.lede||d.character||p.description;
  const seasons=UI.asNotes(d.seasons);if(seasons.length)p.season=seasons;
  const times=[...UI.asNotes(d.hours),...UI.asNotes(d.occasions)].join(' ').toLowerCase();
  if(times)p.timeRaw=times;
  p._search=[p.name,p.brand,p.country,p.family,...p.top,...p.heart,...p.base].join(' ').toLowerCase();
  return p;
}

async function loadApiNeighbours(p){
  try{
    const data=await apiGet(`/perfumes/${encodeURIComponent(p.slug)}/neighbours`);
    const ns=data.detail?.neighbours||[];
    if(!ns.length)return;
    const cards=ns.slice(0,12).map(n=>{
      const found=state.items.find(x=>x.name.toLowerCase()===String(n.name||'').toLowerCase()&&x.brand.toLowerCase()===String(n.house||'').toLowerCase());
      const item=found||normalize({name:n.name,brand:n.house,family:n.family,slug:(n.page||'').split('/').pop(),url:n.page},'api');
      if(!found&&!state.items.some(x=>x.id===item.id))state.items.push(item);
      return{p:item,shared:n.shared||[],difference:n.difference||''};
    });
    const track=$('#similarTrack');
    if(track)track.innerHTML=cards.map(c=>UI.similarCardApi(c,{imageMap:state.imageMap})).join('');
  }catch{ /* fallback handled by caller */ }
}

function similarTo(p){
  const pool=state.items.filter(x=>x.id!==p.id);
  const base=new Set([...p.top,...p.heart,...p.base].map(x=>x.toLowerCase()));
  const fam=(p.family||'').toLowerCase();
  return pool.map(x=>{
    const notes=[...x.top,...x.heart,...x.base];
    const shared=notes.filter(n=>base.has(n.toLowerCase()));
    const union=new Set([...base,...notes.map(n=>n.toLowerCase())]).size||1;
    let score=Math.round(shared.length/union*100);
    if(fam&&fam===(x.family||'').toLowerCase())score+=20;
    return{p:x,score:Math.min(99,score),shared};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,14);
}

function renderSimilar(p){
  const track=$('#similarTrack');
  if(!track)return;
  track.innerHTML=UI.renderSimilarTrack(similarTo(p),{ratings:state.ratings,imageMap:state.imageMap});
  $('#similar')?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function refreshDetailRating(id){
  const content=$('#detailContent');if(!content)return;
  const line=content.querySelector('.detail-rating');
  if(line)line.innerHTML=UI.detailRating(id,state.ratings);
  const r=UI.ratingFor(id,state.ratings);
  content.querySelectorAll('[data-rate]').forEach(b=>{
    const on=+b.dataset.rate<=r.mine;
    b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false');
  });
  CAT.refreshCard(id);
}

function closeModal(sel){
  const m=typeof sel==='string'?$(sel):sel;
  if(!m)return;
  m.classList.add('hidden');
  document.body.style.overflow='';
  if(m.id==='detailModal')state.selected=null;
}

async function openDetail(id){
  const p=state.items.find(x=>x.id===id);
  if(!p)return;
  state.selected=p;
  const dc=$('#detailContent');if(!dc)return;
  dc.innerHTML=UI.detailHTML(p,{ratings:state.ratings,images:state.images,imageMap:state.imageMap});
  $('#detailModal').classList.remove('hidden');
  document.body.style.overflow='hidden';
  const closeBtn=$('#detailModal .close-btn');
  if(closeBtn)setTimeout(()=>closeBtn.focus(),0);
  const ds=dc.querySelector('#detailSimilar');
  if(ds)ds.onclick=()=>{renderSimilar(p);loadApiNeighbours(p);closeModal('#detailModal')};
  try{
    const folio=await apiGet(`/perfumes/${encodeURIComponent(p.slug||p.id)}`);
    applyPortrait(p,folio);
    if(state.selected!==p)return;
    const desc=dc.querySelector('.desc');if(desc)desc.textContent=p.description||'';
    const levels=dc.querySelectorAll('.note-level span');
    [p.top,p.heart,p.base].forEach((a,i)=>{if(levels[i])levels[i].textContent=(a||[]).join('، ')||'اطلاعاتی ثبت نشده'});
    const facts=dc.querySelector('.detail-facts');
    if(facts)facts.textContent=`خانواده بویایی: ${p.family||'نامشخص'} · فصل: ${(p.season||[]).join('، ')||'نامشخص'}`;
    const ss=$('#sourceStatus');if(ss)ss.textContent='اتصال زنده Scento API';
  }catch{}
}

function toast(msg){
  const t=$('#toast');if(!t)return;
  t.textContent=msg;t.classList.add('show');
  clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2300);
}

function applyTheme(t){
  state.theme=t;
  document.documentElement.dataset.theme=t;
  store.set('pf-v2-theme',t);
  const btn=$('#themeBtn');if(btn)btn.textContent=t==='light'?'☾':t==='sand'?'◐':'☼';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=t==='light'?'#f4f3ee':t==='sand'?'#211d17':'#101411';
}

async function loadData(){
  let loaded=false;
  try{
    const res=await fetch(DATA_URL,{cache:'no-store'});
    if(!res.ok)throw Error('HTTP '+res.status);
    const raw=csvParse(await res.text());
    state.items=raw.map(normalize).filter(p=>p.name&&p.name!=='نام ثبت نشده');
    loaded=state.items.length>0;
    state.bankCount=state.items.length;
    state.brandCount=new Set(state.items.map(p=>p.brand)).size;
    const ss=$('#sourceStatus');if(ss)ss.textContent=`بانک Scento · ${fa(state.items.length)} عطر`;
    store.set('pf-v2-last-data',state.items);
  }catch{
    const cached=store.get('pf-v2-last-data',[]);
    if(Array.isArray(cached)&&cached.length){
      state.items=cached;state.bankCount=cached.length;state.brandCount=new Set(cached.map(p=>p.brand)).size;loaded=true;
      const ss=$('#sourceStatus');if(ss)ss.textContent='نمایش آخرین بانک ذخیره‌شده · آفلاین';
    }
    if(!loaded){
      const ss=$('#sourceStatus');if(ss)ss.textContent='اتصال Scento برقرار نشد';
      const grid=$('#catalogGrid');if(grid)grid.innerHTML='<div class="empty-state">دریافت بانک اطلاعاتی ممکن نشد. اتصال اینترنت را بررسی و صفحه را دوباره بارگذاری کن.</div>';
    }
  }
  try{
    const r=await fetch(IMAGE_MANIFEST,{cache:'no-store'});
    if(r.ok){const j=await r.json();state.images=j.images||j;buildImageMap();}
  }catch{}
  return loaded;
}

function updateCounts(){
  const pc=$('#perfumeCount');if(pc)pc.textContent=fa(state.bankCount);
  const bc=$('#brandCount');if(bc)bc.textContent=fa(state.brandCount);
}

function renderBrands(){
  const m=new Map();
  state.items.forEach(p=>m.set(p.brand,(m.get(p.brand)||0)+1));
  const bt=$('#brandTrack');
  if(bt)bt.innerHTML=UI.renderBrandTrack([...m]);
}

function events(){
  const tc=$('#termsCheck'),sa=$('#startApp');
  if(tc&&sa){
    tc.addEventListener('change',e=>sa.disabled=!e.target.checked);
    sa.onclick=()=>{store.set('pf-v2-onboarded','1');$('#onboarding').classList.add('hidden')};
    if(!store.raw('pf-v2-onboarded',''))$('#onboarding').classList.remove('hidden');
  }

  const tb=$('#themeBtn');if(tb)tb.onclick=()=>applyTheme(state.theme==='dark'?'light':state.theme==='light'?'sand':'dark');
  const sb=$('#settingsBtn');if(sb)sb.onclick=()=>{$('#settingsModal').classList.remove('hidden');document.body.style.overflow='hidden'};
  $$('[data-close]').forEach(x=>x.onclick=()=>closeModal(x.closest('.modal')));
  $$('[data-theme-choice]').forEach(b=>b.onclick=()=>{applyTheme(b.dataset.themeChoice);toast('تم ظاهری تغییر کرد')});

  const fs=$('#fontSize');
  if(fs)fs.oninput=e=>{
    const v=+e.target.value;
    document.documentElement.style.setProperty('--font-scale',v/100);
    const fv=$('#fontValue');if(fv)fv.textContent=v+'٪';
    store.set('pf-v2-font',String(v));
  };

  const st=$('#similarTrack');
  if(st){
    st.onclick=e=>{const c=e.target.closest('[data-id]');if(c)openDetail(c.dataset.id)};
    st.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      const c=e.target.closest('.similar-card[data-id]');
      if(c&&document.activeElement===c){e.preventDefault();openDetail(c.dataset.id)}
    });
  }

  const bt=$('#brandTrack');
  if(bt)bt.onclick=e=>{
    const b=e.target.closest('[data-brand]');if(!b)return;
    CAT.setQuery(b.dataset.brand);
    $('#catalog')?.scrollIntoView({behavior:'smooth'});
  };

  const dc=$('#detailContent');
  if(dc)dc.onclick=e=>{
    const b=e.target.closest('[data-rate]');
    if(!b||!state.selected)return;
    const n=+b.dataset.rate,id=state.selected.id,old=UI.ratingFor(id,state.ratings);
    const cur=old.mine;
    if(cur){old.sum-=cur;old.count--}
    old.sum+=n;old.count++;old.mine=n;
    state.ratings[id]=old;
    store.set('pf-v2-ratings',state.ratings);
    refreshDetailRating(id);
    toast('امتیاز تو ذخیره شد');
  };

  const sp=$('#similarPrev');if(sp)sp.onclick=()=>$('#similarTrack')?.scrollBy({left:340,behavior:'smooth'});
  const sn=$('#similarNext');if(sn)sn.onclick=()=>$('#similarTrack')?.scrollBy({left:-340,behavior:'smooth'});
  const bp=$('#brandPrev');if(bp)bp.onclick=()=>$('#brandTrack')?.scrollBy({left:340,behavior:'smooth'});
  const bn=$('#brandNext');if(bn)bn.onclick=()=>$('#brandTrack')?.scrollBy({left:-340,behavior:'smooth'});

  const sur=$('#surpriseBtn');
  if(sur)sur.onclick=()=>{if(!state.items.length)return;openDetail(state.items[Math.floor(Math.random()*state.items.length)].id)};

  const mb=$('#menuBtn');
  if(mb)mb.onclick=()=>document.querySelector('.desktop-nav')?.classList.toggle('mobile-open');
  const dn=document.querySelector('.desktop-nav');
  if(dn)dn.addEventListener('click',e=>{if(e.target.closest('a'))dn.classList.remove('mobile-open')});

  const btTop=$('#backTop');
  if(btTop){
    const onScroll=()=>btTop.classList.toggle('show',window.scrollY>400);
    window.addEventListener('scroll',onScroll,{passive:true});
    btTop.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
  }

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeModal('#detailModal');closeModal('#settingsModal');return}
    if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){
      e.preventDefault();
      const inp=$('#searchInput');if(inp){inp.focus();inp.select()}
    }
  });

  document.addEventListener('error',e=>{
    const t=e.target;
    if(t&&t.tagName==='IMG'&&t.dataset.fallback!=null){
      t.dataset.fallback='';
      const parent=t.parentElement;
      if(parent){t.remove();parent.insertAdjacentHTML('beforeend','<span class="image-placeholder">PF</span>')}
    }
  },true);
}

function initCatalog(){
  CAT.init({
    ratings:state.ratings,
    favorites:state.favorites,
    imageMap:state.imageMap,
    onOpenDetail:id=>openDetail(id),
    onFavoritesChange:list=>{store.set('pf-v2-favs',list)},
    onCountChange:()=>{}
  });
}

async function boot(){
  applyTheme(state.theme);
  const fs=store.raw('pf-v2-font','');
  if(fs){
    const v=+fs||100;
    document.documentElement.style.setProperty('--font-scale',v/100);
    const el=$('#fontSize');if(el)el.value=v;
    const fv=$('#fontValue');if(fv)fv.textContent=v+'٪';
  }
  events();
  initCatalog();
  const loaded=await loadData();
  if(loaded){
    CAT.initCountries(state.items);
    CAT.setItems(state.items);
    updateCounts();
    renderBrands();
  }
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      if(reg.waiting)reg.waiting.postMessage('SKIP_WAITING');
      reg.addEventListener('updatefound',()=>{
        const nw=reg.installing;if(!nw)return;
        nw.addEventListener('statechange',()=>{
          if(nw.state==='installed'&&navigator.serviceWorker.controller){
            toast('نسخه جدید آماده است');
            nw.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(()=>{});
  }
}

boot();
})();
