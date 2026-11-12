const KEY = "analise_forms_alerts";
const SOURCE_KEY = "analise_forms_source";
const SETTINGS_KEY = "analise_forms_settings";
const DEFAULT_SETTINGS = { bubble: true, window: true, browserNotification: true };

async function injectIntoOpenWebTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(tab => {
    if (!tab.id || !/^https?:\/\//i.test(tab.url || "")) return Promise.resolve();
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
  }));
}

chrome.runtime.onInstalled.addListener(() => injectIntoOpenWebTabs());
chrome.runtime.onStartup.addListener(() => injectIntoOpenWebTabs());

async function readState() {
  const data = await chrome.storage.local.get([KEY, SOURCE_KEY, SETTINGS_KEY]);
  return {
    items: Array.isArray(data[KEY]) ? data[KEY] : [],
    source: data[SOURCE_KEY] || null,
    settings: { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) }
  };
}

async function focusSource(id) {
  const { source } = await readState();
  if (source && source.tabId != null) {
    try {
      await chrome.tabs.update(source.tabId, { active: true });
      await chrome.windows.update(source.windowId, { focused: true });
      await chrome.tabs.sendMessage(source.tabId, { type: "focus-alert", id });
      return;
    } catch (e) {}
  }
  if (source && source.url) await chrome.tabs.create({ url: source.url });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "get-alerts") {
      sendResponse(await readState());
      return;
    }
    if (message.type === "set-settings") {
      const settings = { ...DEFAULT_SETTINGS, ...(message.settings || {}) };
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: "settings-updated", settings }).catch(() => {})));
      sendResponse({ settings });
      return;
    }
    if (message.type === "new-form-alerts") {
      const old = await readState();
      const incoming = Array.isArray(message.items) ? message.items : [];
      const known = new Set(old.items.map(x => `${x.id}|${x.time}|${x.status}`));
      const fresh = incoming.filter(x => !known.has(`${x.id}|${x.time}|${x.status}`));
      const items = [...fresh.reverse(), ...old.items].slice(0, 40);
      const tab = sender.tab;
      await chrome.storage.local.set({
        [KEY]: items,
        [SOURCE_KEY]: tab ? { tabId: tab.id, windowId: tab.windowId, url: tab.url } : old.source
      });
      if (old.settings.browserNotification !== false) {
        for (const item of fresh) {
          try {
            await chrome.notifications.create(`forms-${Date.now()}-${item.id}`, {
              type: "basic", iconUrl: "icon.png", title: "Novo Forms recebido", message: `${item.id} · ${item.status}`
            });
          } catch (e) {}
        }
      }
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: "alerts-updated", items, settings: old.settings }).catch(() => {})));
      sendResponse({ items, fresh, settings: old.settings });
      return;
    }
    if (message.type === "mark-read") {
      await chrome.storage.local.set({ [KEY]: [] });
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "view-alert") {
      await focusSource(message.id);
      sendResponse({ ok: true });
    }
  })().catch(error => sendResponse({ error: String(error) }));
  return true;
});

chrome.notifications.onClicked.addListener(notificationId => {
  const id = notificationId.replace(/^forms-[^-]+-/, "");
  focusSource(id);
});
