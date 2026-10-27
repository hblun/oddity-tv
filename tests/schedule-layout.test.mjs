import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseSchedule,collectionOf,moveScheduledSlot} from '../web/schedule-layout.js';
const cycle=(blocks,period_seconds=10800)=>({mode:'cycle',period_seconds,blocks});
const durations={a:3600,b:1800,c:900};
test('cycle geometry identifies leading, internal and trailing gaps exactly',()=>{
 const p=analyseSchedule(cycle([{profile:'a',offset:1800},{profile:'b',offset:7200}]),id=>durations[id]);
 assert.deepEqual(p.lanes[0].gaps.map(g=>[g.start,g.end]),[[0,1800],[5400,7200],[9000,10800]]);
 assert.equal(p.gapSeconds,5400);assert.equal(p.overlapSeconds,0);
});
test('nested and adjacent overlaps count covered time once',()=>{
 const p=analyseSchedule(cycle([{profile:'a',offset:0},{profile:'b',offset:900},{profile:'c',offset:1800}]),id=>durations[id]);
 assert.equal(p.overlapSeconds,1800);assert.equal(p.gapSeconds,7200);assert.deepEqual(p.lanes[0].overlaps[0].slots,[0,1,2]);
});
test('weekly blocks cross midnight and wrap Sunday into Monday',()=>{
 const p=analyseSchedule({mode:'weekly',blocks:[{profile:'a',days:[6],at:'23:30:00'}]},()=>10800);
 assert.deepEqual(p.lanes[6].segments.map(s=>[s.start,s.end,s.continues]),[[84600,86400,false]]);
 assert.deepEqual(p.lanes[0].segments.map(s=>[s.start,s.end,s.continues]),[[0,9000,true]]);
 assert.equal(p.gapSeconds,604800-10800);
});
test('a tail from the previous day can overlap another block',()=>{
 const p=analyseSchedule({mode:'weekly',blocks:[{profile:'a',days:[0],at:'23:00:00'},{profile:'b',days:[1],at:'00:30:00'}]},id=>id==='a'?7200:3600);
 assert.equal(p.lanes[1].overlaps[0].end-p.lanes[1].overlaps[0].start,1800);
});
test('cycle overruns remain visible as planning issues',()=>{
 const p=analyseSchedule(cycle([{profile:'a',offset:9000}]),id=>durations[id]);
 assert.equal(p.issues.length,1);assert.equal(p.lanes[0].segments[0].end,10800);
});
test('moving a repeated weekly slot changes only the dragged occurrence',()=>{
 const s={mode:'weekly',blocks:[{profile:'a',days:[0,2],at:'19:00:00'}]};
 moveScheduledSlot(s,0,0,1,20*3600);
 assert.deepEqual(s.blocks,[{profile:'a',days:[2],at:'19:00:00'},{profile:'a',days:[1],at:'20:00:00'}]);
});
test('collection association is stable across block ordinals and colour editions',()=>{
 const c=collectionOf({family:{title:'Family',theme:'citrus',blocks:['a','b']}},'b');
 assert.deepEqual(c,{id:'family',title:'Family',theme:'citrus',part:2,total:2});assert.equal(collectionOf({},'a'),null);
});
