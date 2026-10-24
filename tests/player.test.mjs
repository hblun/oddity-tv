import test from 'node:test';
import assert from 'node:assert/strict';
import {BroadcastClock, eventAt, position} from '../web/player.js';

test('two devices with different system clocks share the programme position', () => {
  const a = new BroadcastClock(), b = new BroadcastClock();
  // Local wall clocks never enter the calculation. Monotonic uptime may differ.
  a.update(1000, 0, 100);
  b.update(1005, 80000, 80100);
  assert.equal(a.now(10100), b.now(85100));
  const event = {start:1000, end:1020, source_in:40};
  assert.equal(position(event, a.now(10100)), position(event, b.now(85100)));
});

test('advert transitions and source resume are half-open at exact boundaries', () => {
  const programme = {id:'p1', start:0, end:20, source_in:0};
  const advert = {id:'a', start:20, end:28, source_in:0};
  const resume = {id:'p2', start:28, end:48, source_in:20};
  const guide = {now:programme, upcoming:[advert,resume]};
  assert.equal(eventAt(guide, 19.99), programme);
  assert.equal(eventAt(guide, 20), advert);
  assert.equal(eventAt(guide, 28), resume);
  assert.equal(position(resume,33),25);
  assert.equal(eventAt(guide,48), null);
});

test('cached guide progresses during a connection outage and stops at its end', () => {
  const clock = new BroadcastClock();
  clock.update(10,0,0);
  const guide = {now:{start:0,end:20},upcoming:[{start:20,end:30}]};
  assert.equal(eventAt(guide,clock.now(15000)),guide.upcoming[0]);
  assert.equal(eventAt(guide,clock.now(25000)),null);
});
