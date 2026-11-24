export const DEFAULT_PREFIXES=Object.freeze({
  'https://www.hornbach.de':['/s/'],
  'https://www.hornbach.at':['/s/'],
  'https://www.bauhaus.info':['/search','/suche/produkte'],
  'https://www.bauhaus.at':['/search','/suche/produkte'],
  'https://www.sonderpreis-baumarkt.de':['/search'],
  'https://www.obi.at':['/search/'],
  'https://www.obi.de':['/search/'],
});
export function approvedPrefixes(env={}){
  const out=new Map(Object.entries(DEFAULT_PREFIXES));
  if(!env.ALLOWED_SEARCH_PREFIXES)return out;
  try{
    const extra=JSON.parse(env.ALLOWED_SEARCH_PREFIXES);
    for(const [origin,prefixes] of Object.entries(extra).slice(0,40)){
      const url=new URL(origin);
      if(url.protocol!=='https:'||url.origin!==origin||url.port||url.username||url.password||!url.hostname.includes('.')||/^\d|^localhost$|\.local$|\.internal$|\.localhost$/i.test(url.hostname))continue;
      if(!Array.isArray(prefixes))continue;
      const safe=prefixes.filter(p=>typeof p==='string'&&p.startsWith('/')&&p.length>1&&p.length<200&&!/[?#\\\s]/.test(p)&&!p.includes('..'));
      if(safe.length)out.set(origin,[...(out.get(origin)||[]),...safe.slice(0,20)]);
    }
  }catch{/* malformed admin configuration grants no additional access */}
  return out;
}
export function approvedURL(url,prefixes){
  try{
    const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||/%2f|%5c/i.test(u.pathname))return false;
    const allowed=prefixes.get(u.origin);
    return !!allowed?.some(p=>p.endsWith('/')?u.pathname.startsWith(p):u.pathname===p||u.pathname.startsWith(p+'/'));
  }catch{return false;}
}
function canonical(s){return s.replace(/%[0-9a-f]{2}/gi,x=>{const c=String.fromCharCode(parseInt(x.slice(1),16));return /[A-Za-z0-9._~-]/.test(c)?c:x.toUpperCase();});}
function wildcardMatch(pattern,value){
  // Non-backtracking wildcard matcher; no untrusted regular expressions.
  const anchored=pattern.endsWith('$');if(anchored)pattern=pattern.slice(0,-1);
  let i=0,j=0,star=-1,mark=0;
  while(j<value.length){
    if(i===pattern.length&&!anchored)return true;
    if(pattern[i]==='*'){star=i++;mark=j;continue;}
    if(i<pattern.length&&pattern[i]===value[j]){i++;j++;continue;}
    if(star>=0){i=star+1;j=++mark;continue;}
    return false;
  }
  while(pattern[i]==='*')i++;
  return i===pattern.length;
}
export function robotsAllows(text,url,agent='horniboy'){
  const groups=[];let agents=[],rules=[],hasRule=false;
  function flush(){if(agents.length)groups.push({agents,rules});agents=[];rules=[];hasRule=false;}
  for(const raw of String(text).slice(0,150000).split(/\r?\n/)){
    const line=raw.split('#')[0].trim(),idx=line.indexOf(':');if(idx<0)continue;
    const key=line.slice(0,idx).trim().toLowerCase(),value=line.slice(idx+1).trim();
    if(key==='user-agent'){if(hasRule)flush();if(value)agents.push(value.toLowerCase());}
    else if((key==='allow'||key==='disallow')&&agents.length){hasRule=true;if(value&&value.length<=1024&&rules.length<2000)rules.push({allow:key==='allow',value:canonical(value)});}
  }
  flush();
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.toLowerCase().includes(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const u=new URL(url),target=canonical(u.pathname+u.search);
  let best=-1,allow=true;
  for(const g of selected)for(const r of g.rules){
    const length=r.value.replace(/[*$]/g,'').length;
    if(wildcardMatch(r.value,target)&&(length>best||length===best&&r.allow)){best=length;allow=r.allow;}
  }
  return allow;
}
