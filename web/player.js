// Clock-based MP4 playback; native transport adapted from Channel Two.
import {playScheduledFile} from './channel-two-playback.js';
import {createProgrammeGuide, durationText, timeText} from './epg.js';
export class BroadcastClock {
  constructor() { this.anchor = null; this.mono = 0; }
  update(serverTime, requestStart, responseEnd) {
    this.anchor = serverTime + (responseEnd - requestStart) / 2000;
    this.mono = responseEnd;
  }
  now(mono = performance.now()) {
    return this.anchor === null ? null : this.anchor + (mono - this.mono) / 1000;
  }
}

export function eventAt(guide, time) {
  if (time === null || !guide) return null;
  return [guide.now, ...guide.upcoming].find(e => e && e.start <= time && time < e.end) || null;
}

export function position(event, time) {
  return event.source_in + Math.max(0, Math.min(event.end - event.start - 0.05, time - event.start));
}

if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const video = $('video'), clock = new BroadcastClock();
  let epg = null;
  let guide = null, current = null, active = false, fetching = false, lastSuccess = 0, lastRetry = 0;
  video.muted = true;

  function message(text) { $('status').textContent = text; }
  function blocked() {
      $('standby').hidden = false;
      $('tune').textContent = 'Resume the live broadcast';
      message('Playback needs a click. Tune in to resume at the live position.');
  }
  function play() {
    video.play().catch(blocked);
  }
  function seekLive() {
    if (!current || video.readyState < 1) return;
    const target = position(current, clock.now());
    if (Number.isFinite(target)) video.currentTime = Math.min(target, Number.isFinite(video.duration) ? Math.max(0, video.duration - .05) : target);
  }
  function render(event) {
    $('now-title').textContent = event ? event.title : 'Between transmissions';
    $('now-detail').textContent = event ? `${event.block}${event.source_in > 0 ? ' · Programme resumes' : ''}` : 'The programme guide will return shortly.';
    $('now-kind').textContent = event?.kind.replaceAll('-',' ') || 'Continuity';
    $('now-range').textContent = event ? `${timeText(event.start,true)}–${timeText(event.end,true)}` : 'Stand by';
    if (guide) $('channel-name').textContent = guide.channel;
    const next = [guide?.now, ...(guide?.upcoming || [])].find(e => e && e.start > clock.now());
    $('next-title').textContent = next?.title || 'More from the Oddity service';
    $('next-time').textContent = next ? timeText(next.start,next.end-next.start<60 || next.start%60!==0) : '--:--';
    if (next) $('next-time').dateTime = new Date(next.start*1000).toISOString();
    else $('next-time').removeAttribute('datetime');
    $('next-detail').textContent = next ? `${next.kind.replaceAll('-',' ')} · ${durationText(next.end-next.start)}${next.source_in>0 ? ' · Resumes' : ''}` : 'The guide is refreshing.';
  }
  function tick() {
    const now = clock.now();
    if (now === null) return;
    $('clock').textContent = timeText(now,true);
    const next = [guide?.now,...(guide?.upcoming || [])].find(e => e && e.start>now);
    epg?.updateLive(now,next?.id);
    const event = eventAt(guide, now);
    if (event?.id !== current?.id) {
      current = event;
      render(event);
      if (active && current) {
        playScheduledFile(video, current.url, () => current ? position(current, clock.now()) : 0, blocked);
        $('standby').hidden = true;
      } else if (active) {
        video.pause();
        message('Waiting for the next programme. Reconnecting to the station…');
      }
    }
    if (!event) return;
    $('progress').value = Math.max(0, Math.min(1, (now - event.start) / (event.end - event.start)));
    $('remaining').textContent = `${durationText(Math.max(0,event.end-now))} remaining`;
    if (!active) return;
    if (video.error) {
      message('Transmission interrupted. Retrying at the live position…');
      if (performance.now() - lastRetry > 8000) { lastRetry = performance.now(); video.load(); }
      return;
    }
    if (video.readyState >= 2) {
      const drift = position(event, now) - video.currentTime;
      if (Math.abs(drift) > 1.25) seekLive();
      video.playbackRate = Math.abs(drift) > .25 && Math.abs(drift) <= 1.25 ? (drift > 0 ? 1.03 : .97) : 1;
      if (video.paused && !video.ended) play();
      if (performance.now() - lastSuccess < 15000) message('You are watching the shared live broadcast.');
    }
  }
  async function refresh() {
    if (fetching) return;
    fetching = true;
    const start = performance.now();
    try {
      const response = await fetch('/api/channel?hours=0.25', {cache:'no-store', signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('Guide unavailable');
      const data = await response.json(), end = performance.now();
      clock.update(data.server_time, start, end);
      guide = data;
      lastSuccess = end;
      tick(); render(eventAt(guide, clock.now()));
    } catch {
      message('Programme guide connection lost. The cached broadcast continues; reconnecting…');
    } finally { fetching = false; }
  }
  function watchLive() {
    active = true;
    current = null;
    $('standby').hidden = true;
    tick();
    if (!guide) { message('Connecting to the transmission…'); refresh(); }
  }
  $('tune').addEventListener('click',watchLive);
  $('sound').addEventListener('click', () => {
    video.muted = !video.muted;
    $('sound').textContent = video.muted ? 'Sound off' : 'Sound on';
    $('sound').setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Turn sound off');
  });
  $('live').addEventListener('click', () => { if (!active) watchLive(); else {seekLive(); refresh(); play();} });
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('screen').requestFullscreen) await $('screen').requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else message('Full screen is unavailable in this browser.');
    } catch { message('Full screen is unavailable in this browser.'); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', refresh);
  video.addEventListener('ended', () => { tick(); });
  epg = createProgrammeGuide({now:() => clock.now(),watchLive});
  setInterval(tick, 250);
  setInterval(refresh, 10000);
  refresh();
}
