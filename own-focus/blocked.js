const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'guided';
const blockedUrl = params.get('url') || '';

document.getElementById('blocked-kicker').textContent = mode === 'total' ? 'Total Block' : 'Focus Mode';
document.getElementById('blocked-copy').textContent = blockedUrl
  ? `This page is blocked during your focus session: ${blockedUrl}`
  : 'This page is blocked during your focus session.';

document.getElementById('blocked-return-btn')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LOCK_IN_RETURN' });
});
