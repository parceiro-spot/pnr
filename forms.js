/* Análise Forms — fila de validação por regional, com contagem de recusas e  botão para o Logistic */
(function (root) {
  "use strict";
  const LOGISTIC_URL = "https://envios.adminml.com/logistics/case-center/cases";
  // Regionais: o prefixo da base decide (EES/SES/ES… = Espírito Santo, etc.)
  const REGIONAIS = [
    { nome: "Minas Gerais", re: /^(EMG|SMG)/ },
    { nome: "Espírito Santo", re: /^(ES|SES|EES|ESS|EBA)/ },
    { nome: "Bahia", re: /^SBA/ },
    { nome: "Rio de Janeiro", re: /^(ERJ|SRJ)/ },
    { nome: "São Paulo", re: /^SSP/ }
  ];
  const SEM_REG = "Sem regional";
  const VALIDADORES = ["LUIZA FRANÇA", "KETHELLY", "EDUARDA CARVALHO", "VITÓRIA"];
  const DEFAULT_EXCLUDED_IDS = ["47495708033"];
  let excludedIds = new Set(DEFAULT_EXCLUDED_IDS);

  const N = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function parseTs(v) {
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === "number") {
      const u = new Date(Math.round((v - 25569) * 864e5));
      return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
    }
    const s = String(v ?? "").trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T,]*(\d{1,2})?:?(\d{2})?:?(\d{2})?/);
    if (m) {
      const a = +m[1], b = +m[2];
      // O ODS baixado pelo Forms usa mês/dia (ex.: 7/31/2026).
      // Se um dos campos for maior que 12, use o formato não ambíguo.
      const month = b > 12 ? a : (a > 12 ? b : a);
      const day = b > 12 ? b : (a > 12 ? a : b);
      return new Date(+m[3], month - 1, day, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  const p2 = n => String(n).padStart(2, "0");
  const dayKey = d => d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : "";
  const fmtDay = k => k ? k.split("-").reverse().join("/") : "—";
  const fmtDT = d => d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}` : "—";

  // O campo ID do Forms vem sujo: "ID: 4748…", "4741… / 4741…", emojis, números truncados.
  function extractIds(v) {
    const toks = String(v ?? "").match(/\d+/g) || [];
    return [...new Set(toks.filter(t => t.length === 11))];
  }
  // Base também vem suja: "Eba 32", "SRJ8-ERJ6", "SES1/EES8", nome de pessoa…
  function extractCodes(v) {
    const up = String(v ?? "").toUpperCase().replace(/\s+/g, "");
    const m = up.match(/(?:EES|SES|ESS|ES|EMG|SMG|SBA|EBA|ERJ|SRJ|SSP)\d+/g);
    if (m) return m;
    // só o prefixo, sem número (ex.: "SSP") — vale como regional
    return /^(?:EES|SES|ESS|EMG|SMG|SBA|EBA|ERJ|SRJ|SSP)$/.test(up) ? [up] : [];
  }
  function regionOf(code) {
    const c = String(code || "").toUpperCase();
    const r = REGIONAIS.find(x => x.re.test(c));
    return r ? r.nome : SEM_REG;
  }
  function normStatus(v) {
    const n = N(v);
    if (!n) return "PENDENTE";
    if (n.includes("ANALISE")) return "NÃO SUBIR"; // "EM ANÁLISE" = não subir
    if (n.includes("FATURAMENTO") || n === "FATURADA") return "FATURADA";
    if (n === "ANEXADA" || n === "RECUSADA" || n === "ANULADA") return n;
    if (n.includes("NAOSUBIR")) return "NÃO SUBIR";
    return String(v).trim().toUpperCase();
  }
  // Motivo do Forms vem longo ("ENTREGUE>CLIENTE RECEBEU (qualquer status…)"): no dash mostra só "CLIENTE RECEBEU"
  function prettyMotivo(v) {
    const raw = String(v ?? "").trim();
    if (!raw) return "";
    let s = raw.replace(/\([^)]*\)/g, " ").replace(/\([^)]*$/, " ");
    if (s.includes(">")) s = s.slice(s.lastIndexOf(">") + 1);
    s = s.replace(/\s+/g, " ").replace(/[\s.:;,-]+$/, "").trim().toLocaleUpperCase("pt-BR");
    return s || raw.toLocaleUpperCase("pt-BR");
  }
  const URLS = v => {
    const m = String(v ?? "").match(/(?:https?:\/\/|(?:drive|docs)\.google\.com)[^\s,;]+/gi) || [];
    return [...new Set(m.map(u => u.replace(/[)\].>"']+$/, "")).map(u => { const p = u.split(/(?=https?:\/\/)/); return p[p.length - 1]; }).map(u => (/^https?:/i.test(u) ? u : "https://" + u)))];
  };
  // ID do arquivo no Drive (open?id=…, /file/d/…/view, uc?id=…)
  const driveId = u => { const m = String(u).match(/[?&]id=([\w-]{15,})/) || String(u).match(/\/d\/([\w-]{15,})/); return m ? m[1] : ""; };

  function colMap(rows) {
    const keys = [...new Set(rows.slice(0, 50).flatMap(r => Object.keys(r)))];
    const f = fn => keys.find(k => fn(N(k)));
    return {
      ts: f(k => k.startsWith("CARIMBO") || k.includes("DATAHORA")),
      validador: f(k => k === "VALIDADOR"),
      status: f(k => k.startsWith("STATUSDAEVID") || k === "STATUS"),
      id: f(k => k === "ID"),
      base: f(k => k === "BASE"),
      motivo: f(k => k.startsWith("MOTIVO") && !/RESCUSA|RECUSA/.test(k)),
      evid: f(k => k.startsWith("EVIDENCIA")),
      focal: f(k => k.includes("NOMEDOFOCAL")),
      motorista: f(k => k.includes("NOMEDOMOTORISTA")),
      email: f(k => k.includes("EMAIL")),
      recusa: f(k => /MOTIVO(RESCUSA|RECUSA)/.test(k))
    };
  }

  // Junta as respostas do Forms por ID do pacote e conta as recusas.
  function analyze(rows, edits) {
    const C = colMap(rows), g = (r, k) => (k ? r[k] : "");
    const items = [], invalid = [];
    rows.forEach((r, i) => {
      const idRaw = String(g(r, C.id) ?? "").trim(), ts = parseTs(g(r, C.ts));
      if (!idRaw && !ts) return; // linha vazia no fim da planilha
      const evid = String(g(r, C.evid) ?? "");
      const it = {
        i, ts, validador: String(g(r, C.validador) ?? "").trim(), status: normStatus(g(r, C.status)),
        idRaw, ids: extractIds(idRaw), baseRaw: String(g(r, C.base) ?? "").trim(), codes: extractCodes(g(r, C.base)),
        motivo: String(g(r, C.motivo) ?? "").trim(), evid, urls: URLS(evid),
        focal: String(g(r, C.focal) ?? "").trim(), motorista: String(g(r, C.motorista) ?? "").trim(),
        email: String(g(r, C.email) ?? "").trim(), motRecusa: String(g(r, C.recusa) ?? "").trim()
      };
      it.ids = it.ids.filter(id => !excludedIds.has(id));
      if (!it.ids.length && idRaw) return;
      if (!it.ids.length) { invalid.push(it); return; }
      items.push(it);
    });
    const by = new Map();
    for (const it of items) for (const id of it.ids) {
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(it);
    }
    const cases = [];
    for (const [id, att] of by) {
      att.sort((a, b) => ((a.ts?.getTime() || 0) - (b.ts?.getTime() || 0)) || a.i - b.i);
      let last = att[att.length - 1];
      // O Forms prevalece sobre edições locais se o campo mudou desde o snapshot salvo.
      const ed = edits && edits[id];
      if (ed && ed.t === (last.ts ? last.ts.getTime() : 0)) {
        // Edições antigas sem snapshot são descartadas com segurança: não dá para saber
        // se outra pessoa já atualizou o Forms antes de este arquivo ser carregado.
        if (ed.s !== undefined && (ed.os === undefined || normStatus(ed.os) !== last.status)) { delete ed.s; delete ed.os; }
        if (ed.m !== undefined && (ed.om === undefined || String(ed.om ?? "") !== String(last.motRecusa ?? ""))) { delete ed.m; delete ed.om; }
        if (ed.v !== undefined && (ed.ov === undefined || N(ed.ov) !== N(last.validador))) { delete ed.v; delete ed.ov; }
        if (ed.s === undefined && ed.m === undefined && ed.v === undefined) delete edits[id];
        else {
          const cp = { ...last, edited: true, editAt: ed.at || 0, origStatus: last.status, origMot: last.motRecusa, origVal: last.validador };
          if (ed.s) { cp.status = normStatus(ed.s); cp.statusOut = ed.s; }
          if (ed.m !== undefined) { cp.motRecusa = ed.m; cp.motOut = ed.m; }
          if (ed.v !== undefined) { cp.validador = ed.v; cp.valOut = ed.v; }
          att[att.length - 1] = cp; last = cp;
        }
      }
      let code = "";
      for (let k = att.length - 1; k >= 0 && !code; k--) code = att[k].codes[0] || "";
      const recusas = att.filter(a => a.status === "RECUSADA").length;
      cases.push({
        id, att, last, status: last.status, recusas, tent: att.length, code,
        regiao: code ? regionOf(code) : SEM_REG, dia: dayKey(last.ts), lote: att.some(a => a.ids.length > 1),
        recusaMotivos: att.filter(a => a.status === "RECUSADA" && a.motRecusa).map(a => a.motRecusa)
      });
    }
    return { cases, invalid, rowsTotal: items.length + invalid.length, cols: C };
  }

  // Monta o arquivo "igual ao Forms": mesmas colunas, com status e motivo da recusa preenchidos
  function applyEdits(rows, A) {
    const C = A.cols, out = rows.map(r => ({ ...r })), changes = [], seen = new Set();
    // O Forms usa exatamente esta opção, sem acento.
    const statusAnaliseForms = "EM ANALISE";
    for (const c of A.cases) {
      const l = c.last;
      if (!l.edited || seen.has(l.i)) continue;
      seen.add(l.i);
      const row = out[l.i];
      if (l.statusOut !== undefined && C.status) row[C.status] = normStatus(l.statusOut) === "NÃO SUBIR" ? statusAnaliseForms : l.statusOut;
      if (l.motOut !== undefined && C.recusa) row[C.recusa] = l.motOut;
      if (l.valOut !== undefined && C.validador) row[C.validador] = l.valOut;
      changes.push({
        "Carimbo de data/hora": C.ts ? rows[l.i][C.ts] : "", "ID": c.id, "BASE": C.base ? row[C.base] : "",
        "VALIDADOR": C.validador ? row[C.validador] : "", "STATUS DA EVIDÊNCIA": C.status ? row[C.status] : "", "MOTIVO RESCUSA": C.recusa ? row[C.recusa] : ""
      });
    }
    return { out, changes };
  }

  const Core = { VALIDADORES, prettyMotivo, driveId, URLS, analyze, applyEdits, extractIds, extractCodes, regionOf, parseTs, normStatus, REGIONAIS, SEM_REG, LOGISTIC_URL, dayKey, fmtDay, fmtDT, esc };
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  root.FormsCore = Core;
  if (typeof document === "undefined") return;

  /* ================= INTERFACE ================= */
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  let forms = null, A = null, tratando = null; // tratando = ID que você está tratando agora
  excludedIds = new Set(store.get("forms_excluded_ids", DEFAULT_EXCLUDED_IDS));
  DEFAULT_EXCLUDED_IDS.forEach(id => excludedIds.add(id));
  let edits = store.get("forms_edits", {}), byId = new Map();
  const SEM_VAL = "(sem validador)";
  const S = { st: "PENDENTE", reg: new Set(), val: new Set(), dt: "TUDO", sort: "old", q: "", limit: 100 };
  // nome do validador do pacote (usa o nome padrão da lista quando bate, senão o que veio do Forms)
  const valOf = c => { const v = String(c.last.validador || "").trim(); if (!v) return SEM_VAL; return VALIDADORES.find(x => N(x) === N(v)) || v; };
  const STATUS_TABS = [["PENDENTE", "A validar"], ["RECUSADA", "Recusadas"], ["ANEXADA", "Anexadas"], ["ANULADA", "Anuladas"], ["FATURADA", "Faturadas"], ["NÃO SUBIR", "Em analise"], ["TODOS", "Todas"]];
  const BADGE = { PENDENTE: "b-pen", RECUSADA: "b-rec", ANEXADA: "b-ane", ANULADA: "b-anu", FATURADA: "b-fat", "NÃO SUBIR": "b-nsub" };
  const label = s => (STATUS_TABS.find(t => t[0] === s) || [0, s])[1];
  const SING = { PENDENTE: "A validar", RECUSADA: "Recusada", ANEXADA: "Anexada", ANULADA: "Anulada", FATURADA: "Faturada", "NÃO SUBIR": "Em analise" };
  const badge = s => SING[s] || s;

  // navegação entre as abas
  document.querySelectorAll("#nav button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll("#nav button").forEach(x => { $("#" + x.dataset.v).hidden = x.dataset.v !== b.dataset.v; });
  });
  document.querySelectorAll("#formsNav button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#formsNav button").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll("#formsNav button").forEach(x => { $("#" + x.dataset.formView).hidden = x !== b; });
  });

  // ---------- leitura de arquivo ----------
  async function readForms(f) {
    if (/\.csv$/i.test(f.name)) {
      return new Promise(res => Papa.parse(f, { header: true, skipEmptyLines: true, complete: r => res(r.data) }));
    }
    const buf = await f.arrayBuffer();
    // Manter carimbos do Excel como número serial: parseTs converte o calendário
    // do arquivo explicitamente, sem deslocamento causado pelo fuso do navegador.
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
  }
  const rowKey = r => JSON.stringify(Object.keys(r || {}).sort().map(k => [k, r[k]]));
  function mergeForms(next) {
    const all = Array.isArray(forms) ? forms.slice() : [];
    const seen = new Set(all.map(rowKey));
    for (const row of next || []) {
      const key = rowKey(row);
      if (!seen.has(key)) { all.push(row); seen.add(key); }
    }
    forms = all;
    store.set("forms_rows", forms);
    return forms.length;
  }
  function wire(box, input, st, cb) {
    const go = async f => {
      if (!f) return;
      $(st).textContent = "lendo " + f.name + "…";
      try { await cb(f); $(box).classList.add("ok"); }
      catch (e) { console.error(e); $(st).textContent = "não consegui ler esse arquivo: " + (e.message || e); }
    };
    $(input).onchange = e => go(e.target.files[0]);
    $(box).ondragover = e => e.preventDefault();
    $(box).ondrop = e => { e.preventDefault(); go(e.dataTransfer.files[0]); };
  }
  wire("#fd1", "#ff1", "#fs1", async f => {
    const incoming = await readForms(f);
    const before = Array.isArray(forms) ? forms.length : 0;
    const total = mergeForms(incoming);
    const added = total - before;
    $("#fs1").textContent = `${f.name} · ${total.toLocaleString("pt-BR")} linhas salvas${added ? ` · +${added.toLocaleString("pt-BR")} novas` : ""}`;
    analyzeNow();
  });
  function analyzeNow() {
    if (!forms) { $("#finfo").textContent = "Suba o Forms para começar."; return; }
    const firstLoad = !A;
    reanalyze();
    $("#finfo").textContent = A.cols.id ? "" : "Não achei a coluna “ID” no arquivo. Confira se é o Forms baixado.";
    $("#fapp").hidden = !A.cols.id;
    const dts = [...new Set(A.cases.map(c => c.dia).filter(Boolean))].sort().reverse();
    $("#fDt").innerHTML = '<option value="TUDO">(Todas)</option>' + dts.map(d => `<option value="${d}">${fmtDay(d)}</option>`).join("");
    if (firstLoad) {
      // Ao abrir ou atualizar a página, começa sempre no dia atual.
      // O usuário pode trocar para outro dia ou para “Todas” no seletor.
      S.st = "TODOS";
      S.reg = new Set();
      S.val = new Set();
      S.dt = dts.includes(dayKey(new Date())) ? dayKey(new Date()) : "TUDO";
      S.sort = "old";
      S.q = "";
    }
    if (S.dt !== "TUDO" && !dts.includes(S.dt)) S.dt = "TUDO";
    $("#fDt").value = S.dt;
    refresh();
  }
  const savedForms = store.get("forms_rows", null);
  if (Array.isArray(savedForms) && savedForms.length) {
    forms = savedForms;
    $("#fs1").textContent = `Forms salvo · ${forms.length.toLocaleString("pt-BR")} linhas`;
    analyzeNow();
  }
  function reanalyze() {
    A = analyze(forms, edits);
    store.set("forms_edits", edits);
    store.set("forms_excluded_ids", [...excludedIds]);
    byId = new Map(A.cases.map(c => [c.id, c]));
  }
  function saveViewState() {
    store.set("forms_view_state", { version: 2, st: S.st, reg: [...S.reg], val: [...S.val], dt: S.dt, sort: S.sort, q: S.q });
  }
  function refresh() { if (A) { saveViewState(); render(); } }

  // ---------- filtros ----------
  const matches = (c, skip) => {
    // Uma busca explícita deve encontrar o pacote independentemente da situação selecionada.
    if (!S.q && skip !== "st" && S.st !== "TODOS" && c.status !== S.st) return false;
    if (skip !== "reg" && S.reg.size && !S.reg.has(c.regiao)) return false;
    if (skip !== "val" && S.val.size && !S.val.has(valOf(c))) return false;
    if (S.dt !== "TUDO" && c.dia !== S.dt) return false;
    if (S.q) {
      const q = N(S.q), hay = N([c.id, c.code, c.regiao, c.status, c.last.motorista, c.last.focal, c.last.motivo, c.last.motRecusa, c.last.validador, ...c.recusaMotivos].join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  const sorters = {
    rec: (a, b) => b.recusas - a.recusas || (a.last.ts || 0) - (b.last.ts || 0),
    old: (a, b) => (a.last.ts || 0) - (b.last.ts || 0),
    new: (a, b) => (b.last.ts || 0) - (a.last.ts || 0),
    base: (a, b) => (a.code || "~").localeCompare(b.code || "~", "pt-BR", { numeric: true }) || (a.last.ts || 0) - (b.last.ts || 0)
  };

  const currentList = () => A.cases.filter(c => matches(c)).sort(sorters[S.sort]);
  function render() { const list = currentList(); renderTop(list); renderList(list); }
  function renderTop(list) {
    // Os números dos cartões e dos filtros acompanham a data selecionada.
    const all = S.dt === "TUDO" ? A.cases : A.cases.filter(c => c.dia === S.dt), reg = S.reg;
    const valOk = c => !S.val.size || S.val.has(valOf(c));
    const inReg = all.filter(c => (!reg.size || reg.has(c.regiao)) && valOk(c));
    const cnt = (fn, l = inReg) => l.filter(fn).length;
    const responseCount = S.dt === "TUDO" ? A.rowsTotal : all.reduce((n, c) => n + c.att.filter(a => dayKey(a.ts) === S.dt).length, 0);
    $("#fkpi").innerHTML = [
      ["IDs únicos", inReg.length, `${responseCount.toLocaleString("pt-BR")} respostas no Forms`],
      ["A validar", cnt(c => c.status === "PENDENTE"), "último envio sem status"],
      ["Recusadas", cnt(c => c.status === "RECUSADA"), "última resposta = recusada"],
      ["Reincidentes", cnt(c => c.recusas >= 2), "recusados 2× ou mais"],
      ["Alterados por você", all.filter(c => c.last.edited).length, "entram no BAIXAR FORMS"]
    ].map(([t, v, s]) => `<div class="k"><small>${t}</small><div>${v.toLocaleString("pt-BR")}</div><em>${s}</em></div>`).join("");

    // regionais: contagem respeita a situação escolhida
    const regs = [...REGIONAIS.map(r => r.nome), SEM_REG];
    const base = all.filter(c => matches(c, "reg"));
    $("#fReg").innerHTML = `<button data-r="TODAS" class="${!reg.size ? "on" : ""}">Todas <i>${base.length}</i></button>` +
      regs.map(r => { const n = base.filter(c => c.regiao === r).length; return n || reg.has(r) ? `<button data-r="${r}" class="${reg.has(r) ? "on" : ""}">${reg.has(r) ? "✓ " : ""}${r} <i>${n}</i></button>` : ""; }).join("");
    // clique alterna a regional (pode marcar várias); "Todas" limpa a seleção
    $("#fReg").querySelectorAll("button").forEach(b => b.onclick = () => {
      const r = b.dataset.r;
      if (r === "TODAS") S.reg.clear(); else if (S.reg.has(r)) S.reg.delete(r); else S.reg.add(r);
      S.limit = 100; render();
    });

    // validador: marque o seu nome (pode marcar mais de um) para ver só os pacotes dele; respeita status, regional e data
    const vbase = all.filter(c => matches(c, "val"));
    const extras = [...new Set(all.map(valOf))].filter(v => v !== SEM_VAL && !VALIDADORES.includes(v)).sort();
    const vnames = [...VALIDADORES, ...extras, SEM_VAL];
    $("#fVal").innerHTML = `<button data-v="TODOS" class="${!S.val.size ? "on" : ""}">Todos <i>${vbase.length}</i></button>` +
      vnames.map(v => { const n = vbase.filter(c => valOf(c) === v).length; const on = S.val.has(v); return n || on || VALIDADORES.includes(v) ? `<button data-v="${esc(v)}" class="${on ? "on" : ""}">${on ? "✓ " : ""}${esc(v)} <i>${n}</i></button>` : ""; }).join("");
    $("#fVal").querySelectorAll("button").forEach(b => b.onclick = () => {
      const v = b.dataset.v;
      if (v === "TODOS") S.val.clear(); else if (S.val.has(v)) S.val.delete(v); else S.val.add(v);
      S.limit = 100; render();
    });

    $("#fSt").innerHTML = STATUS_TABS.map(([k, t]) => {
      const n = all.filter(c => (!S.reg.size || S.reg.has(c.regiao)) && valOk(c) && (k === "TODOS" || c.status === k)).length;
      return `<button data-s="${k}" class="${S.st === k ? "on" : ""}">${t} <i>${n}</i></button>`;
    }).join("");
    $("#fSt").querySelectorAll("button").forEach(b => b.onclick = () => { S.st = b.dataset.s; S.limit = 100; OPEN.fSt = false; render(); });
    // botões minimizados: mostram só a escolha atual; clicando abre as opções
    const nSt = all.filter(c => (!S.reg.size || S.reg.has(c.regiao)) && valOk(c) && (S.st === "TODOS" || c.status === S.st)).length;
    const tog = (id, txt, n, act) => { const t = $("#" + id + "T"); t.innerHTML = `${esc(txt)} <i>${n}</i> <span class="car">▾</span>`; t.classList.toggle("act", act); };
    tog("fReg", reg.size ? [...reg].join(" + ") : "Todas", reg.size ? base.filter(c => reg.has(c.regiao)).length : base.length, reg.size > 0);
    tog("fVal", S.val.size ? [...S.val].join(" + ") : "Todos", S.val.size ? vbase.filter(c => S.val.has(valOf(c))).length : vbase.length, S.val.size > 0);
    tog("fSt", label(S.st), nSt, false);
    foldSync();
    $("#fTitle").innerHTML = `<h2 class="ttl">${label(S.st)} · ${!reg.size ? "todas as regionais" : [...reg].join(" + ")}</h2><p class="tsub">${list.length.toLocaleString("pt-BR")} pacotes · ${list.filter(c => c.recusas > 0).length} já recusados antes</p>`;
  }
  function renderList(list) {
    const show = list.slice(0, S.limit);
    $("#fList").innerHTML = show.length ? show.map(rowHtml).join("") : '<div class="msg">Nada nesse filtro. 🎉</div>';
    $("#fMore").hidden = list.length <= S.limit;
    $("#fMore").textContent = `Mostrar mais (${Math.min(100, list.length - S.limit)} de ${list.length - S.limit} restantes)`;
    const bad = A.invalid;
    $("#fBadBox").hidden = !bad.length;
    $("#fBadSum").textContent = `⚠️ ${bad.length} respostas sem ID válido de 11 dígitos (ID truncado, nome no lugar do ID…)`;
    $("#fBad").innerHTML = bad.length ? `<table><tr><th>Data</th><th>Validador</th><th>ID digitado</th><th>Base</th><th>Motorista</th><th>Focal</th></tr>${bad.slice(0, 300).map(b => `<tr><td>${fmtDT(b.ts)}</td><td>${esc(b.validador)}</td><td>${esc(b.idRaw)}</td><td>${esc(b.baseRaw)}</td><td>${esc(b.motorista)}</td><td>${esc(b.focal)}</td></tr>`).join("")}</table>` : "";
    renderMessageBox();
  }

  function renderMessageBox() {
    const box = $("#fMsgBox");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = `<h3>MENSAGEM LOGISTIC PARA${tratando ? ` <span class="msg-target">${esc(tratando)}</span>` : ""}</h3><p class="mu">Escolha uma mensagem e clique em copiar.</p><div class="trat-msg"><select class="trat-msg-select" aria-label="Escolher mensagem para o Logistic"><option value="">Escolher mensagem…</option>${MSGS.map(([t], i) => `<option value="${i}">${esc(t)}</option>`).join("")}</select><button type="button" class="mini" data-msg-copy="global">⧉ Copiar</button></div>`;
  }

  function rowHtml(c) {
    const L = c.last, u = L.urls;
    const rec = c.recusas === 0 ? "" : `<span class="rec ${c.recusas >= 3 ? "r3" : c.recusas === 2 ? "r2" : "r1"}">${c.recusas >= 3 ? "⚠ " : ""}${c.recusas}× recusada</span>`;
    const caso = `<div class="lgbox"><small>Abrir Logistic</small><div class="lgpair"><a class="btn pri" target="_blank" rel="noopener" href="${LOGISTIC_URL}" data-lg="${c.id}" title="Copia o ID e abre o Logistic no navegador normal">🌐 Normal ↗</a><button type="button" class="btn lgan" data-lga="${c.id}" title="Copia o link do Logistic para colar numa janela anônima">🕶 Anônimo</button></div></div>`;
    const msgTrat = `<div class="trat-msg"><select class="trat-msg-select" aria-label="Escolher mensagem para o Logistic"><option value="">Mensagem Logistic…</option>${MSGS.map(([t], i) => `<option value="${i}">${esc(t)}</option>`).join("")}</select><button type="button" class="mini" data-msg-copy="${c.id}">⧉ Copiar</button></div>`;
    const evid = u.length ? `<div class="fotos"><a class="btn ph" target="_blank" rel="noopener" href="${esc(u[0])}" title="Abrir a foto no Drive">📷 Ver foto</a>${u.slice(1).map((x, i) => `<a class="btn sm" target="_blank" rel="noopener" href="${esc(x)}" title="Abrir a foto ${i + 2}">📷 ${i + 2}</a>`).join("")}</div>` : (L.evid ? `<span class="mu" title="${esc(L.evid)}">arquivo sem link</span>` : "");
    const SEL = [["RECUSADA", "RECUSADA"], ["ANEXADA", "ANEXADA"], ["ANULADA", "ANULADA"], ["FATURADA", "FATURADA"], ["NÃO SUBIR", "EM ANALISE"]];
    const orig = L.edited ? L.origStatus : L.status;
    const extra = c.status !== "PENDENTE" && !SEL.some(x => x[0] === c.status) ? `<option value="${esc(c.status)}" selected>${esc(c.status)}</option>` : "";
    const sel = `<select class="stsel" data-sel="${c.id}" data-s="${esc(c.status)}" title="Marcar o status deste pacote">${orig === "PENDENTE" ? `<option value=""${c.status === "PENDENTE" ? " selected" : ""}>— A validar —</option>` : ""}${SEL.map(([v, t]) => `<option value="${v}"${c.status === v ? " selected" : ""}>${t}</option>`).join("")}${extra}</select>`;
    const vNow = L.validador || "", vExtra = vNow && !VALIDADORES.some(v => N(v) === N(vNow)) ? `<option value="${esc(vNow)}" selected>${esc(vNow)}</option>` : "";
    const vsel = `<select class="valsel" data-val="${c.id}" data-v="${esc(N(vNow))}" title="Quem validou este pacote">${vNow ? "" : '<option value="" selected>— Validador —</option>'}${VALIDADORES.map(v => `<option value="${v}"${N(v) === N(vNow) ? " selected" : ""}>${v}</option>`).join("")}${vExtra}</select>`;
    const mr = ["RECUSADA", "NÃO SUBIR"].includes(c.status) ? `<input class="mr" data-mr="${c.id}" placeholder="${c.status === "NÃO SUBIR" ? "Motivo da análise (escreva aqui)" : "Motivo da recusa (escreva aqui)"}" value="${esc(L.motRecusa)}">` : "";
    const hist = `<div class="h hh">${c.recusas}× recusada neste ID · ${c.tent} envio${c.tent > 1 ? "s" : ""}</div>` + c.att.map((a, ix) => ({ a, ix })).reverse().map(({ a, ix }) => `<div class="h"><span>${fmtDT(a.ts)}</span><span>${esc(a.validador) || "—"}</span><span class="bd ${BADGE[a.status] || ""}">${esc(badge(a.status))}</span><span>${esc(prettyMotivo(a.motivo)) || "—"}</span>${a.urls.length ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(a.urls[0])}" title="Abrir a foto desse envio">📷</a>` : ""}${a.motRecusa ? `<em>Motivo da recusa: ${esc(a.motRecusa)}</em>` : ""}</div>`).join("");
    return `<div class="fr${c.recusas >= 2 ? " hot" : ""}${L.edited ? " ed" : ""}${c.id === tratando ? " trat" : ""}" data-id="${c.id}">
  <div class="c1"><b class="idv">${c.id}</b><button class="mini" data-cp="${c.id}" title="Copiar ID">⧉</button><button class="mini remove-id" data-remove="${c.id}" title="Remover este ID da análise e das cópias">✕</button><div class="mu">${c.code ? esc(c.code) + " · " : ""}${esc(c.regiao)}${c.lote ? " · enviado em lote" : ""}</div>${L.focal ? `<div class="mu focal">Focal: ${esc(L.focal)}</div>` : ""}<button class="mini cpall" data-cpall="${c.id}" title="Copiar mensagem completa">⧉ Copiar mensagem ID, base e focal</button></div>
  <div class="c2">${sel} ${rec}${L.edited ? ' <span class="edtag">✎ editado</span>' : ""}<div class="vrow">${vsel}</div><div class="mu">${c.tent} envio${c.tent > 1 ? "s" : ""} · último ${fmtDT(L.ts)}</div></div>
  <div class="c3"><div class="mot" title="${esc(L.motivo)}">${esc(prettyMotivo(L.motivo)) || "—"}</div><div class="mu">Motorista: ${esc(L.motorista) || "—"}</div>${c.id === tratando ? tratTag(c.id) : ""}${mr}</div>
  <div class="c4">${caso}${msgTrat}${evid}${c.tent > 1 ? `<button class="mini" data-h="${c.id}">Histórico (${c.tent})</button>` : ""}</div>
  <div class="hist" hidden>${hist}</div>
</div>`;
  }

  // ---------- filtros minimizados ----------
  const OPEN = { fReg: false, fVal: false, fSt: false };
  function foldSync() { for (const k in OPEN) { $("#" + k).hidden = !OPEN[k]; $("#" + k + "T").classList.toggle("open", OPEN[k]); } }
  document.querySelectorAll(".ftog").forEach(t => t.onclick = () => {
    const k = t.id.slice(0, -1), v = !OPEN[k];
    for (const x in OPEN) OPEN[x] = false;
    OPEN[k] = v; foldSync();
  });
  // clicar fora fecha (mousedown, antes de a lista ser redesenhada)
  document.addEventListener("mousedown", e => { if (!e.target.closest(".fold") && Object.values(OPEN).some(Boolean)) { for (const x in OPEN) OPEN[x] = false; foldSync(); } });

  // ---------- TRATANDO ----------
  const tratTag = id => `<span class="trat-tag" data-untrat="${id}" title="Clique para tirar o TRATANDO">TRATANDO ✕</span>`;
  function markTrat(id) {
    if (tratando === id) return;
    tratando = id;
    document.querySelectorAll("#fList .fr.trat").forEach(r => { r.classList.remove("trat"); const t = r.querySelector(".trat-tag"); if (t) t.remove(); });
    if (!id) { renderMessageBox(); return; }
    const row = document.querySelector(`#fList .fr[data-id="${id}"]`);
    if (row) { row.classList.add("trat"); row.querySelector(".c3").insertAdjacentHTML("beforeend", tratTag(id)); }
    renderMessageBox();
  }
  function removeId(id) {
    if (!id) return;
    excludedIds.add(String(id));
    delete edits[id];
    store.set("forms_excluded_ids", [...excludedIds]);
    tratando = tratando === id ? null : tratando;
    reanalyze();
    render();
    toast(`ID ${id} removido da análise e das cópias.`);
  }
  // copiar o ID ou clicar em qualquer coisa da linha marca o pacote como TRATANDO; ao mexer em outro, sai do anterior; clicar na etiqueta tira
  $("#fList").addEventListener("click", e => {
    if (e.target.closest("[data-untrat]")) { markTrat(null); return; }
    const row = e.target.closest(".fr"); if (row) markTrat(row.dataset.id);
  });
  $("#fList").addEventListener("focusin", e => { const row = e.target.closest(".fr"); if (row) markTrat(row.dataset.id); });
  $("#fCopyIds").addEventListener("click", () => markTrat(null));

  // ---------- eventos ----------
  const copy = async t => {
    try { await navigator.clipboard.writeText(t); }
    catch (e) { const a = document.createElement("textarea"); a.value = t; document.body.append(a); a.select(); document.execCommand("copy"); a.remove(); }
  };
  const toast = msg => {
    let el = document.getElementById("lgToast");
    if (!el) { el = document.createElement("div"); el.id = "lgToast"; document.body.append(el); }
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 7000);
  };
  // mostra "✓ copiado" ao lado do ID por ~2s (com fade) e some sozinho
  const markCopied = el => {
    const r = el.closest(".fr"), idv = r && r.querySelector(".idv"); if (!idv) return;
    idv.classList.remove("cpd"); void idv.offsetWidth; idv.classList.add("cpd");
    clearTimeout(idv._cpt); idv._cpt = setTimeout(() => idv.classList.remove("cpd"), 2000);
  };
  const flash = (el, t) => { const o = el.textContent; el.textContent = t; setTimeout(() => el.textContent = o, 900); };
  // Clicar em "Abrir Logistic" copia o ID do pacote e abre a página do Logistic (é só colar o ID na busca)
  $("#fList").addEventListener("click", e => {
    const remove = e.target.closest("[data-remove]");
    if (remove) { e.preventDefault(); e.stopPropagation(); removeId(remove.dataset.remove); return; }
    const t = e.target.closest("[data-cp],[data-cpall],[data-h],[data-lg],[data-lga],[data-msg-copy]");
    if (!t) return;
    if (t.dataset.cp) { copy(t.dataset.cp); flash(t, "✓"); }
    if (t.dataset.cpall) {
      const c = byId.get(t.dataset.cpall), L = c ? c.last : null;
      if (c) {
        const parts = [c.code || L.baseRaw, L.focal].filter(Boolean);
        copy(`🚨 ID: ${c.id}${parts.length ? " - " + parts.join(" - ") : ""}\nPor favor, reenviar evidência.`);
        flash(t, "✓ copiado");
      }
    }
    if (t.dataset.lg) { copy(t.dataset.lg); markCopied(t); }
    if (t.dataset.lga) {
      // Navegador não permite abrir janela anônima por script: copia o link e orienta a colar numa janela anônima
      copy(LOGISTIC_URL); markCopied(t);
      toast("🕶 Link do Logistic copiado. Abra uma janela anônima (Ctrl+Shift+N), cole o link (Ctrl+V) e depois copie o ID no ⧉ ao lado do pacote " + t.dataset.lga + ".");
    }
    if (t.dataset.msgCopy) {
      const select = t.closest(".trat-msg")?.querySelector(".trat-msg-select") || $("#fMsgBox .trat-msg-select");
      const index = select && select.value !== "" ? Number(select.value) : -1;
      if (index >= 0 && MSGS[index]) { copy(MSGS[index][1]); flash(t, "✓ copiado"); }
      else toast("Escolha uma mensagem do Logistic antes de copiar.");
    }
    if (t.dataset.h) { const h = t.closest(".fr").querySelector(".hist"); h.hidden = !h.hidden; }
  });
  const tOf = c => (c.last.ts ? c.last.ts.getTime() : 0);
  const curEdit = c => (edits[c.id] && edits[c.id].t === tOf(c) ? edits[c.id] : { t: tOf(c) });
  function keepEdit(c, ed) {
    if (ed.s === undefined && ed.m === undefined && ed.v === undefined) delete edits[c.id]; else { ed.at = Date.now(); edits[c.id] = ed; } // 'at' = quando você mexeu (usado no BAIXAR FORMS)
    store.set("forms_edits", edits);
  }
  function saveReason(el, final) {
    const c = byId.get(el.dataset.mr); if (!c) return;
    const ed = curEdit(c), origMot = c.last.edited ? c.last.origMot : c.last.motRecusa;
    if (el.value === origMot) { delete ed.m; delete ed.om; } else { ed.m = el.value; ed.om = origMot; }
    keepEdit(c, ed);
    if (final) { reanalyze(); renderTop(currentList()); }
  }
  $("#fList").addEventListener("input", e => { if (e.target.dataset && e.target.dataset.mr) saveReason(e.target, false); });
  $("#fList").addEventListener("change", e => {
    const el = e.target;
    if (el.dataset && el.dataset.mr) { saveReason(el, true); return; }
    if (!el.dataset || !(el.dataset.sel || el.dataset.val)) return;
    const c = byId.get(el.dataset.sel || el.dataset.val), ed = curEdit(c), orig = c.last.edited ? c.last.origStatus : c.last.status;
    if (el.dataset.val) {
      const origV = c.last.edited ? c.last.origVal : c.last.validador;
      if (el.value === "" || N(el.value) === N(origV)) { delete ed.v; delete ed.ov; } else { ed.v = el.value; ed.ov = origV || ""; }
    } else {
      if (el.value === "" || normStatus(el.value) === orig) { delete ed.s; delete ed.os; }
      else { ed.s = el.value; ed.os = orig; }
      if (!["RECUSADA", "NÃO SUBIR"].includes(ed.s ? normStatus(ed.s) : orig)) { delete ed.m; delete ed.om; }
    }
    keepEdit(c, ed); reanalyze();
    // troca só essa linha (ela continua na lista até você mudar o filtro) e atualiza os contadores
    const row = el.closest(".fr"), open = !row.querySelector(".hist").hidden, tmp = document.createElement("div");
    tmp.innerHTML = rowHtml(byId.get(c.id));
    const nr = tmp.firstElementChild; row.replaceWith(nr);
    if (open) nr.querySelector(".hist").hidden = false;
    const mi = nr.querySelector(".mr"); if (mi && !mi.value) mi.focus();
    renderTop(currentList());
  });
  $("#fDt").onchange = e => { S.dt = e.target.value; S.limit = 100; A && render(); };
  $("#fQ").oninput = e => { S.q = e.target.value; S.limit = 100; A && render(); };
  $("#fMore").onclick = () => { S.limit += 100; render(); };
  $("#fCopyIds").onclick = e => {
    const ids = A.cases.filter(c => matches(c)).sort(sorters[S.sort]).map(c => c.id);
    copy(ids.join("\n")); flash(e.target, `✓ ${ids.length} IDs copiados`);
  };
  // print da lista atual (status + regionais marcadas)
  async function printLista(copyIt, btn) {
    if (!A) return;
    const el = $("#fPanel"), more = $("#fMore"), wasHidden = more.hidden;
    more.hidden = true;
    const n = el.querySelectorAll(".fr").length, old = btn.textContent; btn.textContent = "gerando…";
    try {
      const c = await html2canvas(el, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: n > 45 ? 1 : 2 });
      const nm = `Forms_${label(S.st)}_${S.reg.size ? [...S.reg].join("+") : "todas"}.png`.replace(/\s+/g, "_");
      if (copyIt) {
        try { const b = await new Promise(r => c.toBlob(r)); await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); flash(btn, "✓ copiado"); return; } catch (e) { }
      }
      await dl(c, nm);
    } catch (e) { console.error(e); alert("Não consegui gerar o print: " + (e.message || e)); }
    finally { more.hidden = wasHidden; btn.textContent = old; }
  }
  $("#fShot").onclick = e => printLista(false, e.currentTarget);
  $("#fCopyPrint").onclick = e => printLista(true, e.currentTarget);
  $("#fClear").onclick = () => {
    if (!A || !Object.keys(edits).length) return;
    if (confirm("Desfazer todas as alterações de status e motivo feitas aqui?")) { edits = {}; store.set("forms_edits", edits); reanalyze(); render(); }
  };
  async function saveBlob(blob, name) {
    try { const D = window.claude && await claude.use("downloads"); if (D) { await D.save({ filename: name, data: blob }); return; } }
    catch (e) { if (e && e.code === "declined") return; }
    const a = document.createElement("a"); a.download = name; a.href = URL.createObjectURL(blob); a.click();
  }
  // ---------- BAIXAR FORMS: respostas de um dia, no formato do Forms ----------
  const todayKey = () => dayKey(new Date());
  const dmy = k => k.split("-").reverse().join("-");
  const cellTxt = v => v instanceof Date ? `${p2(v.getDate())}/${p2(v.getMonth() + 1)}/${v.getFullYear()} ${p2(v.getHours())}:${p2(v.getMinutes())}:${p2(v.getSeconds())}` : String(v ?? "");
  const pad2 = p2;
  const HORAS = [...Array(24).keys()];
  $("#dlH1").innerHTML = HORAS.map(h => `<option value="${h}">a partir das ${pad2(h)}:00</option>`).join("");
  $("#dlH2").innerHTML = HORAS.map(h => `<option value="${h}">até ${pad2(h)}:59</option>`).join("");
  const atHour = (key, h, end) => { const [y, m, d] = key.split("-").map(Number); return end ? new Date(y, m - 1, d, h, 59, 59, 999) : new Date(y, m - 1, d, h, 0, 0, 0); };
  const isTimestampKey = k => { const n = N(k); return n.startsWith("CARIMBO") || n.includes("DATAHORA") || n.includes("TIMESTAMP"); };
  function dayData() {
    reanalyze();
    const C = A.cols, only = $("#dlOnly").checked;
    const d1 = $("#dlDate").value, d2 = $("#dlDate2").value || d1;
    const h1 = +$("#dlH1").value, h2 = +$("#dlH2").value;
    const from = atHour(d1, h1, false), to = atHour(d2, h2, true);
    const { out } = Core.applyEdits(forms, A);
    const edIdx = new Set(A.cases.filter(c => c.last.edited).map(c => c.last.i));
    const allHeaders = [...new Set(forms.slice(0, 50).flatMap(r => Object.keys(r)))];
    const tsCol = C.ts || allHeaders.find(isTimestampKey) || "Carimbo de data/hora";
    const header = [tsCol, ...allHeaders.filter(k => k !== tsCol)];
    let nEd = 0;
    const rows = out.filter((r, i) => {
      const ids = C.id ? extractIds(r[C.id]) : [];
      if (ids.some(id => excludedIds.has(id))) return false;
      const d = parseTs(r[tsCol]);
      const inR = !!d && d >= from && d <= to, ed = edIdx.has(i);
      // O período é definido pelo carimbo original do Forms. Editar uma resposta antiga
      // não pode fazer essa resposta aparecer no arquivo de uma data diferente.
      const keep = inR && (!only || ed);
      if (keep && ed) nEd++;
      return keep;
    });
    const fmt = (k, h) => `${fmtDay(k).slice(0, 5)} ${pad2(h)}:00`;
    const label = `${fmtDay(d1)} ${pad2(h1)}:00 → ${fmtDay(d2)} ${pad2(h2)}:59`;
    const fullDays = h1 === 0 && h2 === 23;
    const fname = d1 === d2 && fullDays ? `Forms_${dmy(d1)}.xlsx` : `Forms_${dmy(d1)}_${pad2(h1)}h_a_${dmy(d2)}_${pad2(h2)}h.xlsx`;
    return { rows, header, tsCol, label, fname, nEd, bad: from > to };
  }
  function dlRefresh() {
    if (!forms || !A) { $("#dlInfo").textContent = "Suba o Forms primeiro."; return; }
    if ($("#dlDate2").value < $("#dlDate").value) $("#dlDate2").value = $("#dlDate").value;
    const { rows, label, nEd, bad } = dayData();
    if (bad) { $("#dlInfo").textContent = "O fim do período está antes do começo."; $("#dlXlsx").disabled = $("#dlCopy").disabled = true; return; }
    $("#dlInfo").innerHTML = `<b>${label}</b>: ${rows.length} resposta${rows.length === 1 ? "" : "s"}${nEd ? ` · ${nEd} alterada${nEd === 1 ? "" : "s"} por você` : ""}`;
    $("#dlXlsx").disabled = $("#dlCopy").disabled = !rows.length;
  }
  const setHoje = () => { const t = todayKey(); $("#dlDate").value = t; $("#dlDate2").value = t; $("#dlH1").value = 0; $("#dlH2").value = 23; };
  const lockPeriodo = on => ["#dlDate", "#dlDate2", "#dlH1", "#dlH2"].forEach(s => { $(s).disabled = on; });
  $("#fDown").onclick = () => {
    if (!forms || !A) return;
    setHoje(); lockPeriodo(true);
    $("#dlTabs").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.d === "hoje"));
    $("#dl").hidden = false; dlRefresh();
  };
  $("#dlTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
    $("#dlTabs").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    const hoje = b.dataset.d === "hoje";
    lockPeriodo(hoje); if (hoje) setHoje();
    dlRefresh();
  });
  ["#dlDate", "#dlDate2", "#dlH1", "#dlH2", "#dlOnly"].forEach(s => { $(s).onchange = dlRefresh; });
  $("#dlClose").onclick = () => { $("#dl").hidden = true; };
  $("#dl").addEventListener("click", e => { if (e.target.id === "dl") $("#dlClose").onclick(); });
  // O ODS/XLSX pode entregar o carimbo do Forms como número serial. Na saída,
  // converta somente essa coluna para uma data real, sem alterar o instante original.
  const exportValue = (r, k) => {
    const tsCol = A && A.cols && A.cols.ts;
    return (k === tsCol || isTimestampKey(k)) ? (parseTs(r[k]) || r[k]) : r[k];
  };
  const pasteHeader = header => {
    const i = header.findIndex(isTimestampKey);
    return i >= 0 ? [header[i], ...header.filter((_, ix) => ix !== i)] : header;
  };
  $("#dlXlsx").onclick = async e => {
    const { rows, header, fname } = dayData(); if (!rows.length) return;
    const outHeader = pasteHeader(header);
    const clean = rows.map(r => { const o = {}; for (const k of outHeader) { const v = exportValue(r, k); if (v !== "" && v != null) o[k] = v; } return o; });
    const ws = XLSX.utils.json_to_sheet(clean, { header: outHeader, dateNF: "dd/mm/yyyy hh:mm:ss", cellDates: true });
    ws["!cols"] = outHeader.map(h => ({ wch: /EVID|MOTIVO/i.test(h) ? 40 : /CARIMBO/i.test(h) ? 20 : 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Respostas ao formulário 1");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellDates: true });
    await saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fname);
    flash(e.target, `✓ ${rows.length} linhas baixadas`);
  };
  // copia só as linhas (sem cabeçalho), separadas por tab: é só colar na primeira linha vazia da planilha do Forms
  $("#dlCopy").onclick = async e => {
    const { rows, header } = dayData(); if (!rows.length) return;
    const outHeader = pasteHeader(header);
    const tsv = rows.map(r => outHeader.map(h => cellTxt(exportValue(r, h)).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
    await copy(tsv); flash(e.target, `✓ ${rows.length} linhas copiadas`);
  };
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#dl").hidden = true; });

  // ---------- Mensagem para Logistic ----------
  const DEFAULT_MSGS = [
    ["Entregue", "O cliente confirma o recebimento do produto"],
    ["PNR Cartão", "O cliente confirma recebimento do cartão."],
    ["Baixado pelo Meli", "A baixa de entrega não foi feita pelo driver"],
    ["Produto diferente", "A entrega foi realizada corretamente, porém o cliente enviou o produto diferente do que foi comprado"],
    ["Item faltante", "O cliente enviou o pedido incompleto para o cliente."]
  ];
  const validMsgs = value => Array.isArray(value) ? value.filter(x => Array.isArray(x) && x.length >= 2 && String(x[0]).trim() && String(x[1]).trim()).map(x => [String(x[0]), String(x[1])]) : [];
  const savedMsgs = store.get("forms_msgs", null);
  const oldCustomMsgs = store.get("forms_custom_msgs", []);
  let MSGS = savedMsgs !== null ? validMsgs(savedMsgs) : DEFAULT_MSGS.concat(validMsgs(oldCustomMsgs));
  function persistMsgs() {
    store.set("forms_msgs", MSGS);
    // Mantém compatibilidade com versões anteriores que só salvavam mensagens adicionadas.
    store.set("forms_custom_msgs", MSGS.slice(DEFAULT_MSGS.length));
  }
  function renderMsgs() {
    $("#msgList").innerHTML = MSGS.map(([t, m], i) => `<div class="msgc" data-m="${i}"><label>Título<input class="msg-title" type="text" maxlength="80" value="${esc(t)}"></label><label>Mensagem<textarea class="msg-text" rows="4" maxlength="1000">${esc(m)}</textarea></label><div class="msg-actions"><button type="button" class="mini" data-msg-save>Salvar alterações</button><button type="button" class="mini" data-msg-copy>⧉ Copiar</button></div></div>`).join("");
  }
  renderMsgs();
  $("#msgList").addEventListener("click", e => {
    const c = e.target.closest(".msgc"); if (!c) return;
    const i = +c.dataset.m;
    if (e.target.closest("[data-msg-save]")) {
      const title = c.querySelector(".msg-title").value.trim();
      const text = c.querySelector(".msg-text").value.trim();
      if (!title || !text) { alert("Preencha o título e a mensagem antes de salvar."); return; }
      MSGS[i] = [title, text];
      persistMsgs();
      renderMsgs();
      if (A) render();
      toast("Mensagem Logistic atualizada.");
      return;
    }
    if (e.target.closest("[data-msg-copy]")) {
      copy(MSGS[i][1]); flash(e.target.closest("[data-msg-copy]"), "✓ copiado");
    }
  });
  $("#msgAdd").onclick = () => { $("#msgForm").hidden = false; $("#msgTitle").focus(); };
  $("#msgCancel").onclick = () => { $("#msgForm").hidden = true; $("#msgTitle").value = ""; $("#msgText").value = ""; };
  $("#msgSave").onclick = () => {
    const title = $("#msgTitle").value.trim(), text = $("#msgText").value.trim();
    if (!title || !text) { alert("Preencha o título e a mensagem antes de salvar."); return; }
    MSGS.push([title, text]);
    persistMsgs();
    renderMsgs();
    $("#msgCancel").onclick();
    if (A) render();
    toast("Mensagem Logistic adicionada.");
  };
})(typeof window !== "undefined" ? window : globalThis);
