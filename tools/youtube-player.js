const params = new URLSearchParams(window.location.search);
const videoId = params.get('v') || '';
const title = params.get('title') || 'YouTube';

document.title = `${title} • OWN-Focus`;

if (videoId) {
  const frame = document.getElementById('yt-player-frame');
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}
