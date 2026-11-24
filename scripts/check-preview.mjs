import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const config = JSON.parse(await readFile('wrangler.jsonc','utf8'));
assert.equal(config.name,'horniboy-worker');
assert.equal(config.preview_urls,true);
assert.deepEqual(config.previews,{});
assert.equal(config.assets.directory,'./dist');
assert.ok((await stat('dist/index.html')).isFile());
if(config.main){
  assert.ok((await stat(config.main)).isFile());
  assert.equal(config.assets.binding,'ASSETS');
  assert.deepEqual(config.assets.run_worker_first,['/api/*']);
}else{
  assert.equal(config.assets.binding,undefined);
}
console.log('Branch deployment configuration and build assets verified.');
