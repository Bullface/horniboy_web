import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedPrefixes,approvedURL,robotsAllows} from '../worker/policy.js';
test('default allowlist approves search routes, rejects arbitrary destinations and paths',()=>{
  const p=approvedPrefixes();assert.equal(approvedURL('https://www.obi.at/search/hammer',p),true);
  for(const u of ['http://www.obi.at/search/hammer','https://www.obi.at.evil.test/search/hammer','https://www.obi.at/cart','https://www.obi.at/search/%2Fcart','https://127.0.0.1/search/hammer','https://www.obi.at:444/search/hammer','https://user@www.obi.at/search/hammer','https://www.obi.at/search/../cart'])assert.equal(approvedURL(u,p),false,u);
});
test('operator approval is exact HTTPS origin and path, invalid config fails closed',()=>{
  const p=approvedPrefixes({ALLOWED_SEARCH_PREFIXES:JSON.stringify({'https://shop.example':['/search','/api/public/'],'https://127.0.0.1':['/search'],'https://shop.example.evil':['/'],'http://notsecure.example':['/search']})});
  assert.equal(approvedURL('https://shop.example/api/public/products?q=x',p),true);assert.equal(approvedURL('https://shop.example/account',p),false);assert.equal(approvedURL('https://127.0.0.1/search',p),false);assert.equal(approvedURL('https://shop.example.evil/search',p),false);assert.equal(approvedURL('https://shop.example/search',approvedPrefixes({ALLOWED_SEARCH_PREFIXES:'broken'})),false);
});
test('robots wildcard, allow precedence, query patterns, specific agent',()=>{
  const text='User-agent: *\nDisallow: /private/\nDisallow: /search/*?*market=\nAllow: /private/public$\nUser-agent: Horniboy\nDisallow: /blocked/\nAllow: /blocked/open$\n';
  assert.equal(robotsAllows(text,'https://shop.example/private/x','OtherBot'),false);assert.equal(robotsAllows(text,'https://shop.example/private/public','OtherBot'),true);assert.equal(robotsAllows(text,'https://shop.example/private/public/x','OtherBot'),false);
  assert.equal(robotsAllows(text,'https://shop.example/search/x?market=1','OtherBot'),false);assert.equal(robotsAllows(text,'https://shop.example/blocked/x'),false);assert.equal(robotsAllows(text,'https://shop.example/blocked/open'),true);assert.equal(robotsAllows(text,'https://shop.example/search/x?market=1'),true);
});
