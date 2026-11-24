import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Actual local Worker serves the HTML, CSS and config; only shop response fixtures are intercepted.
  await page.goto('http://127.0.0.1:8787/');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready'));
  const config=await page.request.get('http://127.0.0.1:8787/api/config');assert.equal(config.status(),200);assert.ok((await config.json()).approved['https://www.obi.de']);
  const invalid=await page.request.post('http://127.0.0.1:8787/api/search',{data:{template:'https://unapproved.example/search?q={search_keyword}',query:'drill'}});assert.equal((await invalid.json()).status,'not_approved');
  await page.route('**/api/search',async route=>{
    const data=route.request().postDataJSON(),host=new URL(data.template.replace('{search_keyword}','x')).hostname;
    const fast=host==='www.hornbach.de';if(!fast)await new Promise(r=>setTimeout(r,900));
    await route.fulfill({contentType:'application/json',body:JSON.stringify(fast?{status:'products',httpStatus:200,ms:80,products:[{title:'Fixture drill',url:'https://www.hornbach.de/p/fixture/',price:129,currency:'EUR',stock:'in_stock',scope:'online',stores:[]}]}:{status:'blocked',httpStatus:403,ms:900,products:[]})});
  });
  await page.locator('#searchInput').fill('fixture drill');await page.locator('#searchBtn').click();
  await page.getByText('Fixture drill',{exact:true}).waitFor();
  assert.ok((await page.locator('#status').textContent()).includes('1/5'));
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('5/5 checked'));
  assert.equal(await page.getByText('Access blocked',{exact:true}).count(),4);
  assert.equal(await page.getByText('Listed in stock · online delivery',{exact:true}).count(),1);
  await page.locator('#debugBtn').click();assert.match(await page.locator('#debugOutput').textContent(),/"status": "blocked"/);await page.locator('#closeDebug').click();
  await page.locator('#settingsBtn').click();await page.locator('#siteList').fill('Example | https://example.org/search?q={search_keyword}');await page.getByRole('button',{name:'Save sites'}).click();assert.equal(await page.locator('#controls input').count(),1);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'worker-smoke.png',fullPage:true});
  console.log('Browser smoke passed: real Worker routing, progressive search, partial failures, dynamic settings and debug report.');
}finally{await browser.close();}
