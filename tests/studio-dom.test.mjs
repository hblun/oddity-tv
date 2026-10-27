import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

test('Studio edits and reorders a draft, keeps schedule separate and publishes an explicitly saved revision',async()=>{
  const dom=new JSDOM(readFileSync(new URL('../web/studio.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:8001/'});
  const previous={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};globalThis.document=dom.window.document;globalThis.window=dom.window;
  const doc={programmes:{one:{title:'First film',kind:'programme',duration:60,asset_id:'one'},two:{title:'Second film',kind:'programme',duration:120,asset_id:'two'}},
    blocks:{evening:{title:'Evening block',items:[{programme_id:'one'},{programme_id:'two'}]}},collections:{family:{title:'Family collection',theme:'coral',blocks:['evening']}},defaults:{},
    schedule:{mode:'cycle',channel:'Oddity',origin:'2026-01-01T00:00:00Z',period_seconds:3600,timezone:'Europe/London',filler:['one'],blocks:[{profile:'evening',offset:0}]}};
  let current={document:doc,revision:1,history:[{id:1,saved_at:'2026-10-26T12:00:00Z'}],issues:[],ready:{one:true,two:true},assets:[{id:'one',title:'First film',duration:60},{id:'two',title:'Second film',duration:120}]};
  const calls=[];
  globalThis.fetch=async (url,options)=>{calls.push([url,options.method]);const body=options.body?JSON.parse(options.body):null;
    if(url==='/api/studio' && options.method==='PUT'){assert.equal(body.revision,current.revision);current={...current,document:structuredClone(body.document),revision:current.revision+1};}
    if(url==='/api/publish'){assert.equal(body.revision,current.revision);current={...current,published:{revision:current.revision,at:'2026-10-26T12:01:00Z'}};}
    return new Response(JSON.stringify(current),{headers:{'content-type':'application/json'}});
  };
  const $=id=>document.getElementById(id),until=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,5));assert.ok(predicate());};
  try {
    await import(`../web/studio.js?test=${Date.now()}`);await until(()=>$('save-state').textContent==='Draft 1 saved');
    assert.equal(document.querySelector('.record-group button').textContent,'Family collection');
    assert.match(document.querySelector('.collection-path').textContent,/Block 1 of 1/);
    assert.equal(document.querySelectorAll('.micro-programme').length,2);
    const down=document.querySelector('[aria-label="Move programme 1 down"]');down.click();
    assert.equal(document.querySelector('[aria-label="Programme 1"]').value,'two');
    assert.equal($('save-state').textContent,'Unsaved changes');
    assert.deepEqual(current.document.blocks.evening.items,[{programme_id:'one'},{programme_id:'two'}]);
    $('save').click();await until(()=>$('save-state').textContent==='Draft 2 saved');
    assert.equal(current.document.blocks.evening.items[0].programme_id,'two');
    assert.equal(calls.some(([url])=>url==='/api/publish'),false);
    document.querySelector('[data-tab="schedule"]').click();assert.equal(document.querySelector('.slot h3').textContent,'Evening block');
    const pattern=[...document.querySelectorAll('label')].find(n=>n.firstChild.textContent==='Pattern').querySelector('select');pattern.value='weekly';pattern.dispatchEvent(new window.Event('change',{bubbles:true}));
    assert.equal(document.querySelectorAll('.planner-row').length,7);
    const tuesday=[...document.querySelectorAll('.planner-gap')].find(n=>n.getAttribute('aria-label').startsWith('Tuesday:'));tuesday.click();
    assert.ok(document.querySelector('.gap-placement'));
    [...document.querySelectorAll('.gap-placement button')].find(n=>n.textContent==='Place block').click();
    assert.equal(document.querySelectorAll('.slot').length,2);
    $('reload').click();await until(()=>$('save-state').textContent==='Draft 2 saved' && document.querySelectorAll('.planner-row').length===1);
    document.querySelector('[data-tab="programmes"]').click();assert.match(document.querySelector('.status-tag').textContent,/ready/);
    document.querySelector('[data-tab="blocks"]').click();
    const title=[...document.querySelectorAll('label')].find(n=>n.firstChild.textContent==='Block title').querySelector('input');title.value='Revised evening';title.dispatchEvent(new window.Event('input',{bubbles:true}));
    $('publish').click();await until(()=>$('message').textContent.startsWith('Published.'));
    assert.equal(current.revision,3);assert.equal(current.published.revision,3);assert.equal(current.document.blocks.evening.title,'Revised evening');
    assert.deepEqual(calls.slice(-2),[['/api/studio','PUT'],['/api/publish','POST']]);
  } finally {dom.window.close();for(const [key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
