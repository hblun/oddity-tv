import test from 'node:test';
import assert from 'node:assert/strict';
import {dayKey, ukMidnight, periodWindow, timeText, durationText, eventState, guideScale, gridBox, windowAt} from '../web/epg.js';

const stamp = iso => Date.parse(iso)/1000;

test('British day browsing includes all 25 hours when clocks go back', () => {
  const window = periodWindow('today',stamp('2026-10-25T12:00:00Z'));
  assert.equal(window.start,stamp('2026-10-24T23:00:00Z'));
  assert.equal(window.end,stamp('2026-10-26T00:00:00Z'));
  assert.equal(window.end-window.start,25*3600);
});

test('British day browsing includes 23 hours when clocks go forward', () => {
  const window = periodWindow('today',stamp('2026-03-29T12:00:00Z'));
  assert.equal(window.start,stamp('2026-03-29T00:00:00Z'));
  assert.equal(window.end,stamp('2026-03-29T23:00:00Z'));
  assert.equal(window.end-window.start,23*3600);
});

test('tomorrow follows the British calendar instead of adding 24 hours', () => {
  const window = periodWindow('tomorrow',stamp('2026-10-24T12:00:00Z'));
  assert.equal(window.start,stamp('2026-10-24T23:00:00Z'));
  assert.equal(window.end,stamp('2026-10-26T00:00:00Z'));
  assert.equal(dayKey(stamp('2026-06-01T23:30:00Z')),'2026-06-02');
  assert.equal(ukMidnight('2026-06-02'),stamp('2026-06-01T23:00:00Z'));
});

test('now window is a full 24-hour interval and programme states change at boundaries', () => {
  assert.deepEqual(periodWindow('now',500),{start:500,end:86900});
  const event = {id:'film',start:100,end:200};
  assert.equal(eventState(event,99,'film'),'Up next');
  assert.equal(eventState(event,100),'On air');
  assert.equal(eventState(event,200),'Earlier');
});

test('short transmissions retain distinct seconds and meaningful durations', () => {
  assert.equal(timeText(stamp('2026-10-25T19:00:08Z'),true),'19:00:08');
  assert.equal(timeText(stamp('2026-06-01T19:00:00Z')),'20:00');
  assert.equal(durationText(8),'8 sec');
  assert.equal(durationText(90),'1 min 30s');
  assert.equal(durationText(5040),'1h 24m');
});

test('the guide scale keeps real films and the short demo readable without changing time',()=>{
  assert.deepEqual(guideScale([{kind:'programme',start:0,end:5400}]),{span:7200,tick:1800});
  assert.deepEqual(guideScale([{kind:'programme',start:0,end:180}]),{span:1200,tick:300});
  assert.deepEqual(guideScale([{kind:'programme',start:0,end:20},{kind:'advert',start:20,end:28}]),{span:120,tick:30});
});

test('programme cells use elapsed time and clip at window edges',()=>{
  assert.deepEqual(gridBox({start:80,end:160},100,220),{left:0,width:50,before:true,after:false});
  const continued=gridBox({start:180,end:260},100,220);
  assert.ok(Math.abs(continued.left-66.6666667)<.00001);
  assert.ok(Math.abs(continued.width-33.3333333)<.00001);
  assert.equal(continued.after,true);
  assert.equal(gridBox({start:220,end:300},100,220),null);
});

test('a timeline window cannot overrun its selected British day',()=>{
  const day=periodWindow('today',stamp('2026-10-25T12:00:00Z'));
  const range=windowAt(day.end-60,{span:7200,tick:1800},day);
  assert.equal(range.end,day.end);
  assert.equal(range.start,day.end-1800);
  assert.equal(day.end-day.start,25*3600);
});
