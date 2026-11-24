export const VERSION = '3.0.0';
export const PLACEHOLDER = '{search_keyword}';
export const MAX_PROVIDERS = 24;
const STORE_KEY = 'horniboy:v3';
export const DEFAULT_SITES = Object.freeze([
  {name:'Hornbach DE', template:'https://www.hornbach.de/s/{search_keyword}?f.dsall=im+Markt+vorrätig&isInitialRequest=false'},
  {name:'Bauhaus DE', template:'https://www.bauhaus.info/search?availability=561&page=1&q={search_keyword}'},
  {name:'Sonderpreis Baumarkt', template:'https://www.sonderpreis-baumarkt.de/search?q={search_keyword}&search-button=&lang=de_DE'},
  {name:'OBI AT', template:'https://www.obi.at/search/{search_keyword}?_availability=store'},
  {name:'OBI DE', template:'https://www.obi.de/search/{search_keyword}?_availability=store'},
]);
export function validTemplate(template) {
  if (typeof template !== 'string' || template.length > 2048 || !template.startsWith('https://') || template.split(PLACEHOLDER).length !== 2 || /[\u0000-\u0020\\]/.test(template)) return false;
  if (template.slice(8).split(/[/?#]/)[0].includes(PLACEHOLDER)) return false;
  if (template.split('#')[1]?.includes(PLACEHOLDER)) return false;
  try {
    const url = new URL(template.replace(PLACEHOLDER,'test'));
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && !!url.hostname;
  } catch { return false; }
}
export function makeSearchURL(template, query) {
  if (!validTemplate(template)) throw new Error('Invalid HTTPS search template');
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Search term must contain 1–200 characters');
  return new URL(template.replace(PLACEHOLDER,encodeURIComponent(query.trim()))).href;
}
export function parseSites(text) {
  const lines = String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if (!lines.length || lines.length > MAX_PROVIDERS) throw new Error('Enter 1–'+MAX_PROVIDERS+' sites.');
  const seen = new Set();
  return lines.map((line,i)=>{
    const parts = line.split('|').map(x=>x.trim());
    const template = parts.length === 1 ? parts[0] : parts[1];
    if (parts.length > 2 || !validTemplate(template)) throw new Error('Line '+(i+1)+': invalid HTTPS URL or missing {search_keyword}.');
    if (seen.has(template)) throw new Error('Line '+(i+1)+': duplicate URL template.');
    seen.add(template);
    const name = (parts.length === 1 ? new URL(template.replace(PLACEHOLDER,'test')).hostname.replace(/^www\./,'') : parts[0]);
    if (!name || name.length > 80) throw new Error('Line '+(i+1)+': name must have 1–80 characters.');
    return {name,template,enabled:true};
  });
}
export function formatSites(sites) { return sites.map(s=>s.name+' | '+s.template).join('\n'); }
export function freshSites() { return DEFAULT_SITES.map(s=>({...s,enabled:true})); }
export function sanitizeState(value) {
  if (!value || typeof value !== 'object') return {sites:freshSites(),history:[]};
  let sites;
  try {
    sites = parseSites(formatSites(value.sites));
    sites = sites.map(s=>({...s,enabled:value.sites.find(v=>v.template===s.template)?.enabled!==false}));
  } catch { sites = freshSites(); }
  const history = Array.isArray(value.history) ? [...new Set(value.history.filter(s=>typeof s==='string'&&s.trim()&&s.length<=200))].slice(0,10) : [];
  return {sites,history};
}
export function nextHistory(history, query) { return [query,...history.filter(x=>x.toLowerCase()!==query.toLowerCase())].slice(0,10); }
export function node(tag,text='',className='') {
  const e=document.createElement(tag);
  if(text) e.textContent=text;
  if(className) e.className=className;
  return e;
}
export const $ = id=>document.getElementById(id);
export function button(label,fn) {
  const b=node('button',label); b.type='button'; b.addEventListener('click',fn); return b;
}
export function link(label,url) {
  const a=node('a',label);
  try { const u=new URL(url); if(u.protocol!=='https:' || u.username || u.password) throw Error(); a.href=u.href; a.target='_blank'; a.rel='noopener noreferrer'; }
  catch { a.removeAttribute('href'); }
  return a;
}
export function createUI({edition, note, settingsNote, onSearch, onSettingsChange}) {
  let state;
  const events=[];
  let searchSequence=0;
  function record(kind, detail) {
    // Callers must pass technical fields only, not product search strings or URLs.
    events.push({at:new Date().toISOString(),kind,detail});
    if(events.length>100)events.shift();
    if($('debugDialog').open) refreshDebug();
  }
  try {state=sanitizeState(JSON.parse(localStorage.getItem(STORE_KEY)||'null'));}
  catch {state=sanitizeState(null);record('storage','Saved settings unavailable; using defaults');}
  function save() {try{localStorage.setItem(STORE_KEY,JSON.stringify(state));}catch{record('storage','Unable to save browser settings');}}
  function status(text){$('status').textContent=text;}
  function report(){return {version:VERSION,edition,online:navigator.onLine,secureContext:window.isSecureContext,sites:state.sites.length,enabled:state.sites.filter(s=>s.enabled).length,events:[...events]};}
  function refreshDebug(){$('debugOutput').textContent=JSON.stringify(report(),null,2);}
  function renderHistory(){
    $('history').replaceChildren(node('strong','Search history:'));
    for(const term of state.history) $('history').append(button(term,()=>{$('searchInput').value=term;void search();}));
  }
  function renderControls(){
    $('controls').replaceChildren(node('strong','Sites:'));
    state.sites.forEach(s=>{
      const label=node('label'),cb=node('input');cb.type='checkbox';cb.checked=s.enabled;
      cb.addEventListener('change',()=>{s.enabled=cb.checked;save();onSettingsChange?.();});
      label.append(cb,document.createTextNode(s.name));$('controls').append(label);
    });
  }
  async function search(){
    const q=$('searchInput').value.trim().slice(0,200), sites=state.sites.filter(s=>s.enabled);
    if(!q){status('Enter a search term.');return;}
    if(!sites.length){status('Enable at least one website.');return;}
    const sequence=++searchSequence;
    state.history=nextHistory(state.history,q);save();renderHistory();
    record('search',{providers:sites.length});
    try{await onSearch({query:q,sites,sequence,current:()=>sequence===searchSequence});}
    catch(error){if(sequence===searchSequence)status('Search failed. Open Debug for details.');record('search-error',{name:error?.name||'Error',code:error?.code||'SEARCH_FAILED'});}
  }
  $('edition').textContent=edition;$('footer-note').textContent=note;$('settingsNote').textContent=settingsNote||'';
  $('search-bar').addEventListener('submit',e=>{e.preventDefault();void search();});
  $('clearHistoryBtn').addEventListener('click',()=>{state.history=[];save();renderHistory();});
  $('settingsBtn').addEventListener('click',()=>{$('siteList').value=formatSites(state.sites);$('settingsError').textContent='';$('settingsDialog').showModal();});
  $('restoreBtn').addEventListener('click',()=>{$('siteList').value=formatSites(freshSites());});
  $('cancelSettings').addEventListener('click',()=>$('settingsDialog').close());
  $('settingsForm').addEventListener('submit',e=>{
    e.preventDefault();
    try{const sites=parseSites($('siteList').value);state.sites=sites.map(s=>({...s,enabled:state.sites.find(v=>v.template===s.template)?.enabled!==false}));save();renderControls();$('settingsDialog').close();onSettingsChange?.();status('Website list saved. Search again to use the new list.');}
    catch(error){$('settingsError').textContent=error.message;}
  });
  $('debugBtn').addEventListener('click',()=>{refreshDebug();$('debugDialog').showModal();});
  $('closeDebug').addEventListener('click',()=>$('debugDialog').close());
  $('copyDebug').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(report(),null,2));}catch{record('clipboard','Copy unavailable; use Download JSON');}});
  $('downloadDebug').addEventListener('click',()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));const a=node('a');a.href=u;a.download='horniboy-debug.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
  window.addEventListener('error',e=>record('browser-error',{name:e.error?.name||'Error',line:e.lineno||null}));
  window.addEventListener('unhandledrejection',e=>record('browser-rejection',{name:e.reason?.name||'Error'}));
  window.addEventListener('offline',()=>record('network','Offline'));
  window.addEventListener('online',()=>record('network','Online'));
  renderHistory();renderControls();status('Ready. Enter one search term to check your selected sites.');
  record('ready',edition);
  if(new URLSearchParams(location.search).get('debug')==='1'){$('debugDialog').showModal();refreshDebug();}
  return {status,record,report,search,sites:()=>state.sites,clear:()=>{searchSequence++;},query:()=>$('searchInput').value.trim()};
}
export function panel(site) {
  const root=node('section','','panel'), head=node('header','','panel-head'), body=node('div','','panel-body'), badge=node('span','Waiting','tag');
  head.append(node('h2',site.name),badge);root.append(head,body);
  return {root,head,body,badge,setStatus(text,kind=''){badge.textContent=text;badge.className='tag '+kind;}};
}
