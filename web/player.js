// Clock-based MP4 playback; native transport adapted from Channel Two.
import {playScheduledFile} from './channel-two-playback.js';
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
  const ukTime = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
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
    $('now-detail').textContent = event ? `${ukTime.format(event.start * 1000)}–${ukTime.format(event.end * 1000)} · ${event.block}` : 'The programme guide will return shortly.';
    const list = $('guide');
    list.replaceChildren();
    const now = clock.now();
    for (const item of [guide?.now, ...(guide?.upcoming || [])].filter(e => e && e.start > now).slice(0, 9)) {
      const li = document.createElement('li'), time = document.createElement('time'), body = document.createElement('div');
      time.dateTime = new Date(item.start * 1000).toISOString();
      time.textContent = ukTime.format(item.start * 1000);
      const title = document.createElement('span'), kind = document.createElement('span');
      title.className = 'guide-title'; title.textContent = item.title;
      kind.className = 'guide-kind'; kind.textContent = item.kind.replaceAll('-', ' ');
      body.append(title, kind); li.append(time, body); list.append(li);
    }
  }
  function tick() {
    const now = clock.now();
    if (now === null) return;
    $('clock').textContent = `${ukTime.format(now * 1000)} · LONDON`;
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
  $('tune').addEventListener('click', () => {
    active = true;
    current = null;
    $('standby').hidden = true;
    tick();
    if (!guide) { message('Connecting to the transmission…'); refresh(); }
  });
  $('sound').addEventListener('click', () => {
    video.muted = !video.muted;
    $('sound').textContent = video.muted ? 'Sound off' : 'Sound on';
    $('sound').setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Turn sound off');
  });
  $('live').addEventListener('click', () => { seekLive(); refresh(); if (active) play(); });
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
  setInterval(tick, 250);
  setInterval(refresh, 10000);
  refresh();
}
