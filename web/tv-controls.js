// Small, independently testable rules for local viewing and subtitle selection.
export class ViewingSession {
  constructor() { this.active = false; this.paused = false; this.loadedId = null; }
  tune() { this.active = true; this.paused = false; this.loadedId = null; }
  pause() { if (this.active) this.paused = true; }
  get running() { return this.active && !this.paused; }
  shouldLoad(event) { return this.running && !!event && event.id !== this.loadedId; }
  loaded(event) { this.loadedId = event.id; }
}

export function chooseCaption(tracks, language = 'en', preferredId = null) {
  return tracks.find(t => t.id === preferredId)
    || tracks.find(t => t.language?.toLowerCase() === language.toLowerCase())
    || tracks.find(t => t.language?.split('-')[0].toLowerCase() === language.split('-')[0].toLowerCase())
    || tracks.find(t => t.default) || tracks[0] || null;
}

export function safePreferences(value) {
  const p = value && typeof value === 'object' ? value : {};
  return {volume:Number.isFinite(p.volume) ? Math.max(0,Math.min(1,p.volume)) : .7,
    muted:typeof p.muted==='boolean' ? p.muted : true,
    captions:p.captions===true, language:typeof p.language==='string' && p.language.length<=35 && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(p.language) ? p.language : 'en',
    picture:['fit','classic','wide','fill'].includes(p.picture) ? p.picture : 'fit',
    captionSize:p.captionSize==='large' ? 'large' : 'normal', crt:p.crt===true, theatre:p.theatre===true};
}

export function readPreferences(storage) {
  try { return safePreferences(JSON.parse(storage.getItem('oddity-player-v1'))); }
  catch { return safePreferences(null); }
}

export function mountCaptions(video, captions, onError) {
  return captions.map(caption => {
    if (!/^\/captions\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.vtt$/.test(caption.url)) throw new Error('Invalid caption URL');
    const element = document.createElement('track');
    element.kind = 'subtitles'; element.label = caption.label; element.srclang = caption.language; element.src = caption.url;
    element.addEventListener('error',onError);
    video.append(element);
    return {element,caption};
  });
}
