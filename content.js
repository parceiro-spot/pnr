(() => {
  const ROOT = "wa-recebimento-status";
  if (document.getElementById(ROOT)) return;

  const state = { settings: { enabled: true, browserNotification: true, sound: true, floatingButton: true, dashboardUrl: "" }, started: Date.now() };
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
  const messageTime = node => {
    const message = node.closest("[data-pre-plain-text]") || node.closest(".message-in, .message-out") || node;
    const datetime = message.querySelector("time[datetime]")?.getAttribute("datetime");
    if (datetime && !Number.isNaN(Date.parse(datetime))) return Date.parse(datetime);
    const raw = message.getAttribute("data-pre-plain-text") || "";
    const m = raw.match(/\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
    if (!m) return 0;
    const d = new Date(+m[5], +m[4] - 1, +m[3], +m[1], +m[2]).getTime();
    return Number.isNaN(d) ? 0 : d;
  };
  const conversationContext = () => {
    const nodes = [...document.querySelectorAll("#main [data-pre-plain-text], #main .message-out")];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i], wrapper = node.closest("[data-pre-plain-text]") || node;
      if (!wrapper.closest(".message-out") && !wrapper.matches(".message-out")) continue;
      const body = textFrom(wrapper), id = body.match(/(?:ID(?:\s+DO\s+(?:PACOTE|ENVIO))?\s*[:#-]?\s*)?(\d{11})/i)?.[1];
      if (!id) continue;
      const name = body.match(/prezado\s+cliente\s+([^\n.!]+)/i)?.[1]?.trim() || chatName(wrapper);
      return { id, name };
    }
    return { id: "", name: chatName(document.body) };
  };
  function inspect(node, silent = false) {
    const message = node.closest("[data-pre-plain-text]") || node.closest(".message-in") || node;
    if (!message || message.matches(".message-out, [data-testid='msg-container'].message-out") || message.closest(".message-out")) return;
    const raw = message.getAttribute("data-pre-plain-text") || "";
    const time = raw.match(/\[(.*?)\]/)?.[1] || new Date().toISOString();
    const text = textFrom(message);
    if (!isConfirmation(text)) return;
    const key = `${message.getAttribute("data-id") || ""}|${chatName(message)}|${text}|${time}`;
    if (message.dataset.waReceiptSeen === key) return;
    message.dataset.waReceiptSeen = key;
    if (silent) return;
    const context = conversationContext();
    chrome.runtime.sendMessage({ type: "received-confirmation", item: { key, chat: chatName(message), name: context.name, id: context.id, text, time, receivedAt: messageTime(message) || Date.now() } }, response => {
      if (!response?.ok || !state.settings.sound) return;
      try { const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(), o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .18); o.onended = () => ctx.close(); } catch (e) {}
    });
  }
  const inspectAdded = node => {
    if (node.nodeType !== 1) return;
    const closestMessage = node.closest("[data-pre-plain-text], .message-in");
    if (closestMessage) { inspect(closestMessage); return; }
    const found = node.querySelectorAll?.("[data-pre-plain-text]");
    if (found?.length) found.forEach(inspect);
    else node.querySelectorAll?.(".message-in").forEach(inspect);
  };
  const observer = new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(inspectAdded)));
  observer.observe(document.body, { childList: true, subtree: true });
  const initialMessages = document.querySelectorAll("[data-pre-plain-text]");
  const initialNodes = initialMessages.length ? initialMessages : document.querySelectorAll(".message-in");
  initialNodes.forEach(node => {
    const happenedAt = messageTime(node), age = Date.now() - happenedAt;
    // Ao recarregar a extensão, permite recuperar uma confirmação bem recente, mas não reprocessa o histórico antigo.
    inspect(node, !(happenedAt && age >= 0 && age <= 20 * 60 * 1000));
  });

  const root = document.createElement("div"); root.id = ROOT;
  root.innerHTML = `<button id="wa-receipt-bubble" title="Abrir a aba Análise Recebimento" aria-label="RECEBIMENTO">RECEBIMENTO</button><button id="wa-receipt-gear" title="Configurar RECEBIMENTO">⚙</button><section id="wa-receipt-panel" hidden><strong>Configurações de Recebimento</strong><label>Link do dashboard<input id="wa-dashboard-url" type="url" placeholder="https://seu-dashboard/" autocomplete="url"></label><button id="wa-save-url" type="button">Salvar link</button><label><input id="wa-floating" type="checkbox"> Mostrar botão flutuante</label><label><input id="wa-enabled" type="checkbox"> Ativar captação/avisos</label><label><input id="wa-notify" type="checkbox"> Notificação do navegador</label><label><input id="wa-sound" type="checkbox"> Som do aviso</label><small id="wa-status">Para gravar as confirmações na tabela, salve o link e autorize o domínio no popup da extensão.</small></section>`;
  const style = document.createElement("style");
  style.textContent = `#${ROOT}{position:fixed;right:20px;bottom:90px;z-index:2147483647;font-family:Arial,sans-serif;display:flex;align-items:center;gap:5px}#wa-receipt-bubble{min-width:142px;height:42px;padding:0 14px;border:0;border-radius:999px;background:#128c7e;color:#fff;font:800 12px Arial;letter-spacing:.04em;box-shadow:0 8px 24px #0005;cursor:pointer}#wa-receipt-bubble:hover{transform:translateY(-2px);background:#0d766b}#wa-receipt-gear{width:32px;height:32px;border:0;border-radius:50%;background:#fff;color:#128c7e;box-shadow:0 3px 10px #0003;cursor:pointer}#wa-receipt-panel{position:absolute;right:0;bottom:50px;width:290px;padding:13px;background:#f7fffd;border:1px solid #c7ded9;border-radius:12px;box-shadow:0 12px 32px #0004;color:#163b36;font:13px Arial}#wa-receipt-panel[hidden]{display:none}#wa-receipt-panel strong{display:block;margin-bottom:9px;font-size:14px}#wa-receipt-panel label{display:block;margin:9px 0;cursor:pointer}#wa-receipt-panel input[type=checkbox]{margin-right:7px;accent-color:#128c7e}#wa-dashboard-url{display:block;width:100%;margin-top:5px;padding:7px;border:1px solid #c7ded9;border-radius:6px;box-sizing:border-box}#wa-save-url{padding:6px 9px;border:1px solid #c7ded9;border-radius:6px;background:white;color:#163b36;cursor:pointer}#wa-receipt-panel small{display:block;margin-top:10px;color:#60736f;line-height:1.4}@media(max-width:560px){#${ROOT}{right:12px;bottom:78px}#wa-receipt-bubble{min-width:132px;height:40px}}`;
  document.documentElement.append(root, style);

  const bubble = root.querySelector("#wa-receipt-bubble"), gear = root.querySelector("#wa-receipt-gear"), panel = root.querySelector("#wa-receipt-panel"), status = root.querySelector("#wa-status"), urlInput = root.querySelector("#wa-dashboard-url");
  const controls = { floatingButton: root.querySelector("#wa-floating"), enabled: root.querySelector("#wa-enabled"), browserNotification: root.querySelector("#wa-notify"), sound: root.querySelector("#wa-sound") };
  bubble.onclick = () => chrome.runtime.sendMessage({ type: "open-receiving" }, response => {
    if (chrome.runtime.lastError) { panel.hidden = false; status.textContent = "Não consegui abrir o dashboard. Verifique o link salvo."; return; }
    if (!response?.ok) { panel.hidden = false; status.textContent = response?.message || "Configure o link do dashboard."; }
  });
  gear.onclick = () => { panel.hidden = !panel.hidden; };
  const showSettings = settings => {
    state.settings = { ...state.settings, ...(settings || {}) };
    root.hidden = state.settings.floatingButton === false;
    controls.floatingButton.checked = state.settings.floatingButton !== false;
    controls.enabled.checked = state.settings.enabled !== false;
    controls.browserNotification.checked = state.settings.browserNotification !== false;
    controls.sound.checked = state.settings.sound !== false;
    urlInput.value = state.settings.dashboardUrl || "";
  };
  chrome.runtime.sendMessage({ type: "get-settings" }, settings => { if (!chrome.runtime.lastError && settings) showSettings(settings); });
  Object.entries(controls).forEach(([key, input]) => input.onchange = () => {
    state.settings[key] = input.checked;
    chrome.runtime.sendMessage({ type: "set-settings", settings: state.settings }, response => { if (!chrome.runtime.lastError && response) showSettings(response); });
  });
  root.querySelector("#wa-save-url").onclick = () => {
    const raw = urlInput.value.trim();
    if (raw) { try { const u = new URL(raw); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch (e) { status.textContent = "Informe um link http:// ou https:// válido."; return; } }
    state.settings.dashboardUrl = raw;
    chrome.runtime.sendMessage({ type: "set-settings", settings: state.settings }, response => {
      if (!chrome.runtime.lastError && response) {
        showSettings(response);
        status.textContent = raw ? "Link salvo. Clique em RECEBIMENTO para abrir a aba." : "Link removido; será detectada uma aba Análise PNR já aberta.";
      }
    });
  };
  chrome.runtime.onMessage.addListener(message => { if (message?.type === "settings-updated") showSettings(message.settings || {}); });
})();
