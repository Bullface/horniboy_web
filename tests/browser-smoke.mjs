// Optional real Chromium test: npm install --no-save --package-lock=false playwright
// xvfb-run -a node tests/browser-smoke.mjs
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'horniboy-chromium-'));
let ctx;
try{
  const extension=path.resolve('dist');
  ctx=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--no-sandbox']});
  const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:20000});
  const id=new URL(sw.url()).host;
  await ctx.route('https://shop-*.example/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Fixture store</title><h1>Fixture store</h1><button onclick="this.textContent=&quot;Clicked&quot;">Clickable</button>'}));
  const controller=await ctx.newPage();await controller.goto('chrome-extension://'+id+'/index.html');
  await controller.locator('#settingsBtn').click();
  await controller.locator('#siteList').fill('One | https://shop-one.example/search?q={search_keyword}\nTwo | https://shop-two.example/search?q={search_keyword}');
  await controller.getByRole('button',{name:'Save sites'}).click();
  await controller.locator('#searchInput').fill('fixture drill');await controller.locator('#searchBtn').click();
  await controller.waitForFunction(()=>document.querySelectorAll('#views .panel').length===2,{},{timeout:20000});
  await controller.waitForFunction(()=>document.querySelector('#status').textContent.includes('Showing 1–2'),{},{timeout:20000});
  const windows=await sw.evaluate(async()=>{const s=await chrome.storage.session.get('horniboyManagedV3');return s.horniboyManagedV3.windows;});
  assert.equal(windows.length,2);assert.notEqual(windows[0].windowId,windows[1].windowId);
  const deadline=Date.now()+15000;
  let shops=[];
  while(Date.now()<deadline){
    shops=ctx.pages().filter(p=>/^https:\/\/shop-(one|two)\.example\//.test(p.url()));
    if(shops.length===2)break;
    await new Promise(r=>setTimeout(r,250));
  }
  assert.equal(shops.length,2,'Both actual shop tabs must exist in Chromium');
  for(const shop of shops){
    await shop.getByRole('heading',{name:'Fixture store'}).waitFor({timeout:10000});
    await shop.getByRole('button',{name:'Clickable'}).click();
    await shop.getByRole('button',{name:'Clicked'}).waitFor({timeout:5000});
  }
  await controller.getByRole('button',{name:'Close shop windows'}).click();
  await controller.waitForFunction(()=>document.querySelector('#status').textContent.includes('closed'),{},{timeout:10000});
  console.log('Chromium extension smoke passed: two native windows and owned-tab cleanup.');
}finally{await ctx?.close();await rm(profile,{recursive:true,force:true});}
