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

  function savePreferences() { try { localStorage.setItem('oddity-player-v1',JSON.stringify(preferences)); } catch {} }
  function message(text,hold = 0) {
    if (hold) statusUntil = performance.now()+hold;
    if ($('status').textContent!==text) $('status').textContent = text;
  }
  function normalMessage(text) { if (performance.now()>=statusUntil) message(text); }
  function receiverState() {
    $('receiver-state').textContent = session.paused ? 'PAUSED LOCALLY' : session.active ? 'LIVE SERVICE' : 'READY TO RECEIVE';
    $('transport-icon').textContent = session.running ? 'Ⅱ' : '▶';
    $('transport-label').textContent = session.running ? 'Pause' : 'Play live';
    $('transport').setAttribute('aria-label',session.running ? 'Pause on this screen; the channel continues' : 'Play at the current live broadcast position');
    $('paused-overlay').hidden = !session.paused;
    $('live').classList.toggle('is-paused',session.paused);
  }
  function blocked(error) {
    if (session.paused || error?.name==='AbortError') return;
    $('standby').hidden = false; $('tune').textContent = 'Resume the live broadcast';
    message('Playback needs a click. Tune in to resume at the live position.',5000);
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
    if ($('captions').disabled) { message('No subtitles are supplied for this transmission.',4000); return; }
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
    $('sound').textContent = video.muted || video.volume===0 ? 'Unmute' : 'Mute';
    $('sound').setAttribute('aria-label',video.muted || video.volume===0 ? 'Turn sound on' : 'Mute sound');
    savePreferences();
  }
  function toggleSound() { const silent=video.muted || video.volume===0; if (silent && video.volume===0) video.volume=.7; video.muted=!silent; updateSound(); }
  function pictureSettings() {
    $('tv-set').dataset.picture=preferences.picture; $('tv-set').dataset.captionSize=preferences.captionSize;
    $('tv-set').classList.toggle('crt-on',preferences.crt); document.body.classList.toggle('theatre-mode',preferences.theatre);
    $('picture').value=preferences.picture; $('caption-size').value=preferences.captionSize; $('crt').checked=preferences.crt;
    $('theatre').setAttribute('aria-pressed',String(preferences.theatre));
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
    $('now-title').textContent=event?.title || 'Between transmissions';
    $('now-detail').textContent=event ? `${event.block}${event.source_in>0 ? ' · Programme resumes' : ''}` : 'The programme guide will return shortly.';
    $('now-kind').textContent=event?.kind.replaceAll('-',' ') || 'Continuity';
    $('now-range').textContent=event ? `${timeText(event.start,true)}–${timeText(event.end,true)}` : 'Stand by';
    if (guide) $('channel-name').textContent=guide.channel;
    const next=[guide?.now,...(guide?.upcoming || [])].find(e=>e && e.start>clock.now());
    $('next-title').textContent=next?.title || 'More from the Oddity service';
    $('next-time').textContent=next ? timeText(next.start,next.end-next.start<60 || next.start%60!==0) : '--:--';
    if (next) $('next-time').dateTime=new Date(next.start*1000).toISOString(); else $('next-time').removeAttribute('datetime');
    $('next-detail').textContent=next ? `${next.kind.replaceAll('-',' ')} · ${durationText(next.end-next.start)}${next.source_in>0 ? ' · Resumes' : ''}` : 'The guide is refreshing.';
    if (!loadedEvent) captionControls();
  }
  function loadTransmission(event) {
    loadedEvent=event; session.loaded(event); changingSource=true; selectedCaptionId=null;
    playScheduledFile(video,event.url,()=>position(loadedEvent,session.paused && pausedAt!==null ? pausedAt : clock.now()),blocked,{
      shouldPlay:()=>session.running,
      onSource:()=>{
        mounted=mountCaptions(video,event.captions || [],()=>message('This subtitle track could not be loaded. Try another track or switch subtitles off.',5000));
        for (const track of mounted) track.element.addEventListener('load',applyCaptions);
        applyCaptions();
      },onReady:()=>{ applyCaptions(); if (session.running) showInfo(); }
    });
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
    if (event) {
      $('progress').value=Math.max(0,Math.min(1,(now-event.start)/(event.end-event.start)));
      $('remaining').textContent=`${durationText(Math.max(0,event.end-now))} remaining`;
    }
    if (session.paused) { normalMessage('Paused on your screen. Play rejoins the current live transmission.'); return; }
    if (!session.active) return;
    if (!event) { changingSource=true; video.pause(); normalMessage('Waiting for the programme guide. Reconnecting to the station…'); return; }
    if (video.error) {
      normalMessage('Transmission interrupted. Retrying at the live position…');
      if (performance.now()-lastRetry>8000) {lastRetry=performance.now(); loadTransmission(event);}
      return;
    }
    if (video.readyState>=2 && loadedEvent?.id===event.id) {
      const drift=position(event,now)-video.currentTime;
      if (Math.abs(drift)>1.25) seekLive();
      video.playbackRate=Math.abs(drift)>.25 && Math.abs(drift)<=1.25 ? (drift>0 ? 1.03 : .97) : 1;
      if (video.paused && !video.ended) play();
      if (performance.now()-lastSuccess<15000) normalMessage('Live transmission. Everyone is watching the same programme position.');
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
    } catch { message('Programme guide connection lost. The cached broadcast continues; reconnecting…',5000); }
    finally {fetching=false;}
  }
  function watchLive() {
    session.tune(); pausedAt=null; receiverState(); $('standby').hidden=true;
    tick(); if (!guide) message('Connecting to the transmission…'); refresh();
  }
  function pause() { if (!session.paused) pausedAt=clock.now(); session.pause(); video.pause(); video.playbackRate=1; receiverState(); message('Paused on your screen. Play rejoins the current live transmission.'); }
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
  $('theatre').addEventListener('click',()=>{preferences.theatre=!preferences.theatre; pictureSettings(); savePreferences();});
  $('info').addEventListener('click',()=>showInfo(true)); $('fullscreen').addEventListener('click',fullScreen);
  $('pip').hidden=!(document.pictureInPictureEnabled && video.requestPictureInPicture);
  $('pip').addEventListener('click',pictureInPicture);
  video.addEventListener('enterpictureinpicture',()=>$('pip').setAttribute('aria-pressed','true'));
  video.addEventListener('leavepictureinpicture',()=>$('pip').setAttribute('aria-pressed','false'));
  document.addEventListener('fullscreenchange',()=>{
    const full=!!document.fullscreenElement; $('fullscreen').textContent=full ? 'Exit full screen' : 'Full screen';
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
    if (key==='t') {event.preventDefault(); $('theatre').click();}
  });
  updateSound(); pictureSettings(); receiverState(); captionControls();
  epg=createProgrammeGuide({now:()=>clock.now(),watchLive});
  setInterval(tick,250); setInterval(refresh,10000); refresh();
}
