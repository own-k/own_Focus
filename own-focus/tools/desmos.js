// tools/desmos.js
let desmosLoaded = false;

function initDesmos() {
  if (desmosLoaded) return;
  desmosLoaded = true;
  const container = document.getElementById('desmos-iframe-container');
  const iframe = document.createElement('iframe');
  iframe.src = 'https://www.desmos.com/calculator';
  iframe.title = 'Desmos Graphing Calculator';
  iframe.allow = 'fullscreen';
  Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none', background: '#fff' });
  container.appendChild(iframe);

  document.getElementById('desmos-popout').addEventListener('click', () => {
    chrome.windows.create({ url: 'https://www.desmos.com/calculator', type: 'popup', width: 900, height: 700 });
  });
}
