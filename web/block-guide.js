// A block is the guide's primary unit; works expand inside its complete running order.
import {timeText, durationText, periodWindow, gridBox, windowAt, UK_ZONE} from './epg.js';
import {artDirection} from './art-direction.js';
import {createIdentityMotion} from './identity-motion.js';

export function blockScale(blocks) {
  return {span:10800,tick:1800};
}
export function blockState(block,now) {
  if (!block.scheduled) return 'Programme block';
  return now<block.start ? 'Upcoming' : now>=block.end ? 'Earlier' : 'On air';
}
export function offsetText(seconds) {
  return `+${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}`;
}
const formatKind=kind=>({'public-information':'Public information',interstitial:'Short',ident:'Continuity',programme:'Film / TV',archive:'Archive',advert:'Advert',trailer:'Trailer'}[kind] || kind);

export function createBlockGuide({now,watchLive,showGuide=async()=>{}}) {
  const dayFormat=new Intl.DateTimeFormat('en-GB',{timeZone:UK_ZONE,weekday:'short',day:'numeric',month:'short'});
  const $=id=>document.getElementById(id), viewport=$('guide-viewport'), sheet=$('programme-guide');
  let period='today',range=null,scale=null,rows=new Map(),selected=null,followLive=true,manualWork=null;
  let channel='Oddity Television',fallback=null,fallbackMono=0;
  let listRequest=null,detailRequest=null,listVersion=0,detailVersion=0,loading=false,pendingId=null;
  let mode='block',collectionReturn=null,collectionScroll=0,activeCollection=null;
  let selectionVersion=0,renderedStart=null,requestError=false,zoom='3h',planRange=null;
  const chosenScale=()=>zoom==='day' ? {span:86400,tick:10800} : blockScale([]);
  const motion=createIdentityMotion(window.matchMedia('(prefers-reduced-motion: reduce)'));
  const time=()=>now() ?? (fallback===null ? null : fallback+(performance.now()-fallbackMono)/1000);
  const bounds=()=>periodWindow(period,time());
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!=null)n.textContent=text;return n;};
  function status(message) {
    requestError=message.startsWith('Guide unavailable');
    $('guide-status').textContent=message;
    $('collection-message').hidden=mode!=='collection' || !requestError;
    $('collection-retry').hidden=mode!=='collection' || !requestError;
    if(mode==='collection' && requestError)$('collection-message').textContent=message;
    if(message.startsWith('Guide unavailable')) $('guide-refresh').hidden=false;
    else if(message!=='Loading…') $('guide-refresh').hidden=true;
  }
  async function json(url,signal) {
    const response=await fetch(url,{cache:'no-store',signal:signal || AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Guide unavailable');
    return response.json();
  }
  function applyDirection() {
    if(!selected)return;
    const active=selected.works?.flatMap(w=>w.segments || []).find(s=>s.start<=time() && time()<s.end);
    const chosen=selected.works?.find(w=>w.id===manualWork);
    const direction=artDirection(chosen || active || {kind:'programme',presentation:selected.presentation});
    sheet.dataset.theme=direction.theme;
    const art=$('detail-art'),changed=art.getAttribute('src')!==direction.image;
    art.alt=direction.alt;$('art-title').textContent=direction.title;$('art-credit').textContent=direction.credit;$('art-credit').href=direction.source;
    if(changed)art.src=direction.image;
    return {art,changed};
  }
  function markSelection() {
    for(const item of rows.values()) {
      const active=mode==='block' && item.block.id===selected?.id;
      item.row.classList.toggle('is-selected',active);item.button.setAttribute('aria-pressed',String(active));
    }
  }
  function renderWork(work,preview,open,index,total) {
    const row=el('li','work-row'),details=el('details'),summary=el('summary');
    row.dataset.kind=work.kind;row.classList.toggle('is-feature',work.duration>=3600 && ['programme','archive'].includes(work.kind));
    row.style.setProperty('--duration-share',`${Math.min(100,work.duration/total*100)}%`);
    details.dataset.workId=work.id;details.open=open;
    const indexPanel=el('span','work-index'),number=el('span','work-number',String(index+1).padStart(2,'0'));
    const stamp=el('time','work-time',preview ? offsetText(work.offset) : timeText(work.start,work.duration<60));
    if(!preview)stamp.dateTime=new Date(work.start*1000).toISOString();indexPanel.append(number,stamp);
    const content=el('span','work-name'),title=el('strong','',work.title),labels=el('span','work-labels');
    labels.append(el('span','work-kind',formatKind(work.kind)),el('span','work-meta',[work.year,durationText(work.duration),work.segments.length>1 ? 'Includes interval' : ''].filter(Boolean).join(' · ')));
    content.append(labels,title);
    if(work.description)content.append(el('span','work-teaser',work.description));
    summary.append(indexPanel,content,el('span','work-state'));
    summary.addEventListener('click',()=>{followLive=false;manualWork=details.open ? null : work.id;applyDirection();});
    const body=el('div','work-detail');
    if(work.description)body.append(el('p','',work.description));
    const episode=[work.series,work.season!=null && work.episode!=null ? `S${work.season} · E${work.episode}` : ''].filter(Boolean).join(' · ');
    if(episode)body.append(el('p','work-meta',episode));
    body.append(el('p','work-runtime',`${formatKind(work.kind)} · ${durationText(work.duration)}`));
    if(work.segments.length>1) {
      const parts=el('ol','work-segments');
      for(const segment of work.segments)parts.append(el('li','',`${timeText(segment.start,true)} · ${segment.title}${segment.source_in>0 ? ' · continues' : ''} · ${durationText(segment.end-segment.start)}`));
      body.append(parts);
    }
    const measure=el('span','work-measure');measure.setAttribute('aria-hidden','true');
    details.append(summary,body);row.append(details,measure);return row;
  }
  async function selectWork(block,workId) {
    followLive=false;
    await choose(block,true);
    if(selected?.id!==block.id)return;
    const details=[...$('block-works').querySelectorAll('details')].find(n=>n.dataset.workId===workId);
    if(details){details.open=true;manualWork=workId;applyDirection();details.querySelector('summary').focus({preventScroll:true});details.scrollIntoView({block:'nearest'});}
  }
  function ruler(window,tick,relative) {
    $('guide-times').replaceChildren();
    for(let stamp=window.start;stamp<window.end;stamp+=tick){const label=el('span','',relative ? offsetText(stamp).slice(1) : timeText(stamp));label.style.left=`${(stamp-window.start)/(window.end-window.start)*100}%`;$('guide-times').append(label);}
  }
  function renderTimeline() {
    const preview=selected?.scheduled===false;
    const timeline=preview ? selected.preview_timeline || [] : [...rows.values()].map(item=>item.block);
    const horizon=Math.max(selected?.duration || 0,...timeline.map(b=>b.end));
    if(preview && !planRange){
      const active=timeline.find(b=>b.id===selected.id),start=zoom==='day' ? Math.floor((active?.start || 0)/86400)*86400 : Math.floor((active?.start || 0)/10800)*10800;
      planRange={start,end:start+chosenScale().span};
    }
    const window=preview ? planRange : range;
    if(!window)return;
    $('schedule-panel').hidden=false;
    document.querySelector('.guide-day-controls').hidden=preview;
    document.querySelector('.guide-window-controls').hidden=false;
    $('guide-three-hours').setAttribute('aria-pressed',String(zoom==='3h'));$('guide-full-day').setAttribute('aria-pressed',String(zoom==='day'));
    if(preview){$('guide-prev').disabled=window.start<=0;$('guide-next').disabled=window.end>=horizon;$('guide-window').textContent=`${offsetText(window.start).slice(1)} – ${offsetText(window.end).slice(1)}`;}
    $('preview-clock-label').hidden=!preview;
    $('preview-clock-label').textContent=preview ? `Programme time ${offsetText(window.start).slice(1)}–${offsetText(window.end).slice(1)}` : '';
    $('guide-canvas').classList.toggle('is-preview',preview);
    ruler(window,preview ? chosenScale().tick : scale.tick,preview);
    if(preview) {
      const fragment=document.createDocumentFragment();
      for(const block of timeline) {
        const box=gridBox(block,window.start,window.end);if(!box)continue;const row=el('li','guide-row'),button=el('button','programme-button');button.type='button';
        row.style.left=`${box.left}%`;row.style.width=`${box.width}%`;row.dataset.theme=artDirection({presentation:block.presentation}).theme;
        row.classList.toggle('is-selected',block.id===selected.id);button.setAttribute('aria-pressed',String(block.id===selected.id));
        button.setAttribute('aria-label',`${block.title}, block time ${offsetText(block.start).slice(1)}, ${durationText(block.end-block.start)}. Explore block.`);
        button.append(el('span','programme-time',offsetText(block.start).slice(1)));appendBlockLabel(button,block);
        button.addEventListener('click',()=>choose(block,true));row.append(button);fragment.append(row);
      }
      $('guide').replaceChildren(fragment);$('guide-playhead').hidden=true;
    } else $('guide').replaceChildren(...[...rows.values()].map(item=>item.row));
    const works=document.createDocumentFragment();
    for(const block of timeline)for(const work of block.works || []) {
      const box=gridBox(work,window.start,window.end);if(!box)continue;
      const row=el('li','work-timeline-cell'),button=el('button','');button.type='button';row.style.left=`${box.left}%`;row.style.width=`${box.width}%`;
      row.dataset.theme=artDirection(work).theme;
      button.textContent=work.title;button.title=`${work.title} · ${preview ? offsetText(work.start).slice(1) : timeText(work.start,true)}`;
      button.setAttribute('aria-label',`${work.title}, ${preview ? 'programme time '+offsetText(work.start).slice(1) : timeText(work.start,true)}. Read work details.`);
      button.addEventListener('click',()=>selectWork(block,work.id));row.append(button);works.append(row);
    }
    $('work-layer').replaceChildren(works);
  }
  function renderBlock(block) {
    const same=selected?.id===block.id;
    const expanded=new Set(same ? [...$('block-works').querySelectorAll('details[open]')].map(n=>n.dataset.workId) : []);
    const focusedWork=same && $('block-works').contains(document.activeElement) ? document.activeElement.closest('[data-work-id]')?.dataset.workId : null;
    const changed=!same;
    selected=block;mode='block';activeCollection=null;
    if(changed){manualWork=null;if(!block.scheduled){planRange=null;viewport.scrollLeft=0;}}
    $('collection-panel').hidden=true;$('block-panel').hidden=false;$('schedule-panel').hidden=false;
    $('back-to-schedule').hidden=block.scheduled;
    $('detail-title').textContent=block.title;$('detail-premise').textContent=block.premise || '';$('detail-premise').hidden=!block.premise;
    $('detail-description').textContent=block.description || '';$('detail-description').hidden=!block.description;
    if(changed) {$('detail-description').classList.remove('expanded');$('description-more').textContent='More';$('description-more').setAttribute('aria-expanded','false');}
    $('description-more').hidden=(block.description || '').length<=150;
    const duration=block.scheduled ? block.end-block.start : block.duration;
    $('detail-time').textContent=block.scheduled ? `${dayFormat.format(block.start*1000)} · ${timeText(block.start,true)}–${timeText(block.end,true)} · ${durationText(duration)}` : durationText(duration);
    const collection=block.collection;$('collection-link').hidden=!collection;
    $('collection-identity').hidden=!collection;$('block-number').hidden=!collection;
    sheet.dataset.collectionTheme=collection?.theme || 'coral';
    $('collection-parts').replaceChildren();
    if(collection){
      $('collection-link').textContent=collection.title+' ↗';$('block-number').textContent=`Block ${collection.part}`;
      for(let i=1;i<=collection.total;i++){const marker=el('button','',String(i).padStart(2,'0'));marker.type='button';marker.addEventListener('click',()=>{const target=block.preview_timeline?.[i-1];if(target)choose(target,true);else openCollection(collection.id);});marker.classList.toggle('current',i===collection.part);marker.setAttribute('aria-label',`Block ${i}${i===collection.part ? ', selected' : ''}`);$('collection-parts').append(marker);}
    }
    $('running-duration').textContent=durationText(duration);
    $('work-count').textContent=`${block.works.length} ${block.works.length===1 ? 'work' : 'works'}`;
    $('block-works').replaceChildren(...block.works.map((w,i)=>renderWork(w,!block.scheduled,expanded.has(w.id),i,duration)));
    if(focusedWork) [...$('block-works').querySelectorAll('details')].find(n=>n.dataset.workId===focusedWork)?.querySelector('summary').focus({preventScroll:true});
    const art=applyDirection();markSelection();renderTimeline();updateLive(time());
    if(changed && !sheet.hidden) {
      const version=++selectionVersion;motion.stop('art');motion.stop('summary');
      Promise.resolve(art.art.decode?.()).catch(()=>{}).then(()=>{
        if(version!==selectionVersion || sheet.hidden || mode!=='block')return;
        motion.play('wipe',art.art,'art');motion.play('wipe',document.querySelector('.programme-summary'),'summary');
      });
    }
  }
  async function choose(block,manual=false,force=false) {
    if(!block)return;
    if(manual)followLive=false;
    if(!force && (pendingId===block.id || (!pendingId && mode==='block' && selected?.id===block.id)))return;
    const fromCollection=mode==='collection';
    const token=++detailVersion;detailRequest?.abort();const controller=new AbortController();detailRequest=controller;pendingId=block.id;
    $('block-panel').setAttribute('aria-busy','true');
    try {
      const path=block.scheduled===false ? `/api/block-plans/${encodeURIComponent(block.profile_id)}` : `/api/blocks/${encodeURIComponent(block.id)}`;
      const data=await json(path,AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]));
      if(token!==detailVersion)return;
      renderBlock(data.block);status('All times UK');
      if(fromCollection){sheet.scrollTop=0;$('detail-title').focus({preventScroll:true});}
    } catch(error) {if(token===detailVersion && error.name!=='AbortError')status('Guide unavailable. Retry to load block contents.');}
    finally {if(token===detailVersion){pendingId=null;$('block-panel').setAttribute('aria-busy','false');}}
  }
  function revealLive() {
    if(!followLive || !range || sheet.hidden || mode!=='block' || !selected?.scheduled)return;
    const stamp=time();if(stamp===null || stamp<range.start || stamp>=range.end)return;
    const x=(stamp-range.start)/(range.end-range.start)*$('guide-canvas').offsetWidth, margin=Math.min(60,viewport.clientWidth/4);
    if(x<viewport.scrollLeft+margin || x>viewport.scrollLeft+viewport.clientWidth-margin)viewport.scrollLeft=Math.max(0,x-margin);
  }
  new ResizeObserver(revealLive).observe(viewport);
  function updateLive(stamp) {
    if(stamp===null)return;
    $('clock').textContent=timeText(stamp,true);
    for(const item of rows.values()) {
      const live=item.block.start<=stamp && stamp<item.block.end;
      item.row.classList.toggle('is-live',live);item.row.classList.toggle('is-past',stamp>=item.block.end);
      if(live)item.button.setAttribute('aria-current','true');else item.button.removeAttribute('aria-current');
      item.button.setAttribute('aria-label',`${item.block.title}, ${dayFormat.format(item.block.start*1000)}, ${timeText(item.block.start,true)}, ${durationText(item.block.end-item.block.start)}, ${blockState(item.block,stamp)}. Explore programming block.`);
    }
    if(selected?.scheduled===false && mode==='block')$('guide-playhead').hidden=true;
    else if(range) {
      const visible=stamp>=range.start && stamp<range.end;$('guide-playhead').hidden=!visible;
      if(visible){$('guide-playhead').style.left=`${(stamp-range.start)/(range.end-range.start)*100}%`;revealLive();}
      if(followLive && stamp>=range.end && !loading){range=null;load();}
    }
    if(mode!=='block' || !selected)return;
    $('detail-kind').textContent=blockState(selected,stamp);
    const live=selected.scheduled && selected.start<=stamp && stamp<selected.end;
    $('detail-watch').hidden=!live;
    for(const [index,row] of [...$('block-works').children].entries()) {
      const work=selected.works[index], on=selected.scheduled && work.start<=stamp && stamp<work.end;
      row.classList.toggle('is-on-air',on);row.querySelector('.work-state').textContent=on ? 'On air' : selected.scheduled && stamp>=work.end ? 'Earlier' : '';
      const summary=row.querySelector('summary');if(on)summary.setAttribute('aria-current','true');else summary.removeAttribute('aria-current');
    }
    if(!manualWork)applyDirection();
    if(followLive && selected.scheduled) {
      const active=[...rows.values()].find(item=>item.block.start<=stamp && stamp<item.block.end)?.block;
      if(active && active.id!==selected.id)choose(active);
    }
  }
  function appendBlockLabel(button,block) {
    const collection=block.collection;
    if(collection){button.dataset.collectionTheme=collection.theme || 'coral';button.append(el('span','cell-collection',collection.title),el('span','cell-block-number',`Block ${collection.part}`));}
    button.append(el('span','programme-title',block.kind==='continuity' ? 'Continuity' : block.title));
  }
  function makeCell(block) {
    const box=gridBox(block,range.start,range.end);if(!box)return;
    const row=el('li','guide-row'),button=el('button','programme-button');button.type='button';button.title=`${block.title} · ${timeText(block.start,true)}–${timeText(block.end,true)}`;row.dataset.blockId=block.id;
    row.style.left=`${box.left}%`;row.style.width=`${box.width}%`;row.dataset.theme=artDirection({presentation:block.presentation}).theme;
    if(box.width<10)row.classList.add('short-cell');
    button.append(el('span','programme-time',timeText(block.start,scale.tick<3600)));appendBlockLabel(button,block);
    if(box.before)button.append(el('span','continues before','‹'));if(box.after)button.append(el('span','continues after','›'));
    button.addEventListener('focus',()=>choose(block,true));button.addEventListener('click',()=>choose(block,true));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
      const items=[...rows.values()],index=items.findIndex(item=>item.block.id===block.id),target=items[index+(event.key==='ArrowLeft' ? -1 : 1)];
      if(target){target.button.focus({preventScroll:true});target.row.scrollIntoView({block:'nearest',inline:'nearest'});}
    });
    row.append(button);return {row,button,block};
  }
  function navigation() {
    const day=bounds();$('guide-prev').disabled=!range || range.start<=day.start;$('guide-next').disabled=!range || range.end>=day.end;
    $('guide-date').textContent=dayFormat.format((range?.start ?? time())*1000);
    $('guide-window').textContent=range ? `${timeText(range.start)} – ${timeText(range.end)}` : 'Block times';
    for(const button of document.querySelectorAll('[data-period]'))button.setAttribute('aria-pressed',String(button.dataset.period===period));
    $('guide-times').replaceChildren();
    if(range)for(let stamp=range.start;stamp<range.end;stamp+=scale.tick){const label=el('span','',timeText(stamp));label.style.left=`${(stamp-range.start)/(range.end-range.start)*100}%`;$('guide-times').append(label);}
  }
  async function load(force=false) {
    const token=++listVersion;listRequest?.abort();const controller=new AbortController();listRequest=controller;loading=true;status('Loading…');viewport.setAttribute('aria-busy','true');
    try {
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]);
      if(!scale || !range || time()===null) {
        const params=new URLSearchParams({limit:'6'});
        if(time()!==null){const day=bounds();params.set('start',period==='today' && followLive ? time() : day.start);params.set('end',Math.min(day.end,(period==='today' && followLive ? time() : day.start)+21600));}
        const sample=await json(`/api/blocks?${params}`,signal);if(token!==listVersion)return;
        fallback=sample.server_time;fallbackMono=performance.now();channel=sample.channel;scale=chosenScale();
        const day=bounds();range=zoom==='day' ? day : windowAt(period==='today' && followLive ? time() : day.start,scale,day);
      }
      const blocks=[];let cursor=null;
      do {
        const params=new URLSearchParams({start:range.start,end:range.end,limit:'100'});if(cursor!==null)params.set('after',cursor);
        const data=await json(`/api/blocks?${params}`,signal);if(token!==listVersion)return;
        blocks.push(...data.blocks);cursor=data.next_cursor;
        if(blocks.length>2000)throw new Error('Too many blocks');
      } while(cursor!==null);
      const scroll=viewport.scrollLeft,focused=viewport.contains(document.activeElement) ? document.activeElement.closest('[data-block-id]')?.dataset.blockId : null;
      rows=new Map();const fragment=document.createDocumentFragment();
      for(const block of blocks){if(rows.has(block.id))continue;const item=makeCell(block);if(item){rows.set(block.id,item);fragment.append(item.row);}}
      if(selected?.scheduled!==false)$('guide').replaceChildren(fragment);$('guide').setAttribute('aria-label',`${channel} programming blocks`);
      viewport.scrollLeft=!followLive && renderedStart===range.start ? scroll : 0;renderedStart=range.start;
      $('guide-empty').hidden=rows.size>0;$('guide-canvas').hidden=!rows.size;navigation();
      if(mode==='collection') {if(force && activeCollection)await openCollection(activeCollection,false);}
      else if(selected?.scheduled===false) {if(force)await choose(selected,false,true);}
      else {
        const block=followLive ? blocks.find(b=>b.start<=time() && time()<b.end) : blocks.find(b=>b.id===selected?.id);
        if(block || !selected)await choose(block || blocks[0],false,force || selected?.id===(block || blocks[0])?.id);
        if(!blocks.length && !selected){$('detail-title').textContent='No blocks in this window';$('detail-description').textContent='Try Now or choose another day.';$('block-works').replaceChildren();$('work-count').textContent='';}
      }
      if(focused && rows.has(focused))rows.get(focused).button.focus({preventScroll:true});
      markSelection();renderTimeline();updateLive(time());if(!requestError)status('All times UK');
    } catch(error){if(token===listVersion && error.name!=='AbortError')status('Guide unavailable. Retry to load blocks.');}
    finally{if(token===listVersion){loading=false;viewport.setAttribute('aria-busy','false');}}
  }
  function collectionView(title,description) {
    mode='collection';$('block-panel').hidden=true;$('collection-panel').hidden=false;$('collection-title').textContent=title;$('collection-description').textContent=description || '';$('collection-blocks').replaceChildren();markSelection();
  }
  async function openCollection(key,remember=true) {
    const token=++detailVersion;detailRequest?.abort();pendingId=null;
    if(remember){collectionReturn=selected;collectionScroll=sheet.scrollTop;}
    try {
      const data=await json(`/api/collections/${encodeURIComponent(key)}`);if(token!==detailVersion)return;
      const collection=data.collection;activeCollection=key;collectionView(collection.title,collection.description);sheet.dataset.collectionTheme=collection.theme || 'coral';
      for(const [index,block] of collection.blocks.entries()) {
        const row=el('li'),button=el('button','collection-block');button.type='button';
        const body=el('span','');body.append(el('strong','',block.title),el('span','',block.premise || block.description));
        const stamp=block.airing ? `${dayFormat.format(block.airing.start*1000)} · ${timeText(block.airing.start)}–${timeText(block.airing.end)}` : '';
        body.append(el('span','collection-airing',[stamp,block.duration ? durationText(block.duration) : ''].filter(Boolean).join(' · ')));
        button.append(el('span','collection-number',`Block ${index+1}`),body);button.disabled=!block.airing && !block.preview;
        button.addEventListener('click',()=>{followLive=false;if(block.airing)choose(block.airing,true);else choose({id:`plan:${block.profile_id}`,profile_id:block.profile_id,scheduled:false},true);});
        row.append(button);$('collection-blocks').append(row);
      }
      sheet.scrollTop=0;$('collection-title').focus({preventScroll:true});status('All times UK');
    }catch{if(token===detailVersion)status('Guide unavailable. Retry to load collections.');}
  }
  async function openCollections() {
    followLive=false;
    const data=await json('/api/collections');
    if(data.collections.length===1)return openCollection(data.collections[0].id);
    collectionReturn=selected;collectionScroll=sheet.scrollTop;activeCollection=null;collectionView('Collections','Related programming blocks.');
    for(const collection of data.collections){const li=el('li'),button=el('button','collection-block',collection.title);button.addEventListener('click',()=>openCollection(collection.id,false));li.append(button);$('collection-blocks').append(li);}
  }
  async function restoreSchedule() {
    ++detailVersion;detailRequest?.abort();pendingId=null;mode='block';
    goNow();
  }
  function goNow(){mode='block';selected=null;manualWork=null;period='today';followLive=true;range=null;load();}
  $('collections-toggle').addEventListener('click',()=>openCollections().catch(()=>status('Guide unavailable. Retry to load collections.')));
  $('collection-link').addEventListener('click',()=>{if(selected?.collection)openCollection(selected.collection.id);});
  $('collection-back').addEventListener('click',async()=>{if(collectionReturn){await choose(collectionReturn,true,true);sheet.scrollTop=collectionScroll;($('collection-link').hidden ? $('collections-toggle') : $('collection-link')).focus({preventScroll:true});}else await restoreSchedule();});
  $('back-to-schedule').addEventListener('click',async()=>{await restoreSchedule();$('collections-toggle').focus({preventScroll:true});});
  $('collection-retry').addEventListener('click',()=>activeCollection ? openCollection(activeCollection,false) : openCollections().catch(()=>status('Guide unavailable. Retry to load collections.')));
  $('description-more').addEventListener('click',()=>{const expanded=$('detail-description').classList.toggle('expanded');$('description-more').textContent=expanded ? 'Less' : 'More';$('description-more').setAttribute('aria-expanded',String(expanded));});
  $('detail-watch').addEventListener('click',watchLive);
  for(const button of document.querySelectorAll('[data-period]'))button.addEventListener('click',()=>{mode='block';selected=null;period=button.dataset.period;followLive=period==='today';range=null;load();});
  function setZoom(value){zoom=value;scale=chosenScale();if(selected?.scheduled===false){planRange=null;renderTimeline();}else{range=null;load();}}
  $('guide-three-hours').addEventListener('click',()=>setZoom('3h'));$('guide-full-day').addEventListener('click',()=>setZoom('day'));
  function step(direction){if(selected?.scheduled===false){const total=Math.max(selected.duration,...(selected.preview_timeline || []).map(b=>b.end));const start=Math.max(0,planRange.start+direction*chosenScale().span);if(start<total){planRange={start,end:start+chosenScale().span};renderTimeline();}return;}if(!range || time()===null)return;const day=bounds(),start=Math.max(day.start,range.start+direction*scale.span);if(start>=day.end)return;mode='block';selected=null;range={start,end:Math.min(start+scale.span,day.end)};followLive=false;load();}
  $('guide-prev').addEventListener('click',()=>step(-1));$('guide-next').addEventListener('click',()=>step(1));$('guide-now').addEventListener('click',goNow);
  $('guide-refresh').addEventListener('click',()=>mode==='collection' ? openCollections() : load(true));
  viewport.addEventListener('pointerdown',()=>{followLive=false;},{passive:true});viewport.addEventListener('wheel',event=>{if(event.deltaX || event.shiftKey)followLive=false;},{passive:true});
  viewport.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))followLive=false;});
  document.addEventListener('keydown',async event=>{
    if(event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,textarea,select,button,summary,[contenteditable=true]'))return;
    if(event.key.toLowerCase()==='g'){event.preventDefault();await showGuide();viewport.focus();}
    if(event.key.toLowerCase()==='l'){event.preventDefault();watchLive();}
  });
  json('/api/collections').then(data=>{$('collections-toggle').hidden=!data.collections.length;}).catch(()=>{});
  setInterval(()=>{if(!document.hidden && time()!==null)updateLive(time());},1000);
  setInterval(()=>{if(followLive && !loading && !document.hidden && !viewport.contains(document.activeElement)){range=null;load();}},60000);
  load();
  return {revealLive,showLive:goNow,refresh:()=>{json('/api/collections').then(data=>{$('collections-toggle').hidden=!data.collections.length;}).catch(()=>{});return load(true);},
    updateLive:(stamp)=>updateLive(stamp),updateNow:(event,name)=>{if(name)channel=name;updateLive(time());}};
}
