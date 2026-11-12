(() => {
  "use strict";
  const KEY = "pnr_floating_settings";
  const DEFAULTS = { formsButton: true, formsWindow: true, receiptButton: true };
  const read = () => {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; }
    catch (e) { return { ...DEFAULTS }; }
  };
  let settings = read();
  const checks = [...document.querySelectorAll("[data-float-setting]")];
  const widget = document.getElementById("formsAlertWidget");
  const panel = document.getElementById("formsAlertPanel");
  const bubble = document.getElementById("formsAlertBubble");
  const receipt = document.getElementById("recebimentoFloat");

  function apply() {
    checks.forEach(input => { input.checked = !!settings[input.dataset.floatSetting]; });
    const extensionOwnsPnr = widget?.dataset.extensionActive === "true";
    if (widget) widget.hidden = !settings.formsButton || extensionOwnsPnr;
    if (receipt) receipt.hidden = !settings.receiptButton;
    if (panel && bubble) {
      if (!settings.formsWindow) panel.hidden = true;
      bubble.disabled = !settings.formsWindow;
      bubble.title = settings.formsWindow ? "Abrir avisos e fila A VALIDAR" : "Janela desativada — reative em Configurações dos botões flutuantes";
      bubble.setAttribute("aria-disabled", String(!settings.formsWindow));
      bubble.setAttribute("aria-expanded", String(!panel.hidden));
    }
  }
  function save() {
    settings = { ...settings };
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
    apply();
    // Mantém as preferências espelhadas na extensão PNR, caso esteja instalada.
    window.postMessage({ source: "analise-forms", type: "set-extension-settings", settings: { bubble: settings.formsButton, window: settings.formsWindow } }, "*");
  }
  checks.forEach(input => input.addEventListener("change", () => {
    settings[input.dataset.floatSetting] = input.checked;
    save();
  }));
  if (bubble && panel) bubble.onclick = () => {
    if (!settings.formsWindow) return;
    panel.hidden = !panel.hidden;
    bubble.setAttribute("aria-expanded", String(!panel.hidden));
  };
  if (receipt) receipt.onclick = () => document.querySelector('#nav button[data-v="viewRecebimento"]')?.click();
  window.addEventListener("message", event => {
    if (event.source !== window || !event.data || event.data.source !== "analise-forms-extension") return;
    if (event.data.type === "installed") {
      apply();
      window.postMessage({ source: "analise-forms", type: "set-extension-settings", settings: { bubble: settings.formsButton, window: settings.formsWindow } }, "*");
      return;
    }
    if (event.data.type !== "settings-updated") return;
    const remote = event.data.settings || {};
    if (typeof remote.bubble === "boolean") settings.formsButton = remote.bubble;
    if (typeof remote.window === "boolean") settings.formsWindow = remote.window;
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
    apply();
  });
  apply();
  // Permite arrastar as duas bolhas; as coordenadas ficam salvas neste navegador.
  const POS_KEY = "pnr_floating_positions";
  let positions = {};
  try { positions = JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch (e) {}
  const movers = [[bubble, "forms"], [receipt, "receipt"]];
  movers.forEach(([el, key]) => {
    if (!el) return;
    const pos = positions[key];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      el.style.left = `${Math.max(0, Math.min(innerWidth - el.offsetWidth, pos.x))}px`;
      el.style.top = `${Math.max(0, Math.min(innerHeight - el.offsetHeight, pos.y))}px`;
      el.style.right = "auto"; el.style.bottom = "auto";
    }
    let start = null, moved = false;
    el.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const r = el.getBoundingClientRect(); start = { x:e.clientX, y:e.clientY, left:r.left, top:r.top };
      moved = false; el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", e => {
      if (!start) return;
      const dx=e.clientX-start.x, dy=e.clientY-start.y;
      if (Math.abs(dx)+Math.abs(dy)>5) moved=true;
      if (!moved) return;
      const x=Math.max(0,Math.min(innerWidth-el.offsetWidth,start.left+dx));
      const y=Math.max(0,Math.min(innerHeight-el.offsetHeight,start.top+dy));
      el.style.left=`${x}px`; el.style.top=`${y}px`; el.style.right="auto"; el.style.bottom="auto";
    });
    el.addEventListener("pointerup", () => {
      if (start && moved) { const r=el.getBoundingClientRect(); positions[key]={x:r.left,y:r.top}; try { localStorage.setItem(POS_KEY,JSON.stringify(positions)); } catch(e) {} }
      start=null;
    });
    el.addEventListener("click", e => { if (moved) { e.preventDefault(); e.stopImmediatePropagation(); moved=false; } }, true);
  });
  window.addEventListener("resize", () => movers.forEach(([el,key]) => {
    if (!el || !positions[key]) return;
    const r=el.getBoundingClientRect(), x=Math.max(0,Math.min(innerWidth-el.offsetWidth,r.left)), y=Math.max(0,Math.min(innerHeight-el.offsetHeight,r.top));
    el.style.left=`${x}px`; el.style.top=`${y}px`; positions[key]={x,y};
  }));
  window.postMessage({ source: "analise-forms", type: "set-extension-settings", settings: { bubble: settings.formsButton, window: settings.formsWindow } }, "*");
  const requestedView = new URLSearchParams(location.search).get("view");
  if (requestedView === "recebimento") document.querySelector('#nav button[data-v="viewRecebimento"]')?.click();
})();
