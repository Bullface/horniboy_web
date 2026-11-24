// Real extension smoke, using local HTTPS fixture pages (not third-party sites).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'horniboy-chromium-'));
let ctx,server;
const hits=[];
try{
  const key=path.join(profile,'fixture.key'),cert=path.join(profile,'fixture.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=shop-one.example','-addext','subjectAltName=DNS:shop-one.example,DNS:shop-two.example','-keyout',key,'-out',cert],{stdio:'ignore'});
  server=createServer({key:await readFile(key),cert:await readFile(cert)},(req,res)=>{
    hits.push({host:req.headers.host,path:req.url});
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end('<!doctype html><title>Fixture store</title><h1>Fixture store</h1><button onclick="this.textContent=&quot;Clicked&quot;">Clickable</button>');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port,extension=path.resolve('dist');
  ctx=await chromium.launchPersistentContext(path.join(profile,'browser'),{
    channel:'chromium',headless:false,ignoreHTTPSErrors:true,
    args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--no-sandbox','--no-proxy-server','--ignore-certificate-errors','--host-resolver-rules=MAP shop-one.example 127.0.0.1:'+port+', MAP shop-two.example 127.0.0.1:'+port]
  });
  const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:20000});
  const id=new URL(sw.url()).host;
  const controller=await ctx.newPage();await controller.goto('chrome-extension://'+id+'/index.html');
  await controller.locator('#settingsBtn').click();
  await controller.locator('#siteList').fill('One | https://shop-one.example/search?q={search_keyword}\nTwo | https://shop-two.example/search?q={search_keyword}');
  await controller.getByRole('button',{name:'Save sites'}).click();
  await controller.locator('#searchInput').fill('fixture drill');await controller.locator('#searchBtn').click();
  await controller.waitForFunction(()=>document.querySelectorAll('#views .panel').length===2,{},{timeout:20000});
  await controller.waitForFunction(()=>document.querySelector('#status').textContent.includes('Showing 1–2'),{},{timeout:20000});
  const windows=await sw.evaluate(async()=>{const s=await chrome.storage.session.get('horniboyManagedV3');return s.horniboyManagedV3.windows;});
  assert.equal(windows.length,2);assert.notEqual(windows[0].windowId,windows[1].windowId);
  const deadline=Date.now()+20000;
  let shops=[];
  while(Date.now()<deadline){
    shops=ctx.pages().filter(p=>/^https:\/\/shop-(one|two)\.example\//.test(p.url()));
    if(shops.length===2)break;
    await new Promise(r=>setTimeout(r,250));
  }
  console.log('Browser pages:',ctx.pages().map(p=>p.url()));
  console.log('Fixture hits:',hits);
  assert.equal(shops.length,2,'Both actual shop tabs must exist in Chromium');
  assert.equal(new Set(hits.filter(x=>x.path.startsWith('/search')).map(x=>x.host)).size,2,'Both local HTTPS fixture servers received a search');
  for(const shop of shops){
    await shop.getByRole('heading',{name:'Fixture store'}).waitFor({timeout:10000});
    await shop.getByRole('button',{name:'Clickable'}).click();
    await shop.getByRole('button',{name:'Clicked'}).waitFor({timeout:5000});
  }
  await controller.getByRole('button',{name:'Close shop windows'}).click();
  await controller.waitForFunction(()=>document.querySelector('#status').textContent.includes('closed'),{},{timeout:10000});
  const remaining=await sw.evaluate(async()=>{const s=await chrome.storage.session.get('horniboyManagedV3');return s.horniboyManagedV3.windows.length;});
  assert.equal(remaining,0);
  console.log('Chromium extension smoke passed: two native windows, actual HTTPS navigation, independent clicks and owned-tab cleanup.');
}finally{await ctx?.close();if(server)await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true});}
