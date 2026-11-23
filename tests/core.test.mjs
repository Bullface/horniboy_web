import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState, validTemplate, searchUrl, effectiveShops, detectTemplate,
  addHistory, normalizeState, parseImportText, addExtraPresets, MAX_HISTORY,
} from '../src/core.js';

const tpl = 'https://www.example.com/search?q={search_keyword}';

test('first-commit baseline: precisely five shops', () => {
  const state = defaultState();
  assert.equal(state.shops.length, 5);
  assert.deepEqual(new Set(state.shops.map(s => s.id)), new Set(['hornbach-de','bauhaus-de','sonderpreis-de','obi-at','obi-de']));
  assert.equal(state.groups.length, 2);
});
test('valid URL templates must use http(s) and exactly one placeholder', () => {
  assert.equal(validTemplate(tpl), true);
  assert.equal(validTemplate('http://example.com/s/{search_keyword}'), true);
  for (const value of ['javascript:alert(1)', 'data:text/html,{search_keyword}', 'https://example.com/search', 'https://example.com/s/{search_keyword}/{search_keyword}', 'https://foo:bar@example.com?q={search_keyword}', 'https://{search_keyword}.example.com/s']) {
    assert.equal(validTemplate(value), false, value);
  }
});
test('search URL encodes non-ASCII and special characters', () => {
  const url = searchUrl(tpl, '  höhle & 3D #7  ');
  assert.equal(new URL(url).searchParams.get('q'), 'höhle & 3D #7');
  assert.match(url, /h%C3%B6hle%20%26%203D%20%237/);
});
test('empty search is rejected', () => {
  assert.throws(() => searchUrl(tpl, '   '));
});
test('disabling every group returns no shops', () => {
  const s = defaultState();
  s.groups.forEach(g => { g.enabled = false; });
  assert.equal(effectiveShops(s).length, 0);
});
test('ungrouped active shop works even if no group is active', () => {
  const s = defaultState();
  s.groups.forEach(g => { g.enabled = false; });
  s.shops.push({ id:'custom', name:'Custom', template:tpl, groupId: null, enabled: true });
  assert.deepEqual(effectiveShops(s).map(v => v.id), ['custom']);
});
test('auto detects search parameter in e-commerce URL', () => {
  const result = detectTemplate('https://shop.example/suche?q=akkuschrauber&page=2');
  assert.equal(result?.template, 'https://shop.example/suche?q={search_keyword}&page=2');
});
test('auto detects search in URL path', () => {
  const result = detectTemplate('https://example.com/s/bohrmaschine?filter=1');
  assert.equal(result?.template, 'https://example.com/s/{search_keyword}?filter=1');
});
test('auto detect refuses arbitrary non-search URLs and scripts', () => {
  assert.equal(detectTemplate('https://example.com/blog/welcome'), null);
  assert.equal(detectTemplate('javascript:alert(1)'), null);
});
test('history deduplicates and uses most recent first', () => {
  assert.deepEqual(addHistory(['Drill','hammer'], 'drill'), ['drill','hammer']);
  let history = [];
  for (let i = 0; i < 30; i++) history = addHistory(history, `search ${i}`);
  assert.equal(history.length, MAX_HISTORY);
  assert.equal(history[0], 'search 29');
});
test('legacy Electron config.json import maps labels and active groups', () => {
  const imported = parseImportText(JSON.stringify({
    groups: [{ id:'my-group', name:'Test', active:false }],
    urls: [{ id:'my-shop', label:'Sample', template:tpl, groupId:'my-group', enabled:true }]
  }));
  assert.equal(imported.groups[0].enabled, false);
  assert.equal(imported.shops[0].name, 'Sample');
  assert.equal(effectiveShops(imported).length, 0);
});
test('legacy urls.txt plain-text import', () => {
  const imported = parseImportText('https://a.example/s/{search_keyword}\nhttps://b.example/?q={search_keyword}\ninvalid text');
  assert.equal(imported.shops.length, 2);
  assert.equal(imported.groups.length, 0);
});
test('legacy urls.txt JSON lines import', () => {
  const imported = parseImportText('{"id":"shop-1","label":"Example","template":"https://example.com/?q={search_keyword}","enabled":true}');
  assert.equal(imported.shops.length, 1);
  assert.equal(imported.shops[0].name, 'Example');
});
test('import filters unsafe or incomplete shops', () => {
  const state = normalizeState({ groups: [], shops: [
    { name:'Good', template:tpl },
    { name:'Bad', template:'javascript:alert(1)' },
    { name:'Missing template' }
  ]});
  assert.equal(state.shops.length, 1);
});
test('opt-in additional presets are idempotent', () => {
  const first = addExtraPresets(defaultState());
  assert.ok(first.added > 15);
  const again = addExtraPresets(first.state);
  assert.equal(again.added, 0);
  assert.equal(again.state.shops.length, first.state.shops.length);
});
test('wrong or blank import raises errors', () => {
  assert.throws(() => parseImportText(''));
  assert.throws(() => parseImportText('not-a-url'));
  assert.throws(() => parseImportText('[]'));
});