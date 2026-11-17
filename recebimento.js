(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const KEY = "pnr_recebimentos";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const STATUS = ["A VALIDAR", "ANULADA", "EM REVISÃO", "PARA FATURAMENTO", "COMPROVANTE CARREGADO", "SEM RETORNO DO CLIENTE"];
  const VAL_KEY = "pnr_recebimento_validadores";
  const VAL_DEFAULT = ["LUIZA FRANÇA", "KETHELLY OLIVEIRA", "EDUARDA CARVALHO", "VITÓRIA NASCIMENTO"];
  let VALIDADORES = (() => { try { const x = JSON.parse(localStorage.getItem(VAL_KEY) || "null"); return Array.isArray(x) ? x.filter(v => typeof v === "string" && v.trim()) : VAL_DEFAULT.slice(); } catch (e) { return VAL_DEFAULT.slice(); } })();
  const saveValidators = () => { try { localStorage.setItem(VAL_KEY, JSON.stringify(VALIDADORES)); } catch (e) {} };
  const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fmtDate = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const rowDate = r => r.date || (r.receivedAt || r.updatedAt ? todayISO(new Date(r.receivedAt || r.updatedAt)) : "");
  let rows = (() => { try { const x = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(x) ? x : []; } catch (e) { return []; } })();
  let editing = null, selected = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} };
  const setOptions = (el, values, blank = false) => { $(el).innerHTML = (blank ? '<option value="">— Selecione —</option>' : "") + values.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join(""); };
  setOptions("#rStatus", STATUS);
  function fillValidators(current = "") {
    const list = current && !VALIDADORES.some(v => norm(v) === norm(current)) ? [...VALIDADORES, current] : VALIDADORES;
    $("#rValidator").innerHTML = '<option value="">— Sem validador —</option>' + list.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
    $("#rValidator").value = current && current !== "— Sem validador —" ? current : "";
  }
  fillValidators();
  $("#rValAdd").onclick = () => {
    const name = (prompt("Nome do validador para adicionar:") || "").trim().replace(/\s+/g, " ").toUpperCase();
    if (!name) return;
    if (!VALIDADORES.some(v => norm(v) === norm(name))) { VALIDADORES.push(name); saveValidators(); }
    fillValidators(VALIDADORES.find(v => norm(v) === norm(name)));
  };
  $("#rValDel").onclick = () => {
    const name = $("#rValidator").value;
    if (!name) { $("#rParseStatus").textContent = "Selecione um validador na lista para excluir."; return; }
    if (!confirm(`Excluir "${name}" da lista de validadores? Registros já salvos com esse nome não mudam.`)) return;
    VALIDADORES = VALIDADORES.filter(v => v !== name); saveValidators(); fillValidators();
  };
  const cleanPhone = text => {
    const marked = String(text).match(/(?:telefone|celular|whatsapp|fone|número)[^\d(+]{0,15}(\+?\(?\d[\d\s().-]{8,16}\d)/i);
    if (marked) return marked[1].trim();
    const candidates = String(text).match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[\s-]?\d{4}/g) || [];
    return candidates.find(x => x.replace(/\D/g, "").length >= 10) || "";
  };
  const HEAD = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?),?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\]?\s*(?:-\s*)?([^:\n]{1,60}?):\s?(.*)$|^\s*\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?:-\s*)?([^:\n]{1,60}?):\s?(.*)$/;
  const isPhoneSender = s => String(s).replace(/\D/g, "").length >= 10 && !/[a-zA-ZÀ-ú]/.test(s);
  function splitMessages(raw) {
    const msgs = []; let cur = null;
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(HEAD);
      if (m) { cur = { sender: (m[3] || m[7] || "").trim(), lines: [(m[4] ?? m[8] ?? "").trim()] }; msgs.push(cur); }
      else if (cur) cur.lines.push(line.trim());
    });
    msgs.forEach(x => { x.text = x.lines.join("\n").trim(); });
    return msgs;
  }
  function parseMessage(text) {
    const full = String(text || "").trim(), msgs = splitMessages(full);
    // Só a primeira mensagem (a que começa com "Prezado cliente"); respostas do cliente servem apenas para achar o telefone.
    const first = msgs.length ? (msgs.find(m => /prezado\s+cliente/i.test(m.text)) || msgs[0]) : null;
    const raw = first ? first.text : full;
    const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const idMatch = raw.match(/\bID(?:\s+DO\s+(?:PACOTE|ENVIO))?\s*[:#-]?\s*(\d{11})\b/i) || raw.match(/\b(\d{11})\b/);
    const id = idMatch ? idMatch[1] : "";
    const nameLine = lines.find(x => /^prezado\s+cliente/i.test(x));
    const name = nameLine ? nameLine.replace(/^prezado\s+cliente\s*/i, "").replace(/[,.!:;\s]+$/, "").trim() : "";
    const date = (raw.match(/(?:entregue|entrega)\s+(?:no dia|em)?\s*:?\s*([^\n.]+)/i) || [])[1]?.trim() || "";
    const clientMsg = msgs.find(m => m !== first && isPhoneSender(m.sender));
    const senderPhone = clientMsg ? clientMsg.sender : (first && isPhoneSender(first.sender) ? first.sender : "");
    const phone = senderPhone ? senderPhone.replace(/\s+/g, " ").trim() : cleanPhone(raw.replace(/\d{11}/g, " "));
    return { name, phone, id, date, raw, multiple: msgs.length > 1 };
  }
  function fillParsed() {
    const text = $("#rPaste").value.trim() || $("#rMessage").value.trim();
    if (!text) { $("#rParseStatus").textContent = "Cole a mensagem na caixa “Cole aqui toda a mensagem”."; return; }
    const parsed = parseMessage(text);
    $("#rName").value = parsed.name; $("#rPhone").value = parsed.phone; $("#rId").value = parsed.id;
    if (parsed.raw) $("#rMessage").value = parsed.raw;
    if (parsed.id) $("#rPaste").value = "";
    $("#rParseStatus").textContent = parsed.id ? `ID ${parsed.id} identificado${parsed.multiple ? " (usei só a primeira mensagem)" : ""}${parsed.name ? ` · ${parsed.name}` : ""}${parsed.phone ? ` · ${parsed.phone}` : ""}. Complete os campos e salve.` : "Não encontrei um ID de 11 dígitos. Confira a mensagem colada.";
    if (parsed.id) $("#rBase").focus();
  }
  function clearForm() { editing = null; ["rName","rPhone","rId","rBase","rDriver"].forEach(id => $("#" + id).value = ""); $("#rStatus").value = "A VALIDAR"; fillValidators(); $("#rDate").value = todayISO(); $("#rMessage").value = ""; $("#rPaste").value = ""; $("#rParseStatus").textContent = ""; $("#rSave").textContent = "Salvar recebimento"; }
  function formData() {
    const old = editing ? rows.find(x => x.key === editing) || {} : {};
    return { ...old, id: $("#rId").value.replace(/\D/g, "").slice(0, 11), name: $("#rName").value.trim(), phone: $("#rPhone").value.trim(), base: $("#rBase").value.trim(), driver: $("#rDriver").value.trim(), date: $("#rDate").value || todayISO(), status: $("#rStatus").value, validator: $("#rValidator").value, message: $("#rMessage").value.trim(), updatedAt: Date.now() };
  }
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const monthKey = r => (rowDate(r) || "").slice(0, 7) || "sem-data";
  const monthLabel = k => k === "sem-data" ? "Sem data" : `${MESES[Number(k.slice(5, 7)) - 1] || k.slice(5, 7)}/${k.slice(0, 4)}`;
  const monthSort = (a, b) => a === "sem-data" ? 1 : b === "sem-data" ? -1 : b.localeCompare(a);
  const valueOf = r => r.validator && r.validator !== "— Sem validador —" ? r.validator : "";
  let openMonths = new Set(), selMonths = new Set(), previewKey = null;
  const rowHtml = r => `<tr data-rid="${esc(r.key)}" class="${selected.has(r.key) ? "selected" : ""}${previewKey === r.key ? " previewing" : ""}"><td>${esc(fmtDate(rowDate(r))) || "—"}</td><td>${esc(r.name) || "—"}</td><td>${esc(r.phone) || "—"}</td><td><b>${esc(r.id) || "—"}</b></td><td><span class="receb-status" data-status="${esc(r.status)}">${esc(r.status)}</span></td><td>${esc(r.base) || "—"}</td><td>${esc(r.driver) || "—"}</td><td>${esc(valueOf(r)) || "—"}</td><td title="${esc(r.chat || "")}">${esc(r.receivedText || "")}</td><td><button type="button" data-edit="${esc(r.key)}">Editar</button></td></tr>`
    + (previewKey === r.key ? `<tr class="receb-preview-row"><td colspan="10"><div class="receb-preview"><div class="receb-preview-grid"><div><small>Cliente</small><b>${esc(r.name) || "—"}</b></div><div><small>Telefone</small><b>${esc(r.phone) || "—"}</b></div><div><small>ID</small><b>${esc(r.id) || "—"}</b></div><div><small>Data</small><b>${esc(fmtDate(rowDate(r))) || "—"}</b></div><div><small>Base</small><b>${esc(r.base) || "—"}</b></div><div><small>Motorista</small><b>${esc(r.driver) || "—"}</b></div><div><small>Status</small><b>${esc(r.status) || "—"}</b></div><div><small>Validador</small><b>${esc(valueOf(r)) || "—"}</b></div></div>${r.message ? `<small>Mensagem enviada</small><pre>${esc(r.message)}</pre>` : ""}${r.receivedText ? `<small>Resposta do cliente</small><pre>${esc(r.receivedText)}</pre>` : ""}<div class="frow"><button type="button" class="pri" data-edit="${esc(r.key)}">Editar</button><button type="button" data-pclose="1">Fechar prévia</button></div></div></td></tr>` : "");
  const tableHtml = list => `<div class="receb-table-wrap"><table class="receb-table"><thead><tr><th>Data</th><th>Cliente</th><th>Telefone</th><th>ID</th><th>Status</th><th>Base</th><th>Motorista</th><th>Validador</th><th>Confirmação WhatsApp</th><th></th></tr></thead><tbody>${list.map(rowHtml).join("")}</tbody></table></div>`;
  function updateDownloadButtons() {
    const keys = [...new Set(rows.map(monthKey))];
    selMonths = new Set([...selMonths].filter(k => keys.includes(k)));
    $("#rDlSel").textContent = `⬇ Baixar selecionados (${selMonths.size})`;
    $("#rDlSel").disabled = !selMonths.size; $("#rDlAll").disabled = !rows.length;
    $("#rSelAll").textContent = keys.length && selMonths.size === keys.length ? "☐ Desmarcar todos os meses" : "☑ Marcar todos os meses";
  }
  function render() {
    const q = norm($("#rSearch").value), filtered = rows.filter(r => !q || norm([r.id,r.name,r.phone,r.base,r.driver,r.status,r.validator,r.chat,r.receivedText,fmtDate(rowDate(r))].join(" ")).includes(q));
    $("#rCount").textContent = `· ${filtered.length} de ${rows.length}`;
    const groups = {}; filtered.forEach(r => (groups[monthKey(r)] ||= []).push(r));
    const keys = Object.keys(groups).sort(monthSort);
    $("#rTable").innerHTML = keys.length ? keys.map(k => {
      const open = !!q || openMonths.has(k), n = groups[k].length;
      return `<div class="receb-month${open ? " open" : ""}"><div class="receb-month-head"><label class="receb-month-check" title="Marcar este mês para baixar"><input type="checkbox" data-msel="${esc(k)}"${selMonths.has(k) ? " checked" : ""}></label><button type="button" class="receb-month-toggle" data-mopen="${esc(k)}" aria-expanded="${open}">📁 <b>${esc(monthLabel(k))}</b><span class="receb-month-count">${n} ${n === 1 ? "registro" : "registros"}</span><span class="receb-chev">${open ? "▾" : "▸"}</span></button><button type="button" data-mdl="${esc(k)}">⬇ Baixar mês</button></div>${open ? `<div class="receb-month-body">${tableHtml(groups[k])}</div>` : ""}</div>`;
    }).join("") : '<div class="msg">Nenhum recebimento registrado.</div>';
    updateDownloadButtons();
  }
  const editRecord = key => {
    const r = rows.find(x => x.key === key); if (!r) return;
    editing = r.key; ["Name","Phone","Id","Base","Driver"].forEach(k => $("#r" + k).value = r[k.toLowerCase()] || "");
    $("#rStatus").value = r.status; fillValidators(r.validator || ""); $("#rDate").value = rowDate(r) || todayISO(); $("#rPaste").value = ""; $("#rMessage").value = r.message || r.receivedText || ""; $("#rSave").textContent = "Salvar alterações";
    $("#rName").scrollIntoView({ behavior: "smooth", block: "center" });
  };
  $("#rParse").onclick = fillParsed;
  $("#rPaste").addEventListener("paste", () => setTimeout(fillParsed, 60));
  $("#rClearMessage").onclick = () => { $("#rPaste").value = ""; $("#rMessage").value = ""; $("#rParseStatus").textContent = ""; };
  $("#rSave").onclick = () => { const r = formData(); if (r.id.length !== 11) { $("#rParseStatus").textContent = "Informe um ID válido com 11 dígitos."; return; } if (!r.name) { $("#rParseStatus").textContent = "Informe o nome do cliente."; return; } r.key = editing || `${r.id}-${Date.now()}`; const ix = rows.findIndex(x => x.key === r.key); if (ix >= 0) rows[ix] = r; else rows.unshift(r); save(); render(); clearForm(); };
  $("#rCancel").onclick = clearForm; $("#rSearch").oninput = render;
  $("#rTable").onclick = e => {
    const chk = e.target.closest("input[data-msel]");
    if (chk) { if (chk.checked) selMonths.add(chk.dataset.msel); else selMonths.delete(chk.dataset.msel); updateDownloadButtons(); return; }
    const open = e.target.closest("[data-mopen]");
    if (open) { const k = open.dataset.mopen; if (openMonths.has(k)) openMonths.delete(k); else openMonths.add(k); render(); return; }
    const dl = e.target.closest("[data-mdl]");
    if (dl) { downloadMonths([dl.dataset.mdl], monthFileName([dl.dataset.mdl])); return; }
    if (e.target.closest("[data-pclose]")) { previewKey = null; render(); return; }
    const ed = e.target.closest("[data-edit]");
    if (ed) { editRecord(ed.dataset.edit); return; }
    const tr = e.target.closest("tr[data-rid]"); if (!tr) return;
    if (e.ctrlKey || e.metaKey) { const k = tr.dataset.rid; if (selected.has(k)) selected.delete(k); else selected.add(k); tr.classList.toggle("selected", selected.has(k)); return; }
    previewKey = previewKey === tr.dataset.rid ? null : tr.dataset.rid; render();
  };
  const copySelected = async () => { const text = rows.filter(r => selected.has(r.key)).map(r => [fmtDate(rowDate(r)),r.name,r.phone,r.id,r.status,r.base,r.driver,r.validator,r.receivedText].join("\t")).join("\n"); if (!text) return; try { await navigator.clipboard.writeText(text); } catch (e) { const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); } };
  $("#rCopy").onclick = copySelected; document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected.size && !e.target.closest("input,textarea,select")) { e.preventDefault(); copySelected(); } });
  const DL_HEAD = ["DATA","NOME","TELEFONE","ID","STATUS","BASE","MOTORISTA","VALIDADOR","CONFIRMACAO_WHATSAPP"];
  const dlRow = r => [fmtDate(rowDate(r)), r.name, r.phone, r.id, r.status, r.base, r.driver, valueOf(r), r.receivedText].map(x => String(x ?? ""));
  const sortedMonth = k => rows.filter(r => monthKey(r) === k).sort((a, b) => rowDate(a).localeCompare(rowDate(b)) || (a.updatedAt || 0) - (b.updatedAt || 0));
  const monthFileName = keys => keys.length === 1 ? `Analise_Recebimento_${keys[0]}` : keys.length === rows.map(monthKey).filter((k, i, a) => a.indexOf(k) === i).length ? "Analise_Recebimento_todos_os_meses" : "Analise_Recebimento_meses_selecionados";
  function downloadMonths(keys, name) {
    keys = keys.sort(monthSort).reverse();
    if (!keys.length) return;
    if (window.XLSX && XLSX.utils && XLSX.writeFile) {
      const wb = XLSX.utils.book_new();
      keys.forEach(k => {
        const ws = XLSX.utils.aoa_to_sheet([DL_HEAD, ...sortedMonth(k).map(dlRow)]);
        ws["!cols"] = [{ wch: 11 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 9 }, { wch: 26 }, { wch: 22 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, ws, monthLabel(k).replace(/[\\/?*[\]:]/g, "-").slice(0, 31));
      });
      XLSX.writeFile(wb, `${name}.xlsx`);
      return;
    }
    const csv = [["MÊS", ...DL_HEAD], ...keys.flatMap(k => sortedMonth(k).map(r => [monthLabel(k), ...dlRow(r)]))].map(a => a.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `${name}.csv`; a.click();
  }
  $("#rDlAll").onclick = () => downloadMonths([...new Set(rows.map(monthKey))], "Analise_Recebimento_todos_os_meses");
  $("#rDlSel").onclick = () => downloadMonths([...selMonths], monthFileName([...selMonths]));
  $("#rSelAll").onclick = () => { const keys = [...new Set(rows.map(monthKey))]; if (keys.length && selMonths.size === keys.length) selMonths.clear(); else selMonths = new Set(keys); render(); };
  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== "whatsapp-receipt-bridge" || event.data?.type !== "confirmation") return;
    const item = event.data.item || {}, waKey = String(item.key || `${item.chat}|${item.text}|${item.time}`);
    const id = String(item.id || "").replace(/\D/g, "").slice(0, 11), name = String(item.name || item.chat || "Cliente").trim();
    const chatPhone = String(item.chat || "").match(/(?:\+?55[ \t().-]*)?(?:\(?\d{2}\)?[ \t().-]*)?\d{4,5}[ \t.-]?\d{4}/)?.[0] || "";
    const phone = String(item.phone || chatPhone).trim();
    let record = rows.find(r => r.whatsappKey === waKey || (id && r.id === id));
    if (record) {
      record.whatsappKey = waKey; record.chat = item.chat || record.chat || ""; record.receivedText = item.text || record.receivedText || ""; record.receivedAt = item.receivedAt || Date.now();
      if (phone) record.phone = phone;
      if (id) record.id = id; if (!record.name || record.name === "Cliente") record.name = name; if (!record.status || record.status === "A VALIDAR") record.status = "COMPROVANTE CARREGADO";
    } else {
      record = { key: `wa-${waKey}`, whatsappKey: waKey, source: "WhatsApp", id, name, phone, base: "", driver: "", status: "COMPROVANTE CARREGADO", validator: "", message: item.text || "", receivedText: item.text || "", chat: item.chat || "", receivedAt: item.receivedAt || Date.now(), date: todayISO(), updatedAt: Date.now() };
      rows.unshift(record);
    }
    save(); render();
    const notice = $("#rWhatsAppNotice");
    const float = $("#recebimentoFloat");
    if (float) { float.title = `Nova confirmação: ${record.name}${record.phone ? ` · ${record.phone}` : ""} — ${record.receivedText}`; float.dataset.confirmations = String(Number(float.dataset.confirmations || 0) + 1); float.textContent = "RECEBIDO ✓"; }
    if (notice) notice.textContent = `CONFIRMAÇÃO DE RECEBIMENTO: ${record.name}${record.phone ? ` · ${record.phone}` : " · telefone não identificado"}${record.id ? ` · ID ${record.id}` : " · ID não identificado"}: “${record.receivedText}”`;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Confirmação recebida no WhatsApp", { body: `${record.name}${record.phone ? ` · ${record.phone}` : ""}${record.id ? ` · ID ${record.id}` : ""}: ${record.receivedText}`, tag: `wa-receipt-${waKey}` });
    window.postMessage({ source: "whatsapp-dashboard", type: "receipt-saved", key: waKey }, "*");
  });
  clearForm(); render();
})();
