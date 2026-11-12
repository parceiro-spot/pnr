(() => {
  if (globalThis.__waRecebimentoDashboardBridge) return;
  globalThis.__waRecebimentoDashboardBridge = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "wa-receipt-confirmation") return;
    window.postMessage({ source: "whatsapp-receipt-bridge", type: "confirmation", item: message.item || {} }, "*");
    sendResponse({ ok: true });
  });
  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== "whatsapp-dashboard" || event.data?.type !== "receipt-saved") return;
    chrome.runtime.sendMessage({ type: "receipt-saved", key: event.data.key });
  });
})();
