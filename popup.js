const ids = ["floatingButton", "enabled", "browserNotification", "sound"];
const defaults = { floatingButton: true, enabled: true, browserNotification: true, sound: true };
const fields = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
chrome.runtime.sendMessage({ type: "get-settings" }, s => {
  s = { ...defaults, ...(s || {}) };
  fields.floatingButton.checked = s.floatingButton; fields.enabled.checked = s.enabled; fields.browserNotification.checked = s.browserNotification; fields.sound.checked = s.sound;
});
function save() {
  const settings = { floatingButton: fields.floatingButton.checked, enabled: fields.enabled.checked, browserNotification: fields.browserNotification.checked, sound: fields.sound.checked };
  chrome.runtime.sendMessage({ type: "set-settings", settings }, () => { document.getElementById("status").textContent = "Configuração salva."; setTimeout(() => document.getElementById("status").textContent = "", 1400); });
}
ids.forEach(id => fields[id].addEventListener("change", save));
