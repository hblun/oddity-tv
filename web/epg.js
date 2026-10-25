// British-time helpers and a compact, time-proportional television guide.
export const UK_ZONE = 'Europe/London';
const clockFormat = (seconds = false) => new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_ZONE, hour:'2-digit', minute:'2-digit', ...(seconds ? {second:'2-digit'} : {})
});
const dayFormat = new Intl.DateTimeFormat('en-GB', {timeZone:UK_ZONE,weekday:'short',day:'numeric',month:'short'});

export function timeText(timestamp, precise = false) {
  return clockFormat(precise).format(timestamp * 1000);
}

export function durationText(seconds) {
  const total = Math.max(1, Math.round(seconds));
  if (total < 60) return `${total} sec`;
  const minutes = Math.floor(total / 60), hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes} min${total % 60 ? ` ${total % 60}s` : ''}`;
  return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
}

export function dayKey(timestamp) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_ZONE, year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(timestamp * 1000).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDay(key, offset) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function ukMidnight(key) {
  const wall = Date.parse(`${key}T00:00:00Z`);
  let utc = wall;
  // Convert the British wall-clock midnight, including BST/GMT, into UTC.
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone:UK_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }).formatToParts(utc).map(p => [p.type,p.value]));
    const represented = Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
    utc += wall - represented;
  }
  return utc / 1000;
}

export function periodWindow(period, now) {
  if (period === 'now') return {start:now,end:now+86400};
  const key = shiftDay(dayKey(now), period === 'tomorrow' ? 1 : 0);
  return {start:ukMidnight(key),end:ukMidnight(shiftDay(key,1))};
}

export function eventState(event, now, nextId) {
  if (event.start <= now && now < event.end) return 'On air';
  if (event.end <= now) return 'Earlier';
  return event.id === nextId ? 'Up next' : 'Later';
}

// A full-length programme uses the familiar two-hour / half-hour guide. The
// short demo gets a two-minute / 30-second scale so its clips remain selectable.
export function guideScale(events) {
  const longest=Math.max(0,...events.filter(e=>e.kind==='programme').map(e=>e.end-e.start));
  return longest>=600 ? {span:7200,tick:1800} : longest>=60 ? {span:1200,tick:300} : {span:120,tick:30};
}

export function gridBox(event,start,end) {
  const left=Math.max(start,event.start),right=Math.min(end,event.end);
  if (right<=left || end<=start) return null;
  return {left:(left-start)/(end-start)*100,width:(right-left)/(end-start)*100,
    before:event.start<start,after:event.end>end};
}

export function windowAt(timestamp,scale,day) {
  const start=Math.max(day.start,Math.min(day.end-1,Math.floor(timestamp/scale.tick)*scale.tick));
  return {start,end:Math.min(start+scale.span,day.end)};
}

export function createProgrammeGuide({now,watchLive,showGuide=async()=>{}}) {
  const $=id=>document.getElementById(id);
  const viewport=$('guide-viewport'),list=$('guide');
  let period='today',range=null,scale=null,rows=new Map(),selected=null,followLive=true;
  let request=null,generation=0,loading=false,fallbackTime=null,fallbackMono=0,nextId=null,channel='Oddity Television';
  const time=()=>now() ?? (fallbackTime===null ? null : fallbackTime+(performance.now()-fallbackMono)/1000);
  const bounds=()=>periodWindow(period,time());
  const status=message=>{if ($('guide-status').textContent!==message) $('guide-status').textContent=message;};
  function zonedTime(stamp,precise=false) {
    return new Intl.DateTimeFormat('en-GB',{timeZone:UK_ZONE,hour:'2-digit',minute:'2-digit',...(precise ? {second:'2-digit'} : {}),timeZoneName:'short'}).format(stamp*1000);
  }
  function select(event,manual=false) {
    selected=event;
    if (manual) followLive=false;
    $('detail-title').textContent=event.title;
    const description=event.description || '';
    $('detail-description').textContent=description;$('detail-description').hidden=!description;
    $('detail-description').classList.remove('expanded');
    $('description-more').hidden=description.length<=120;
    $('description-more').textContent='More';$('description-more').setAttribute('aria-expanded','false');
    const episode=[event.series,event.season!=null && event.episode!=null ? `S${String(event.season).padStart(2,'0')} · E${String(event.episode).padStart(2,'0')}` : '',event.year].filter(Boolean).join(' · ');
    $('detail-episode').textContent=episode;$('detail-episode').hidden=!episode;
    $('block-banner').hidden=!event.programming;
    $('detail-programming-title').textContent=event.programming?.title || '';
    $('detail-programming-description').textContent=event.programming?.description || '';
    $('detail-tags').replaceChildren();
    for (const tag of [...new Set([...(event.tags || []),...(event.genres || [])])].slice(0,5)) {
      const badge=document.createElement('span');badge.textContent=tag;$('detail-tags').append(badge);
    }
    const state=eventState(event,time(),nextId);
    $('detail-kind').textContent=`${state}${event.captions?.length ? ' · CC' : ''}`;
    $('detail-time').textContent=`${timeText(event.start,event.end-event.start<60)}–${timeText(event.end,event.end-event.start<60)} · ${durationText(event.end-event.start)}`;
    $('detail-block').textContent=` · ${event.block}${event.source_in>0 ? ' · Resumes' : ''}`;
    for (const item of rows.values()) {
      const active=item.event.id===event.id;
      item.row.classList.toggle('is-selected',active);
      item.button.setAttribute('aria-pressed',String(active));
      item.shortcut?.setAttribute('aria-pressed',String(active));
    }
  }
  function shortTitle(event) {
    return {advert:'Ad',ident:'Ident',trailer:'Trailer',interstitial:'Clip','public-information':'PIF'}[event.kind] || event.title;
  }
  function makeCell(event) {
    const box=gridBox(event,range.start,range.end);
    if (!box) return null;
    const row=document.createElement('li'),button=document.createElement('button');
    row.className='guide-row';row.dataset.eventId=event.id;
    row.style.left=`${box.left}%`;row.style.width=`${box.width}%`;
    button.className='programme-button';button.type='button';button.title=`${event.title} · ${timeText(event.start,true)}–${timeText(event.end,true)}`;
    const title=document.createElement('span');title.className='programme-title';
    title.textContent=box.width<10 ? shortTitle(event) : event.title;
    const stamp=document.createElement('span');stamp.className='programme-time';stamp.textContent=timeText(event.start,scale.tick<60);
    const state=document.createElement('span');state.className='programme-state';
    if (box.width<8) row.classList.add('short-cell');
    if (box.before) {const arrow=document.createElement('span');arrow.className='continues before';arrow.textContent='‹';arrow.setAttribute('aria-hidden','true');button.append(arrow);}
    if (box.after) {const arrow=document.createElement('span');arrow.className='continues after';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');button.append(arrow);}
    button.append(stamp,title,state);row.append(button);
    button.addEventListener('focus',()=>select(event,true));button.addEventListener('click',()=>select(event,true));
    button.addEventListener('keydown',e=>{
      if (!['ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const items=[...rows.values()],index=items.findIndex(item=>item.event.id===event.id);
      const target=items[index+(e.key==='ArrowLeft' ? -1 : 1)];
      if (target) {target.button.focus({preventScroll:true});target.row.scrollIntoView({block:'nearest',inline:'nearest'});}
    });
    return {row,button,state,event};
  }
  function navigation() {
    const day=bounds();
    $('guide-prev').disabled=!range || range.start<=day.start;
    $('guide-next').disabled=!range || range.end>=day.end;
    $('guide-date').textContent=dayFormat.format((range?.start ?? time())*1000);
    $('guide-window').textContent=range ? `${timeText(range.start,scale.tick<60)} – ${timeText(range.end,scale.tick<60)}` : 'Programme times';
    for (const button of document.querySelectorAll('[data-period]')) button.setAttribute('aria-pressed',String(button.dataset.period===period));
  }
  function drawRuler() {
    $('guide-times').replaceChildren();
    const count=Math.ceil((range.end-range.start)/scale.tick);
    for (let i=0;i<count;i++) {
      const label=document.createElement('span'),stamp=range.start+i*scale.tick;
      label.textContent=timeText(stamp,scale.tick<60);label.style.left=`${i*scale.tick/(range.end-range.start)*100}%`;
      $('guide-times').append(label);
    }
  }
  function updateLive(timestamp,upcomingId=null) {
    if (timestamp===null) return;
    nextId=upcomingId ?? nextId;
    for (const item of rows.values()) {
      const state=eventState(item.event,timestamp,nextId);
      if (item.state.textContent===state) continue;
      item.state.textContent=state;
      item.row.classList.toggle('is-live',state==='On air');item.row.classList.toggle('is-past',state==='Earlier');
      if (state==='On air') item.button.setAttribute('aria-current','true');else item.button.removeAttribute('aria-current');
      item.button.setAttribute('aria-label',`${item.event.title}, ${dayFormat.format(item.event.start*1000)}, ${zonedTime(item.event.start,true)}, ${durationText(item.event.end-item.event.start)}, ${state}. Select programme information.`);
    }
    if (range) {
      const inView=timestamp>=range.start && timestamp<range.end;
      $('guide-playhead').hidden=!inView;
      if (inView) $('guide-playhead').style.left=`${(timestamp-range.start)/(range.end-range.start)*100}%`;
      if (followLive && timestamp>=range.end && !loading && !viewport.contains(document.activeElement)) {range=null;load();}
    }
    const active=[...rows.values()].find(item=>item.event.start<=timestamp && timestamp<item.event.end)?.event;
    if (followLive && active && selected?.id!==active.id) select(active);
    else if (selected) {
      const state=eventState(selected,timestamp,nextId);
      $('detail-kind').textContent=`${state}${selected.captions?.length ? ' · CC' : ''}`;
    }
  }
  async function load() {
    const token=++generation;request?.abort();const controller=new AbortController();request=controller;
    const timeout=setTimeout(()=>controller.abort(),10000);loading=true;viewport.setAttribute('aria-busy','true');status('Loading…');
    try {
      if (!scale || !range || time()===null) {
        const sampleParams=new URLSearchParams({limit:'60'});
        if (time()!==null) {
          const day=bounds();
          sampleParams.set('start',period==='today' && followLive ? time() : day.start);
          sampleParams.set('end',day.end);
        }
        const initial=await fetch(`/api/guide?${sampleParams}`,{cache:'no-store',signal:controller.signal});
        if (!initial.ok) throw new Error('Guide unavailable');
        const sample=await initial.json();if (token!==generation) return;
        fallbackTime=sample.server_time;fallbackMono=performance.now();channel=sample.channel;
        scale=guideScale(sample.events);
        const day=bounds();range=windowAt(period==='today' && followLive ? time() : day.start,scale,day);
      }
      const queryRange={...range},events=[];let cursor=null;
      do {
        const params=new URLSearchParams({start:queryRange.start,end:queryRange.end,limit:'100'});
        if (cursor!==null) params.set('after',cursor);
        const response=await fetch(`/api/guide?${params}`,{cache:'no-store',signal:controller.signal});
        if (!response.ok) throw new Error('Guide unavailable');
        const data=await response.json();if (token!==generation) return;
        events.push(...data.events);cursor=data.next_cursor;channel=data.channel;
        if (events.length>2000) throw new Error('Too many short transmissions');
      } while (cursor!==null);
      const previous=selected;
      rows=new Map();const fragment=document.createDocumentFragment();
      for (const event of events) {if (rows.has(event.id)) continue;const item=makeCell(event);if (item) {rows.set(event.id,item);fragment.append(item.row);}}
      list.replaceChildren(fragment);viewport.scrollLeft=0;
      $('guide-shortcuts').replaceChildren();
      for (const item of rows.values()) {
        if (!item.row.classList.contains('short-cell') || item.event.kind==='programme') continue;
        const shortcut=document.createElement('button');shortcut.type='button';
        shortcut.textContent=`${timeText(item.event.start,scale.tick<60)} · ${item.event.title}`;
        shortcut.title=shortcut.textContent;shortcut.setAttribute('aria-pressed','false');
        shortcut.addEventListener('click',()=>select(item.event,true));
        item.shortcut=shortcut;$('guide-shortcuts').append(shortcut);
      }
      $('guide-channel-name').textContent=channel;$('guide-channel').setAttribute('aria-label',`Watch ${channel} live`);
      $('guide-empty').hidden=rows.size>0;$('guide-canvas').hidden=rows.size===0;
      drawRuler();navigation();
      const chosen=followLive ? events.find(e=>e.start<=time() && time()<e.end) : events.find(e=>e.id===previous?.id);
      if (chosen || events[0]) select(chosen || events[0]);
      else {$('detail-title').textContent='No programme information';$('detail-kind').textContent=channel;$('detail-time').textContent='';$('detail-block').textContent='';$('detail-description').hidden=true;$('detail-episode').hidden=true;$('description-more').hidden=true;$('block-banner').hidden=true;$('detail-tags').replaceChildren();selected=null;}
      updateLive(time(),nextId);status(scale.span===120 ? '30-second intervals' : 'All times UK');
    } catch {
      if (token===generation) status('Guide unavailable. Refresh to retry.');
    } finally {clearTimeout(timeout);if (token===generation) {loading=false;viewport.setAttribute('aria-busy','false');}}
  }
  $('description-more').addEventListener('click',()=>{
    const expanded=$('detail-description').classList.toggle('expanded');
    $('description-more').setAttribute('aria-expanded',String(expanded));
    $('description-more').textContent=expanded ? 'Less' : 'More';
  });
  function goNow() {period='today';followLive=true;range=null;load();}
  for (const button of document.querySelectorAll('[data-period]')) button.addEventListener('click',()=>{period=button.dataset.period;followLive=period==='today';range=null;load();});
  function step(direction) {
    if (!range || time()===null) return;
    const day=bounds(),start=Math.max(day.start,range.start+direction*scale.span);
    if (start>=day.end) return;
    range={start,end:Math.min(start+scale.span,day.end)};followLive=false;load();
  }
  $('guide-prev').addEventListener('click',()=>step(-1));$('guide-next').addEventListener('click',()=>step(1));
  $('guide-now').addEventListener('click',goNow);$('guide-refresh').addEventListener('click',()=>load());
  viewport.addEventListener('scroll',()=>{if (viewport.scrollLeft>8) followLive=false;},{passive:true});
  $('detail-watch').addEventListener('click',watchLive);$('guide-channel').addEventListener('click',watchLive);
  document.addEventListener('keydown',async event=>{
    if (event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,textarea,select,button,summary,[contenteditable=true]')) return;
    if (event.key.toLowerCase()==='g') {event.preventDefault();await showGuide();viewport.focus();}
    if (event.key.toLowerCase()==='l') {event.preventDefault();watchLive();}
  });
  setInterval(()=>{if (!document.hidden && time()!==null) {$('clock').textContent=timeText(time());updateLive(time(),nextId);}},1000);
  setInterval(()=>{if (followLive && !loading && !document.hidden && !viewport.contains(document.activeElement)) {range=null;load();}},60000);
  load();
  return {updateLive,refresh:()=>load(),updateNow:(event,name)=>{if (name) channel=name;updateLive(time(),nextId);}};
}
