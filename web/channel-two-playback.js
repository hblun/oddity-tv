// Adapted from cfinke/Channel-Two, channel-two.js play(path).
// Operator-authorised reuse; see THIRD_PARTY_NOTICES.md and vendor/channel-two/.
// jQuery/UI removed; seek uses the shared clock after metadata is available.
export function playScheduledFile(video, path, livePosition, onBlocked) {
  if (!/^\/media\/[a-zA-Z0-9_-]+\.mp4$/.test(path)) throw new Error('Invalid broadcast asset URL');
  video.pause();
  video.removeAttribute('src');
  video.replaceChildren();
  video.onloadedmetadata = () => {
    const target = livePosition();
    if (Number.isFinite(target)) {
      video.currentTime = Math.min(Math.max(0, target), Number.isFinite(video.duration) ? Math.max(0, video.duration - .05) : target);
    }
    video.play().catch(onBlocked);
  };
  video.src = path;
  video.load();
}
