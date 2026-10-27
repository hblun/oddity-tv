// Three identity behaviours: acquire, wipe, and factual clock-driven progress.
// Clock movement is set from broadcast time by the player/guide, never looped.
export const MOTION = Object.freeze({
  aperture: {duration: 420, frames: [{clipPath:'inset(48% 8% 48% 8%)'}, {clipPath:'inset(0 0 0 0)'}]},
  wipe: {duration: 280, frames: [{clipPath:'inset(0 100% 0 0)'}, {clipPath:'inset(0 0 0 0)'}]}
});

export function createIdentityMotion(preference) {
  const active = new Map();
  function stop(key) {active.get(key)?.cancel();active.delete(key);}
  function stopAll() {for (const key of active.keys()) stop(key);}
  preference.addEventListener('change',()=>{if (preference.matches) stopAll();});
  return {
    stop, stopAll,
    play(gesture, element, key=element) {
      stop(key);
      if (preference.matches || !element?.animate) return;
      const rule=MOTION[gesture];
      if (!rule) return;
      const animation=element.animate(rule.frames,{duration:rule.duration,easing:'cubic-bezier(.2,.7,.2,1)',iterations:1});
      active.set(key,animation);
      // No persistent fill or style: the underlying final layout takes over.
      animation.finished.then(()=>{if (active.get(key)===animation) active.delete(key);},()=>{});
      return animation;
    }
  };
}
