import test from 'node:test';
import assert from 'node:assert/strict';
import {artDirection} from '../web/art-direction.js';

test('programme artwork and colour stay stable through an advert break and resumption',()=>{
  const first=artDirection({asset:'feature',kind:'programme',source_in:0,id:'first'});
  const resumed=artDirection({asset:'feature',kind:'programme',source_in:1800,id:'resumed'});
  assert.deepEqual(first,resumed);
  assert.notEqual(artDirection({kind:'advert'}).image,first.image);
});

test('archive placeholders use local images and retain factual source credits',()=>{
  for (const kind of ['programme','advert','ident','trailer','interstitial','public-information',undefined]) {
    const direction=artDirection({kind});
    assert.match(direction.image,/^\/artwork\/[a-z-]+\.jpg$/);
    assert.ok(direction.alt.length>20);
    assert.ok(direction.title && direction.credit);
    assert.ok(['www.nasa.gov','commons.wikimedia.org'].includes(new URL(direction.source).hostname));
    assert.ok(['cobalt','coral','citrus','nocturne'].includes(direction.theme));
  }
});

test('clip colours change within a strand and explicit editorial choices take priority',()=>{
  const programming={id:'after-hours',title:'Past Watershed Strangeness'};
  assert.equal(artDirection({kind:'ident',programming}).theme,'citrus');
  assert.equal(artDirection({kind:'programme',programming}).theme,'cobalt');
  assert.equal(artDirection({kind:'advert',programming}).theme,'coral');
  assert.equal(artDirection({kind:'programme',programming,asset:'feature'}).theme,'nocturne');
  const chosen=artDirection({kind:'advert',presentation:{theme:'citrus',artwork:'moon-walking'}});
  assert.equal(chosen.theme,'citrus');assert.equal(chosen.image,'/artwork/moon-walking.jpg');
  assert.equal(artDirection({kind:'advert',presentation:{theme:'invalid',artwork:'__proto__'}}).image,'/artwork/radio-hat.jpg');
});
