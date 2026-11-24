// Read data, never execute remote JavaScript. All values are treated as untrusted.
const MAX_NODES=12000, MAX_PRODUCTS=12;
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const list=x=>Array.isArray(x)?x:x==null?[]:[x];
const str=(x,max=300)=>typeof x==='string'?x.trim().slice(0,max):typeof x==='number'&&Number.isFinite(x)?String(x):'';
const last=x=>str(x,200).split(/[/#]/).pop();
const type=(x,t)=>list(x?.['@type']).some(v=>last(v)===t);
export function safeLink(value,base,sameOrigin=true){
  if(typeof value!=='string'||!value.trim()||value.length>2048)return null;
  try{const u=new URL(value,base);if(u.protocol!=='https:'||u.username||u.password||u.port||sameOrigin&&u.origin!==new URL(base).origin)return null;u.hash='';return u.href;}catch{return null;}
}
function price(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0&&value<=1e8?value:null;
  if(typeof value!=='string'||!/^\d{1,8}(?:[.,]\d{1,4})?$/.test(value.trim()))return null;
  return Number(value.trim().replace(',','.'));
}
function currency(v){return /^[A-Z]{3}$/.test(str(v,3))&&str(v,10).length===3?v:null;}
export function stock(value){
  return ({InStock:'in_stock',OutOfStock:'out_of_stock',SoldOut:'out_of_stock',LimitedAvailability:'limited',PreOrder:'preorder',PreSale:'preorder',BackOrder:'backorder',OnlineOnly:'unknown',InStoreOnly:'unknown',Discontinued:'discontinued',BESTELLBAR:'orderable',NICHT_BESTELLBAR:'not_orderable'})[last(value)]||'unknown';
}
function norm(s){return str(s,800).toLowerCase().replace(/ß/g,'ss').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function matches(product,query){
  const q=norm(query).split(' ').filter(Boolean), hay=norm([product.title,product.sku,product.gtin,product.brand].filter(Boolean).join(' '));
  return q.length>0&&q.every(t=>hay.includes(t)||hay.replaceAll(' ','').includes(t));
}
function offerInfo(o,scope){
  return {price:price(o?.price??o?.lowPrice),currency:currency(o?.priceCurrency),stock:stock(o?.availability),scope,priceKind:o?.price==null&&o?.lowPrice!=null?'from':'listed'};
}
function selectOffer(offers){
  const parcel=offers.filter(o=>list(o.availableDeliveryMethod).some(v=>last(v)==='ParcelService'));
  const pickup=offers.filter(o=>list(o.availableDeliveryMethod).some(v=>last(v)==='OnSitePickup'));
  const unspecified=offers.filter(o=>!list(o.availableDeliveryMethod).length);
  const chosen=parcel.length?parcel:unspecified;
  const scope=parcel.length?'online':'unspecified';
  const values=chosen.map(o=>offerInfo(o,scope));
  let result=values[0]||{price:null,currency:null,stock:'unknown',scope:'unspecified',priceKind:'listed'};
  if(values.length>1){
    result={...result};
    if(!values.every(v=>v.stock===result.stock))result.stock='unknown';
    if(!values.every(v=>v.price===result.price&&v.currency===result.currency&&v.priceKind===result.priceKind)){result.price=null;result.currency=null;}
  }
  const stores=[];
  for(const o of pickup.slice(0,10)){
    const place=o.availableAtOrFrom;
    const name=obj(place)?str(place.name,100):'';
    if(name)stores.push({name,stock:stock(o.availability)});
  }
  return {...result,stores};
}
function productFromSchema(p,base){
  const title=str(p.name),url=safeLink(p.url||list(p.offers)[0]?.url||(typeof p['@id']==='string'&&!p['@id'].startsWith('#')?p['@id']:null),base);
  if(!title||!url)return null;
  const image=list(p.image)[0];
  return {title,url,sku:str(p.sku,80)||null,gtin:str(p.gtin13||p.gtin14||p.gtin,30)||null,brand:str(obj(p.brand)?p.brand.name:p.brand,100)||null,image:safeLink(obj(image)?image.url||image.contentUrl:image,base,false),...selectOffer(list(p.offers).filter(obj)),source:'json-ld'};
}
function productFromJSON(p,base){
  // Only accept a clear product identity plus explicit product fields, not arbitrary objects.
  if(!obj(p)||!(p.sku||p.gtin||p.productId)||!(p.price!=null||p.availability!=null||p.offers))return null;
  const title=str(p.name||p.title),url=safeLink(p.productUrl||p.url,base);
  if(!title||!url)return null;
  return {title,url,sku:str(p.sku||p.productId,80)||null,gtin:str(p.gtin,30)||null,brand:str(obj(p.brand)?p.brand.name:p.brand,100)||null,image:safeLink(list(p.image||p.imageUrl)[0],base,false),...selectOffer(list(p.offers||{price:p.price,priceCurrency:p.currency||p.priceCurrency,availability:p.availability,availableDeliveryMethod:p.availableDeliveryMethod}).filter(obj)),source:'json'};
}
function obiState(html){
  const match=/window\.__INITIAL_STATE__\s*=\s*'/.exec(html);
  if(!match)return null;
  const end=html.indexOf('</script',match.index+match[0].length);
  if(end===-1)return null;
  const raw=html.slice(match.index+match[0].length,end).trim().replace(/;$/,'').trim();
  if(!raw.endsWith("'"))return null;
  const content=raw.slice(0,-1);
  for(const candidate of [content,content.replace(/\\'/g,"'").replace(/\\\\"/g,'\\"')]){try{return JSON.parse(candidate);}catch{}}
  return null;
}
function obiProducts(data,base){
  const search=data?.pinia?.suche;
  if(!obj(search))return {known:false,empty:false,products:[]};
  if(search.error?.name==='NullErgebnisSeiteError')return {known:true,empty:true,products:[]};
  const items=search.suchergebnis?.ergebnisListe;
  if(!Array.isArray(items))return {known:false,empty:false,products:[]};
  const products=[];
  for(const item of items.slice(0,100)){
    if(!obj(item))continue;
    const title=str(item.artikelName),sku=str(item.artikelNummer,80),url=safeLink(item.detailseitenUrl,base);
    if(!title||!sku||!url)continue;
    const image=item.bilder?.[0]?.urlSchema;
    products.push({title,sku,url,gtin:null,brand:str(item.markenName,100)||null,image:safeLink(typeof image==='string'?image.replace('[PROFIL]','prZZK'):null,base,false),price:price(item.jsonLdPreis),currency:currency(item.preise?.preisPrimary?.waehrungsIsoCode),stock:stock(item.anzeigeOnlineBestellbarkeit),scope:'online',priceKind:'listed',stores:[],source:'obi-state'});
  }
  return {known:true,empty:items.length===0,products};
}
export function extractProducts(text,base,query,contentType='text/html'){
  const found=[],sources=new Set(),seen=new Set();
  let malformed=0,visited=0,structured=0,confirmedEmpty=false;
  const add=p=>{if(!p)return;const key=p.url+'|'+(p.sku||'');if(seen.has(key))return;seen.add(key);found.push(p);sources.add(p.source);};
  function walk(root,kind){
    const stack=[root];
    while(stack.length&&visited<MAX_NODES&&found.length<100){
      const v=stack.pop();visited++;
      if(Array.isArray(v)){for(let i=Math.min(v.length,300)-1;i>=0;i--)stack.push(v[i]);continue;}
      if(!obj(v))continue;
      if(type(v,'Product'))add(productFromSchema(v,base));
      else if(kind==='json')add(productFromJSON(v,base));
      for(const k of Object.keys(v).slice(0,100))if(typeof v[k]==='object'&&v[k]!==null)stack.push(v[k]);
    }
  }
  if(contentType.includes('json')){
    try{structured++;walk(JSON.parse(text),'json');}catch{malformed++;}
  }else{
    const host=new URL(base).hostname;
    if(host==='www.obi.de'||host==='www.obi.at'){
      const state=obiState(text);
      if(state){structured++;const result=obiProducts(state,base);confirmedEmpty=result.empty;result.products.forEach(add);}
    }
    // Bounded script parsing; no remote scripts are evaluated.
    const re=/<script\b([^>]{0,2048})>([\s\S]*?)<\/script\s*>/gi;
    let m,count=0;
    while((m=re.exec(text))&&count++<100&&visited<MAX_NODES&&found.length<100){
      if(!/\btype\s*=\s*["']?application\/(?:ld\+json|json)\b/i.test(m[1])&&!/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(m[1]))continue;
      if(m[2].length>850000){malformed++;continue;}
      try{structured++;walk(JSON.parse(m[2]),/ld\+json/i.test(m[1])?'schema':'json');}catch{malformed++;}
    }
  }
  const matching=found.filter(p=>matches(p,query)).slice(0,MAX_PRODUCTS);
  return {products:matching,found:found.length,matched:matching.length,structured,malformed,sources:[...sources],confirmedEmpty:confirmedEmpty&&found.length===0};
}
export function looksBlocked(text){
  const title=/<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(text)?.[1]||'';
  return /just a moment|access denied|client challenge|sicherheitsprüfung|nur einen moment|request blocked|attention required/i.test(title)||/cf-chl-|_cf_chl_opt|f5_cspm|\/cdn-cgi\/challenge-platform/i.test(text.slice(0,50000));
}
