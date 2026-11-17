const DEFAULTS = { bubble: true, window: true, browserNotification: true };
const els = { notify: document.querySelector('#notify') };
chrome.runtime.sendMessage({ type: 'get-alerts' }, state => {
  const s = { ...DEFAULTS, ...((state && state.settings) || {}) };
  els.notify.checked = s.browserNotification;
});
function save() {
  const settings = { bubble: false, window: false, browserNotification: els.notify.checked };
  chrome.runtime.sendMessage({ type: 'set-settings', settings }, () => {
    document.querySelector('#status').textContent = 'Configuração salva.';
    setTimeout(() => document.querySelector('#status').textContent = '', 1400);
  });
}
Object.values(els).forEach(el => el.addEventListener('change', save));
