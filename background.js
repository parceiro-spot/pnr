const SETTINGS = "wa_recebimento_settings";
const DEFAULTS = { enabled: true, browserNotification: true, sound: true, floatingButton: true };
const seen = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "get-settings") {
      const data = await chrome.storage.local.get(SETTINGS);
      sendResponse({ ...DEFAULTS, ...(data[SETTINGS] || {}) });
      return;
    }
    if (message.type === "set-settings") {
      const settings = { ...DEFAULTS, ...(message.settings || {}) };
      await chrome.storage.local.set({ [SETTINGS]: settings });
      const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
      await Promise.all(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, { type: "settings-updated", settings }).catch(() => {}) : Promise.resolve()));
      sendResponse(settings);
      return;
    }
    if (message.type === "received-confirmation") {
      const data = await chrome.storage.local.get(SETTINGS);
      const settings = { ...DEFAULTS, ...(data[SETTINGS] || {}) };
      if (!settings.enabled) return sendResponse({ ignored: true });
      const item = message.item || {};
      const key = `${item.chat}|${item.text}|${item.time}`;
      if (seen.has(key)) return sendResponse({ duplicate: true });
      seen.add(key);
      if (seen.size > 500) seen.delete(seen.values().next().value);
      if (settings.browserNotification) {
        try {
          await chrome.notifications.create(`wa-${Date.now()}`, {
            type: "basic", iconUrl: "icon.png", title: "Confirmação recebida no WhatsApp", message: `${item.chat || "Cliente"}: ${item.text || "Recebi"}`
          });
        } catch (e) {}
      }
      sendResponse({ ok: true, settings });
    }
  })().catch(error => sendResponse({ error: String(error) }));
  return true;
});
