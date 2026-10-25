// Shared-clock television, with local viewing controls and cached WebVTT tracks.
import {playScheduledFile} from './channel-two-playback.js';
import {createProgrammeGuide, durationText, timeText} from './epg.js';
import {ViewingSession, chooseCaption, mountCaptions, readPreferences, safePreferences} from './tv-controls.js';
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
  const video = $('video'), clock = new BroadcastClock(), session = new ViewingSession();
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
  let controlsTimer=null, guideReturnFocus=null, settingsReturnFocus=null;
  function revealControls() {
    $('tv-set').classList.add('controls-visible');clearTimeout(controlsTimer);
    controlsTimer=setTimeout(()=>{
      if (!$('receiver-settings').hidden) return;
      $('tv-set').classList.remove('controls-visible');
    },3500);
  }
  function setSettings(open) {
    if (open) settingsReturnFocus=document.activeElement;
    $('receiver-settings').hidden=!open;
    $('settings-toggle').setAttribute('aria-expanded',String(open));
    revealControls();
    if (open) $('settings-close').focus();
    else if ($('receiver-settings').contains(document.activeElement)) settingsReturnFocus?.focus();
  }
  async function setGuide(open) {
    if (open) {
      guideReturnFocus=$('receiver-settings').contains(document.activeElement) ? $('guide-toggle') : document.activeElement;
      if (document.fullscreenElement) await document.exitFullscreen();
      setSettings(false);
    }
    $('programme-guide').hidden=!open;$('guide-backdrop').hidden=!open;
    $('guide-toggle').setAttribute('aria-expanded',String(open));
    if (open) $('guide-close').focus();
    else { revealControls(); if ($('programme-guide').contains(document.activeElement) || document.activeElement===$('guide-backdrop')) (guideReturnFocus?.isConnected ? guideReturnFocus : $('guide-toggle')).focus(); }
  }
  $('guide-toggle').addEventListener('click',()=>setGuide($('programme-guide').hidden));
  $('skip-guide').addEventListener('click',()=>setGuide(true));
  $('guide-close').addEventListener('click',()=>setGuide(false));
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
    $('receiver-state').textContent = session.paused ? 'Paused' : session.active ? 'Live' : 'Ready';
    $('transport-icon').textContent = session.running ? 'Ⅱ' : '▶';
    $('transport-label').textContent = session.running ? 'Pause' : 'Play live';
    $('transport').setAttribute('aria-label',session.running ? 'Pause on this screen; the channel continues' : 'Play at the current live broadcast position');
    $('paused-overlay').hidden = !session.paused;
    $('tv-set').classList.toggle('is-paused',session.paused);
    $('tv-set').classList.toggle('is-idle',!session.active);
    $('live').classList.toggle('is-paused',session.paused);
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
    $('captions').disabled = !tracks.length;
    $('captions').setAttribute('aria-pressed',String(preferences.captions && !!selected));
    $('captions').setAttribute('aria-label',tracks.length ? `Turn subtitles ${preferences.captions ? 'off' : 'on'}` : 'No subtitles supplied for this transmission');
    $('captions').title = tracks.length ? `Subtitles ${preferences.captions ? 'on' : 'off'} (C)` : 'No subtitles supplied for this transmission';
    $('subtitle-status').textContent = tracks.length ? `${tracks.length} subtitle track${tracks.length===1 ? '' : 's'} supplied. Your choice carries over between programmes.` : 'No subtitles supplied for this transmission. Your preference is kept for the next programme.';
  }
  function toggleCaptions() {
    if ($('captions').disabled) { message('Subtitles unavailable',4000); return; }
    preferences.captions = !preferences.captions; applyCaptions(); savePreferences();
    message(`Subtitles ${preferences.captions ? 'on' : 'off'}.`,3000);
  }
  function showInfo(toggle = false) {
    clearTimeout(infoTimer);
    if (toggle && !$('screen-info').hidden) { $('screen-info').hidden=true; $('info').setAttribute('aria-pressed','false'); return; }
    const event = loadedEvent || current;
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
    $('tv-set').classList.toggle('crt-on',preferences.crt);
    $('picture').value=preferences.picture; $('caption-size').value=preferences.captionSize; $('crt').checked=preferences.crt;
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
  function loadTransmission(event) {
    loadedEvent=event; $('viewing-title').textContent=event.title; session.loaded(event); changingSource=true; selectedCaptionId=null;
    playScheduledFile(video,event.url,()=>position(loadedEvent,session.paused && pausedAt!==null ? pausedAt : clock.now()),blocked,{
      shouldPlay:()=>session.running,
      onSource:()=>{
        mounted=mountCaptions(video,event.captions || [],()=>message('This subtitle track could not be loaded. Try another track or switch subtitles off.',5000));
        for (const track of mounted) track.element.addEventListener('load',applyCaptions);
        applyCaptions();
      },onReady:()=>{ applyCaptions(); }
    });
    $('standby').hidden=true;
  }
  function tick() {
    const now=clock.now(); if (now===null) return;
    $('clock').textContent=timeText(now);
    const next=[guide?.now,...(guide?.upcoming || [])].find(e=>e && e.start>now);
    epg?.updateLive(now,next?.id);
    const event=eventAt(guide,now), changed=event?.id!==current?.id;
    current=event;
    if (changed) render(event);
    if (session.shouldLoad(event)) loadTransmission(event);
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
      clock.update(data.server_time,start,end); guide=data; lastSuccess=end;
      tick(); render(eventAt(guide,clock.now()));
    } catch { message('Reconnecting…'); }
    finally {fetching=false;}
  }
  function watchLive() {
    session.tune(); pausedAt=null; receiverState(); revealControls(); setGuide(false); setSettings(false); $('standby').hidden=true;
    tick(); if (!guide) message('Connecting…'); refresh();
  }
  function pause() { if (!session.paused) pausedAt=clock.now(); session.pause(); video.pause(); video.playbackRate=1; receiverState(); message('Paused'); revealControls(); }
  function togglePlayback() { if (session.running) pause(); else watchLive(); }
  $('tune').addEventListener('click',watchLive); $('resume-live').addEventListener('click',watchLive);
  $('transport').addEventListener('click',togglePlayback); $('live').addEventListener('click',watchLive);
  $('sound').addEventListener('click',toggleSound); video.addEventListener('volumechange',updateSound);
  $('volume').addEventListener('input',()=>{video.volume=Number($('volume').value)/100; video.muted=video.volume===0; updateSound();});
  $('captions').addEventListener('click',toggleCaptions);
  $('subtitle-track').addEventListener('change',()=>{
    selectedCaptionId=$('subtitle-track').value; preferences.captions=selectedCaptionId!=='off';
    const selected=(loadedEvent?.captions || current?.captions || []).find(t=>t.id===selectedCaptionId);
    if (selected) preferences.language=selected.language; applyCaptions(); savePreferences();
  });
  $('picture').addEventListener('change',()=>{preferences.picture=$('picture').value; pictureSettings(); savePreferences();});
  $('caption-size').addEventListener('change',()=>{preferences.captionSize=$('caption-size').value; pictureSettings(); savePreferences();});
  $('crt').addEventListener('change',()=>{preferences.crt=$('crt').checked; pictureSettings(); savePreferences();});
  $('info').addEventListener('click',()=>showInfo(true)); $('fullscreen').addEventListener('click',fullScreen);
  $('pip').hidden=!(document.pictureInPictureEnabled && video.requestPictureInPicture);
  $('pip').addEventListener('click',pictureInPicture);
  video.addEventListener('enterpictureinpicture',()=>$('pip').setAttribute('aria-pressed','true'));
  video.addEventListener('leavepictureinpicture',()=>$('pip').setAttribute('aria-pressed','false'));
  document.addEventListener('fullscreenchange',()=>{
    const full=!!document.fullscreenElement; icon($('fullscreen'),full ? 'exit' : 'fullscreen');
    $('fullscreen').setAttribute('aria-label',full ? 'Exit full screen' : 'Enter full screen');
  });
  video.addEventListener('pause',()=>{if (!changingSource && video.paused && !video.ended && session.running) pause();});
  video.addEventListener('play',()=>{if (session.paused && !video.paused) watchLive();});
  video.addEventListener('playing',()=>{if (session.paused) {video.pause(); return;} changingSource=false; $('standby').hidden=true; receiverState();});
  video.addEventListener('ended',tick);
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
