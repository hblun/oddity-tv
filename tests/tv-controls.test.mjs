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

test('next-clip preparation is bounded to the imminent boundary and respects data saver',async()=>{
  const {preloadCandidate,programmeProgress}=await import('../web/tv-controls.js');
  const current={id:'film',start:0,end:100},next={id:'ident',start:100,end:108};
  const guide={upcoming:[next]};
  assert.equal(preloadCandidate(guide,current,89),null);
  assert.equal(preloadCandidate(guide,current,90),next);
  assert.equal(preloadCandidate(guide,current,100),null);
  assert.equal(preloadCandidate(guide,current,95,{saveData:true}),null);
  assert.equal(preloadCandidate(guide,current,95,{effectiveType:'2g'}),null);
  assert.equal(preloadCandidate({upcoming:[{...next,start:110}]},current,95),null);
  assert.equal(preloadCandidate(guide,null,95),null);
  assert.equal(programmeProgress(current,25),.25);
  assert.equal(programmeProgress(current,200),1);
  assert.equal(programmeProgress(current,-10),0);
  assert.equal(programmeProgress({start:100,end:120,source_in:20,source_duration:40},110),.75);
});
