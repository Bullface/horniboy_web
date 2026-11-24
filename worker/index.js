import {makeSearchURL} from '../public/shared.js';
import {approvedPrefixes,approvedURL,robotsAllows} from './policy.js';
import {extractProducts,looksBlocked} from './extract.js';
const MAX_BODY=8192,MAX_RESPONSE=1000000,MAX_ROBOTS=150000,TIMEOUT_MS=8500;
const UA='Horniboy/3.0 (+https://github.com/Bullface/horniboy_web)';
const robotCache=new Map();
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const failure=(code,extra={})=>({status:code,products:[],...extra});
async function readPrefix(response,limit){
  if(!response.body)return {text:'',truncated:false};
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let bytes=0,text='',truncated=false;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      const remaining=limit-bytes;
      if(value.byteLength>remaining){text+=decoder.decode(value.subarray(0,remaining),{stream:true});bytes+=remaining;truncated=true;break;}
      bytes+=value.byteLength;text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
    return {text,truncated};
  }finally{void reader.cancel().catch(()=>{});}
}
async function checkRobots(url,fetcher,signal,cache){
  const origin=new URL(url).origin,now=Date.now();
  let policy=cache.get(origin);
  if(!policy||policy.expires<now){
    let response;
    try{response=await fetcher(origin+'/robots.txt',{redirect:'manual',signal,headers:{'user-agent':UA,accept:'text/plain'}});}catch{if(signal.aborted)throw Error('TIMEOUT');return {error:'robots_unverified',diagnostics:{robotsReason:'network_error'}};}
    if(response.status===404||response.status===410)policy={text:'',expires:now+300000};
    else if(response.ok){
      const {text,truncated}=await readPrefix(response,MAX_ROBOTS);
      if(truncated||/<html[\s>]/i.test(text.slice(0,300)))return {error:'robots_unverified',diagnostics:{robotsStatus:response.status,robotsReason:truncated?'response_too_large':'unexpected_html'}};
      policy={text,expires:now+300000};
    }else{void response.body?.cancel().catch(()=>{});return {error:'robots_unverified',diagnostics:{robotsStatus:response.status,robotsReason:'http_error'}};}
    if(cache.size>=50)cache.delete(cache.keys().next().value);
    cache.set(origin,policy);
  }
  return robotsAllows(policy.text,url)?null:{error:'robots_disallowed',diagnostics:{robotsReason:'matching_disallow_rule'}};
}
async function retrieve(url,fetcher,signal,prefixes,cache){
  let current=url;
  for(let i=0;i<4;i++){
    if(!approvedURL(current,prefixes))return {error:'not_approved'};
    const robots=await checkRobots(current,fetcher,signal,cache);if(robots)return robots;
    const response=await fetcher(current,{redirect:'manual',signal,headers:{'user-agent':UA,'accept':'text/html,application/json;q=0.9','accept-language':'de-AT,de;q=0.9,en;q=0.5'}});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');void response.body?.cancel().catch(()=>{});
      if(!location)return {error:'bad_redirect',httpStatus:response.status};
      let dest;try{dest=new URL(location,current).href;}catch{return {error:'bad_redirect',httpStatus:response.status};}
      if(!approvedURL(dest,prefixes))return {error:'redirect_not_approved',httpStatus:response.status};
      current=dest;continue;
    }
    return {response,url:current};
  }
  return {error:'too_many_redirects'};
}
export async function runProvider(input,env={},options={}){
  const started=Date.now(),fetcher=options.fetcher||fetch,cache=options.cache||robotCache,prefixes=approvedPrefixes(env);
  let url;
  try{url=makeSearchURL(input?.template,input?.query);}catch{return failure('invalid_template',{ms:Date.now()-started});}
  if(!approvedURL(url,prefixes))return failure('not_approved',{ms:Date.now()-started});
  const controller=new AbortController();
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('TIMEOUT'));},options.timeoutMs??TIMEOUT_MS);});
  const job=async()=>{
    const fetched=await retrieve(url,fetcher,controller.signal,prefixes,cache);
    if(fetched.error)return failure(fetched.error,{httpStatus:fetched.httpStatus??null,diagnostics:fetched.diagnostics??null});
    const response=fetched.response,httpStatus=response.status,contentType=(response.headers.get('content-type')||'').toLowerCase();
    if([401,403,429,451].includes(httpStatus)){void response.body?.cancel().catch(()=>{});return failure('blocked',{httpStatus});}
    if(!response.ok&&httpStatus!==404){void response.body?.cancel().catch(()=>{});return failure('upstream_error',{httpStatus});}
    if(!contentType.includes('html')&&!contentType.includes('json')){void response.body?.cancel().catch(()=>{});return failure('unsupported_content',{httpStatus,diagnostics:{contentType:contentType.slice(0,80)}});}
    const {text,truncated}=await readPrefix(response,MAX_RESPONSE);
    const data=extractProducts(text,fetched.url,input.query,contentType);
    const diagnostics={httpStatus,truncated,structured:data.structured,malformed:data.malformed,found:data.found,matched:data.matched,sources:data.sources};
    if(looksBlocked(text)&&data.products.length===0)return failure('blocked',{httpStatus,diagnostics});
    if(!response.ok&&!data.confirmedEmpty)return failure('upstream_error',{httpStatus,diagnostics});
    if(data.products.length)return {status:'products',products:data.products,diagnostics,httpStatus};
    if(data.confirmedEmpty&&!truncated)return failure('no_results',{httpStatus,diagnostics});
    return failure(data.found?'no_verified_match':truncated?'response_truncated':'unverified',{httpStatus,diagnostics});
  };
  try{const result=await Promise.race([job(),deadline]);return {...result,ms:Date.now()-started};}
  catch(e){return failure(controller.signal.aborted||e?.message==='TIMEOUT'?'timeout':'network_error',{ms:Date.now()-started});}
  finally{clearTimeout(timer);}
}
export async function handleApi(request,env={},options={}){
  const url=new URL(request.url);
  if(url.pathname==='/api/config'&&request.method==='GET')return json({version:'3.0.0',approved:Object.fromEntries(approvedPrefixes(env)),maxProviders:24});
  if(url.pathname!=='/api/search')return json(failure('not_found'),404);
  if(request.method!=='POST')return json(failure('method_not_allowed'),405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return json(failure('origin_denied'),403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json(failure('invalid_content_type'),415);
  if(Number(request.headers.get('content-length'))>MAX_BODY)return json(failure('request_too_large'),413);
  let input;
  try{const {text,truncated}=await readPrefix(request,MAX_BODY);if(truncated)return json(failure('request_too_large'),413);input=JSON.parse(text);}catch{return json(failure('invalid_json'),400);}
  if(!input||typeof input.template!=='string'||typeof input.query!=='string')return json(failure('invalid_request'),400);
  return json(await runProvider(input,env,options));
}
export default {async fetch(request,env){
  if(new URL(request.url).pathname.startsWith('/api/'))return handleApi(request,env);
  return env.ASSETS?env.ASSETS.fetch(request):new Response('Static assets binding missing',{status:503});
}};
