(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const KEY = "pnr_recebimentos";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const STATUS = ["A VALIDAR", "ANULADA", "EM REVISÃO", "PARA FATURAMENTO", "COMPROVANTE CARREGADO", "SEM RETORNO DO CLIENTE"];
  const VALIDADORES = ["— Sem validador —", "LUIZA FRANÇA", "KETHELLY OLIVEIRA", "EDUARDA CARVALHO", "VITÓRIA NASCIMENTO", "VITOR MENDES"];
  let rows = (() => { try { const x = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(x) ? x : []; } catch (e) { return []; } })();
  let editing = null, selected = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} };
  const setOptions = (el, values, blank = false) => { $(el).innerHTML = (blank ? '<option value="">— Selecione —</option>' : "") + values.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join(""); };
  setOptions("#rStatus", STATUS); setOptions("#rValidator", VALIDADORES);
  const cleanPhone = text => {
    const marked = String(text).match(/(?:telefone|celular|whatsapp|fone|número)[^\d]{0,15}(\+?\d[\d\s().-]{8,16}\d)/i);
    if (marked) return marked[1].trim();
    const candidates = String(text).match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[\s-]?\d{4}/g) || [];
    return candidates.find(x => x.replace(/\D/g, "").length >= 10) || "";
  };
  function parseMessage(text) {
    const raw = String(text || "").trim(), lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const idMatch = raw.match(/(?:ID|ID\s+DO\s+PACOTE|ID\s+DO\s+ENVIO)\s*[:#-]?\s*(\d{11})/i) || raw.match(/\b\d{11}\b/);
    const id = idMatch ? idMatch[1] || idMatch[0] : "";
    const nameLine = lines.find(x => /^prezado\s+cliente/i.test(x));
    const name = nameLine ? nameLine.replace(/^prezado\s+cliente\s*/i, "").trim() : "";
    const date = (raw.match(/(?:entregue|entrega)\s+(?:no dia|em)?\s*:?\s*([^\n.]+)/i) || [])[1]?.trim() || "";
    return { name, phone: cleanPhone(raw), id, date, raw };
  }
  function fillParsed() {
    const parsed = parseMessage($("#rMessage").value);
    $("#rName").value = parsed.name; $("#rPhone").value = parsed.phone; $("#rId").value = parsed.id;
    $("#rParseStatus").textContent = parsed.id ? `ID ${parsed.id} identificado${parsed.name ? ` · ${parsed.name}` : ""}${parsed.phone ? ` · ${parsed.phone}` : ""}. Complete os campos e salve.` : "Não encontrei um ID de 11 dígitos. Confira a mensagem colada.";
    if (parsed.id) $("#rBase").focus();
  }
  function clearForm() { editing = null; ["rName","rPhone","rId","rBase","rDriver"].forEach(id => $("#" + id).value = ""); $("#rStatus").value = "A VALIDAR"; $("#rValidator").value = ""; $("#rMessage").value = ""; $("#rParseStatus").textContent = ""; $("#rSave").textContent = "Salvar recebimento"; }
  function formData() {
    const old = editing ? rows.find(x => x.key === editing) || {} : {};
    return { ...old, id: $("#rId").value.replace(/\D/g, "").slice(0, 11), name: $("#rName").value.trim(), phone: $("#rPhone").value.trim(), base: $("#rBase").value.trim(), driver: $("#rDriver").value.trim(), status: $("#rStatus").value, validator: $("#rValidator").value, message: $("#rMessage").value.trim(), updatedAt: Date.now() };
  }
  function render() {
    const q = norm($("#rSearch").value), filtered = rows.filter(r => !q || norm([r.id,r.name,r.phone,r.base,r.driver,r.status,r.validator,r.chat,r.receivedText].join(" ")).includes(q));
    $("#rCount").textContent = `· ${filtered.length} de ${rows.length}`;
    $("#rTable").innerHTML = filtered.length ? `<table class="receb-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>ID</th><th>Status</th><th>Base</th><th>Motorista</th><th>Validador</th><th>Confirmação WhatsApp</th><th></th></tr></thead><tbody>${filtered.map(r => `<tr data-rid="${esc(r.key)}" class="${selected.has(r.key) ? "selected" : ""}"><td>${esc(r.name) || "—"}</td><td>${esc(r.phone) || "—"}</td><td><b>${esc(r.id) || "—"}</b></td><td><span class="receb-status" data-status="${esc(r.status)}">${esc(r.status)}</span></td><td>${esc(r.base) || "—"}</td><td>${esc(r.driver) || "—"}</td><td>${esc(r.validator) || "—"}</td><td title="${esc(r.chat || "")}">${esc(r.receivedText || "")}</td><td><button type="button" data-edit="${esc(r.key)}">Editar</button></td></tr>`).join("")}</tbody></table>` : '<div class="msg">Nenhum recebimento registrado.</div>';
  }
  $("#rParse").onclick = fillParsed; $("#rClearMessage").onclick = () => { $("#rMessage").value = ""; $("#rParseStatus").textContent = ""; };
  $("#rSave").onclick = () => { const r = formData(); if (r.id.length !== 11) { $("#rParseStatus").textContent = "Informe um ID válido com 11 dígitos."; return; } if (!r.name) { $("#rParseStatus").textContent = "Informe o nome do cliente."; return; } r.key = editing || `${r.id}-${Date.now()}`; const ix = rows.findIndex(x => x.key === r.key); if (ix >= 0) rows[ix] = r; else rows.unshift(r); save(); render(); clearForm(); };
  $("#rCancel").onclick = clearForm; $("#rSearch").oninput = render;
  $("#rTable").onclick = e => { const tr = e.target.closest("tr[data-rid]"); if (!tr) return; if (e.target.closest("[data-edit]")) { const r = rows.find(x => x.key === tr.dataset.rid); if (!r) return; editing = r.key; ["Name","Phone","Id","Base","Driver"].forEach(k => $("#r" + k).value = r[k.toLowerCase()] || ""); $("#rStatus").value = r.status; $("#rValidator").value = r.validator; $("#rMessage").value = r.message || r.receivedText || ""; $("#rSave").textContent = "Salvar alterações"; return; } if (e.ctrlKey || e.metaKey) { if (selected.has(tr.dataset.rid)) selected.delete(tr.dataset.rid); else selected.add(tr.dataset.rid); tr.classList.toggle("selected", selected.has(tr.dataset.rid)); } };
  const copySelected = async () => { const text = rows.filter(r => selected.has(r.key)).map(r => [r.name,r.phone,r.id,r.status,r.base,r.driver,r.validator,r.receivedText].join("\t")).join("\n"); if (!text) return; try { await navigator.clipboard.writeText(text); } catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); } };
  $("#rCopy").onclick = copySelected; document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected.size && !e.target.closest("input,textarea,select")) { e.preventDefault(); copySelected(); } });
  $("#rExport").onclick = () => { const head = ["NOME","TELEFONE","ID","STATUS","BASE","MOTORISTA","VALIDADOR","CONFIRMACAO_WHATSAPP"]; const csv = [head, ...rows.map(r => [r.name,r.phone,r.id,r.status,r.base,r.driver,r.validator,r.receivedText])].map(a => a.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = "Analise_Recebimento.csv"; a.click(); };
  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== "whatsapp-receipt-bridge" || event.data?.type !== "confirmation") return;
    const item = event.data.item || {}, waKey = String(item.key || `${item.chat}|${item.text}|${item.time}`);
    const id = String(item.id || "").replace(/\D/g, "").slice(0, 11), name = String(item.name || item.chat || "Cliente").trim();
    let record = rows.find(r => r.whatsappKey === waKey || (id && r.id === id));
    if (record) {
      record.whatsappKey = waKey; record.chat = item.chat || record.chat || ""; record.receivedText = item.text || record.receivedText || ""; record.receivedAt = item.receivedAt || Date.now();
      if (id) record.id = id; if (!record.name || record.name === "Cliente") record.name = name; if (!record.status) record.status = "A VALIDAR";
    } else {
      record = { key: `wa-${waKey}`, whatsappKey: waKey, source: "WhatsApp", id, name, phone: "", base: "", driver: "", status: "A VALIDAR", validator: "", message: item.text || "", receivedText: item.text || "", chat: item.chat || "", receivedAt: item.receivedAt || Date.now(), updatedAt: Date.now() };
      rows.unshift(record);
    }
    save(); render();
    const notice = $("#rWhatsAppNotice");
    if (notice) notice.textContent = `Confirmação recebida de ${record.name}${record.id ? ` · ID ${record.id}` : " · ID não identificado"}: “${record.receivedText}”`;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Confirmação recebida no WhatsApp", { body: `${record.name}${record.id ? ` · ID ${record.id}` : ""}: ${record.receivedText}`, tag: `wa-receipt-${waKey}` });
    window.postMessage({ source: "whatsapp-dashboard", type: "receipt-saved", key: waKey }, "*");
  });
  clearForm(); render();
})();
