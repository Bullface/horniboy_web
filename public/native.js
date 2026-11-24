import {makeSearchURL,parseSites,formatSites} from './shared.js';
import {pagePlan,chooseDisplay} from './layout.js';
const KEY='horniboyManagedV3';
const fallbackArea={left:0,top:0,width:1280,height:800};
const empty=()=>({windows:[],controller:null});
async function state(api){const data=await api.storage.session.get(KEY);return data[KEY]||empty();}
async function save(api,s){await api.storage.session.set({[KEY]:s});}
async function alive(api,item){
  try {const t=await api.tabs.get(item.tabId);return t.windowId===item.windowId?t:null;}catch{return null;}
}
async function closeOwned(api,item){
  if(await alive(api,item)){try{await api.tabs.remove(item.tabId);}catch{/* already closed */}}
}
async function areaFor(api,controllerId,fallback){
  let controller=null,displays=[];
  try{controller=await api.windows.get(controllerId);}catch{}
  try{displays=await api.system.display.getInfo();}catch{}
  return chooseDisplay(displays,controller,fallback||fallbackArea);
}
export async function openController(api){
  const s=await state(api);
  if(s.controller!=null){
    try{await api.windows.update(s.controller,{focused:true,state:'normal'});return s.controller;}catch{}
  }
  let current;try{current=await api.windows.getLastFocused();}catch{}
  const area=await areaFor(api,current?.id,fallbackArea);
  const win=await api.windows.create({url:api.runtime.getURL('index.html'),type:'popup',left:area.left,top:area.top,width:Math.min(1200,area.width),height:Math.min(245,area.height),focused:true});
  s.controller=win.id;await save(api,s);return win.id;
}
export async function launch(api,{query,sites,offset,columns,area,controllerId}){
  const safe=parseSites(formatSites(sites));
  // Validate the entire batch before changing any windows.
  const urls=new Map(safe.map(s=>[s.template,makeSearchURL(s.template,query)]));
  const work=await areaFor(api,controllerId,area);
  const plan=pagePlan(work,safe,offset,columns);
  const s=await state(api), wanted=new Set(plan.sites.map(x=>x.template));
  const old=s.windows.filter(x=>wanted.has(x.template));
  await Promise.all(s.windows.filter(x=>!wanted.has(x.template)).map(x=>closeOwned(api,x)));
  const result=await Promise.all(plan.sites.map(async(site,i)=>{
    const bounds=plan.tiles[i], url=urls.get(site.template);
    let owned=old.find(x=>x.template===site.template),t=owned?await alive(api,owned):null;
    try{
      if(t){
        try{await api.windows.update(owned.windowId,{state:'normal'});await api.windows.update(owned.windowId,bounds);}
        catch{/* the tab can still be navigated */}
        await api.tabs.update(owned.tabId,{url,active:true});
      }else{
        const w=await api.windows.create({url,type:'normal',focused:false,...bounds});
        const tabs=w.tabs?.length?w.tabs:await api.tabs.query({windowId:w.id});
        if(tabs[0]?.id==null)throw new Error('NO_TAB');
        owned={template:site.template,name:site.name,windowId:w.id,tabId:tabs[0].id};
      }
      return {...owned,name:site.name,status:'opened'};
    }catch{
      return {template:site.template,name:site.name,status:'error',code:'WINDOW_OPEN_FAILED',...(owned&&t?{tabId:owned.tabId,windowId:owned.windowId}:{})};
    }
  }));
  s.windows=result.filter(x=>Number.isInteger(x.tabId)&&Number.isInteger(x.windowId)).map(({template,name,windowId,tabId})=>({template,name,windowId,tabId}));
  await save(api,s);
  return {items:result,offset:plan.offset,total:plan.total,capacity:plan.capacity,prev:plan.prev,next:plan.next,reserve:plan.reserve};
}
export async function getStatus(api){
  const s=await state(api);
  return Promise.all(s.windows.map(async x=>{const t=await alive(api,x);return {template:x.template,status:t?(t.status==='complete'?'loaded':'loading'):'closed',tabId:x.tabId,windowId:x.windowId};}));
}
export async function command(api,{template,action}){
  const s=await state(api);
  if(action==='close-all'){await Promise.all(s.windows.map(x=>closeOwned(api,x)));s.windows=[];await save(api,s);return {ok:true};}
  const x=s.windows.find(x=>x.template===template);
  if(!x||!await alive(api,x))return {ok:false,code:'WINDOW_CLOSED'};
  try{
    if(action==='focus')await api.windows.update(x.windowId,{focused:true});
    else if(action==='reload')await api.tabs.reload(x.tabId);
    else if(action==='back')await api.tabs.goBack(x.tabId);
    else if(action==='forward')await api.tabs.goForward(x.tabId);
    else if(action==='close'){await closeOwned(api,x);s.windows=s.windows.filter(y=>y.tabId!==x.tabId);await save(api,s);}
    else return {ok:false,code:'UNKNOWN_COMMAND'};
    return {ok:true};
  }catch{return {ok:false,code:'COMMAND_FAILED'};}
}
