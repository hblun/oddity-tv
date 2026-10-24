// Guide auto-scroll adapted from Ringmast4r/Ringmast4r-TV (MIT, © 2026 ringmast4r).
// See THIRD_PARTY_NOTICES.md and vendor/ringmast4r/LICENSE.
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

// Adapted from startGuideAuto/stopGuideAuto and manual-wheel handling upstream.
// Native scrolling keeps focused rows visible; movement is opt-in and pauses on
// every manual interaction instead of taking over wheel/keyboard behaviour.
export function createGuideScroller(viewport, {onChange = () => {}, onEnd = () => {}} = {}) {
  let timer = null, guideManualUntil = 0, lastEnd = 0;
  const pause = () => { guideManualUntil = performance.now() + 8000; };
  const stop = () => { clearInterval(timer); timer = null; onChange(false); };
  const start = () => {
    stop();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    onChange(true);
    timer = setInterval(() => {
      if (document.hidden || performance.now() < guideManualUntil || viewport.contains(document.activeElement)
          || document.querySelector('dialog[open]')) return;
      const max = viewport.scrollHeight - viewport.clientHeight;
      if (max <= 4) return;
      if (viewport.scrollTop >= max - 1) {
        if (performance.now() - lastEnd > 3000) { lastEnd = performance.now(); onEnd(); }
        return;
      }
      viewport.scrollTop = Math.min(max, viewport.scrollTop + 0.6);
    }, 40);
  };
  for (const event of ['wheel','pointerdown','keydown','touchstart','focusin']) viewport.addEventListener(event, pause, {passive:true});
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', () => { if (motion.matches) stop(); });
  return {start,stop,toggle:() => timer ? stop() : start()};
}

export function createProgrammeGuide({now, watchLive}) {
  const $ = id => document.getElementById(id);
  const viewport = $('guide-viewport'), list = $('guide'), dialog = $('programme-dialog');
  let period = 'now', windowRange = null, cursor = null, rows = new Map(), request = null;
  let generation = 0, loading = false, selected = null, nextId = null, debounce = null;
  let fallbackTime = null, fallbackMono = 0;
  const time = () => now() ?? (fallbackTime === null ? null : fallbackTime + (performance.now()-fallbackMono)/1000);
  function status(message) { $('guide-status').textContent = message; }
  function showDetails(event) {
    selected = event;
    $('detail-title').textContent = event.title;
    $('detail-kind').textContent = `${event.kind.replaceAll('-',' ')} · CHANNEL 01`;
    $('detail-time').textContent = `${dayFormat.format(event.start*1000)} · ${timeText(event.start,true)}–${timeText(event.end,true)} · ${durationText(event.end-event.start)}`;
    $('detail-block').textContent = event.block;
    $('detail-note').textContent = event.source_in > 0
      ? `The programme resumes ${durationText(event.source_in)} into the source, following a scheduled interruption.`
      : 'Part of the shared broadcast schedule. Select “Watch the live channel” to join whatever is on air now.';
    if (!dialog.open) dialog.showModal();
  }
  function makeRow(event) {
    const row = document.createElement('li'), button = document.createElement('button');
    row.className = 'guide-row'; row.dataset.eventId = event.id;
    button.className = 'programme-button'; button.type = 'button';
    const stamp = document.createElement('time'); stamp.className = 'programme-time'; stamp.dateTime = new Date(event.start*1000).toISOString();
    stamp.append(document.createTextNode(timeText(event.start,event.end-event.start<60 || event.start%60!==0)));
    const day = document.createElement('small'); day.textContent = dayFormat.format(event.start*1000); stamp.append(day);
    const info = document.createElement('span'); info.className = 'programme-info';
    const title = document.createElement('span'); title.className = 'programme-title'; title.textContent = event.title;
    const meta = document.createElement('span'); meta.className = 'programme-meta';
    const kind = document.createElement('span'); kind.className = 'kind'; kind.dataset.kind = event.kind; kind.textContent = event.kind.replaceAll('-',' ');
    const block = document.createElement('span'); block.className = 'block-name'; block.textContent = event.block;
    meta.append(kind,block);
    if (event.source_in > 0) { const resumes = document.createElement('span'); resumes.textContent = 'Resumes'; meta.append(resumes); }
    info.append(title,meta);
    const duration = document.createElement('span'); duration.className = 'programme-duration'; duration.textContent = durationText(event.end-event.start);
    const state = document.createElement('span'); state.className = 'programme-state';
    button.append(stamp,info,duration,state); row.append(button);
    button.addEventListener('click', () => showDetails(event));
    return {row,button,state,event};
  }
  function updateLive(timestamp, upcomingId = null) {
    nextId = upcomingId;
    for (const item of rows.values()) {
      const state = eventState(item.event,timestamp,nextId);
      if (item.state.textContent === state) continue;
      item.state.textContent = state;
      item.row.classList.toggle('is-live',state==='On air');
      item.row.classList.toggle('is-past',state==='Earlier');
      if (state==='On air') item.button.setAttribute('aria-current','true'); else item.button.removeAttribute('aria-current');
      item.button.setAttribute('aria-label',`${item.event.title}, ${dayFormat.format(item.event.start*1000)}, ${timeText(item.event.start,true)}, ${durationText(item.event.end-item.event.start)}, ${state}. Show programme details.`);
    }
    if (selected && dialog.open) $('detail-watch').textContent = eventState(selected,timestamp,nextId)==='On air' ? 'Watch this transmission ↗' : 'Watch the live channel ↗';
  }
  async function load(more = false) {
    if (more && (loading || cursor===null)) return;
    const token = ++generation;
    request?.abort(); const controller = new AbortController(); request = controller;
    const abortTimer = setTimeout(() => controller.abort(),8000);
    loading = true; viewport.setAttribute('aria-busy','true'); $('guide-more').disabled = true;
    status(more ? 'Receiving more programmes…' : 'Receiving the programme guide…');
    if (!more) windowRange = time() === null ? null : periodWindow(period,time());
    const params = new URLSearchParams({limit:'60',q:$('guide-search').value.trim(),programmes_only:String($('programmes-only').checked)});
    if (windowRange) { params.set('start',windowRange.start); params.set('end',windowRange.end); }
    if (more) params.set('after',cursor);
    try {
      const response = await fetch(`/api/guide?${params}`,{cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('Guide unavailable');
      const data = await response.json();
      if (token!==generation) return;
      fallbackTime = data.server_time; fallbackMono = performance.now();
      if (!windowRange && period!=='now') return load();
      windowRange = {start:data.start,end:data.end}; cursor = data.next_cursor;
      if (!more) { list.replaceChildren(); rows = new Map(); viewport.scrollTop = 0; }
      const fragment = document.createDocumentFragment();
      for (const event of data.events) {
        if (rows.has(event.id)) continue;
        const item = makeRow(event); rows.set(event.id,item); fragment.append(item.row);
      }
      list.append(fragment);
      $('guide-channel-name').textContent = data.channel;
      $('guide-date').textContent = `${dayFormat.format(data.start*1000).toUpperCase()}${period==='now' ? ' · NEXT 24 HOURS' : ''}`;
      $('guide-empty').hidden = rows.size > 0;
      $('guide-more').hidden = cursor===null;
      const last = [...rows.values()].at(-1)?.event;
      status(rows.size ? `${rows.size} transmissions${last ? ` · through ${timeText(last.end,true)}` : ''}${cursor===null ? ' · End of this guide' : ''}` : 'No transmissions found for this selection.');
      updateLive(time(),nextId);
    } catch (error) {
      if (token!==generation) return;
      status(`Guide unavailable. ${rows.size ? 'Previous results remain. ' : ''}Use Refresh to try again; the live broadcast continues.`);
    } finally {
      clearTimeout(abortTimer);
      if (token===generation) { loading = false; viewport.setAttribute('aria-busy','false'); $('guide-more').disabled = false; }
    }
  }
  for (const button of document.querySelectorAll('[data-period]')) button.addEventListener('click', () => {
    period = button.dataset.period;
    for (const sibling of document.querySelectorAll('[data-period]')) sibling.setAttribute('aria-pressed',String(sibling===button));
    load();
  });
  $('guide-search').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => load(),250); });
  $('programmes-only').addEventListener('change', () => load());
  $('guide-refresh').addEventListener('click', () => load());
  $('guide-more').addEventListener('click', () => load(true));
  $('detail-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { const rect = dialog.getBoundingClientRect(); if (e.target===dialog && (e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom)) dialog.close(); });
  $('detail-watch').addEventListener('click', () => { dialog.close(); watchLive(); $('screen').scrollIntoView({block:'center'}); });
  const scroller = createGuideScroller(viewport,{onChange:enabled => $('guide-auto').setAttribute('aria-pressed',String(enabled)),onEnd:() => { if (cursor!==null) load(true); else scroller.stop(); }});
  $('guide-auto').addEventListener('click', () => scroller.toggle());
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const setMotion = () => { $('guide-auto').disabled = motion.matches; $('guide-auto').title = motion.matches ? 'Auto-scroll is off to respect your reduced motion preference' : 'Slowly scroll the programme guide; manual interaction pauses it'; };
  motion.addEventListener('change',setMotion); setMotion();
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable=true]') || dialog.open) return;
    if (event.key.toLowerCase()==='g') { event.preventDefault(); $('programme-guide').scrollIntoView(); $('guide-search').focus({preventScroll:true}); }
    if (event.key.toLowerCase()==='l') { event.preventDefault(); watchLive(); }
  });
  // Keep the default board near the live transmission without rebuilding rows
  // while someone is reading, scrolling, using the keyboard or viewing details.
  setInterval(() => {
    if (period==='now' && !loading && viewport.scrollTop<4 && !viewport.contains(document.activeElement)
        && !dialog.open && !document.hidden && $('guide-auto').getAttribute('aria-pressed')!=='true') load();
  },60000);
  load();
  return {updateLive, refresh:() => load()};
}
