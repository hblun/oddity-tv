// Flow checks without a browser: actual HTML, DOM events and asynchronous guide requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createBlockGuide} from '../web/block-guide.js';

const copy=value=>structuredClone(value);
const work={id:'item-0',asset:'film',title:'A film',description:'A complete synopsis.',kind:'programme',start:1000,end:1180,duration:180,
  segments:[{title:'A film',kind:'programme',start:1000,end:1180,source_in:0,presentation:{theme:'cobalt'}}]};
const airing={id:'1000.000:evening',profile_id:'evening',title:'The evening block',description:'An authored introduction.',kind:'block',scheduled:true,start:1000,end:1180,works:[work],presentation:{theme:'coral'}};
const next={...copy(airing),id:'1180.000:evening',title:'The later block',start:1180,end:1360,works:[{...copy(work),start:1180,end:1360,segments:[{...work.segments[0],start:1180,end:1360}]}]};
const planned=index=>({id:`plan:part-${index}`,profile_id:`part-${index}`,title:`Draft block ${index}`,description:'An unscheduled block.',kind:'block',scheduled:false,duration:10800,
  presentation:{theme:'citrus'},collection:{id:'family',title:'A nine-hour programme',part:index,total:3},
  works:[{id:'item-0',title:`Planned film ${index}`,description:'Editorial copy.',kind:'programme',duration:10800,offset:0,segments:[]}],
  preview_timeline:[1,2,3].map(n=>({id:`plan:part-${n}`,profile_id:`part-${n}`,title:`Draft block ${n}`,scheduled:false,kind:'block',start:(n-1)*10800,end:n*10800,
    works:[{id:'item-0',title:`Planned film ${n}`,kind:'programme',start:(n-1)*10800,end:n*10800,duration:10800}]}))});
const collection={id:'family',title:'A nine-hour programme',description:'Three blocks.',blocks:[1,2,3].map(n=>({profile_id:`part-${n}`,title:`Draft block ${n}`,preview:true,duration:10800,status:'Unscheduled editorial preview',airing:null}))};

async function setup() {
  const dom=new JSDOM(readFileSync(new URL('../web/index.html',import.meta.url),'utf8'),{url:'http://station.test/',pretendToBeVisual:true});
  const saved={window:globalThis.window,document:globalThis.document,ResizeObserver:globalThis.ResizeObserver,fetch:globalThis.fetch,setInterval:globalThis.setInterval};
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  window.matchMedia=()=>({matches:false,addEventListener(){}});
  window.Element.prototype.scrollIntoView=()=>{};
  globalThis.ResizeObserver=class{observe(){}};
  globalThis.setInterval=()=>0;
  let now=1100,watchCalls=0,revision='one',fail=false,delayed=null;
  const $=id=>document.getElementById(id);
  const handlers=[];
  globalThis.fetch=async input=>{
    const url=new URL(input,'http://station.test');let data;
    if(fail && url.pathname==='/api/blocks')throw new Error('offline');
    if(url.pathname==='/api/blocks')data={blocks:[copy(airing),copy(next)],server_time:now,channel:'Oddity Television',scale:{span:360,tick:120},next_cursor:null,content_revision:revision};
    else if(url.pathname==='/api/collections')data={collections:[{id:'family',title:collection.title}]};
    else if(url.pathname==='/api/collections/family')data={collection:copy(collection)};
    else if(url.pathname.startsWith('/api/block-plans/'))data={block:planned(+url.pathname.at(-1)),content_revision:revision};
    else if(url.pathname.startsWith('/api/blocks/')){
      const id=decodeURIComponent(url.pathname.slice('/api/blocks/'.length));
      if(id===next.id && delayed){const wait=delayed;delayed=null;await wait;}
      data={block:copy(id===next.id ? next : airing),content_revision:revision};
    } else throw new Error('Unexpected request '+url.pathname);
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  };
  $('programme-guide').hidden=false;
  const guide=createBlockGuide({now:()=>now,watchLive:()=>watchCalls++});
  const until=async predicate=>{for(let i=0;i<100 && !predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(predicate(),'Expected interface state was not reached');};
  await until(()=>$('detail-title').textContent===airing.title && $('guide-viewport').getAttribute('aria-busy')==='false');
  return {$,guide,until,setNow:value=>now=value,setFail:value=>fail=value,setRevision:value=>revision=value,
    delayNext:promise=>delayed=promise,watchCalls:()=>watchCalls,
    dispose(){dom.window.close();for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}

test('two-layer guide explores a collection and preview without retuning or fabricating clock times',async()=>{
  const h=await setup();
  try {
    assert.equal(h.$('block-works').children.length,1);
    assert.equal(h.$('guide').children.length,2);
    assert.equal(h.$('work-layer').children.length,2);
    assert.equal(h.$('running-order-caption'),null);
    assert.equal(h.$('block-notes'),null);
    assert.equal(h.$('collection-notes'),null);
    h.$('collections-toggle').click();await h.until(()=>!h.$('collection-panel').hidden);
    assert.equal(h.$('collection-blocks').children.length,3);
    h.$('collection-blocks').children[1].querySelector('button').click();
    await h.until(()=>h.$('detail-title').textContent==='Draft block 2');
    assert.equal(h.$('detail-kind').textContent,'Programme block');
    assert.equal(h.$('detail-watch').hidden,true);
    assert.equal(h.$('guide-playhead').hidden,true);
    assert.equal(h.$('guide').children.length,1);
    assert.equal(h.$('work-layer').children.length,1);
    assert.match(h.$('preview-clock-label').textContent,/03:00–06:00/);
    assert.equal(h.$('guide-three-hours').getAttribute('aria-pressed'),'true');
    h.$('guide-full-day').click();
    assert.equal(h.$('guide').children.length,3);
    assert.equal(h.$('work-layer').children.length,3);
    assert.match(h.$('preview-clock-label').textContent,/00:00–24:00/);
    assert.equal(h.$('block-works').querySelector('time').textContent,'+00:00');
    assert.equal(h.$('block-number').textContent,'Block 2');
    assert.equal(h.$('collection-link').textContent,'A nine-hour programme ↗');
    assert.equal(h.$('collection-parts').children.length,3);
    // A work in the lower lane selects its parent block, then opens its details.
    h.$('work-layer').children[2].querySelector('button').click();
    await h.until(()=>h.$('detail-title').textContent==='Draft block 3' && h.$('block-works').querySelector('details').open);
    assert.equal(h.$('block-works').querySelector('strong').textContent,'Planned film 3');
    assert.equal(h.watchCalls(),0);
    h.$('guide-three-hours').click();
    assert.match(h.$('preview-clock-label').textContent,/06:00–09:00/);
    h.setNow(1200);
    h.$('back-to-schedule').click();await h.until(()=>h.$('detail-title').textContent===next.title);
    assert.equal(h.$('preview-clock-label').hidden,true);
    assert.equal(h.$('work-layer').children.length,2);
    assert.equal(h.watchCalls(),0);
  }finally{h.dispose();}
});

test('manual work inspection survives metadata refresh; failed requests keep the last usable guide',async()=>{
  const h=await setup();
  try {
    const summary=h.$('block-works').querySelector('summary');summary.click();summary.focus();
    h.setRevision('two');await h.guide.refresh();
    assert.equal(h.$('block-works').querySelector('details').open,true);
    assert.equal(document.activeElement,h.$('block-works').querySelector('summary'));
    h.setNow(1200);h.guide.updateLive(1200);
    assert.equal(h.$('detail-title').textContent,airing.title);
    h.setFail(true);await h.guide.refresh();
    assert.equal(h.$('guide-refresh').hidden,false);
    assert.equal(h.$('detail-title').textContent,airing.title);
    h.setFail(false);await h.guide.refresh();
    assert.equal(h.$('guide-refresh').hidden,true);
    assert.equal(h.watchCalls(),0);
  }finally{h.dispose();}
});

test('an older block response cannot replace a newer selection',async()=>{
  const h=await setup();
  try {
    let release;
    h.delayNext(new Promise(resolve=>{release=resolve;}));
    h.$('guide').children[1].querySelector('button').click();
    h.$('guide').children[0].querySelector('button').click();
    await h.until(()=>h.$('block-panel').getAttribute('aria-busy')==='false');
    release();await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(h.$('detail-title').textContent,airing.title);
  }finally{h.dispose();}
});
