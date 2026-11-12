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
  window.postMessage({ source: "analise-forms", type: "set-extension-settings", settings: { bubble: settings.formsButton, window: settings.formsWindow } }, "*");
  const requestedView = new URLSearchParams(location.search).get("view");
  if (requestedView === "recebimento") document.querySelector('#nav button[data-v="viewRecebimento"]')?.click();
})();
