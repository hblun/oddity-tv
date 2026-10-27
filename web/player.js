// Shared-clock television, with local viewing controls and cached WebVTT tracks.
import {playScheduledFile} from './channel-two-playback.js';
import {createProgrammeGuide, timeText} from './epg.js';
import {strandTheme} from './art-direction.js';
import {createIdentityMotion} from './identity-motion.js';
import {ViewingSession, chooseCaption, mountCaptions, readPreferences, safePreferences, preloadCandidate, programmeProgress} from './tv-controls.js';
export class BroadcastClock {
  constructor() { this.anchor = null; this.mono = 0; }
  update(serverTime, requestStart, responseEnd) { this.anchor = serverTime + (responseEnd-requestStart)/2000; this.mono = responseEnd; }
  now(mono = performance.now()) { return this.anchor===null ? null : this.anchor+(mono-this.mono)/1000; }
}
export function eventAt(guide,time) {
  if (time===null || !guide) return null;
  return [guide.now,...guide.upcoming].find(e=>e && e.start<=time && time<e.end) || null;
}
export function position(event,time) {
  return event.source_in + Math.max(0,Math.min(event.end-event.start-.05,time-event.start));
}

if (typeof document!=='undefined') {
  const $ = id=>document.getElementById(id);
  let video = $('video'), buffer = $('preload-video');
  const clock = new BroadcastClock(), session = new ViewingSession();
  let prepared=null, acquireOnPlaying=false, continuityId=null;
  const motion=createIdentityMotion(window.matchMedia('(prefers-reduced-motion: reduce)'));
  let preferences = safePreferences(null);
  try { preferences = readPreferences(window.localStorage); } catch {}
  let epg = null, guide = null, current = null, loadedEvent = null, fetching = false, changingSource = false;
  let lastSuccess = 0, lastRetry = 0, statusUntil = 0, infoTimer = null, captionOptionsKey = '', selectedCaptionId = null, mounted = [], pausedAt = null;
  video.muted = preferences.muted; video.volume = preferences.volume;

  const icons = {
    sound:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
    fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
    exit:'<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>'
  };
  function icon(button,name) { button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`; }
  icon($('settings-toggle'),'settings');icon($('fullscreen'),'fullscreen');
  let controlsTimer=null, guideReturnFocus=null;
  function revealControls() {
    $('tv-set').classList.add('controls-visible');clearTimeout(controlsTimer);
    controlsTimer=setTimeout(()=>{
      if (!$('receiver-settings').hidden) return;
      $('tv-set').classList.remove('controls-visible');
    },3500);
  }
  function setSettings(open) {
    const restoreFocus=!open && !$('receiver-settings').hidden;
    $('receiver-settings').hidden=!open;
    $('settings-toggle').setAttribute('aria-expanded',String(open));
    revealControls();
    if (open) $('settings-close').focus();
    else if (restoreFocus) $('settings-toggle').focus();
  }
  async function setGuide(open, opener=$('guide-toggle')) {
    // Use the actual opener: pointer clicks need not focus buttons in Safari.
    const restoreFocus=!open && !$('programme-guide').hidden;
    if (open) {
      guideReturnFocus=opener;
      if (document.fullscreenElement) await document.exitFullscreen();
      setSettings(false);
    }
    $('programme-guide').hidden=!open;$('guide-backdrop').hidden=!open;
    $('guide-toggle').setAttribute('aria-expanded',String(open));
    if (open) { $('guide-close').focus(); epg?.revealLive(); }
    else {
      revealControls();
      if (restoreFocus) {
        const target=guideReturnFocus?.isConnected ? guideReturnFocus : $('guide-toggle');
        // Let pointer dismissal finish before returning keyboard focus.
        requestAnimationFrame(()=>{if ($('programme-guide').hidden) target.focus({preventScroll:true});});
      }
    }
  }
  $('guide-toggle').addEventListener('click',()=>setGuide($('programme-guide').hidden));
  $('viewing-block').addEventListener('click',async()=>{await setGuide(true,$('viewing-block'));epg?.showLive();});
  $('skip-guide').addEventListener('click',()=>setGuide(true,$('skip-guide')));
  $('guide-close').addEventListener('click',()=>setGuide(false));
  let dragStart=null;
  $('sheet-handle').addEventListener('pointerdown',event=>{
    dragStart={x:event.clientX,y:event.clientY,id:event.pointerId};
    $('sheet-handle').setPointerCapture(event.pointerId);
  });
  $('sheet-handle').addEventListener('pointermove',event=>{
    if (!dragStart || event.pointerId!==dragStart.id) return;
    $('programme-guide').classList.add('is-dragging');
    $('programme-guide').style.transform=`translateY(${Math.min(160,Math.max(0,event.clientY-dragStart.y))}px)`;
  });
  function resetSheet() {
    dragStart=null;$('programme-guide').classList.remove('is-dragging');$('programme-guide').style.transform='';
  }
  $('sheet-handle').addEventListener('pointerup',event=>{
    if (dragStart && event.pointerId===dragStart.id && event.clientY-dragStart.y>55 && Math.abs(event.clientX-dragStart.x)<90) setGuide(false);
    resetSheet();
  });
  $('sheet-handle').addEventListener('pointercancel',resetSheet);
  $('guide-backdrop').addEventListener('click',()=>setGuide(false));
  $('settings-toggle').addEventListener('click',()=>setSettings($('receiver-settings').hidden));
  $('settings-close').addEventListener('click',()=>setSettings(false));
  $('tv-set').addEventListener('pointermove',revealControls,{passive:true});
  $('screen').addEventListener('pointerdown',revealControls,{passive:true});
  $('tv-set').addEventListener('keydown',revealControls);
  document.addEventListener('keydown',event=>{
    if (event.key!=='Escape') return;
    if (!$('receiver-settings').hidden) {event.preventDefault();setSettings(false);}
    else if (!$('programme-guide').hidden) {event.preventDefault();setGuide(false);}
  });
  function savePreferences() { try { localStorage.setItem('oddity-player-v1',JSON.stringify(preferences)); } catch {} }
  function message(text,hold = 0) {
    if (hold) statusUntil = performance.now()+hold;
    if ($('status').textContent!==text) $('status').textContent = text;
    $('status').classList.toggle('visible',hold>0 || /interrupted|reconnecting|Waiting|unavailable|could not|Connecting|needs a click/i.test(text));
  }
  function normalMessage(text) { if (performance.now()>=statusUntil) message(text); }
  function receiverState() {
    $('transport-icon').textContent = session.running ? 'Ⅱ' : '▶';
    $('transport-label').textContent = session.running ? 'Pause' : 'Play live';
    $('transport').setAttribute('aria-label',session.running ? 'Pause on this screen; the channel continues' : 'Play at the current live broadcast position');
    $('paused-overlay').hidden = !session.paused;
    $('tv-set').classList.toggle('is-paused',session.paused);
    $('tv-set').classList.toggle('is-idle',!session.active);
    $('live').classList.toggle('is-paused',session.paused);
    $('programme-guide').dataset.viewing=session.running ? 'live' : 'idle';
  }
  function blocked(error) {
    if (session.paused || error?.name==='AbortError') return;
    $('standby').hidden = false; $('tune').textContent = '▶ Tune in';
    message('Tap to resume',5000);
  }
  function play() { if (session.running) video.play().catch(blocked); }
  function seekLive() {
    if (!loadedEvent || video.readyState<1 || clock.now()===null) return;
    const target = position(loadedEvent,clock.now());
    if (Number.isFinite(target)) video.currentTime = Math.min(target,Number.isFinite(video.duration) ? Math.max(0,video.duration-.05) : target);
  }
  function applyCaptions() {
    const selected = chooseCaption(mounted.map(t=>t.caption),preferences.language,selectedCaptionId);
    for (const item of mounted) item.element.track.mode = preferences.captions && item.caption.id===selected?.id ? 'showing' : 'disabled';
    captionControls();
  }
  function captionControls() {
    const tracks = loadedEvent?.captions || current?.captions || [];
    const selected = chooseCaption(tracks,preferences.language,selectedCaptionId);
    const key = JSON.stringify(tracks.map(t=>[t.id,t.label,t.language]));
    if (key!==captionOptionsKey) {
      const off = document.createElement('option'); off.value = 'off'; off.textContent = tracks.length ? 'Off' : 'Off — no subtitles supplied';
      $('subtitle-track').replaceChildren(off);
      for (const track of tracks) { const option = document.createElement('option'); option.value=track.id; option.textContent=track.label; $('subtitle-track').append(option); }
      captionOptionsKey = key;
    }
    $('subtitle-track').value = preferences.captions && selected ? selected.id : 'off';
    $('subtitle-status').textContent = tracks.length ? `${tracks.length} subtitle track${tracks.length===1 ? '' : 's'} supplied. Your choice carries over between programmes.` : 'No subtitles supplied for this transmission. Your preference is kept for the next programme.';
  }
  function toggleCaptions() {
    if (!(loadedEvent?.captions || current?.captions || []).length) { message('Subtitles unavailable',4000); return; }
    preferences.captions = !preferences.captions; applyCaptions(); savePreferences();
    message(`Subtitles ${preferences.captions ? 'on' : 'off'}.`,3000);
  }
  function showInfo(toggle = false) {
    clearTimeout(infoTimer);
    if (toggle && !$('screen-info').hidden) { $('screen-info').hidden=true; $('info').setAttribute('aria-pressed','false'); return; }
    const event = loadedEvent || current;
    $('screen-info').dataset.theme=strandTheme(event || {});
    $('screen-title').textContent = event?.title || 'The independent service';
    $('screen-detail').textContent = event ? `${timeText(event.start,true)}–${timeText(event.end,true)} · ${event.kind.replaceAll('-',' ')}${session.paused ? ' · Paused locally' : ''}` : 'Tune in to join the live service.';
    $('screen-info').hidden = false; $('info').setAttribute('aria-pressed','true');
    infoTimer = setTimeout(()=>{ $('screen-info').hidden=true; $('info').setAttribute('aria-pressed','false'); },5000);
  }
  function updateSound() {
    preferences.volume=video.volume; preferences.muted=video.muted;
    $('volume').value = String(Math.round(video.volume*100));
    $('volume').setAttribute('aria-valuetext',`${Math.round(video.volume*100)} percent${video.muted ? ', muted' : ''}`);
    icon($('sound'),video.muted || video.volume===0 ? 'muted' : 'sound');
    $('sound').setAttribute('aria-label',video.muted || video.volume===0 ? 'Turn sound on' : 'Mute sound');
    savePreferences();
  }
  function toggleSound() { const silent=video.muted || video.volume===0; if (silent && video.volume===0) video.volume=.7; video.muted=!silent; updateSound(); }
  function pictureSettings() {
    $('tv-set').dataset.picture=preferences.picture; $('tv-set').dataset.captionSize=preferences.captionSize;
    $('picture').value=preferences.picture; $('caption-size').value=preferences.captionSize;
  }
  async function fullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('tv-set').requestFullscreen && document.fullscreenEnabled) await $('tv-set').requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else message('Full screen is unavailable in this browser.',4000);
    } catch { message('Full screen is unavailable in this browser.',4000); }
  }
  async function pictureInPicture() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (video.readyState>=2) await video.requestPictureInPicture();
      else message('Tune in before opening picture-in-picture.',4000);
    } catch { message('Picture-in-picture is unavailable for this transmission.',4000); }
  }
  function render(event) {
    epg?.updateNow(event,guide?.channel);
    $('viewing-title').textContent=(session.paused ? loadedEvent : event)?.title || 'Oddity Television';
    if (!loadedEvent) captionControls();
  }
  function clearPrepared() {
    prepared=null;delete buffer.dataset.preparedId;buffer.onloadedmetadata=null;buffer.pause();buffer.removeAttribute('src');buffer.replaceChildren();buffer.load();
  }
  function prepareNext(event) {
    if (prepared?.id===event?.id) return;
    if (prepared) clearPrepared();
    if (!event) return;
    prepared=event;buffer.dataset.preparedId=event.id;buffer.muted=true;buffer.volume=0;
    playScheduledFile(buffer,event.url,()=>event.source_in,()=>{}, {shouldPlay:()=>false});
  }
  function loadTransmission(event) {
    changingSource=true;
    const ready=prepared?.id===event.id && buffer.readyState>=2 && !buffer.error
      && !document.pictureInPictureElement && !video.webkitDisplayingFullscreen
      && !(navigator.vendor?.includes('Apple') && !video.muted);
    if (ready) {
      video.pause();
      const previous=video;video=buffer;buffer=previous;
      buffer.id='preload-video';buffer.hidden=true;buffer.setAttribute('aria-hidden','true');
      video.id='video';video.hidden=false;video.removeAttribute('aria-hidden');
      video.setAttribute('aria-label','Live Oddity Television broadcast');
      video.muted=preferences.muted;video.volume=preferences.volume;
    }
    loadedEvent=event;video.dataset.broadcastId=event.id; $('viewing-title').textContent=event.title; session.loaded(event); selectedCaptionId=null;
    const attachCaptions=()=>{
      mounted=mountCaptions(video,event.captions || [],()=>message('Subtitles could not load',4000));
      for (const track of mounted) track.element.addEventListener('load',applyCaptions);
      applyCaptions();
    };
    if (ready) {
      video.replaceChildren();attachCaptions();seekLive();play();clearPrepared();
    } else {
      if (prepared) clearPrepared();
      playScheduledFile(video,event.url,()=>position(loadedEvent,session.paused && pausedAt!==null ? pausedAt : clock.now()),blocked,{
        shouldPlay:()=>session.running,onSource:attachCaptions,onReady:applyCaptions
      });
    }
    $('standby').hidden=true;
  }
  function tick() {
    const now=clock.now(); if (now===null) return;
    $('clock').textContent=timeText(now,true);
    const next=[guide?.now,...(guide?.upcoming || [])].find(e=>e && e.start>now);
    epg?.updateLive(now,next?.id);
    const event=eventAt(guide,now), changed=event?.id!==current?.id;
    current=event;
    if (changed) render(event);
    if (session.shouldLoad(event)) loadTransmission(event);
    const shown=session.paused ? loadedEvent : event;
    $('tv-set').dataset.theme=strandTheme(shown || {});
    if (shown?.id!==continuityId) {
      continuityId=shown?.id;
      // One wipe per real transmission change, rather than every metadata poll.
      if (session.active) motion.play('wipe',document.querySelector('.viewing-now'),'continuity');
    }
    $('programme-progress').value=programmeProgress(shown,session.paused ? pausedAt : now);
    const upcoming=[guide?.now,...(guide?.upcoming || [])].find(e=>e && e.start>=(shown?.end ?? now));
    const collection=shown?.programming?.collection;
    $('viewing-block').textContent=shown?.programming ? `${collection ? collection.title+' · Block '+collection.part+': ' : ''}${shown.programming.title} ↗` : '';
    $('viewing-block').dataset.collectionTheme=collection?.theme || '';
    $('viewing-block').setAttribute('aria-label',shown?.programming ? `Explore ${collection ? collection.title+", Block "+collection.part+": " : "programming block: "}${shown.programming.title}` : 'Explore programming block');
    $('viewing-block').hidden=!shown?.programming;
    $('viewing-next').hidden=!upcoming;
    $('next-title').textContent=upcoming?.title || '';
    $('next-time').textContent=upcoming ? timeText(upcoming.start) : '';
    if (session.running) prepareNext(preloadCandidate(guide,event,now,navigator.connection));
    else if (prepared) clearPrepared();
    if (session.paused) { normalMessage('Paused'); return; }
    if (!session.active) return;
    if (!event) { changingSource=true; video.pause(); normalMessage('Connecting…'); return; }
    if (video.error) {
      normalMessage('Playback interrupted · Retrying…');
      if (performance.now()-lastRetry>8000) {lastRetry=performance.now(); loadTransmission(event);}
      return;
    }
    if (video.readyState>=2 && loadedEvent?.id===event.id) {
      const drift=position(event,now)-video.currentTime;
      if (Math.abs(drift)>1.25) seekLive();
      video.playbackRate=Math.abs(drift)>.25 && Math.abs(drift)<=1.25 ? (drift>0 ? 1.03 : .97) : 1;
      if (video.paused && !video.ended) play();
      if (performance.now()-lastSuccess<15000) normalMessage('Live');
    }
  }
  async function refresh() {
    if (fetching) return; fetching=true;
    const start=performance.now();
    try {
      const response=await fetch('/api/channel?hours=0.25',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('Guide unavailable');
      const data=await response.json(),end=performance.now();
      const contentChanged=guide && guide.content_revision!==data.content_revision;
      clock.update(data.server_time,start,end); guide=data; lastSuccess=end;
      const refreshedLoaded=[data.now,...data.upcoming].find(event=>event?.id===loadedEvent?.id);
      if (refreshedLoaded) loadedEvent=refreshedLoaded;
      tick(); render(eventAt(guide,clock.now()));
      if (contentChanged) {epg?.refresh();if (!$('screen-info').hidden) showInfo();}
    } catch { message('Reconnecting…'); }
    finally {fetching=false;}
  }
  function watchLive() {
    if (!session.active) acquireOnPlaying=true;
    session.tune(); pausedAt=null; receiverState(); revealControls(); setGuide(false); setSettings(false); $('standby').hidden=true;
    tick(); if (!guide) message('Connecting…'); refresh();
  }
  function pause() { if (!session.paused) pausedAt=clock.now(); session.pause(); video.pause(); video.playbackRate=1; receiverState(); message('Paused'); revealControls(); }
  function togglePlayback() { if (session.running) pause(); else watchLive(); }
  $('tune').addEventListener('click',watchLive); $('resume-live').addEventListener('click',watchLive);
  $('transport').addEventListener('click',togglePlayback); $('live').addEventListener('click',watchLive);
  $('sound').addEventListener('click',toggleSound);
  $('volume').addEventListener('input',()=>{video.volume=Number($('volume').value)/100; video.muted=video.volume===0; updateSound();});
  $('subtitle-track').addEventListener('change',()=>{
    selectedCaptionId=$('subtitle-track').value; preferences.captions=selectedCaptionId!=='off';
    const selected=(loadedEvent?.captions || current?.captions || []).find(t=>t.id===selectedCaptionId);
    if (selected) preferences.language=selected.language; applyCaptions(); savePreferences();
  });
  $('picture').addEventListener('change',()=>{preferences.picture=$('picture').value; pictureSettings(); savePreferences();});
  $('caption-size').addEventListener('change',()=>{preferences.captionSize=$('caption-size').value; pictureSettings(); savePreferences();});
  $('info').addEventListener('click',()=>showInfo(true)); $('fullscreen').addEventListener('click',fullScreen);
  $('pip').hidden=!(document.pictureInPictureEnabled && video.requestPictureInPicture);
  $('pip').addEventListener('click',pictureInPicture);
  document.addEventListener('fullscreenchange',()=>{
    const full=!!document.fullscreenElement; icon($('fullscreen'),full ? 'exit' : 'fullscreen');
    $('fullscreen').setAttribute('aria-label',full ? 'Exit full screen' : 'Enter full screen');
  });
  function bindVideo(element) {
    element.addEventListener('volumechange',()=>{if (element===video) updateSound();});
    element.addEventListener('enterpictureinpicture',()=>$('pip').setAttribute('aria-pressed','true'));
    element.addEventListener('leavepictureinpicture',()=>$('pip').setAttribute('aria-pressed','false'));
    element.addEventListener('pause',()=>{if (element===video && !changingSource && video.paused && !video.ended && session.running) pause();});
    element.addEventListener('play',()=>{if (element===video && session.paused && !video.paused) watchLive();});
    element.addEventListener('playing',()=>{
      if (element!==video) return;
      if (session.paused) {video.pause();return;}
      changingSource=false;$('standby').hidden=true;receiverState();
      if (acquireOnPlaying) {acquireOnPlaying=false;motion.play('aperture',$('screen'),'acquisition');}
    });
    element.addEventListener('ended',()=>{if (element===video) tick();});
  }
  bindVideo(video);bindVideo(buffer);
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) refresh();}); window.addEventListener('online',refresh);
  document.addEventListener('keydown',event=>{
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,textarea,select,button,a,summary,#programme-guide,[contenteditable=true]') || document.querySelector('dialog[open]')) return;
    const key=event.key.toLowerCase();
    if (key===' ' || key==='k') {event.preventDefault(); togglePlayback();}
    if (key==='m') {event.preventDefault(); toggleSound();}
    if (key==='c') {event.preventDefault(); toggleCaptions();}
    if (key==='f') {event.preventDefault(); fullScreen();}
    if (key==='i') {event.preventDefault(); showInfo(true);}
  });
  updateSound(); pictureSettings(); receiverState(); captionControls();
  epg=createProgrammeGuide({now:()=>clock.now(),watchLive,showGuide:()=>setGuide(true)});
  revealControls();
  setInterval(tick,250); setInterval(refresh,10000); refresh();
}
