(() => {
  if (window.top !== window) return;
  const ROOT_ID = "analise-forms-extension-root";
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <button id="afe-bubble" title="Novos envios do Forms" aria-label="Novos envios do Forms"><span>PNR</span><b id="afe-count">0</b></button>
    <section id="afe-panel" hidden aria-label="Avisos do Forms">
      <header><div><strong>Novos A validar</strong><small id="afe-summary">Nenhum pacote novo</small></div><button id="afe-close" title="Fechar">×</button></header>
      <div id="afe-list"><p>Os novos envios aparecerão aqui.</p></div>
      <div id="afe-settings" hidden>
        <strong>Configurações da bolinha</strong>
        <label><input id="afe-set-bubble" type="checkbox"> Botão flutuante</label>
        <label><input id="afe-set-window" type="checkbox"> Janela flutuante</label>
        <label><input id="afe-set-notify" type="checkbox"> Notificação do navegador</label>
        <small>A atualização do Forms continua manual.</small>
      </div>
      <footer><button id="afe-refresh">↻ Atualizar</button><button id="afe-copy">⧉ Copiar selecionados</button><button id="afe-read">Marcar como lidos</button><button id="afe-config">⚙ Configurar</button></footer>
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
    .afe-new-box{margin:2px 0 6px;padding:9px 8px;border-radius:8px;background:#fff1d6;border:1px solid #f0c670;color:#7a5700}.afe-new-box b{display:block;font-size:12px}.afe-new-box small{font-size:11px;color:#9a5b00}
    .afe-item{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 7px;border-bottom:1px solid #eee8dc;cursor:pointer}.afe-item.afe-selected{background:#d8f1df;box-shadow:inset 3px 0 #0e6b5c}
    .afe-item:last-child{border-bottom:0}.afe-item b{font:700 14px ui-monospace,Consolas,monospace}.afe-item small{display:block;color:#6b7573;font-size:11px;margin-top:2px}
    .afe-item button,#afe-panel footer button,#afe-settings button{padding:6px 9px;border:1px solid #ddd6c6;border-radius:7px;background:#fff;color:#1d2b2a;cursor:pointer;font-size:12px;white-space:nowrap}
    #afe-panel footer{display:flex;gap:7px;flex-wrap:wrap;padding:10px;border-top:1px solid #ddd6c6;flex:0 0 auto}
    #afe-settings{padding:12px;background:#f4f1ea;border-bottom:1px solid #ddd6c6;font-size:12px;flex:0 0 auto}
    #afe-settings strong{display:block;margin-bottom:7px;font-size:13px} #afe-settings label{display:block;margin:7px 0;cursor:pointer} #afe-settings input{margin-right:6px}
    #afe-settings small{display:block;color:#6b7573;margin-top:8px}
    .afe-detail{padding:8px}.afe-detail h3{margin:4px 0 12px;font-size:17px}.afe-detail p{margin:7px 0;color:#6b7573}.afe-detail b{color:#1d2b2a}.afe-detail button{margin-top:12px;padding:7px 10px;border:1px solid #ddd6c6;border-radius:7px;background:#fff;color:#1d2b2a;cursor:pointer}
    .afe-photo{display:inline-block;margin:3px;padding:5px 8px;border:1px solid #ddd6c6;border-radius:7px;color:#0e6b5c;text-decoration:none;background:#fff}
    @keyframes afe-pulse{50%{box-shadow:0 8px 24px #0005,0 0 0 9px #d9463b24}}
    @media(max-width:560px){#${ROOT_ID}{right:12px;bottom:12px}#afe-panel{bottom:66px;width:min(380px,calc(100vw - 28px))}#afe-bubble{width:54px;height:54px}}
  `;
  document.documentElement.appendChild(style);

  const bubble = root.querySelector("#afe-bubble"), panel = root.querySelector("#afe-panel"), count = root.querySelector("#afe-count"), list = root.querySelector("#afe-list"), summary = root.querySelector("#afe-summary"), settingsBox = root.querySelector("#afe-settings");
  const setBubble = root.querySelector("#afe-set-bubble"), setWindow = root.querySelector("#afe-set-window"), setNotify = root.querySelector("#afe-set-notify");
  let items = [], settings = { bubble: true, window: true, browserNotification: true }, listMode = "items", selectedItem = null, selectedIds = new Set();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function render() {
    count.hidden = !items.length; count.textContent = items.length > 99 ? "99+" : items.length;
    bubble.classList.toggle("has-new", items.length > 0);
    summary.textContent = items.length ? `${items.length} pacote${items.length === 1 ? "" : "s"} novo${items.length === 1 ? "" : "s"}` : "Nenhum pacote novo";
    if (listMode === "items") list.innerHTML = items.length ? `<div class="afe-new-box"><b>📥 Novos pacotes A validar</b><small>Ctrl+clique para selecionar · Ctrl+C para copiar</small></div>${items.map((x, i) => `<div class="afe-item${selectedIds.has(x.id) ? " afe-selected" : ""}" data-id="${esc(x.id)}"><div><b>${esc(x.id)}</b><small>${esc(x.time)} · A validar</small></div><span>${x.photos?.length ? `<button data-photo="${i}">📷 Foto</button>` : ""}<button data-view="${i}">Visualizar</button></span></div>`).join("")}` : "<p>A caixa de novos A validar está vazia.</p>";
  }
  function renderDetail(item) {
    selectedItem = item;
    listMode = "detail";
    const photos = Array.isArray(item.photos) ? item.photos : [];
    list.innerHTML = `<div class="afe-detail"><h3>Novo pacote A validar</h3><p><b>ID:</b> ${esc(item.id)}</p><p><b>Data:</b> ${esc(item.time)}</p><p><b>Status:</b> A validar</p><p>Este aviso foi recebido quando você atualizou manualmente o Forms.</p>${photos.length ? `<p><b>Evidência:</b> ${photos.map((url, i) => `<a class="afe-photo" href="${esc(url)}" target="_blank" rel="noopener">📷 Ver foto${photos.length > 1 ? ` ${i + 1}` : ""}</a>`).join(" ")}</p>` : "<p>Sem foto vinculada nesta resposta.</p>"}<button data-back>← Voltar para os avisos</button><button data-open>↗ Abrir no Análise Forms</button></div>`;
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
  root.querySelector("#afe-refresh").onclick = () => {
    const button = root.querySelector("#afe-refresh"); button.disabled = true; button.textContent = "Consultando…";
    chrome.runtime.sendMessage({ type: "refresh-forms" }, response => { button.disabled = false; button.textContent = "↻ Atualizar"; if (response && response.message) { summary.textContent = response.message; setTimeout(render, 3000); } });
  };
  root.querySelector("#afe-copy").onclick = () => copySelected();
  root.querySelector("#afe-config").onclick = () => { settingsBox.hidden = !settingsBox.hidden; };
  [setBubble, setWindow, setNotify].forEach(input => input.onchange = saveSettings);
  list.onclick = e => {
    const view = e.target.closest("[data-view]");
    const row = e.target.closest(".afe-item");
    if (row && (e.ctrlKey || e.metaKey) && !e.target.closest("button")) { const id = row.dataset.id; if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); render(); return; }
    const photo = e.target.closest("[data-photo]");
    if (photo) { const item = items[Number(photo.dataset.photo)]; if (item?.photos?.[0]) window.open(item.photos[0], "_blank", "noopener"); return; }
    if (view) { const item = items[Number(view.dataset.view)]; if (item) { renderDetail(item); show(true); } return; }
    if (e.target.closest("[data-back]")) { listMode = "items"; render(); return; }
    if (e.target.closest("[data-open]") && selectedItem) chrome.runtime.sendMessage({ type: "view-alert", id: selectedItem.id });
  };
  async function copySelected() {
    const text = items.filter(x => selectedIds.has(x.id)).map(x => x.id).join("\n");
    if (!text) { summary.textContent = "Selecione com Ctrl+clique primeiro"; setTimeout(render, 2200); return; }
    try { await navigator.clipboard.writeText(text); } catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    summary.textContent = `${selectedIds.size} ID${selectedIds.size === 1 ? "" : "s"} copiado${selectedIds.size === 1 ? "" : "s"}`;
    setTimeout(render, 2200);
  }
  window.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedIds.size && !e.target.closest("input,textarea")) { e.preventDefault(); copySelected(); } });

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
    if (message.type === "refresh-forms") window.postMessage({ source: "analise-forms-extension", type: "refresh-forms" }, "*");
  });
  window.postMessage({ source: "analise-forms-extension", type: "installed" }, "*");
  render(); load();
})();
