import test from 'node:test';
import assert from 'node:assert/strict';
import {runPool} from '../public/search-pool.js';
test('pool limits concurrency and emits fast results without waiting for slow shop',async()=>{
  let active=0,peak=0;const results=[];
  let release;const held=new Promise(resolve=>{release=resolve;});
  const run=runPool([0,1,2,3],2,async i=>{active++;peak=Math.max(active,peak);if(i===0)await held;else await new Promise(r=>setTimeout(r,5));results.push(i);active--;});
  await new Promise(r=>setTimeout(r,35));assert.deepEqual(results,[1,2,3]);release();await run;assert.equal(peak,2);assert.deepEqual(results,[1,2,3,0]);
});
