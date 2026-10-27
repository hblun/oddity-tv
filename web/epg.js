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

export {createBlockGuide as createProgrammeGuide} from './block-guide.js';
