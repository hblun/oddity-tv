import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityMotion} from '../web/identity-motion.js';

function rig() {
  let change;
  const preference={matches:false,addEventListener(name,callback){change=callback;}};
  const animations=[];
  const element={animate(frames,options){
    let finish,reject;
    const finished=new Promise((resolve,fail)=>{finish=resolve;reject=fail;});
    const animation={frames,options,finished,cancelled:false,finish,cancel(){this.cancelled=true;reject(new Error('cancelled'));}};
    animations.push(animation);return animation;
  }};
  return {preference,element,animations,motion:createIdentityMotion(preference),change:()=>change()};
}

test('rapid programme changes cancel the previous wipe without cancelling its replacement',async()=>{
  const r=rig();
  const first=r.motion.play('wipe',r.element,'selection');
  const second=r.motion.play('wipe',r.element,'selection');
  assert.equal(first.cancelled,true);
  await Promise.resolve();
  assert.equal(second.cancelled,false);
  r.motion.stop('selection');
  assert.equal(second.cancelled,true);
});

test('reduced motion settles active gestures and presents subsequent states immediately',()=>{
  const r=rig();
  const aperture=r.motion.play('aperture',r.element,'tune');
  const wipe=r.motion.play('wipe',r.element,'selection');
  r.preference.matches=true;r.change();
  assert.equal(aperture.cancelled,true);assert.equal(wipe.cancelled,true);
  assert.equal(r.motion.play('wipe',r.element),undefined);
  assert.equal(r.animations.length,2);
});

test('gestures finish once, retain no fill and can be used without an animation API',async()=>{
  const r=rig();
  for (const gesture of ['aperture','wipe']) {
    const animation=r.motion.play(gesture,r.element);
    assert.equal(animation.options.iterations,1);
    assert.ok(animation.options.duration<=450);
    assert.equal(animation.options.fill,undefined);
    assert.equal(animation.frames.at(-1).clipPath,'inset(0 0 0 0)');
    animation.finish();await Promise.resolve();
    r.motion.stopAll();assert.equal(animation.cancelled,false);
  }
  assert.equal(r.motion.play('wipe',{}),undefined);
});
