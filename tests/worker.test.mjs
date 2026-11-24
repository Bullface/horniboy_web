import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{runProvider,handleApi} from '../worker/index.js';
const input={template:'https://www.obi.de/search/{search_keyword}/',query:'drill'};
const html='<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'Fixture Drill',url:'/p/drill/',offers:{price:10,priceCurrency:'EUR',availability:'InStock'}})+'</script>';
const response=(body,status=200,type='text/html',headers={})=>new Response(body,{status,headers:{'content-type':type,...headers}});
function fixture(fn){const calls=[];return {calls,options:{cache:new Map(),fetcher:async(url,init)=>{calls.push({url,init});return url.endsWith('/robots.txt')?response('User-agent: *\nAllow: /',200,'text/plain'):fn(url,init);}}};}
test('end-to-end mocked public page, no credentials, manual redirect, real explicit data',async()=>{
  const f=fixture(()=>response(html));const r=await runProvider(input,{},f.options);
  assert.equal(r.status,'products');assert.equal(r.products[0].stock,'in_stock');assert.equal(r.httpStatus,200);assert.equal(f.calls.length,2);assert.equal(f.calls[1].init.redirect,'manual');assert.equal(f.calls[1].init.headers.cookie,undefined);assert.match(f.calls[1].init.headers['user-agent'],/^Horniboy/);
});
test('403, 429 and soft challenge are blocked, not out of stock',async()=>{
  for(const status of [403,429]){const f=fixture(()=>response('Forbidden',status));assert.equal((await runProvider(input,{},f.options)).status,'blocked');}
  const f=fixture(()=>response('<title>Client Challenge</title>'));assert.equal((await runProvider(input,{},f.options)).status,'blocked');
});
test('404 OBI recognized empty only, generic 404 upstream error',async()=>{
  const h="<script>window.__INITIAL_STATE__='"+JSON.stringify({pinia:{suche:{error:{name:'NullErgebnisSeiteError'}}}})+"';</script>";
  assert.equal((await runProvider(input,{},fixture(()=>response(h,404)).options)).status,'no_results');
  assert.equal((await runProvider(input,{},fixture(()=>response('missing',404)).options)).status,'upstream_error');
});
test('missing data, unrelated products, explicit unknown, and bounded response',async()=>{
  assert.equal((await runProvider(input,{},fixture(()=>response('<html>no structured data</html>')).options)).status,'unverified');
  assert.equal((await runProvider({...input,query:'hammer'}, {},fixture(()=>response(html)).options)).status,'no_verified_match');
  assert.equal((await runProvider(input,{},fixture(()=>response('a'.repeat(1000100))).options)).status,'response_truncated');
});
test('redirect cannot leave approved path and unknown URL is never fetched',async()=>{
  const f=fixture(()=>response(null,302,'text/html',{location:'https://127.0.0.1/private'}));assert.equal((await runProvider(input,{},f.options)).status,'redirect_not_approved');assert.equal(f.calls.length,2);
  const blocked=fixture(()=>{throw Error('unexpected');});assert.equal((await runProvider({query:'drill',template:'https://example.net/search?q={search_keyword}'},{},blocked.options)).status,'not_approved');assert.equal(blocked.calls.length,0);
});
test('same approved redirect and robots cache reuse',async()=>{
  const f=fixture(url=>url.endsWith('/drill/')?response(null,302,'text/html',{location:'/search/drill/?x=1'}):response(html));
  assert.equal((await runProvider(input,{},f.options)).status,'products');assert.equal(f.calls.length,3);
  await runProvider(input,{},f.options);assert.equal(f.calls.filter(c=>c.url.endsWith('/robots.txt')).length,1);
});
test('robots denial or unavailable policy stops before provider request',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return response('User-agent: *\nDisallow: /search/',200,'text/plain');};
  assert.equal((await runProvider(input,{}, {cache:new Map(),fetcher})).status,'robots_disallowed');assert.equal(calls,1);
  const denied=await runProvider(input,{}, {cache:new Map(),fetcher:async()=>response('Denied',403)});assert.equal(denied.status,'robots_unverified');assert.equal(denied.diagnostics.robotsStatus,403);
});
test('deadline resolves even when upstream fails to respond; transport failures distinct',async()=>{
  const f=fixture(()=>new Promise(()=>{}));assert.equal((await runProvider(input,{}, {...f.options,timeoutMs:25})).status,'timeout');
  const broken=fixture(()=>{throw Error('network');});assert.equal((await runProvider(input,{},broken.options)).status,'network_error');
});
const req=(body,headers={})=>new Request('https://horniboy.example/api/search',{method:'POST',headers:{'content-type':'application/json',...headers},body});
test('API request validation, config, no cross-origin access, body cap',async()=>{
  const opts=fixture(()=>response(html)).options;
  const good=await handleApi(req(JSON.stringify(input)),{},opts);assert.equal(good.status,200);assert.equal((await good.json()).status,'products');
  assert.equal((await handleApi(req('bad'),{},opts)).status,400);
  assert.equal((await handleApi(req(JSON.stringify(input),{origin:'https://evil.example'}),{},opts)).status,403);
  assert.equal((await handleApi(req('a'.repeat(9000)),{},opts)).status,413);
  assert.equal((await handleApi(req('{}',{'content-type':'text/plain'}),{},opts)).status,415);
  assert.equal((await handleApi(new Request('https://horniboy.example/api/search'),{},opts)).status,405);
  const c=await handleApi(new Request('https://horniboy.example/api/config'));assert.ok((await c.json()).approved['https://www.obi.de']);
});
test('static assets binding fallback',async()=>{const r=await worker.fetch(new Request('https://horniboy.example/'),{ASSETS:{fetch:async()=>new Response('ui')}});assert.equal(await r.text(),'ui');});
