(() => {
  if (window.top !== window) return;
  const ROOT_ID = "analise-forms-extension-root";
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <button id="afe-bubble" title="Novos envios do Forms" aria-label="Novos envios do Forms"><span>PNR</span><b id="afe-count">0</b></button>
    <section id="afe-panel" hidden aria-label="Avisos do Forms">
      <header><div><strong>Novo Forms</strong><small id="afe-summary">Nenhum aviso novo</small></div><button id="afe-close" title="Fechar">×</button></header>
      <div id="afe-list"><p>Os novos envios aparecerão aqui.</p></div>
      <div id="afe-settings" hidden>
        <strong>Configurações da bolinha</strong>
        <label><input id="afe-set-bubble" type="checkbox"> Botão flutuante</label>
        <label><input id="afe-set-window" type="checkbox"> Janela flutuante</label>
        <label><input id="afe-set-notify" type="checkbox"> Notificação do navegador</label>
        <small>A atualização do Forms continua manual.</small>
      </div>
      <footer><button id="afe-read">Marcar como lidos</button><button id="afe-config">⚙ Configurar</button></footer>
    </section>`;
  document.documentElement.appendChild(root);
  const style = document.createElement("style");
  style.textContent = `
    #${ROOT_ID}{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;font-family:Arial,sans-serif;color:#1d2b2a}
    #${ROOT_ID} *{box-sizing:border-box}
    #afe-bubble{position:relative;width:58px;height:58px;border:0;border-radius:50%;background:#c2410c;color:#fff;box-shadow:0 8px 24px #0005;cursor:pointer;font:900 17px Arial;letter-spacing:.02em}
    #afe-bubble:hover{transform:translateY(-2px)} #afe-bubble.has-new{animation:afe-pulse 1.6s infinite}
    #afe-count{position:absolute;right:-3px;top:-5px;min-width:23px;height:23px;padding:2px 5px;border:2px solid #fff;border-radius:999px;background:#d9463b;color:#fff;font:800 12px/15px Arial}
    #afe-count[hidden]{display:none}
    #afe-panel{position:absolute;right:0;bottom:70px;width:380px;height:360px;min-width:280px;min-height:210px;max-width:min(90vw,700px);max-height:85vh;resize:both;overflow:hidden;display:flex;flex-direction:column;background:#fffdf8;border:1px solid #ddd6c6;border-radius:14px;box-shadow:0 16px 48px #0005;color:#1d2b2a}
    #afe-panel[hidden]{display:none} #afe-panel header{display:flex;justify-content:space-between;gap:12px;padding:14px 15px 10px;border-bottom:1px solid #ddd6c6;flex:0 0 auto}
    #afe-panel header strong{display:block;font-size:16px} #afe-panel header small{display:block;color:#6b7573;font-size:12px;margin-top:2px}
    #afe-panel header button{border:0;background:transparent;font-size:21px;cursor:pointer;color:#6b7573}
    #afe-list{overflow:auto;padding:8px 10px;min-height:70px;flex:1} #afe-list p{margin:12px 5px;color:#6b7573;font-size:13px}
    .afe-item{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 7px;border-bottom:1px solid #eee8dc}
    .afe-item:last-child{border-bottom:0}.afe-item b{font:700 14px ui-monospace,Consolas,monospace}.afe-item small{display:block;color:#6b7573;font-size:11px;margin-top:2px}
    .afe-item button,#afe-panel footer button,#afe-settings button{padding:6px 9px;border:1px solid #ddd6c6;border-radius:7px;background:#fff;color:#1d2b2a;cursor:pointer;font-size:12px;white-space:nowrap}
    #afe-panel footer{display:flex;gap:7px;flex-wrap:wrap;padding:10px;border-top:1px solid #ddd6c6;flex:0 0 auto}
    #afe-settings{padding:12px;background:#f4f1ea;border-bottom:1px solid #ddd6c6;font-size:12px;flex:0 0 auto}
    #afe-settings strong{display:block;margin-bottom:7px;font-size:13px} #afe-settings label{display:block;margin:7px 0;cursor:pointer} #afe-settings input{margin-right:6px}
    #afe-settings small{display:block;color:#6b7573;margin-top:8px}
    .afe-detail{padding:8px}.afe-detail h3{margin:4px 0 12px;font-size:17px}.afe-detail p{margin:7px 0;color:#6b7573}.afe-detail b{color:#1d2b2a}.afe-detail button{margin-top:12px;padding:7px 10px;border:1px solid #ddd6c6;border-radius:7px;background:#fff;color:#1d2b2a;cursor:pointer}
    @keyframes afe-pulse{50%{box-shadow:0 8px 24px #0005,0 0 0 9px #d9463b24}}
    @media(max-width:560px){#${ROOT_ID}{right:12px;bottom:12px}#afe-panel{bottom:66px;width:min(380px,calc(100vw - 28px))}#afe-bubble{width:54px;height:54px}}
  `;
  document.documentElement.appendChild(style);

  const bubble = root.querySelector("#afe-bubble"), panel = root.querySelector("#afe-panel"), count = root.querySelector("#afe-count"), list = root.querySelector("#afe-list"), summary = root.querySelector("#afe-summary"), settingsBox = root.querySelector("#afe-settings");
  const setBubble = root.querySelector("#afe-set-bubble"), setWindow = root.querySelector("#afe-set-window"), setNotify = root.querySelector("#afe-set-notify");
  let items = [], settings = { bubble: true, window: true, browserNotification: true }, listMode = "items", selectedItem = null;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function render() {
    count.hidden = !items.length; count.textContent = items.length > 99 ? "99+" : items.length;
    bubble.classList.toggle("has-new", items.length > 0);
    summary.textContent = items.length ? `${items.length} envio${items.length === 1 ? "" : "s"} novo${items.length === 1 ? "" : "s"}` : "Nenhum aviso novo";
    if (listMode === "items") list.innerHTML = items.length ? items.map((x, i) => `<div class="afe-item"><div><b>${esc(x.id)}</b><small>${esc(x.time)} · ${esc(x.status)}</small></div><button data-view="${i}">Visualizar</button></div>`).join("") : "<p>Os novos envios aparecerão aqui.</p>";
  }
  function renderDetail(item) {
    selectedItem = item;
    listMode = "detail";
    list.innerHTML = `<div class="afe-detail"><h3>Novo envio recebido</h3><p><b>ID:</b> ${esc(item.id)}</p><p><b>Data:</b> ${esc(item.time)}</p><p><b>Status:</b> ${esc(item.status)}</p><p>Este aviso foi recebido quando você atualizou manualmente o Forms.</p><button data-back>← Voltar para os avisos</button><button data-open>↗ Abrir no Análise Forms</button></div>`;
  }
  function show(on) { if (on && !settings.window) return; panel.hidden = !on; bubble.setAttribute("aria-expanded", String(on)); }
  function applySettings() {
    root.hidden = !settings.bubble;
    panel.hidden = panel.hidden || !settings.window;
    setBubble.checked = settings.bubble; setWindow.checked = settings.window; setNotify.checked = settings.browserNotification;
  }
  function saveSettings() {
    settings = { bubble: setBubble.checked, window: setWindow.checked, browserNotification: setNotify.checked };
    chrome.runtime.sendMessage({ type: "set-settings", settings }); applySettings();
  }
  function load() { chrome.runtime.sendMessage({ type: "get-alerts" }, state => { if (!chrome.runtime.lastError && state) { items = state.items || []; settings = { ...settings, ...(state.settings || {}) }; render(); applySettings(); } }); }
  bubble.onclick = () => { listMode = "items"; render(); show(panel.hidden); };
  root.querySelector("#afe-close").onclick = () => show(false);
  root.querySelector("#afe-read").onclick = () => { items = []; listMode = "items"; render(); chrome.runtime.sendMessage({ type: "mark-read" }); };
  root.querySelector("#afe-config").onclick = () => { settingsBox.hidden = !settingsBox.hidden; };
  [setBubble, setWindow, setNotify].forEach(input => input.onchange = saveSettings);
  list.onclick = e => {
    const view = e.target.closest("[data-view]");
    if (view) { const item = items[Number(view.dataset.view)]; if (item) { renderDetail(item); show(true); } return; }
    if (e.target.closest("[data-back]")) { listMode = "items"; render(); return; }
    if (e.target.closest("[data-open]") && selectedItem) chrome.runtime.sendMessage({ type: "view-alert", id: selectedItem.id });
  };

  window.addEventListener("message", e => {
    if (e.source !== window || !e.data || e.data.source !== "analise-forms") return;
    if (e.data.type === "new-form-alerts") {
      chrome.runtime.sendMessage({ type: "new-form-alerts", items: e.data.items || [] }, response => { if (!chrome.runtime.lastError && response) { items = response.items || []; settings = { ...settings, ...(response.settings || {}) }; listMode = "items"; render(); applySettings(); } });
    }
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === "focus-alert") window.postMessage({ source: "analise-forms-extension", type: "focus-case", id: message.id }, "*");
    if (message.type === "settings-updated") { settings = { ...settings, ...(message.settings || {}) }; applySettings(); }
    if (message.type === "alerts-updated") { items = message.items || []; settings = { ...settings, ...(message.settings || {}) }; listMode = "items"; render(); applySettings(); }
  });
  window.postMessage({ source: "analise-forms-extension", type: "installed" }, "*");
  render(); load();
})();
