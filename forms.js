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
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
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
      // alterações feitas no site (status / motivo da recusa) valem para o último envio do ID
      const ed = edits && edits[id];
      if (ed && ed.t === (last.ts ? last.ts.getTime() : 0)) {
        const cp = { ...last, edited: true, origStatus: last.status, origMot: last.motRecusa, origVal: last.validador };
        if (ed.s) { cp.status = normStatus(ed.s); cp.statusOut = ed.s; }
        if (ed.m !== undefined) { cp.motRecusa = ed.m; cp.motOut = ed.m; }
        if (ed.v !== undefined) { cp.validador = ed.v; cp.valOut = ed.v; }
        att[att.length - 1] = cp; last = cp;
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
    for (const c of A.cases) {
      const l = c.last;
      if (!l.edited || seen.has(l.i)) continue;
      seen.add(l.i);
      const row = out[l.i];
      if (l.statusOut !== undefined && C.status) row[C.status] = normStatus(l.statusOut) === "NÃO SUBIR" ? "EM ANÁLISE" : l.statusOut; // no Forms o nome da opção é EM ANÁLISE
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
  let forms = null, A = null;
  let edits = store.get("forms_edits", {}), byId = new Map();
  const S = { st: "PENDENTE", reg: new Set(), dt: "TUDO", sort: "rec", q: "", limit: 100 };
  const STATUS_TABS = [["PENDENTE", "A validar"], ["RECUSADA", "Recusadas"], ["ANEXADA", "Anexadas"], ["ANULADA", "Anuladas"], ["FATURADA", "Faturadas"], ["NÃO SUBIR", "Em análise"], ["TODOS", "Todas"]];
  const BADGE = { PENDENTE: "b-pen", RECUSADA: "b-rec", ANEXADA: "b-ane", ANULADA: "b-anu", FATURADA: "b-fat", "NÃO SUBIR": "b-nsub" };
  const label = s => (STATUS_TABS.find(t => t[0] === s) || [0, s])[1];
  const SING = { PENDENTE: "A validar", RECUSADA: "Recusada", ANEXADA: "Anexada", ANULADA: "Anulada", FATURADA: "Faturada", "NÃO SUBIR": "Em análise" };
  const badge = s => SING[s] || s;

  // navegação entre as abas
  document.querySelectorAll("#nav button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("on", x === b));
    $("#viewLost").hidden = b.dataset.v !== "viewLost";
    $("#viewForms").hidden = b.dataset.v !== "viewForms";
    
  });

  // ---------- leitura de arquivo ----------
  async function readForms(f) {
    if (/\.csv$/i.test(f.name)) {
      return new Promise(res => Papa.parse(f, { header: true, skipEmptyLines: true, complete: r => res(r.data) }));
    }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
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
    forms = await readForms(f);
    $("#fs1").textContent = f.name + " · " + forms.length.toLocaleString("pt-BR") + " linhas";
    analyzeNow();
  });
  function analyzeNow() {
    if (!forms) { $("#finfo").textContent = "Suba o Forms para começar."; return; }
    reanalyze();
    $("#finfo").textContent = A.cols.id ? "" : "Não achei a coluna “ID” no arquivo. Confira se é o Forms baixado.";
    $("#fapp").hidden = !A.cols.id;
    const dts = [...new Set(A.cases.map(c => c.dia).filter(Boolean))].sort().reverse();
    $("#fDt").innerHTML = '<option value="TUDO">(Todas)</option>' + dts.map(d => `<option value="${d}">${fmtDay(d)}</option>`).join("");
    S.dt = "TUDO"; S.limit = 100;
    refresh();
  }
  function reanalyze() { A = analyze(forms, edits); byId = new Map(A.cases.map(c => [c.id, c])); }
  function refresh() { if (A) render(); }

  // ---------- filtros ----------
  const matches = (c, skip) => {
    if (skip !== "st" && S.st !== "TODOS" && c.status !== S.st) return false;
    if (skip !== "reg" && S.reg.size && !S.reg.has(c.regiao)) return false;
    if (S.dt !== "TUDO" && c.dia !== S.dt) return false;
    if (S.q) {
      const q = N(S.q), hay = N([c.id, c.code, c.regiao, c.last.motorista, c.last.focal, c.last.motivo, c.last.validador].join(" "));
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
    const all = A.cases, reg = S.reg;
    const inReg = all.filter(c => !reg.size || reg.has(c.regiao));
    const cnt = (fn, l = inReg) => l.filter(fn).length;
    $("#fkpi").innerHTML = [
      ["IDs únicos", inReg.length, `${A.rowsTotal.toLocaleString("pt-BR")} respostas no Forms`],
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

    $("#fSt").innerHTML = STATUS_TABS.map(([k, t]) => {
      const n = all.filter(c => (!S.reg.size || S.reg.has(c.regiao)) && (k === "TODOS" || c.status === k)).length;
      return `<button data-s="${k}" class="${S.st === k ? "on" : ""}">${t} <i>${n}</i></button>`;
    }).join("");
    $("#fSt").querySelectorAll("button").forEach(b => b.onclick = () => { S.st = b.dataset.s; S.limit = 100; render(); });
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
  }

  function rowHtml(c) {
    const L = c.last, u = L.urls;
    const rec = c.recusas === 0 ? "" : `<span class="rec ${c.recusas >= 3 ? "r3" : c.recusas === 2 ? "r2" : "r1"}">${c.recusas >= 3 ? "⚠ " : ""}${c.recusas}× recusada</span>`;
    const caso = `<a class="btn pri" target="_blank" rel="noopener" href="${LOGISTIC_URL}" data-lg="${c.id}" title="Copia o ID e abre o Logistic">Abrir Logistic ↗</a>`;
    const evid = u.length ? `<div class="fotos"><a class="btn ph" target="_blank" rel="noopener" href="${esc(u[0])}" title="Abrir a foto no Drive">📷 Ver foto</a>${u.slice(1).map((x, i) => `<a class="btn sm" target="_blank" rel="noopener" href="${esc(x)}" title="Abrir a foto ${i + 2}">📷 ${i + 2}</a>`).join("")}</div>` : (L.evid ? `<span class="mu" title="${esc(L.evid)}">arquivo sem link</span>` : "");
    const SEL = [["RECUSADA", "RECUSADA"], ["ANEXADA", "ANEXADA"], ["ANULADA", "ANULADA"], ["FATURADA", "FATURADA"], ["NÃO SUBIR", "EM ANÁLISE"]];
    const orig = L.edited ? L.origStatus : L.status;
    const extra = c.status !== "PENDENTE" && !SEL.some(x => x[0] === c.status) ? `<option value="${esc(c.status)}" selected>${esc(c.status)}</option>` : "";
    const sel = `<select class="stsel" data-sel="${c.id}" data-s="${esc(c.status)}" title="Marcar o status deste pacote">${orig === "PENDENTE" ? `<option value=""${c.status === "PENDENTE" ? " selected" : ""}>— A validar —</option>` : ""}${SEL.map(([v, t]) => `<option value="${v}"${c.status === v ? " selected" : ""}>${t}</option>`).join("")}${extra}</select>`;
    const vNow = L.validador || "", vExtra = vNow && !VALIDADORES.some(v => N(v) === N(vNow)) ? `<option value="${esc(vNow)}" selected>${esc(vNow)}</option>` : "";
    const vsel = `<select class="valsel" data-val="${c.id}" data-v="${esc(N(vNow))}" title="Quem validou este pacote">${vNow ? "" : '<option value="" selected>— Validador —</option>'}${VALIDADORES.map(v => `<option value="${v}"${N(v) === N(vNow) ? " selected" : ""}>${v}</option>`).join("")}${vExtra}</select>`;
    const mr = c.status === "RECUSADA" ? `<input class="mr" data-mr="${c.id}" placeholder="Motivo da recusa (escreva aqui)" value="${esc(L.motRecusa)}">` : "";
    const hist = `<div class="h hh">${c.recusas}× recusada neste ID · ${c.tent} envio${c.tent > 1 ? "s" : ""}</div>` + c.att.map((a, ix) => ({ a, ix })).reverse().map(({ a, ix }) => `<div class="h"><span>${fmtDT(a.ts)}</span><span>${esc(a.validador) || "—"}</span><span class="bd ${BADGE[a.status] || ""}">${esc(badge(a.status))}</span><span>${esc(prettyMotivo(a.motivo)) || "—"}</span>${a.urls.length ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(a.urls[0])}" title="Abrir a foto desse envio">📷</a>` : ""}${a.motRecusa ? `<em>Motivo da recusa: ${esc(a.motRecusa)}</em>` : ""}</div>`).join("");
    return `<div class="fr${c.recusas >= 2 ? " hot" : ""}${L.edited ? " ed" : ""}" data-id="${c.id}">
  <div class="c1"><b class="idv">${c.id}</b><button class="mini" data-cp="${c.id}" title="Copiar ID">⧉</button><div class="mu">${c.code ? esc(c.code) + " · " : ""}${esc(c.regiao)}${c.lote ? " · enviado em lote" : ""}</div>${L.focal ? `<div class="mu focal">Focal: ${esc(L.focal)}</div>` : ""}<button class="mini cpall" data-cpall="${c.id}" title="Copia ID - Base - Focal">⧉ Copiar ID, base e focal</button></div>
  <div class="c2">${sel} ${rec}${L.edited ? ' <span class="edtag">✎ editado</span>' : ""}<div class="vrow">${vsel}</div><div class="mu">${c.tent} envio${c.tent > 1 ? "s" : ""} · último ${fmtDT(L.ts)}</div></div>
  <div class="c3"><div class="mot" title="${esc(L.motivo)}">${esc(prettyMotivo(L.motivo)) || "—"}</div><div class="mu">Motorista: ${esc(L.motorista) || "—"}</div>${mr}</div>
  <div class="c4">${caso}${evid}${c.tent > 1 ? `<button class="mini" data-h="${c.id}">Histórico (${c.tent})</button>` : ""}</div>
  <div class="hist" hidden>${hist}</div>
</div>`;
  }

  // ---------- eventos ----------
  const copy = async t => {
    try { await navigator.clipboard.writeText(t); }
    catch (e) { const a = document.createElement("textarea"); a.value = t; document.body.append(a); a.select(); document.execCommand("copy"); a.remove(); }
  };
  const flash = (el, t) => { const o = el.textContent; el.textContent = t; setTimeout(() => el.textContent = o, 900); };
  // Clicar em "Abrir Logistic" copia o ID do pacote e abre a página do Logistic (é só colar o ID na busca)
  $("#fList").addEventListener("click", e => {
    const t = e.target.closest("[data-cp],[data-cpall],[data-h],[data-lg]");
    if (!t) return;
    if (t.dataset.cp) { copy(t.dataset.cp); flash(t, "✓"); }
    if (t.dataset.cpall) {
      const c = byId.get(t.dataset.cpall), L = c ? c.last : null;
      if (c) { copy([c.id, c.code || L.baseRaw, L.focal].filter(Boolean).join(" - ")); flash(t, "✓ copiado"); }
    }
    if (t.dataset.lg) { copy(t.dataset.lg); const r = t.closest(".fr"); if (r) r.querySelector(".idv").classList.add("cpd"); }
    if (t.dataset.h) { const h = t.closest(".fr").querySelector(".hist"); h.hidden = !h.hidden; }
  });
  const tOf = c => (c.last.ts ? c.last.ts.getTime() : 0);
  const curEdit = c => (edits[c.id] && edits[c.id].t === tOf(c) ? edits[c.id] : { t: tOf(c) });
  function keepEdit(c, ed) {
    if (ed.s === undefined && ed.m === undefined && ed.v === undefined) delete edits[c.id]; else edits[c.id] = ed;
    store.set("forms_edits", edits);
  }
  function saveReason(el, final) {
    const c = byId.get(el.dataset.mr); if (!c) return;
    const ed = curEdit(c), origMot = c.last.edited ? c.last.origMot : c.last.motRecusa;
    if (el.value === origMot) delete ed.m; else ed.m = el.value;
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
      if (el.value === "" || N(el.value) === N(origV)) delete ed.v; else ed.v = el.value;
    } else {
      if (el.value === "" || normStatus(el.value) === orig) delete ed.s; else ed.s = el.value;
      if ((ed.s ? normStatus(ed.s) : orig) !== "RECUSADA") delete ed.m;
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
  function dayData() {
    reanalyze();
    const day = $("#dlDate").value, only = $("#dlOnly").checked, C = A.cols;
    const { out } = Core.applyEdits(forms, A);
    const edIdx = new Set(A.cases.filter(c => c.last.edited).map(c => c.last.i));
    const header = [...new Set(forms.slice(0, 50).flatMap(r => Object.keys(r)))];
    const rows = out.filter((r, i) => {
      const d = C.ts ? parseTs(r[C.ts]) : null;
      return d && dayKey(d) === day && (!only || edIdx.has(i));
    });
    const nEd = out.filter((r, i) => { const d = C.ts ? parseTs(r[C.ts]) : null; return d && dayKey(d) === day && edIdx.has(i); }).length;
    return { rows, header, day, nEd };
  }
  function dlRefresh() {
    if (!forms || !A) { $("#dlInfo").textContent = "Suba o Forms primeiro."; return; }
    const { rows, day, nEd } = dayData();
    $("#dlInfo").innerHTML = `<b>${fmtDay(day)}</b>: ${rows.length} resposta${rows.length === 1 ? "" : "s"}${nEd ? ` · ${nEd} alterada${nEd === 1 ? "" : "s"} por você` : ""}`;
    $("#dlXlsx").disabled = $("#dlCopy").disabled = !rows.length;
  }
  $("#fDown").onclick = () => {
    if (!forms || !A) return;
    $("#dlDate").value = todayKey(); $("#dlDate").disabled = true;
    $("#dlTabs").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.d === "hoje"));
    $("#dl").hidden = false; dlRefresh();
  };
  $("#dlTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
    $("#dlTabs").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    const hoje = b.dataset.d === "hoje";
    $("#dlDate").disabled = hoje; if (hoje) $("#dlDate").value = todayKey();
    dlRefresh();
  });
  $("#dlDate").onchange = dlRefresh;
  $("#dlOnly").onchange = dlRefresh;
  $("#dlClose").onclick = () => { $("#dl").hidden = true; };
  $("#dl").addEventListener("click", e => { if (e.target.id === "dl") $("#dlClose").onclick(); });
  $("#dlXlsx").onclick = async e => {
    const { rows, header, day } = dayData(); if (!rows.length) return;
    const clean = rows.map(r => { const o = {}; for (const k of header) if (r[k] !== "" && r[k] != null) o[k] = r[k]; return o; });
    const ws = XLSX.utils.json_to_sheet(clean, { header, dateNF: "dd/mm/yyyy hh:mm:ss", cellDates: true });
    ws["!cols"] = header.map(h => ({ wch: /EVID|MOTIVO/i.test(h) ? 40 : /CARIMBO/i.test(h) ? 20 : 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Respostas ao formulário 1");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array", cellDates: true });
    await saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Forms_${dmy(day)}.xlsx`);
    flash(e.target, `✓ ${rows.length} linhas baixadas`);
  };
  // copia só as linhas (sem cabeçalho), separadas por tab: é só colar na primeira linha vazia da planilha do Forms
  $("#dlCopy").onclick = async e => {
    const { rows, header } = dayData(); if (!rows.length) return;
    const tsv = rows.map(r => header.map(h => cellTxt(r[h]).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
    await copy(tsv); flash(e.target, `✓ ${rows.length} linhas copiadas`);
  };
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#dl").hidden = true; });
})(typeof window !== "undefined" ? window : globalThis);
