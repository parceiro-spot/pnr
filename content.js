(() => {
  const ROOT = "wa-recebimento-status";
  if (document.getElementById(ROOT)) return;

  const state = { settings: { enabled: true, browserNotification: true, sound: true }, started: Date.now() };
  const normalize = text => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const isConfirmation = text => {
    const s = normalize(text);
    if (!s || s.length > 240) return false;
    return /\b(eu\s+)?recebi\b/.test(s) || /\bproduto\s+(foi\s+)?recebido\b/.test(s) || /\bpedido\s+(foi\s+)?recebido\b/.test(s) || /\brecebimento\s+confirmado\b/.test(s);
  };
  const textFrom = node => [...node.querySelectorAll("span.selectable-text, span.copyable-text, [dir='auto']")].map(x => x.innerText || x.textContent || "").join(" ").replace(/\s+/g, " ").trim() || (node.innerText || "").trim();
  const chatName = node => {
    const header = document.querySelector("header [data-testid='conversation-info-header-chat-title'], header span[title]");
    return header?.getAttribute("title") || header?.textContent?.trim() || "Cliente";
  };
  function inspect(node, silent = false) {
    const message = node.closest("[data-pre-plain-text]") || node.closest(".message-in") || node;
    if (!message || message.matches(".message-out, [data-testid='msg-container'].message-out") || message.closest(".message-out")) return;
    const raw = message.getAttribute("data-pre-plain-text") || "";
    const time = raw.match(/\[(.*?)\]/)?.[1] || new Date().toISOString();
    const text = textFrom(message);
    if (!isConfirmation(text)) return;
    const key = `${message.getAttribute("data-id") || ""}|${text}|${time}`;
    if (message.dataset.waReceiptSeen === key) return;
    message.dataset.waReceiptSeen = key;
    if (silent) return;
    chrome.runtime.sendMessage({ type: "received-confirmation", item: { chat: chatName(message), text, time } }, response => {
      if (!response?.ok || !state.settings.sound) return;
      try { const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(), o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .18); o.onended = () => ctx.close(); } catch (e) {}
    });
  }
  const observer = new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(node => { if (node.nodeType === 1) { inspect(node); node.querySelectorAll?.("[data-pre-plain-text], .message-in").forEach(inspect); } })));
  observer.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll("[data-pre-plain-text], .message-in").forEach(node => inspect(node, true));

  const root = document.createElement("div"); root.id = ROOT;
  root.innerHTML = `<button id="wa-receipt-bubble" title="Configurações da captação de recebimentos" aria-label="RECEBIMENTO">RECEBIMENTO</button><section id="wa-receipt-panel" hidden><strong>Captação WhatsApp</strong><label><input id="wa-floating" type="checkbox"> Mostrar botão flutuante</label><label><input id="wa-enabled" type="checkbox"> Ativar avisos</label><label><input id="wa-notify" type="checkbox"> Notificação do navegador</label><label><input id="wa-sound" type="checkbox"> Som do aviso</label><small>Se ocultar este botão, reative-o pelo ícone da extensão no navegador.</small></section>`;
  const style = document.createElement("style"); style.textContent = `#${ROOT}{position:fixed;right:20px;bottom:90px;z-index:2147483647;font-family:Arial,sans-serif}#wa-receipt-bubble{min-width:142px;height:42px;padding:0 14px;border:0;border-radius:999px;background:#128c7e;color:#fff;font:800 12px Arial;letter-spacing:.04em;box-shadow:0 8px 24px #0005;cursor:pointer}#wa-receipt-bubble:hover{transform:translateY(-2px);background:#0d766b}#wa-receipt-panel{position:absolute;right:0;bottom:50px;width:270px;padding:13px;background:#f7fffd;border:1px solid #c7ded9;border-radius:12px;box-shadow:0 12px 32px #0004;color:#163b36;font:13px Arial}#wa-receipt-panel[hidden]{display:none}#wa-receipt-panel strong{display:block;margin-bottom:9px;font-size:14px}#wa-receipt-panel label{display:block;margin:9px 0;cursor:pointer}#wa-receipt-panel input{margin-right:7px;accent-color:#128c7e}#wa-receipt-panel small{display:block;margin-top:10px;color:#60736f;line-height:1.4}@media(max-width:560px){#${ROOT}{right:12px;bottom:78px}#wa-receipt-bubble{min-width:132px;height:40px}}`;
  document.documentElement.append(root, style);
  const bubble = root.querySelector("#wa-receipt-bubble"), panel = root.querySelector("#wa-receipt-panel");
  const controls = { floatingButton: root.querySelector("#wa-floating"), enabled: root.querySelector("#wa-enabled"), browserNotification: root.querySelector("#wa-notify"), sound: root.querySelector("#wa-sound") };
  bubble.onclick = () => { panel.hidden = !panel.hidden; };
  const showSettings = settings => {
    state.settings = { ...state.settings, ...(settings || {}) };
    root.hidden = state.settings.floatingButton === false;
    controls.floatingButton.checked = state.settings.floatingButton !== false;
    controls.enabled.checked = state.settings.enabled !== false;
    controls.browserNotification.checked = state.settings.browserNotification !== false;
    controls.sound.checked = state.settings.sound !== false;
  };
  chrome.runtime.sendMessage({ type: "get-settings" }, settings => { if (!chrome.runtime.lastError && settings) showSettings(settings); });
  Object.entries(controls).forEach(([key, input]) => input.onchange = () => {
    state.settings[key] = input.checked;
    chrome.runtime.sendMessage({ type: "set-settings", settings: state.settings }, response => {
      if (!chrome.runtime.lastError && response) showSettings(response);
    });
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "settings-updated") showSettings(message.settings || {});
  });
})();
