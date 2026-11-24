import {$,node,button,link,panel,createUI,makeSearchURL} from './shared.js';
import {runPool} from './search-pool.js';
const LABELS={
  products:['Matches found','ok'],no_results:['No results confirmed','warn'],no_verified_match:['No verified match','warn'],
  blocked:['Access blocked','bad'],timeout:['Timed out','bad'],network_error:['Network error','bad'],
  not_approved:['Needs provider approval','warn'],redirect_not_approved:['Redirect not approved','warn'],
  robots_disallowed:['Crawling not permitted','warn'],robots_unverified:['Crawl policy unavailable','warn'],
  response_truncated:['Response too large · unverified','warn'],unverified:['No verifiable product data','warn'],
  upstream_error:['Shop HTTP error','bad'],unsupported_content:['Unsupported response','warn'],invalid_template:['Invalid search URL','bad'],
  bad_redirect:['Invalid redirect','bad'],too_many_redirects:['Too many redirects','bad'],api_error:['Worker unavailable','bad'],cancelled:['Cancelled','warn']
};
const DETAIL={
  not_approved:'The site is not in the Worker’s approved origin/path list. Ask the operator to add a permitted search endpoint.',
  redirect_not_approved:'The shop redirected to an unapproved endpoint. No further request was made.',
  robots_disallowed:'This search path is disallowed by the shop’s robots policy.',
  robots_unverified:'The shop’s crawl policy could not be verified. No search request was made.',
  blocked:'The shop refused automated access or presented a challenge. No bypass attempted.',
  unverified:'The response did not include usable structured product data; JavaScript rendering may be required.',
  response_truncated:'The response exceeded the safe size limit before a match could be verified.',
  no_verified_match:'Product data was present but no title/model matched all search tokens.',
  no_results:'The shop explicitly reported no results; this does not imply every physical store is out of stock.',
  timeout:'The request exceeded its deadline; try again later.',
  api_error:'Check Cloudflare Worker/Pages Functions deployment, free-tier quota and Debug.',
};
const STOCK={in_stock:'Listed in stock',out_of_stock:'Listed out of stock',orderable:'Orderable online',not_orderable:'Not orderable online',limited:'Limited availability',preorder:'Pre-order',backorder:'Back-order',discontinued:'Discontinued',unknown:'Availability unknown'};
let ui,controller=null,last=null,showImages=false;
const results=new Map();
function productRow(p){
  const row=node('article','','product');
  if(showImages&&p.image){
    const img=node('img');img.loading='lazy';img.referrerPolicy='no-referrer';img.alt='';img.src=p.image;img.addEventListener('error',()=>img.remove());row.append(img);
  }
  const info=node('div','','product-info');
  const title=link(p.title,p.url);title.className='product-title';info.append(title);
  if(p.price!=null&&p.currency){
    let formatted;try{formatted=new Intl.NumberFormat(navigator.language,{style:'currency',currency:p.currency}).format(p.price);}catch{formatted=p.price+' '+p.currency;}
    info.append(node('p',(p.priceKind==='from'?'From ':'')+formatted,'product-price'));
  }else info.append(node('p','Price not verified','muted'));
  const label=STOCK[p.stock]||STOCK.unknown;
  const scope=p.stock==='unknown'?'':p.scope==='online'&&!['orderable','not_orderable'].includes(p.stock)?' · online delivery':p.scope==='unspecified'?' · scope unspecified':'';
  info.append(node('div',label+scope,'product-stock '+(['in_stock','orderable'].includes(p.stock)?'in':['out_of_stock','not_orderable','discontinued'].includes(p.stock)?'out':'unknown')));
  for(const store of (p.stores||[]))info.append(node('div','Pickup · '+store.name+': '+(STOCK[store.stock]||STOCK.unknown),'product-stock'));
  if(p.sku||p.gtin)info.append(node('div',[p.sku?'SKU '+p.sku:null,p.gtin?'GTIN '+p.gtin:null].filter(Boolean).join(' · '),'muted'));
  row.append(info);return row;
}
function render(p,result){
  const [label,style]=LABELS[result.status]||[result.status,'warn'];p.setStatus(label,style);
  p.body.replaceChildren();
  if(result.products?.length){
    for(const product of result.products)p.body.append(productRow(product));
    if(result.diagnostics?.truncated)p.body.append(node('p','Partial response; additional results may exist.','muted'));
  }else p.body.append(node('p',DETAIL[result.status]||'No verified product information. This is not an out-of-stock result.','muted'));
  if(result.httpStatus||result.ms!=null)p.body.append(node('div',[result.httpStatus?'HTTP '+result.httpStatus:null,result.ms!=null?result.ms+' ms':null].filter(Boolean).join(' · '),'muted'));
}
async function requestSite(site,query,signal){
  const timeout=new AbortController(),abort=()=>timeout.abort();
  if(signal.aborted)timeout.abort();else signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>timeout.abort(),12000);
  try{
    const response=await fetch('/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({template:site.template,query}),signal:timeout.signal,cache:'no-store'});
    if(!response.ok)return {status:'api_error',products:[],httpStatus:response.status};
    const value=await response.json();
    if(!value||typeof value.status!=='string'||!Array.isArray(value.products))return {status:'api_error',products:[]};
    return value;
  }catch{return {status:signal.aborted?'cancelled':timeout.signal.aborted?'timeout':'api_error',products:[]};}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
async function search(params){
  controller?.abort();controller=new AbortController();const signal=controller.signal;
  last=params;results.clear();$('views').replaceChildren();$('searchBtn').disabled=false;
  const panels=params.sites.map(site=>{const p=panel(site);p.head.append(link('Original search ↗',makeSearchURL(site.template,params.query)));p.setStatus('Queued');$('views').append(p.root);return p;});
  let done=0,matched=0;
  ui.status('Searching '+params.sites.length+' sites in parallel (up to 4 at once)…');
  await runPool(params.sites,4,async(site,i)=>{
    if(signal.aborted||!params.current())return;
    const p=panels[i];p.setStatus('Checking…');
    const data=await requestSite(site,params.query,signal);
    if(signal.aborted||!params.current())return;
    results.set(site.template,{p,data});render(p,data);done++;
    if(data.status==='products')matched++;
    ui.record('provider',{name:site.name,status:data.status,http:data.httpStatus??null,ms:data.ms??null,diagnostics:data.diagnostics??null});
    ui.status(done+'/'+params.sites.length+' checked · '+matched+' with matching products'+(done===params.sites.length?' · Finished.':''));
  });
}
const cancel=button('Cancel',()=>{controller?.abort();ui.clear();for(const p of $('views').querySelectorAll('.tag'))if(['Queued','Checking…'].includes(p.textContent)){p.textContent='Cancelled';p.className='tag warn';}ui.status('Search cancelled. Completed results kept.');});
const retry=button('Refresh search',()=>{if(last)void ui.search();});
const imageLabel=node('label',' Product images (external requests)'),images=node('input');images.type='checkbox';imageLabel.prepend(images);images.addEventListener('change',()=>{showImages=images.checked;for(const {p,data} of results.values())render(p,data);});
$('toolbar').append(cancel,retry,imageLabel);
ui=createUI({edition:'CLOUDFLARE WORKER',note:'Public product data · No false stock claims',settingsNote:'The Worker only fetches approved HTTPS search paths and respects robots policies. New sites need operator approval in ALLOWED_SEARCH_PREFIXES. Actual store pickup is shown only when a named store is explicitly provided.',onSearch:search});
fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error();const v=await r.json();if(!v.approved)throw Error();ui.record('worker-config',{version:v.version,approved:Object.keys(v.approved).length});}).catch(()=>{ui.record('worker-config','API unavailable: deploy the Worker or Pages Functions, not only static assets');ui.status('Worker API not reachable. Check the deployment; Debug has details.');});
