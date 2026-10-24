import test from 'node:test';
import assert from 'node:assert/strict';
import {playScheduledFile} from '../web/channel-two-playback.js';

function fakeVideo() {
  return {duration:100, currentTime:0, plays:0, loads:0, children:['old captions'], src:'old',
    pause(){this.paused=true;}, removeAttribute(name){delete this[name];},
    replaceChildren(){this.children=[];}, load(){this.loads++;},
    play(){this.plays++;return Promise.resolve();}};
}

test('Channel Two transport seeks at metadata arrival using the current clock', () => {
  const video = fakeVideo();
  let target = 25;
  playScheduledFile(video, '/media/feature.mp4', () => target, () => assert.fail('unexpected playback block'));
  assert.equal(video.currentTime, 0);
  target = 28;
  video.onloadedmetadata();
  assert.equal(video.currentTime,28);
  assert.equal(video.plays,1);
  assert.equal(video.loads,1);
  assert.deepEqual(video.children,[]);
});

test('Channel Two transport refuses remote URLs and private file paths', () => {
  for (const path of ['https://jellyfin.private/stream?api_key=secret','/media/../../.env','file:///home/film.mp4']) {
    assert.throws(() => playScheduledFile(fakeVideo(),path,()=>0,()=>{}),/Invalid broadcast asset URL/);
  }
});

test('autoplay rejection reaches the recovery callback', async () => {
  const video = fakeVideo();
  let blocked = false;
  video.play = () => Promise.reject(new Error('interaction required'));
  playScheduledFile(video, '/media/ident.mp4', () => 200, () => {blocked=true;});
  video.onloadedmetadata();
  await Promise.resolve();
  assert.equal(blocked,true);
  assert.equal(video.currentTime,99.95);
});
