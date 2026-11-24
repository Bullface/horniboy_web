import test from 'node:test';
import assert from 'node:assert/strict';
import {extractProducts,matches,looksBlocked,safeLink,stock} from '../worker/extract.js';
const base='https://www.hornbach.de/s/drill';
const schema=(products)=>'<html><script type="application/ld+json">'+JSON.stringify({'@type':'ItemList',itemListElement:products.map(item=>({'@type':'ListItem',item}))})+'</script></html>';
const product=(extra={})=>({'@type':'Product',name:'Bosch GSR 18V-55 Drill',sku:'123',url:'/p/drill/123/',...extra});
test('JSON-LD ItemList extracts price, exact status and product URL',()=>{
  const result=extractProducts(schema([product({offers:{price:'129.99',priceCurrency:'EUR',availability:'https://schema.org/InStock',availableDeliveryMethod:'https://schema.org/ParcelService'}})]),base,'Bosch 18v-55');
  assert.equal(result.products.length,1);const p=result.products[0];assert.equal(p.price,129.99);assert.equal(p.currency,'EUR');assert.equal(p.stock,'in_stock');assert.equal(p.scope,'online');assert.equal(p.url,'https://www.hornbach.de/p/drill/123/');assert.equal(p.source,'json-ld');
});
test('no availability is inferred from presence or price; aggregate prices labelled from',()=>{
  const p=extractProducts(schema([product({offers:{lowPrice:79,priceCurrency:'EUR'}})]),base,'drill').products[0];assert.equal(p.stock,'unknown');assert.equal(p.priceKind,'from');assert.equal(p.scope,'unspecified');assert.deepEqual(p.stores,[]);
});
test('contradictory offers do not invent an online status or price',()=>{
  const p=extractProducts(schema([product({offers:[{price:20,priceCurrency:'EUR',availability:'InStock'},{price:21,priceCurrency:'EUR',availability:'OutOfStock'}]})]),base,'drill').products[0];assert.equal(p.stock,'unknown');assert.equal(p.price,null);
});
test('named pickup store is separate; pickup does not become online stock',()=>{
  const p=extractProducts(schema([product({offers:[{price:20,priceCurrency:'EUR',availability:'InStock',availableDeliveryMethod:'OnSitePickup',availableAtOrFrom:{name:'Test market'}},{availability:'OutOfStock',availableDeliveryMethod:'OnSitePickup'}]})]),base,'drill').products[0];assert.equal(p.stock,'unknown');assert.deepEqual(p.stores,[{name:'Test market',stock:'in_stock'}]);
});
test('OBI initial state maps online orderability, does not fabricate physical stock',()=>{
  const data={pinia:{suche:{suchergebnis:{ergebnisListe:[{artikelNummer:123,artikelName:'Bosch Drill',detailseitenUrl:'/p/123',jsonLdPreis:'99,50',preise:{preisPrimary:{waehrungsIsoCode:'EUR'}},anzeigeOnlineBestellbarkeit:'BESTELLBAR',bilder:[{urlSchema:'https://bilder.obi.de/uuid/[PROFIL]/image.jpeg'}]}]}}}};
  const html="<script>window.__INITIAL_STATE__='"+JSON.stringify(data)+"';</script>";
  const r=extractProducts(html,'https://www.obi.de/search/drill/','drill');assert.equal(r.products.length,1);const p=r.products[0];assert.equal(p.stock,'orderable');assert.equal(p.scope,'online');assert.equal(p.price,99.5);assert.equal(p.currency,'EUR');assert.equal(p.image,'https://bilder.obi.de/uuid/prZZK/image.jpeg');assert.deepEqual(p.stores,[]);
});
test('recognized OBI empty result differs from missing or malformed state',()=>{
  const h="<script>window.__INITIAL_STATE__='"+JSON.stringify({pinia:{suche:{error:{name:'NullErgebnisSeiteError'}}}})+"';</script>";
  assert.equal(extractProducts(h,'https://www.obi.at/search/x','x').confirmedEmpty,true);
  assert.equal(extractProducts('<html>nothing</html>','https://www.obi.at/search/x','x').confirmedEmpty,false);
  assert.equal(extractProducts("<script>window.__INITIAL_STATE__='bad';</script>",'https://www.obi.at/search/x','x').confirmedEmpty,false);
});
test('malformed JSON-LD does not break valid later script; deduplication and matching',()=>{
  const p=product();const r=extractProducts('<script type="application/ld+json">bad</script>'+schema([p,p,product({name:'Wrong hammer',sku:'456',url:'/p/hammer/'})]),base,'Bosch Drill');
  assert.equal(r.malformed,1);assert.equal(r.found,2);assert.equal(r.products.length,1);
});
test('generic JSON requires clear product identity, no arbitrary script execution',()=>{
  const r=extractProducts(JSON.stringify({products:[{name:'Drill',sku:'P1',url:'/p/p1/',price:10,currency:'EUR',availability:'InStock'},{name:'Drill ad',url:'/ad',price:3}]}),base,'Drill','application/json');
  assert.equal(r.products.length,1);assert.equal(r.products[0].source,'json');
});
test('untrusted links and stock strings are rejected safely',()=>{
  assert.equal(safeLink('javascript:alert(1)',base),null);assert.equal(safeLink('https://evil.example/p',base),null);assert.equal(safeLink('https://user:pass@www.hornbach.de/p',base),null);assert.equal(stock('available maybe'),'unknown');assert.equal(matches({title:'Bosch GSR 18V-55'},'Bosch 18V-55'),true);assert.equal(matches({title:'Bosch hammer'},'Bosch drill'),false);
  assert.equal(looksBlocked('<title>Just a moment...</title>'),true);assert.equal(looksBlocked('<title>Drills</title>'),false);
});
