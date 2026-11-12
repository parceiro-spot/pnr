const ids = ["floatingButton", "enabled", "browserNotification", "sound"];
const defaults = { floatingButton: true, enabled: true, browserNotification: true, sound: true, dashboardUrl: "" };
const fields = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
const dashboardUrl = document.getElementById("dashboardUrl"), status = document.getElementById("status");
function currentSettings() {
  return { floatingButton: fields.floatingButton.checked, enabled: fields.enabled.checked, browserNotification: fields.browserNotification.checked, sound: fields.sound.checked, dashboardUrl: dashboardUrl.value.trim() };
}
function loadSettings(s) {
  s = { ...defaults, ...(s || {}) };
  fields.floatingButton.checked = s.floatingButton;
  fields.enabled.checked = s.enabled;
  fields.browserNotification.checked = s.browserNotification;
  fields.sound.checked = s.sound;
  dashboardUrl.value = s.dashboardUrl || "";
}
chrome.runtime.sendMessage({ type: "get-settings" }, loadSettings);
function saveToggles() {
  chrome.runtime.sendMessage({ type: "set-settings", settings: currentSettings() }, () => {
    status.textContent = "Configuração salva.";
    setTimeout(() => { status.textContent = ""; }, 1500);
  });
}
Object.values(fields).forEach(el => el.addEventListener("change", saveToggles));
document.getElementById("saveDashboard").addEventListener("click", async () => {
  const settings = currentSettings();
  let originPattern = "";
  if (settings.dashboardUrl) {
    try {
      const u = new URL(settings.dashboardUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
      originPattern = `${u.origin}/*`;
    } catch (e) { status.textContent = "Informe uma URL http:// ou https:// válida."; return; }
  }
  let allowed = !originPattern;
  if (originPattern) {
    try { allowed = await chrome.permissions.request({ origins: [originPattern] }); }
    catch (e) { allowed = false; }
  }
  chrome.runtime.sendMessage({ type: "set-settings", settings }, () => {
    if (!settings.dashboardUrl) status.textContent = "Link removido. Configure uma URL para sincronizar na tabela.";
    else if (allowed) status.textContent = "Sincronização autorizada para este domínio. Confirmações novas serão salvas na Análise Recebimento.";
    else status.textContent = "Link salvo, mas sem permissão de acesso ao domínio. Autorize o acesso para sincronizar confirmações.";
  });
});
