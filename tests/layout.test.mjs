import test from 'node:test';
import assert from 'node:assert/strict';
import {planTiles,pagePlan,chooseDisplay} from '../public/layout.js';
const area={left:-1920,top:0,width:1920,height:1080};
test('tiles are non-overlapping and inside negative-coordinate monitor',()=>{const p=planTiles(area,5,3);assert.equal(p.tiles.length,5);for(const [i,a] of p.tiles.entries()){assert.ok(a.left>=area.left&&a.top>=area.top&&a.left+a.width<=area.left+area.width&&a.top+a.height<=area.top+area.height);for(const b of p.tiles.slice(i+1))assert.ok(a.left+a.width<=b.left||b.left+b.width<=a.left||a.top+a.height<=b.top||b.top+b.height<=a.top);}});
test('small monitor paginates and clamps invalid offsets',()=>{const sites=Array.from({length:9},(_,i)=>i);const p=pagePlan({width:800,height:600,left:0,top:0},sites,100,3);assert.equal(p.capacity,2);assert.deepEqual(p.sites,[8]);assert.equal(p.next,false);assert.equal(p.prev,true);assert.equal(pagePlan({width:800,height:600},sites,-100).offset,0);});
test('display selection uses controller monitor and work area',()=>{const d=[{isPrimary:true,bounds:{left:0,top:0,width:1000,height:1000},workArea:{left:0,top:0,width:1000,height:900}},{bounds:area,workArea:{...area,height:1040}}];assert.equal(chooseDisplay(d,{left:-1500,top:100,width:500,height:200}).height,1040);});
