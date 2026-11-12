const SETTINGS = "wa_recebimento_settings";
const QUEUE = "wa_recebimento_pending_sync";
const SEEN = "wa_recebimento_seen_keys";
const DEFAULTS = { enabled: true, browserNotification: true, sound: true, floatingButton: true, dashboardUrl: "" };
const seen = new Set();

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS);
  return { ...DEFAULTS, ...(data[SETTINGS] || {}) };
}
function hostPattern(value) {
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) ? `${u.origin}/*` : ""; }
  catch (e) { return ""; }
}
async function deliverOne(item) {
  const settings = await getSettings(), pattern = hostPattern(settings.dashboardUrl);
  if (!pattern) return false;
  try { if (!await chrome.permissions.contains({ origins: [pattern] })) return false; }
  catch (e) { return false; }
  const configured = new URL(settings.dashboardUrl), tabs = await chrome.tabs.query({});
  const targets = tabs.filter(tab => {
    try { const u = new URL(tab.url || ""); return u.origin === configured.origin && u.pathname === configured.pathname; }
    catch (e) { return false; }
  });
  for (const tab of targets) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dashboard-bridge.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "wa-receipt-confirmation", item });
      return true;
    } catch (e) {}
  }
  return false;
}
async function deliverQueue() {
  const data = await chrome.storage.local.get(QUEUE), queue = Array.isArray(data[QUEUE]) ? data[QUEUE] : [];
  for (const item of queue) await deliverOne(item);
}
async function queueReceipt(item) {
  const data = await chrome.storage.local.get(QUEUE), queue = Array.isArray(data[QUEUE]) ? data[QUEUE] : [];
  if (!queue.some(x => x.key === item.key)) queue.unshift(item);
  await chrome.storage.local.set({ [QUEUE]: queue.slice(0, 500) });
  await deliverOne(item);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") deliverQueue().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "get-settings") { sendResponse(await getSettings()); return; }
    if (message.type === "set-settings") {
      const current = await getSettings(), settings = { ...current, ...(message.settings || {}) };
      await chrome.storage.local.set({ [SETTINGS]: settings });
      const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
      await Promise.all(tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, { type: "settings-updated", settings }).catch(() => {}) : Promise.resolve()));
      await deliverQueue(); sendResponse(settings); return;
    }
    if (message.type === "open-receiving") {
      const settings = await getSettings(), configured = String(settings.dashboardUrl || "").trim();
      if (configured) {
        let u;
        try { u = new URL(configured); } catch (e) { sendResponse({ ok: false, message: "O link salvo do dashboard não é válido." }); return; }
        if (!/^https?:$/.test(u.protocol)) { sendResponse({ ok: false, message: "O link do dashboard precisa usar http:// ou https://." }); return; }
        u.searchParams.set("view", "recebimento"); u.searchParams.set("_open_recebimento", String(Date.now()));
        const tabs = await chrome.tabs.query({});
        const same = tabs.find(t => t.id && t.url && (() => { try { const x = new URL(t.url); return x.origin === u.origin && x.pathname === u.pathname; } catch (e) { return false; } })());
        if (same) { await chrome.tabs.update(same.id, { url: u.href, active: true }); if (same.windowId != null) await chrome.windows.update(same.windowId, { focused: true }); sendResponse({ ok: true }); return; }
        await chrome.tabs.create({ url: u.href, active: true }); sendResponse({ ok: true }); return;
      }
      const tabs = await chrome.tabs.query({});
      const dashboard = tabs.find(t => t.id && /^https?:/i.test(t.url || "") && !/web\.whatsapp\.com/i.test(t.url || "") && /an[aá]lise.*(pnr|forms)|pnr-main/i.test(`${t.title || ""} ${t.url || ""}`));
      if (!dashboard) { sendResponse({ ok: false, message: "Abra o dashboard Análise PNR uma vez ou configure o link no popup da extensão." }); return; }
      const u = new URL(dashboard.url); u.searchParams.set("view", "recebimento"); u.searchParams.set("_open_recebimento", String(Date.now()));
      await chrome.tabs.update(dashboard.id, { url: u.href, active: true });
      if (dashboard.windowId != null) await chrome.windows.update(dashboard.windowId, { focused: true });
      sendResponse({ ok: true }); return;
    }
    if (message.type === "received-confirmation") {
      const settings = await getSettings();
      if (!settings.enabled) { sendResponse({ ignored: true }); return; }
      const item = message.item || {}, key = String(item.key || `${item.chat}|${item.text}|${item.time}`);
      if (seen.has(key)) { sendResponse({ duplicate: true }); return; }
      const seenData = await chrome.storage.local.get(SEEN), savedKeys = Array.isArray(seenData[SEEN]) ? seenData[SEEN] : [];
      if (savedKeys.includes(key)) { seen.add(key); sendResponse({ duplicate: true }); return; }
      seen.add(key); if (seen.size > 1000) seen.delete(seen.values().next().value);
      const receipt = { ...item, key, receivedAt: item.receivedAt || Date.now() };
      await queueReceipt(receipt);
      await chrome.storage.local.set({ [SEEN]: [...savedKeys, key].slice(-2000) });
      if (settings.browserNotification) {
        try { await chrome.notifications.create(`wa-${Date.now()}`, { type: "basic", iconUrl: "icon.png", title: "Confirmação recebida no WhatsApp", message: `${receipt.name || receipt.chat || "Cliente"}${receipt.id ? ` · ID ${receipt.id}` : ""}: ${receipt.text || "Recebi"}` }); } catch (e) {}
      }
      sendResponse({ ok: true, settings }); return;
    }
    if (message.type === "receipt-saved") {
      const data = await chrome.storage.local.get(QUEUE), queue = Array.isArray(data[QUEUE]) ? data[QUEUE] : [];
      await chrome.storage.local.set({ [QUEUE]: queue.filter(x => x.key !== String(message.key || "")) });
      sendResponse({ ok: true }); return;
    }
  })().catch(error => sendResponse({ error: String(error) }));
  return true;
});
