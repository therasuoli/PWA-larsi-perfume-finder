(()=>{'use strict';

/* =========================================================
   CONSTANTS
   ========================================================= */
const DATA_URL='https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv';
const IMAGE_MANIFEST='./data/perfume-images.json';
const API_BASE='https://www.scento.com/api/perfume/v1';
const API_TIMEOUT=8000;
const API_CACHE_MAX=200;

/* =========================================================
   HELPERS
   ========================================================= */
const apiCache=new Map();
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const norm=s=>String(s??'').trim();
const fa=n=>Number(n||0).toLocaleString('fa-IR');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* safe localStorage wrapper */
const store={
  get(k,fb){try{const v=localStorage.getItem(k);return v==null?fb:JSON.parse(v)}catch{return fb}},
  raw(k,fb){try{const v=localStorage.getItem(k);return v==null?fb:v}catch{return fb}},
  set(k,v){try{localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));return true}catch{return false}}
};

/* normalize notes input — accepts string, array of strings, array of objects */
const asNotes=v=>{
  if(Array.isArray(v)){
    return v.map(n=>{
      if(n==null)return '';
      if(typeof n==='object')return String(n.name||n.note||n.title||'').trim();
      return String(n).trim();
    }).filter(Boolean);
  }
  return String(v||'').split(/[;,|]/).map(x=>x.trim()).filter(Boolean);
};

/* stable hash id for entries without id/slug */
const hashId=s=>{
  let h=5381;
  for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);
  return 'p'+Math.abs(h).toString(36);
};

/* =========================================================
   STATE
   ========================================================= */
const state={
  items:[],
  filtered:[],
  page:1,
  pageSize:20,
  gender:'all',
  time:'all',
  country:'all',
  sort:'popular',
  query:'',
  selected:null,
  images:{},
  imageMap:new Map(),
  ratings:store.get('pf-v2-ratings',{}),
  favorites:new Set(store.get('pf-v2-favs',[])),
  theme:store.raw('pf-v2-theme','dark'),
  bankCount:0,
  brandCount:0
};

/* =========================================================
   CSV PARSER
   ========================================================= */
function csvParse(text){
  text=text.replace(/^\uFEFF/,'');
  const rows=[];
  let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'&&text[i+1]==='"'&&q){cell+='"';i++}
    else if(c==='"'){q=!q}
    else if(c===','&&!q){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!q){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);
      if(row.some(x=>x.trim()))rows.push(row);
      row=[];cell='';
    }
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  const headers=(rows.shift()||[]).map(x=>x.trim());
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}

function field(o,...keys){
  for(const k of keys){if(o[k]!=null&&o[k]!=='')return o[k]}
  return '';
}

function normalize(raw,i){
  const name=field(raw,'name','perfume','title','perfume_name');
  const brand=field(raw,'brand','house','brand_name')||'Unknown';
  const sourceUrl=field(raw,'url','source_url','product_url');
  const slug=field(raw,'slug','url_slug')
    ||(sourceUrl?sourceUrl.split('/').filter(Boolean).pop():'')
    ||hashId(brand+'|'+name);
  const country=field(raw,'country','country_of_origin','origin_country','brand_country')||'نامشخص';
  const genderRaw=String(field(raw,'gender','for','target_gender')).toLowerCase();
  let gender='unisex';
  if(/women|woman|female|for her|زن/.test(genderRaw))gender='women';
  else if(/men|male|for him|مرد/.test(genderRaw))gender='men';

  const top=asNotes(field(raw,'top_notes','top','topNotes'));
  const heart=asNotes(field(raw,'middle_notes','heart_notes','heart','middle','heartNotes'));
  const base=asNotes(field(raw,'base_notes','base','baseNotes'));
  const family=field(raw,'family','fragrance_family','olfactive_family');
  const season=asNotes(field(raw,'season','seasons'));
  const timeRaw=asNotes(field(raw,'time','usage_time','best_time')).join(' ').toLowerCase();

  const id=String(field(raw,'id')||slug||i);
  const _search=[name,brand,country,family,...top,...heart,...base].join(' ').toLowerCase();

  return{
    id,slug,
    name:name||'نام ثبت نشده',
    brand,country,gender,
    year:parseInt(field(raw,'year','release_year'),10)||0,
    top,heart,base,family,season,timeRaw,
    description:field(raw,'description','overview','details'),
    url:sourceUrl,
    image:field(raw,'image','image_url','photo'),
    _search
  };
}

/* =========================================================
   IMAGE MAP
   ========================================================= */
function buildImageMap(){
  state.imageMap=new Map();
  for(const [k,v] of Object.entries(state.images||{})){
    if(!v)continue;
    state.imageMap.set(k,v);
    if(v.sourcePage)state.imageMap.set(v.sourcePage,v);
  }
}

function imgFor(p){
  const direct=state.imageMap.get(p.id)
    ||state.imageMap.get(p.slug)
    ||state.imageMap.get(p.name);
  if(direct)return direct.primary||direct.image||'';
  if(p.url){
    const byUrl=state.imageMap.get(p.url);
    if(byUrl)return byUrl.primary||byUrl.image||'';
  }
  return p.image||'';
}

function imgHTML(p,cls=''){
  const url=imgFor(p);
  return url
    ?`<img class="${cls}" src="${esc(url)}" alt="${esc(p.name)}" loading="lazy" data-fallback="1">`
    :'<span class="image-placeholder">PF</span>';
}

/* =========================================================
   RATING
   ========================================================= */
function ratingFor(id){return state.ratings[id]||{sum:0,count:0,mine:0}}
function average(id){const r=ratingFor(id);return r.count?r.sum/r.count:0}

function starsHTML(v){
  const rounded=Math.round(v);
  return `<span class="stars" aria-label="${v?v.toFixed(1):'بدون امتیاز'} از ۵">${[1,2,3,4,5].map(n=>n<=rounded?'★':'☆').join('')}</span>`;
}

function cardRating(id){
  const r=ratingFor(id);
  return `<div class="rating-line">${starsHTML(r.mine||0)}<span class="muted">${r.mine?`امتیاز تو: ${fa(r.mine)}`:'بدون امتیاز'}</span></div>`;
}

function detailRating(id){
  const r=ratingFor(id),avg=average(id);
  return `${starsHTML(avg)}<b>${avg?avg.toFixed(1):'—'}</b><span class="muted">${r.mine?`امتیاز تو: ${fa(r.mine)} از ۵`:'امتیاز نداده‌ای'}</span>`;
}

/* =========================================================
   CARD
   ========================================================= */
function card(p){
  const fav=state.favorites.has(p.id);
  return `<article class="perfume-card" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.brand)} — ${esc(p.name)}">
    <div class="card-image">
      ${imgHTML(p)}
      <button class="favorite-btn ${fav?'active':''}" data-fav="${esc(p.id)}" aria-label="علاقه‌مندی" aria-pressed="${fav}" type="button">${fav?'♥':'♡'}</button>
    </div>
    <div class="card-body">
      <div class="card-brand">${esc(p.brand)}</div>
      <h3>${esc(p.name)}</h3>
      <div class="card-meta"><span>${esc(p.country)}</span><span>${p.year||'—'}</span></div>
      ${cardRating(p.id)}
      <div class="card-notes">${[...p.top,...p.heart].slice(0,3).map(n=>`<span class="note-tag">${esc(n)}</span>`).join('')}</div>
    </div>
  </article>`;
}

/* =========================================================
   HASH SYNC
   ========================================================= */
function syncHash(){
  const p=new URLSearchParams();
  if(state.query)p.set('q',state.query);
  if(state.gender!=='all')p.set('g',state.gender);
  if(state.country!=='all')p.set('c',state.country);
  if(state.time!=='all')p.set('t',state.time);
  if(state.sort!=='popular')p.set('s',state.sort);
  const h=p.toString();
  const target=h?'#'+h:location.pathname+location.search;
  try{history.replaceState(null,'',target)}catch{}
}

function readHash(){
  const h=location.hash.replace(/^#/,'');
  if(!h)return;
  const p=new URLSearchParams(h);
  const q=p.get('q');if(q)state.query=q;
  const g=p.get('g');if(g)state.gender=g;
  const c=p.get('c');if(c)state.country=c;
  const t=p.get('t');if(t)state.time=t;
  const s=p.get('s');if(s)state.sort=s;
}

function applyStateToUI(){
  const si=$('#searchInput');if(si)si.value=state.query||'';
  const cf=$('#countryFilter');if(cf)cf.value=state.country;
  const sf=$('#sortFilter');if(sf)sf.value=state.sort;
  $$('[data-filter]').forEach(b=>{
    const on=b.dataset.filter===state.gender;
    b.classList.toggle('active',on);
    b.setAttribute('aria-pressed',on?'true':'false');
  });
  $$('[data-time]').forEach(b=>{
    const on=b.dataset.time===state.time;
    b.classList.toggle('active',on);
    b.setAttribute('aria-pressed',on?'true':'false');
  });
  const sb=si?.closest('.searchbar');
  if(sb)sb.classList.toggle('has-value',!!state.query);
}

/* =========================================================
   RENDER
   ========================================================= */
function render(){
  const q=state.query.toLowerCase();
  let list=state.items.filter(p=>{
    const gender=state.gender==='all'||p.gender===state.gender;
    const country=state.country==='all'||p.country===state.country;
    let time=true;
    if(state.time==='favorites')time=state.favorites.has(p.id);
    else if(state.time==='day')time=/day|morning|روز/.test(p.timeRaw);
    else if(state.time==='night')time=/night|evening|شب/.test(p.timeRaw);
    return gender&&country&&time&&(!q||p._search.includes(q));
  });

  if(state.sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'fa'));
  if(state.sort==='year')list.sort((a,b)=>b.year-a.year);
  if(state.sort==='rating')list.sort((a,b)=>average(b.id)-average(a.id));

  state.filtered=list;
  const show=list.slice(0,state.page*state.pageSize);
  const grid=$('#catalogGrid');
  if(grid){
    grid.setAttribute('aria-busy','false');
    grid.innerHTML=show.length
      ?show.map(card).join('')
      :`<div class="empty-state">موردی پیدا نشد. فیلترها یا عبارت جستجو را تغییر بده.</div>`;
  }
  const lm=$('#loadMore');
  if(lm)lm.classList.toggle('hidden',show.length>=list.length);

  updateCounts();
  syncHash();
}

function updateCounts(){
  const pc=$('#perfumeCount');if(pc)pc.textContent=fa(state.bankCount);
  const bc=$('#brandCount');if(bc)bc.textContent=fa(state.brandCount);
}

function renderBrands(){
  const m=new Map();
  state.items.forEach(p=>m.set(p.brand,(m.get(p.brand)||0)+1));
  const bt=$('#brandTrack');
  if(!bt)return;
  bt.innerHTML=[...m].sort((a,b)=>b[1]-a[1]).slice(0,60).map(([n,c])=>
    `<button class="brand-card" data-brand="${esc(n)}" type="button"><b>${esc(n)}</b><span>${fa(c)} عطر ثبت‌شده</span></button>`
  ).join('');
}

/* =========================================================
   SIMILAR
   ========================================================= */
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
  const matches=similarTo(p);
  const track=$('#similarTrack');
  if(!track)return;
  track.innerHTML=matches.length
    ?matches.map(({p:x,score,shared})=>
      `<article class="similar-card" data-id="${esc(x.id)}" tabindex="0" role="button">
        <div class="card-image">${imgHTML(x)}</div>
        <div class="card-body">
          <div class="card-brand">${esc(x.brand)}</div>
          <h3>${esc(x.name)}</h3>
          <span class="match-pill">${fa(score)}٪ شباهت · ${fa(shared.length)} نت مشترک</span>
          <div class="rating-line">${starsHTML(average(x.id))}<span class="muted">${average(x.id)?average(x.id).toFixed(1):'بدون امتیاز'}</span></div>
        </div>
      </article>`
    ).join('')
    :`<div class="empty-similar">برای این عطر نت مشترک کافی در بانک پیدا نشد.</div>`;
  $('#similar')?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

/* =========================================================
   API
   ========================================================= */
async function apiGet(path){
  if(apiCache.has(path))return apiCache.get(path);
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),API_TIMEOUT);
  try{
    const res=await fetch(API_BASE+path,{headers:{Accept:'application/json'},signal:ctrl.signal});
    if(!res.ok)throw Error('Scento API '+res.status);
    const data=await res.json();
    if(apiCache.size>=API_CACHE_MAX){
      const first=apiCache.keys().next().value;
      if(first!==undefined)apiCache.delete(first);
    }
    apiCache.set(path,data);
    return data;
  }finally{clearTimeout(t)}
}

function applyPortrait(p,folio){
  const d=folio?.detail||{};
  const py=d.pyramid||{};
  const safe=v=>{const a=asNotes(v);return a.length?a:null};
  const t=safe(py.top),h=safe(py.heart||py.middle),b=safe(py.base);
  if(t)p.top=t;
  if(h)p.heart=h;
  if(b)p.base=b;
  p.family=d.family||d.scento_family||p.family;
  p.description=folio.lede||d.character||p.description;
  const seasons=asNotes(d.seasons);
  if(seasons.length)p.season=seasons;
  const times=[...asNotes(d.hours),...asNotes(d.occasions)].join(' ').toLowerCase();
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
      const found=state.items.find(x=>
        x.name.toLowerCase()===String(n.name||'').toLowerCase()
        &&x.brand.toLowerCase()===String(n.house||'').toLowerCase()
      );
      const item=found||normalize({
        name:n.name,brand:n.house,family:n.family,
        slug:(n.page||'').split('/').pop(),url:n.page
      },'api');
      if(!found&&!state.items.some(x=>x.id===item.id))state.items.push(item);
      return{p:item,shared:n.shared||[],difference:n.difference||''};
    });
    const track=$('#similarTrack');
    if(!track)return;
    track.innerHTML=cards.map(({p:x,shared,difference})=>
      `<article class="similar-card" data-id="${esc(x.id)}" tabindex="0" role="button">
        <div class="card-image">${imgHTML(x)}</div>
        <div class="card-body">
          <div class="card-brand">${esc(x.brand)}</div>
          <h3>${esc(x.name)}</h3>
          <span class="match-pill">Scento · ${fa(shared.length)} نت مشترک</span>
          <p class="muted tiny">${esc(difference)}</p>
        </div>
      </article>`
    ).join('');
  }catch{renderSimilar(p)}
}

/* =========================================================
   DETAIL MODAL
   ========================================================= */
function detailHTML(p){
  const r=ratingFor(p.id);
  const image=imgFor(p);
  const gallery=state.images[p.id]?.gallery||[];
  return `<div class="detail-layout">
    <div>
      <div class="detail-photo">${image
        ?`<img src="${esc(image)}" alt="${esc(p.name)}" data-fallback="1">`
        :'<span class="image-placeholder">PF</span>'}</div>
      ${gallery.length
        ?`<div class="image-gallery">${gallery.map(u=>`<img src="${esc(u)}" loading="lazy" alt="گالری ${esc(p.name)}" data-fallback="1">`).join('')}</div>`
        :''}
    </div>
    <div class="detail-copy">
      <div class="card-brand">${esc(p.brand)} · ${esc(p.country)}</div>
      <h2>${esc(p.name)}</h2>
      <p class="muted">${p.year||'سال عرضه نامشخص'} · ${p.gender==='women'?'زنانه':p.gender==='men'?'مردانه':'یونیسکس'}</p>
      <div class="rating-line detail-rating">${detailRating(p.id)}</div>
      <p class="desc">${esc(p.description||'توضیحات رسمی برای این عطر در داده‌های فعلی ثبت نشده است.')}</p>
      <div class="note-pyramid">${[['نت‌های آغازین',p.top],['نت‌های میانی',p.heart],['نت‌های پایه',p.base]].map(([t,a])=>
        `<div class="note-level"><b>${t}</b><span>${a.length?a.map(esc).join('، '):'اطلاعاتی ثبت نشده'}</span></div>`
      ).join('')}</div>
      <p class="muted tiny detail-facts">خانواده بویایی: ${esc(p.family||'نامشخص')} · فصل: ${esc((p.season||[]).join('، ')||'نامشخص')}</p>
      <div class="rate-box">
        <b>به این عطر امتیاز بده</b>
        <p class="muted tiny">امتیاز شخصی تو در همین دستگاه ذخیره می‌شود.</p>
        <div class="rate-stars">${[1,2,3,4,5].map(n=>
          `<button data-rate="${n}" class="${r.mine>=n?'on':''}" aria-label="${n} ستاره" aria-pressed="${r.mine>=n}" type="button">★</button>`
        ).join('')}</div>
      </div>
      <button class="btn ghost wide" id="detailSimilar" type="button">دیدن عطرهای مشابه ✦</button>
    </div>
  </div>`;
}

function refreshDetailRating(id){
  const content=$('#detailContent');
  if(!content)return;
  const line=content.querySelector('.detail-rating');
  if(line)line.innerHTML=detailRating(id);
  const r=ratingFor(id);
  content.querySelectorAll('[data-rate]').forEach(b=>{
    const on=+b.dataset.rate<=r.mine;
    b.classList.toggle('on',on);
    b.setAttribute('aria-pressed',on?'true':'false');
  });
  const cardEl=[...document.querySelectorAll('.perfume-card')].find(c=>c.dataset.id===id);
  if(cardEl){
    const rl=cardEl.querySelector('.rating-line');
    if(rl)rl.outerHTML=cardRating(id);
  }
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
  const dc=$('#detailContent');
  if(!dc)return;
  dc.innerHTML=detailHTML(p);
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
    const desc=dc.querySelector('.desc');
    if(desc)desc.textContent=p.description||'';
    const levels=dc.querySelectorAll('.note-level span');
    [p.top,p.heart,p.base].forEach((a,i)=>{
      if(levels[i])levels[i].textContent=(a||[]).join('، ')||'اطلاعاتی ثبت نشده';
    });
    const facts=dc.querySelector('.detail-facts');
    if(facts)facts.textContent=`خانواده بویایی: ${p.family||'نامشخص'} · فصل: ${(p.season||[]).join('، ')||'نامشخص'}`;
    const ss=$('#sourceStatus');
    if(ss)ss.textContent='اتصال زنده Scento API';
  }catch{/* keep catalogue fallback */}
}

/* =========================================================
   TOAST & THEME
   ========================================================= */
function toast(msg){
  const t=$('#toast');
  if(!t)return;
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>t.classList.remove('show'),2300);
}

function applyTheme(t){
  state.theme=t;
  document.documentElement.dataset.theme=t;
  store.set('pf-v2-theme',t);
  const btn=$('#themeBtn');
  if(btn)btn.textContent=t==='light'?'☾':t==='sand'?'◐':'☼';
}

/* =========================================================
   LOAD DATA
   ========================================================= */
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
    const ss=$('#sourceStatus');
    if(ss)ss.textContent=`بانک Scento · ${fa(state.items.length)} عطر`;
    store.set('pf-v2-last-data',state.items);
  }catch{
    const cached=store.get('pf-v2-last-data',[]);
    if(Array.isArray(cached)&&cached.length){
      state.items=cached;
      state.bankCount=cached.length;
      state.brandCount=new Set(cached.map(p=>p.brand)).size;
      loaded=true;
      const ss=$('#sourceStatus');
      if(ss)ss.textContent='نمایش آخرین بانک ذخیره‌شده · آفلاین';
    }
    if(!loaded){
      const ss=$('#sourceStatus');
      if(ss)ss.textContent='اتصال Scento برقرار نشد';
      const grid=$('#catalogGrid');
      if(grid)grid.innerHTML='<div class="empty-state">دریافت بانک اطلاعاتی ممکن نشد. اتصال اینترنت را بررسی و صفحه را دوباره بارگذاری کن.</div>';
    }
  }

  try{
    const r=await fetch(IMAGE_MANIFEST,{cache:'no-store'});
    if(r.ok){
      const j=await r.json();
      state.images=j.images||j;
      buildImageMap();
    }
  }catch{}

  if(loaded){
    applyStateToUI();
    updateCounts();
    initCountries();
    render();
    renderBrands();
  }
}

function initCountries(){
  const countries=[...new Set(state.items.map(p=>p.country).filter(x=>x&&x!=='نامشخص'))].sort();
  const cf=$('#countryFilter');
  if(cf)cf.innerHTML='<option value="all">همه کشورها</option>'+countries.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

/* =========================================================
   EVENTS
   ========================================================= */
function events(){
  /* onboarding */
  const tc=$('#termsCheck'),sa=$('#startApp');
  if(tc&&sa){
    tc.addEventListener('change',e=>sa.disabled=!e.target.checked);
    sa.onclick=()=>{
      store.set('pf-v2-onboarded','1');
      $('#onboarding').classList.add('hidden');
    };
    if(!store.raw('pf-v2-onboarded',''))$('#onboarding').classList.remove('hidden');
  }

  /* theme & settings */
  const tb=$('#themeBtn');
  if(tb)tb.onclick=()=>applyTheme(state.theme==='dark'?'light':state.theme==='light'?'sand':'dark');

  const sb=$('#settingsBtn');
  if(sb)sb.onclick=()=>{
    $('#settingsModal').classList.remove('hidden');
    document.body.style.overflow='hidden';
  };

  $$('[data-close]').forEach(x=>x.onclick=()=>closeModal(x.closest('.modal')));

  $$('[data-theme-choice]').forEach(b=>b.onclick=()=>{
    applyTheme(b.dataset.themeChoice);
    toast('تم ظاهری تغییر کرد');
  });

  const fs=$('#fontSize');
  if(fs){
    fs.oninput=e=>{
      const v=+e.target.value;
      document.documentElement.style.setProperty('--font-scale',v/100);
      const fv=$('#fontValue');
      if(fv)fv.textContent=v+'٪';
      store.set('pf-v2-font',String(v));
    };
  }

  /* search */
  let searchTimer=null,apiTimer=null;
  const si=$('#searchInput');
  if(si){
    si.oninput=e=>{
      state.query=e.target.value;
      state.page=1;
      si.closest('.searchbar')?.classList.toggle('has-value',!!state.query);
      clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>render(),120);

      clearTimeout(apiTimer);
      const q=state.query.trim();
      if(q.length>2){
        apiTimer=setTimeout(async()=>{
          try{
            const f=await apiGet(`/search?q=${encodeURIComponent(q)}&kind=perfume`);
            for(const m of f.detail?.matches||[]){
              if(!m.name)continue;
              const slug=(m.url||'').split('/').pop()||hashId(m.name+'|'+(m.house||''));
              const dup=state.items.some(p=>
                p.slug===slug
                ||(p.name.toLowerCase()===m.name.toLowerCase()
                  &&p.brand.toLowerCase()===(m.house||'').toLowerCase())
              );
              if(dup)continue;
              state.items.unshift(normalize({
                name:m.name,brand:m.house,slug,url:m.url,family:m.family
              },'api-'+slug));
            }
            render();
          }catch{}
        },450);
      }
    };
  }

  const sc=$('#searchClear');
  if(sc&&si){
    sc.onclick=()=>{
      state.query='';
      si.value='';
      si.closest('.searchbar')?.classList.remove('has-value');
      state.page=1;
      render();
      si.focus();
    };
  }

  /* filters */
  const gf=$('#genderFilters');
  if(gf)gf.onclick=e=>{
    const b=e.target.closest('[data-filter]');
    if(!b)return;
    state.gender=b.dataset.filter;
    $$('[data-filter]').forEach(x=>{
      const on=x===b;
      x.classList.toggle('active',on);
      x.setAttribute('aria-pressed',on?'true':'false');
    });
    state.page=1;
    render();
  };

  const cf=$('#countryFilter');
  if(cf)cf.onchange=e=>{state.country=e.target.value;state.page=1;render()};

  const sf=$('#sortFilter');
  if(sf)sf.onchange=e=>{state.sort=e.target.value;state.page=1;render()};

  $$('[data-time]').forEach(b=>b.onclick=()=>{
    state.time=b.dataset.time;
    $$('[data-time]').forEach(x=>{
      const on=x===b;
      x.classList.toggle('active',on);
      x.setAttribute('aria-pressed',on?'true':'false');
    });
    state.page=1;
    render();
  });

  const lm=$('#loadMore');
  if(lm)lm.onclick=()=>{state.page++;render()};

  /* catalog grid */
  const cg=$('#catalogGrid');
  if(cg){
    cg.onclick=e=>{
      const fav=e.target.closest('[data-fav]');
      if(fav){
        const id=fav.dataset.fav;
        if(state.favorites.has(id))state.favorites.delete(id);
        else state.favorites.add(id);
        store.set('pf-v2-favs',[...state.favorites]);
        render();
        return;
      }
      const c=e.target.closest('[data-id]');
      if(c)openDetail(c.dataset.id);
    };
    cg.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      const c=e.target.closest('.perfume-card[data-id]');
      if(c&&document.activeElement===c){
        e.preventDefault();
        openDetail(c.dataset.id);
      }
    });
  }

  /* similar track */
  const st=$('#similarTrack');
  if(st){
    st.onclick=e=>{
      const c=e.target.closest('[data-id]');
      if(c)openDetail(c.dataset.id);
    };
    st.addEventListener('keydown',e=>{
      if(e.key!=='Enter'&&e.key!==' ')return;
      const c=e.target.closest('.similar-card[data-id]');
      if(c&&document.activeElement===c){
        e.preventDefault();
        openDetail(c.dataset.id);
      }
    });
  }

  /* brand track */
  const bt=$('#brandTrack');
  if(bt)bt.onclick=e=>{
    const b=e.target.closest('[data-brand]');
    if(!b)return;
    state.query=b.dataset.brand;
    if(si)si.value=state.query;
    si?.closest('.searchbar')?.classList.add('has-value');
    state.page=1;
    render();
    $('#catalog')?.scrollIntoView({behavior:'smooth'});
  };

  /* detail rate stars */
  const dc=$('#detailContent');
  if(dc)dc.onclick=e=>{
    const b=e.target.closest('[data-rate]');
    if(!b||!state.selected)return;
    const n=+b.dataset.rate;
    const id=state.selected.id;
    const old=ratingFor(id);
    const cur=old.mine;
    if(cur){old.sum-=cur;old.count--}
    old.sum+=n;
    old.count++;
    old.mine=n;
    state.ratings[id]=old;
    store.set('pf-v2-ratings',state.ratings);
    refreshDetailRating(id);
    toast('امتیاز تو ذخیره شد');
  };

  /* sliders */
  const sp=$('#similarPrev');if(sp)sp.onclick=()=>$('#similarTrack')?.scrollBy({left:340,behavior:'smooth'});
  const sn=$('#similarNext');if(sn)sn.onclick=()=>$('#similarTrack')?.scrollBy({left:-340,behavior:'smooth'});
  const bp=$('#brandPrev');if(bp)bp.onclick=()=>$('#brandTrack')?.scrollBy({left:340,behavior:'smooth'});
  const bn=$('#brandNext');if(bn)bn.onclick=()=>$('#brandTrack')?.scrollBy({left:-340,behavior:'smooth'});

  /* surprise */
  const sur=$('#surpriseBtn');
  if(sur)sur.onclick=()=>{
    if(!state.items.length)return;
    openDetail(state.items[Math.floor(Math.random()*state.items.length)].id);
  };

  /* mobile menu */
  const mb=$('#menuBtn');
  if(mb)mb.onclick=()=>document.querySelector('.desktop-nav')?.classList.toggle('mobile-open');
  const dn=document.querySelector('.desktop-nav');
  if(dn)dn.addEventListener('click',e=>{
    if(e.target.closest('a'))dn.classList.remove('mobile-open');
  });

  /* back to top */
  const btTop=$('#backTop');
  if(btTop){
    const onScroll=()=>btTop.classList.toggle('show',window.scrollY>400);
    window.addEventListener('scroll',onScroll,{passive:true});
    btTop.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
  }

  /* global keys */
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      closeModal('#detailModal');
      closeModal('#settingsModal');
      return;
    }
    if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){
      e.preventDefault();
      const inp=$('#searchInput');
      if(inp){inp.focus();inp.select()}
    }
  });

  /* image error fallback (global) */
  document.addEventListener('error',e=>{
    const t=e.target;
    if(t&&t.tagName==='IMG'&&t.dataset.fallback!=null){
      t.dataset.fallback='';
      const parent=t.parentElement;
      if(parent){
        t.remove();
        parent.insertAdjacentHTML('beforeend','<span class="image-placeholder">PF</span>');
      }
    }
  },true);
}

/* =========================================================
   INIT
   ========================================================= */
function init(){
  applyTheme(state.theme);

  const fs=store.raw('pf-v2-font','');
  if(fs){
    const v=+fs||100;
    document.documentElement.style.setProperty('--font-scale',v/100);
    const el=$('#fontSize');if(el)el.value=v;
    const fv=$('#fontValue');if(fv)fv.textContent=v+'٪';
  }

  readHash();
  events();
  loadData();

  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}

init();
})();
