import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewingSession,chooseCaption,safePreferences,readPreferences} from '../web/tv-controls.js';

test('local pause prevents automatic playout changes until an explicit live resume',()=>{
  const session=new ViewingSession(), film={id:'film'}, advert={id:'advert'};
  assert.equal(session.shouldLoad(film),false);
  session.tune(); assert.equal(session.shouldLoad(film),true);
  session.loaded(film); assert.equal(session.shouldLoad(film),false);
  session.pause();
  assert.equal(session.running,false);
  assert.equal(session.shouldLoad(advert),false);
  assert.equal(session.shouldLoad({id:'next-day'}),false);
  session.tune();
  assert.equal(session.paused,false);
  assert.equal(session.shouldLoad(advert),true);
});

test('subtitle choice follows language preference across programme and advert changes',()=>{
  const tracks=[{id:'fr',language:'fr',default:true},{id:'en',language:'en'},{id:'en-sdh',language:'en-GB'}];
  assert.equal(chooseCaption(tracks,'en-GB').id,'en-sdh');
  assert.equal(chooseCaption(tracks,'en-US').id,'en');
  assert.equal(chooseCaption(tracks,'en','fr').id,'fr');
  assert.equal(chooseCaption(tracks,'de').id,'fr');
  assert.equal(chooseCaption([],'en'),null);
  assert.equal(chooseCaption([{id:'new-english',language:'en'}],'en','old-track').id,'new-english');
});

test('preferences tolerate malformed or blocked storage and validate control values',()=>{
  assert.equal(readPreferences({getItem(){throw new Error('blocked');}}).volume,.7);
  assert.equal(readPreferences({getItem(){return 'invalid json';}}).muted,true);
  const p=safePreferences({volume:999,picture:'not-an-option',captionSize:'huge',language:'<script>',crt:'yes',paused:true});
  assert.equal(p.volume,1); assert.equal(p.picture,'fit'); assert.equal(p.captionSize,'normal');
  assert.equal(p.language,'en'); assert.equal(p.crt,false); assert.equal('paused' in p,false);
  assert.equal(safePreferences({language:'es-419'}).language,'es-419');
});
