import {$,node,button,link,panel,createUI,makeSearchURL} from './shared.js';
let ui, active=null, pollTimer=null, offset=0, capacity=1, columns=3, generation=0;
const hasExtension=Boolean(globalThis.chrome?.runtime?.id&&chrome.runtime.sendMessage);
function rpc(message){
  if(!hasExtension) return Promise.reject(Object.assign(new Error('Install the browser extension'),{code:'EXTENSION_REQUIRED'}));
  return chrome.runtime.sendMessage(message).then(r=>{if(!r?.ok)throw Object.assign(new Error('Extension operation failed'),{code:r?.code||'NO_RESPONSE'});return r.data;});
}
function screenArea(){return {left:screen.availLeft??0,top:screen.availTop??0,width:screen.availWidth,height:screen.availHeight};}
function setPanel(p,status){
  if(status==='loaded')p.setStatus('Page loaded · check stock','ok');
  else if(status==='closed')p.setStatus('Window closed','warn');
  else if(status==='loading')p.setStatus('Loading page…','');
  else if(status==='error')p.setStatus('Could not open window','bad');
  else p.setStatus('Window opened','ok');
}
function stopPoll(){clearTimeout(pollTimer);pollTimer=null;}
async function refreshStatuses(panels,token,deadline){
  if(token!==generation)return;
  try{
    const statuses=await rpc({type:'status'});
    if(token!==generation)return;
    const byTemplate=new Map(statuses.map(s=>[s.template,s.status]));
    for(const [template,p] of panels){
      if(p.failed)continue;
      const status=byTemplate.get(template)||'closed';
      if(status==='loading'&&Date.now()>=deadline)p.setStatus('Still loading · inspect window','warn');
      else setPanel(p,status);
      if(p.previous!==status){p.previous=status;ui.record('native-window',{site:p.site,status});}
    }
    if(Date.now()<deadline)pollTimer=setTimeout(()=>void refreshStatuses(panels,token,deadline),1000);
  }catch(e){if(token===generation){ui.record('status-error',e.code||'STATUS_FAILED');ui.status('Window status unavailable. Search again or open Debug.');}}
}
async function execute(params,start=0){
  const token=++generation;stopPoll();active=params;offset=start;
  if(!hasExtension){ui.status('Install this edition as an unpacked Chrome / Edge extension. A regular website cannot create tiled browser windows.');return;}
  ui.status('Opening native shop windows…');$('searchBtn').disabled=true;
  try{
    const data=await rpc({type:'launch',query:params.query,sites:params.sites,offset:start,columns,area:screenArea()});
    if(token!==generation||!params.current())return;
    offset=data.offset;capacity=data.capacity;prev.disabled=!data.prev;next.disabled=!data.next;
    $('views').replaceChildren();const panels=new Map();
    for(const item of data.items){
      const p=panel(item);p.site=item.name;p.failed=item.status==='error';panels.set(item.template,p);
      setPanel(p,item.status);p.head.append(link('Search URL',makeSearchURL(item.template,params.query)));
      const actions=node('div','','panel-actions');
      for(const [label,action] of [['Focus','focus'],['◀ Back','back'],['Forward ▶','forward'],['Reload','reload'],['Close','close']]){
        const b=button(label,async()=>{try{const r=await rpc({type:'command',template:item.template,action});if(!r.ok)throw Object.assign(new Error(),{code:r.code});if(action==='close')setPanel(p,'closed');if(action==='reload'){setPanel(p,'loading');stopPoll();void refreshStatuses(panels,token,Date.now()+15000);} }catch(e){p.setStatus(e.code||'Command failed','warn');ui.record('command-error',{site:item.name,action,code:e.code||'COMMAND_FAILED'});}});b.disabled=p.failed;actions.append(b);
      }
      p.body.append(actions);$('views').append(p.root);
    }
    ui.status('Showing '+(offset+1)+'–'+(offset+data.items.length)+' of '+data.total+' shops. Native pages are interactive; loaded does not verify inventory.');
    ui.record('tile',{total:data.total,visible:data.items.length,failed:data.items.filter(x=>x.status==='error').length,capacity});
    void refreshStatuses(panels,token,Date.now()+15000);
  }catch(e){if(token===generation){ui.status('Cannot open shop windows. Open Debug for details.');ui.record('launch-error',e.code||'LAUNCH_FAILED');}}
  finally{if(token===generation)$('searchBtn').disabled=false;}
}
const prev=button('◀ Previous sites',()=>{if(active)void execute(active,Math.max(0,offset-capacity));});
const next=button('Next sites ▶',()=>{if(active)void execute(active,offset+capacity);});
prev.disabled=next.disabled=true;
const label=node('label','Columns: '),select=node('select');
for(const n of [1,2,3,4]){const o=node('option',String(n));o.value=String(n);select.append(o);}select.value='3';label.append(select);
select.addEventListener('change',()=>{columns=Number(select.value);if(active)void execute(active,0);});
const close=button('Close shop windows',async()=>{++generation;stopPoll();try{await rpc({type:'command',action:'close-all'});$('views').replaceChildren();ui.status('Managed shop windows closed.');}catch(e){ui.record('close-error',e.code||'CLOSE_FAILED');}finally{$('searchBtn').disabled=false;prev.disabled=next.disabled=true;active=null;}});
$('toolbar').append(label,prev,next,close);
ui=createUI({edition:'BROWSER ADD-ON',note:'Native windows · No iframe restrictions',settingsNote:'Sites open in normal browser windows. Your existing browser cookies remain untouched.',onSearch:params=>execute(params,0)});
if(!hasExtension){ui.status('This is the add-on edition. Load the dist folder as an unpacked extension in Chrome or Edge.');$('searchBtn').disabled=true;}
window.addEventListener('pagehide',stopPoll);
