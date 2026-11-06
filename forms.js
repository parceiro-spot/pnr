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
  let excludedIds = new Set(); // (não usado mais: o ✕ só oculta, não tira o ID da análise)

  const N = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Texto de data com barras pode ser dia/mês (planilha em pt-BR: 03/11/2026) ou mês/dia (7/31/2026).
  // Olha o arquivo todo: se algum 1º número passa de 12 é dia/mês; se algum 2º passa de 12 é mês/dia.
  let TS_DMY = null; // null = não deu para saber (mantém o padrão antigo)
  function detectTsOrder(rows, tk) {
    if (!tk) return;
    let dm = 0, md = 0;
    for (const r of rows || []) {
      const v = r[tk]; if (typeof v !== "string") continue;
      const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/\d{4}/); if (!m) continue;
      if (+m[1] > 12) dm++; else if (+m[2] > 12) md++;
    }
    TS_DMY = dm > 0 && md === 0 ? true : (md > 0 && dm === 0 ? false : null);
  }
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
      if (TS_DMY === true) return new Date(+m[3], b - 1, a, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); // arquivo em dia/mês (pt-BR)
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

  // O Forms usa a COLUNA D (4ª coluna) como ID. Ela é a fonte de verdade,
  // mesmo quando o cabeçalho vem vazio, trocado ou com outro nome.
  const ID_COL_POS = 3; // D
  function pickIdCol(rows, keys, byHeader) {
    const sample = rows.slice(0, 400);
    const score = k => sample.reduce((n, r) => n + ((String(r[k] ?? "").match(/\d+/g) || []).some(t => t.length === 11) ? 1 : 0), 0);
    const d = keys[ID_COL_POS];
    // Não procurar outra coluna “parecida”: isso embaralha a identificação
    // quando o arquivo tem mais de uma coluna com números.
    if (d && score(d) > 0) return d;
    // Mantém a mesma regra mesmo quando os IDs não têm 11 dígitos ou vieram
    // como texto vazio no pequeno recorte inicial.
    if (d) return d;
    if (byHeader && score(byHeader) > 0) return byHeader;
    let best = null, bestN = 0;
    for (const k of keys) { const n = score(k); if (n > bestN) { best = k; bestN = n; } }
    return best || byHeader || d || undefined;
  }
  function colMap(rows) {
    rows = Array.isArray(rows) ? rows : []; // Forms ainda não carregado (primeiro anexo) = lista vazia
    const keys = [...new Set(rows.slice(0, 50).flatMap(r => Object.keys(r)))];
    const f = fn => keys.find(k => fn(N(k)));
    return {
      ts: f(k => k.startsWith("CARIMBO") || k.includes("DATAHORA")),
      validador: f(k => k === "VALIDADOR"),
      status: f(k => k.startsWith("STATUSDAEVID") || k === "STATUS"),
      id: pickIdCol(rows, keys, f(k => k === "ID" || /^ID(DE|DO|DA)?(ENVIO|PACOTE|SHIPMENT)?$/.test(k))),
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
    rows = Array.isArray(rows) ? rows : [];
    const C = colMap(rows), g = (r, k) => (k ? r[k] : "");
    detectTsOrder(rows, C.ts);
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
      const before = it.ids.length;
      it.ids = it.ids.filter(id => !excludedIds.has(id));
      if (!it.ids.length && before) return; // ID válido, mas removido de propósito (✕)
      if (!it.ids.length) { invalid.push(it); return; } // sem ID, ou ID digitado errado (truncado, 12 dígitos, nome…)
      items.push(it);
    });
    // Status fora da lista padrão (novos, digitados na planilha): "Em revisão", "EM REVISAO " e "em revisão" são o mesmo status.
    // Vale a grafia com acento; sem acento em nenhuma, a primeira que apareceu.
    const KNOWN = new Set(["PENDENTE", "RECUSADA", "ANEXADA", "ANULADA", "FATURADA", "NÃO SUBIR"]), canon = new Map();
    for (const it of items) {
      if (KNOWN.has(it.status)) continue;
      const k = N(it.status), cur = canon.get(k);
      if (!cur || (/[^\x00-\x7F]/.test(it.status) && !/[^\x00-\x7F]/.test(cur))) canon.set(k, it.status);
    }
    for (const it of items) if (!KNOWN.has(it.status)) it.status = canon.get(N(it.status)) || it.status;
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

  // Linhas que vão para a cópia: UMA por pacote selecionado, sempre o envio ATUAL (o último),
  // nunca o histórico. Se o mesmo envio cobre vários IDs (lote), a linha sai uma vez só.
  // Ordem cronológica (como o Forms registra), então várias linhas colam em sequência.
  function currentRowIndexes(A, ids) {
    const want = ids instanceof Set ? ids : new Set(ids), seen = new Set(), picked = [];
    for (const c of A.cases) {
      if (!want.has(c.id) || seen.has(c.last.i)) continue;
      seen.add(c.last.i); picked.push(c.last);
    }
    picked.sort((a, b) => ((a.ts ? a.ts.getTime() : 0) - (b.ts ? b.ts.getTime() : 0)) || a.i - b.i);
    return picked.map(l => l.i);
  }

  // Ordem EXATA das colunas da planilha do Forms: é a ordem do próprio arquivo baixado do Forms
  // (nada de ordem "inventada"). Sem carimbo, a cópia começa na coluna VALIDADOR e segue até o fim,
  // na mesma sequência da planilha, para colar na célula VALIDADOR da primeira linha vazia.
  function formsOrder(allHeaders, C, tsCol, withTs) {
    const hs = allHeaders.slice();
    if (withTs) return hs.includes(tsCol) ? hs : [tsCol, ...hs];
    const vi = C && C.validador ? hs.indexOf(C.validador) : -1;
    return (vi >= 0 ? hs.slice(vi) : hs).filter(k => k !== tsCol);
  }

  // Ordem cronológica (como o Forms registra) e sem repetição: se o mesmo envio (mesmo carimbo + mesmo ID)
  // aparece duas vezes (ex.: Forms anexado de novo com status alterado), fica só a ocorrência mais nova.
  function chronoDedupe(items, idCol, tsCol) {
    const t = r => { const d = parseTs(r[tsCol]); return d ? d.getTime() : 0; };
    const last = new Map();
    for (const it of items) {
      const id = idCol ? N(it.r[idCol]) : "";
      const k = id ? t(it.r) + "|" + id : "u|" + it.i;
      if (!last.has(k) || it.i > last.get(k).i) last.set(k, it);
    }
    return [...last.values()].sort((x, y) => (t(x.r) - t(y.r)) || (x.i - y.i));
  }


  const rowKey = r => JSON.stringify(Object.keys(r || {}).sort().map(k => [k, r[k]]));
  // Junta o arquivo novo com o que já estava salvo. O carimbo (data/hora com milésimos) identifica a resposta:
  // se a mesma resposta veio de novo com algo diferente (ID preenchido, validador, status…), vale a do arquivo novo
  // e a antiga sai (antes ficavam as duas e a antiga, sem ID, virava "sem ID válido").
  function mergeRows(existing, incoming) {
    const all = Array.isArray(existing) ? existing.slice() : [];
    const sample = [...all.slice(0, 50), ...(incoming || []).slice(0, 50)];
    const C = colMap(sample), tk = C.ts, ik = C.id;
    detectTsOrder([...all, ...(incoming || [])], tk);
    const tsKey = r => { const d = tk ? parseTs(r[tk]) : null; return d ? String(d.getTime()) : ""; };
    const idKey = r => (ik ? String(r[ik] ?? "").replace(/\D+/g, " ").trim() : "");
    const full = new Set(all.map(rowKey)), byTs = new Map();
    all.forEach((r, i) => { const t = tsKey(r); if (t) { if (!byTs.has(t)) byTs.set(t, []); byTs.get(t).push(i); } });
    let added = 0, updated = 0;
    for (const row of incoming || []) {
      const k = rowKey(row);
      if (full.has(k)) continue;
      const t = tsKey(row), same = t ? (byTs.get(t) || []) : [];
      const a = idKey(row);
      // mesma resposta = mesmo carimbo e (um dos IDs vazio ou IDs iguais)
      const hit = same.find(i => { const b = idKey(all[i]); return !a || !b || a === b; });
      if (hit !== undefined) { full.delete(rowKey(all[hit])); all[hit] = row; full.add(k); updated++; continue; }
      all.push(row); full.add(k); added++;
      if (t) { if (!byTs.has(t)) byTs.set(t, []); byTs.get(t).push(all.length - 1); }
    }
    return { rows: all, added, updated };
  }

  const Core = { colMap, mergeRows, formsOrder, chronoDedupe, currentRowIndexes, VALIDADORES, prettyMotivo, driveId, URLS, analyze, applyEdits, extractIds, extractCodes, regionOf, parseTs, normStatus, REGIONAIS, SEM_REG, LOGISTIC_URL, dayKey, fmtDay, fmtDT, esc };
  if (typeof module !== "undefined" && module.exports) module.exports = Core;
  root.FormsCore = Core;
  if (typeof document === "undefined") return;

  /* ================= INTERFACE ================= */
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  let forms = null, A = null, tratando = null, formsHeader = null, lastHeader = null; // tratando = ID que você está tratando agora
  const selectedIds = new Set();
  // IDs ocultos (✕): só somem da lista e das cópias / BAIXAR FORMS. A análise (recusas, histórico, alterações
  // de status/validador) continua intacta. O valor guardado é o carimbo do envio que foi ocultado: se chegar
  // um envio NOVO do mesmo ID, ele volta para a lista. 0 = oculto sempre.
  let hiddenMap = (() => {
    const h = store.get("forms_hidden_ids", null);
    if (h && typeof h === "object" && !Array.isArray(h)) return h;
    const m = {};
    DEFAULT_EXCLUDED_IDS.forEach(id => { m[id] = 0; });
    (store.get("forms_excluded_ids", []) || []).forEach(id => { m[String(id)] = 0; }); // ✕ de antes continuam ocultos
    store.set("forms_hidden_ids", m);
    return m;
  })();
  const saveHidden = () => store.set("forms_hidden_ids", hiddenMap);
  const caseTs = c => (c.last && c.last.ts ? c.last.ts.getTime() : 0);
  const isHiddenCase = c => { const h = hiddenMap[c.id]; return h !== undefined && (h === 0 || h === caseTs(c)); };
  const rowHidden = r => {
    const C = A && A.cols; if (!C || !C.id) return false;
    const d = C.ts ? parseTs(r[C.ts]) : null, t = d ? d.getTime() : 0;
    return extractIds(r[C.id]).some(id => { const h = hiddenMap[id]; return h !== undefined && (h === 0 || h === t); });
  };
  let edits = store.get("forms_edits", {}), byId = new Map();
  const SEM_VAL = "(sem validador)";
  const S = { st: "PENDENTE", reg: new Set(), val: new Set(), dt: "TUDO", sort: "old", q: "", limit: 100 };
  // nome do validador do pacote (usa o nome padrão da lista quando bate, senão o que veio do Forms)
  const valOf = c => { const v = String(c.last.validador || "").trim(); if (!v) return SEM_VAL; return VALIDADORES.find(x => N(x) === N(v)) || v; };
  const STATUS_TABS = [["PENDENTE", "A validar"], ["RECUSADA", "Recusadas"], ["ANEXADA", "Anexadas"], ["ANULADA", "Anuladas"], ["FATURADA", "Faturadas"], ["NÃO SUBIR", "Em analise"], ["TODOS", "Todas"]];
  const BADGE = { PENDENTE: "b-pen", RECUSADA: "b-rec", ANEXADA: "b-ane", ANULADA: "b-anu", FATURADA: "b-fat", "NÃO SUBIR": "b-nsub" };
  const SING = { PENDENTE: "A validar", RECUSADA: "Recusada", ANEXADA: "Anexada", ANULADA: "Anulada", FATURADA: "Faturada", "NÃO SUBIR": "Em analise" };
  const badge = s => SING[s] || s;

  // ---------- status novos e cores ----------
  // O .ods/.xlsx do Forms NÃO leva as cores dos chips da planilha (só o cinza das linhas), então a cor vem daqui:
  // qualquer status que aparecer na coluna STATUS DA EVIDÊNCIA vira aba + opção no seletor automaticamente,
  // e você pode trocar a cor (ou criar um status) em "🎨 Status e cores".
  const BUILTIN_ST = new Set(["PENDENTE", "RECUSADA", "ANEXADA", "ANULADA", "FATURADA", "NÃO SUBIR"]);
  let stCfg = (() => { const c = store.get("forms_status_cfg", null) || {}; return { custom: Array.isArray(c.custom) ? c.custom : [], colors: c.colors && typeof c.colors === "object" ? c.colors : {} }; })();
  const saveStCfg = () => store.set("forms_status_cfg", stCfg);
  let foundSt = [];
  const scanStatuses = () => {
    const set = new Set();
    for (const c of A.cases) for (const a of c.att) if (a.status && !BUILTIN_ST.has(a.status)) set.add(a.status);
    if (A.cases.length) for (const c of A.cases) if (c.status && !BUILTIN_ST.has(c.status)) set.add(c.status);
    foundSt = [...set].sort((x, y) => x.localeCompare(y, "pt-BR"));
  };
  const extraStatuses = () => [...new Set([...stCfg.custom, ...foundSt])].filter(x => x && !BUILTIN_ST.has(x));
  const cap = x => x.charAt(0) + x.slice(1).toLocaleLowerCase("pt-BR");
  const statusTabs = () => [...STATUS_TABS.filter(t => t[0] !== "TODOS"), ...extraStatuses().map(x => [x, cap(x)]), ["TODOS", "Todas"]];
  const label = x => (statusTabs().find(t => t[0] === x) || [0, x])[1];
  const hex2rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); return m ? [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)) : [123, 136, 133]; };
  const rgb2hex = a => "#" + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mixHex = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const textOn = h => { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? "#2b2b2b" : "#ffffff"; };
  const PALETTE = ["#6b7a99", "#0e8a8a", "#a0522d", "#7b5ea7", "#c2185b", "#2e7d32", "#ef6c00", "#455a64"];
  const autoColor = x => { let h = 0; for (const ch of x) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const DEFAULT_COL = { PENDENTE: "#c9a000", RECUSADA: "#b3261e", ANEXADA: "#1e7e4f", ANULADA: "#1f5fbf", FATURADA: "#e6d4f7", "NÃO SUBIR": "#d86f6a" };
  const stColor = x => stCfg.colors[x] || DEFAULT_COL[x] || autoColor(x);
  // status padrão sem cor escolhida usam o CSS original; os demais (cor escolhida ou status novo) levam a cor inline
  const stStyle = (x, kind) => {
    if (x === "TODOS" || (BUILTIN_ST.has(x) && !stCfg.colors[x])) return "";
    const c = stColor(x);
    if (kind === "tab") return ` style="background:${mixHex(c, "#ffffff", .85)};border-color:${mixHex(c, "#ffffff", .35)};color:${mixHex(c, "#000000", .45)}"`;
    return ` style="background:${c};border-color:${c};color:${textOn(c)}"`;
  };

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
      return new Promise(res => Papa.parse(f, { header: true, skipEmptyLines: true, complete: r => { lastHeader = (r.meta && r.meta.fields) || Object.keys(r.data[0] || {}); res(r.data); } }));
    }
    if (!root.XLSX || typeof root.XLSX.read !== "function") {
      throw new Error("o leitor de planilhas não carregou. Recarregue a página e tente novamente; se persistir, verifique a conexão com a internet");
    }
    const buf = await f.arrayBuffer();
    // Manter carimbos do Excel como número serial: parseTs converte o calendário
    // do arquivo explicitamente, sem deslocamento causado pelo fuso do navegador.
    let wb;
    try {
      wb = root.XLSX.read(buf, { type: "array", cellDates: false, cellNF: false, cellText: false });
    } catch (e) {
      throw new Error(`não consegui abrir ${f.name}. Confira se o arquivo é um ODS/XLSX válido (${e.message || e})`);
    }
    // O Forms baixado em .ods/.xlsx costuma ter VÁRIAS abas ("Respostas ao formulário 1, 2, 3…") e a
    // primeira pode ser uma aba vazia/sem a coluna ID. Por isso lê todas as abas e usa as que têm a coluna ID
    // (o cabeçalho pode estar em qualquer uma das primeiras linhas).
    const sheets = wb.SheetNames.map(name => {
      const ws = wb.Sheets[name];
      const grid = root.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: false });
      const temId = v => (String(v ?? "").match(/\d+/g) || []).some(t => t.length === 11);
      const isIdHeader = c => {
        const h = N(c);
        return h === "ID" || (h.includes("ID") && /(ENVIO|PACOTE|SHIPMENT|REMESSA|PEDIDO)/.test(h));
      };
      // O Forms pode escrever "ID do envio", "ID do pacote" ou colocar uma
      // linha de título antes do cabeçalho. A versão anterior só aceitava a
      // célula exatamente igual a "ID" e acabava ignorando alguns ODS.
      let hi = grid.slice(0, 30).findIndex(r => r.filter(c => String(c ?? "").trim() !== "").length >= 2 && r.some(isIdHeader));
      // sem cabeçalho "ID": se a COLUNA D (ou qualquer coluna) da aba tem IDs de 11 dígitos, a 1ª linha é o cabeçalho
      if (hi < 0 && grid.length > 1 && grid.slice(1, 200).some(r => temId(r[ID_COL_POS]) || r.some(temId))) hi = 0;
      let rows = [], head = [];
      if (hi >= 0) {
        const used = new Set();
        head = grid[hi].map((c, j) => {
          const original = String(c ?? "").trim();
          // Não remover células de cabeçalho vazias: isso deslocaria a coluna
          // D para a posição C e quebraria a identificação dos pacotes.
          const base = original || `COLUNA ${String.fromCharCode(65 + j)}`;
          let h = base, n = 2;
          while (used.has(h)) h = `${base} (${n++})`;
          used.add(h);
          return h;
        });
        rows = grid.slice(hi + 1).map(r => {
          const o = {};
          head.forEach((h, j) => { o[h] = r[j] ?? ""; });
          return o;
        }).filter(o => Object.values(o).some(v => String(v ?? "").trim() !== ""));
      }
      return { name, hi, head: hi >= 0 ? head : [], rows };
    });
    const good = sheets.filter(s => s.hi >= 0 && s.rows.length);
    if (!good.length) {
      const nomes = sheets.map(s => `“${s.name}”`).join(", ");
      throw new Error(`não achei a coluna “ID” em nenhuma aba (${nomes}). Confira se é o Forms baixado.`);
    }
    // A ordem das colunas é a da primeira aba válida do arquivo, não a da aba
    // com mais respostas. Assim a sequência original do Forms nunca é trocada
    // por uma heurística de quantidade de linhas.
    lastHeader = good[0].head;
    return good.flatMap(s => s.rows);
  }
  // As linhas do Forms ficam no IndexedDB (o localStorage estoura em ~5 MB com milhares de respostas
  // e, quando estourava, o Forms não era salvo e era preciso anexar de novo a cada vez).
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open("analise_forms", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const tx = db.transaction("kv", mode), rq = fn(tx.objectStore("kv"));
      tx.oncomplete = () => res(rq && rq.result);
      tx.onerror = tx.onabort = () => rej(tx.error);
    }));
    return { get: k => run("readonly", s => s.get(k)), set: (k, v) => run("readwrite", s => s.put(v, k)) };
  })();
  // Colunas na ordem do Forms (a do último arquivo anexado); colunas novas, se houver, vão no fim.
  function allHdrs() {
    const seen = new Set(), out = [];
    for (const k of formsHeader || []) if (!seen.has(k)) { seen.add(k); out.push(k); }
    for (const r of (forms || []).slice(0, 50)) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); out.push(k); }
    return out;
  }
  function saveRows() {
    idb.set("forms_rows", forms)
      .then(() => { try { localStorage.removeItem("forms_rows"); } catch (e) { } })
      .catch(() => store.set("forms_rows", forms));
  }
  function mergeForms(next) {
    const r = Core.mergeRows(forms, next);
    forms = r.rows;
    saveRows();
    return r;
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
  let ready = Promise.resolve(); // termina quando o Forms salvo foi carregado
  wire("#fd1", "#ff1", "#fs1", async f => {
    await ready;
    const incoming = await readForms(f);
    if (lastHeader && lastHeader.length) { formsHeader = lastHeader.slice(); idb.set("forms_header", formsHeader).catch(() => { }); }
    const idsDe = rs => { rs = Array.isArray(rs) ? rs : []; const k = Core.colMap(rs).id; return rs.flatMap(r => k ? extractIds(r[k]) : []); };
    const idsAntes = new Set(idsDe(forms));
    const r = mergeForms(incoming);
    const idsNovos = new Set(idsDe(r.rows).filter(id => !idsAntes.has(id)));
    $("#fs1").textContent = `${f.name} · ${incoming.length.toLocaleString("pt-BR")} linhas lidas · ${r.rows.length.toLocaleString("pt-BR")} salvas` +
      (r.added || r.updated ? ` · +${r.added.toLocaleString("pt-BR")} respostas novas${r.updated ? ` · ${r.updated.toLocaleString("pt-BR")} atualizadas` : ""} · ${idsNovos.size.toLocaleString("pt-BR")} IDs novos` : " · nenhuma resposta nova neste arquivo (já estava salvo)");
    analyzeNow();
  });
  function analyzeNow() {
    if (!forms) { $("#finfo").textContent = "Suba o Forms para começar."; return; }
    const firstLoad = !A;
    reanalyze();
    $("#finfo").textContent = A.cols.id ? "" : "Não achei a coluna “ID” no arquivo. Confira se é o Forms baixado.";
    $("#fapp").hidden = !A.cols.id;
    // Com o Forms já carregado, a caixa de anexar fica pequena: só use quando houver informações novas.
    $("#fd1").classList.add("compact");
    $("#fb1").textContent = "📎 Anexar outro Forms (só se houver informações novas)";
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
  ready = (async () => {
    let saved = null;
    try { saved = await idb.get("forms_rows"); } catch (e) { }
    try { const h = await idb.get("forms_header"); if (Array.isArray(h) && h.length) formsHeader = h; } catch (e) { }
    if (!Array.isArray(saved) || !saved.length) {
      // migra o que estava salvo na versão antiga (localStorage)
      saved = store.get("forms_rows", null);
      if (Array.isArray(saved) && saved.length) idb.set("forms_rows", saved).then(() => { try { localStorage.removeItem("forms_rows"); } catch (e) { } }).catch(() => { });
    }
    if (Array.isArray(saved) && saved.length) {
      forms = saved;
      $("#fs1").textContent = `Forms salvo · ${forms.length.toLocaleString("pt-BR")} linhas`;
      try { analyzeNow(); } catch (e) { console.error("Falha ao abrir o Forms salvo:", e); $("#finfo").textContent = "Não consegui abrir o Forms salvo (" + (e && e.message || e) + "). Anexe o arquivo de novo."; }
    }
  })().catch(e => console.error(e));
  function reanalyze() {
    A = analyze(forms, edits);
    store.set("forms_edits", edits);
    byId = new Map(A.cases.map(c => [c.id, c]));
    scanStatuses();
  }
  function saveViewState() {
    store.set("forms_view_state", { version: 2, st: S.st, reg: [...S.reg], val: [...S.val], dt: S.dt, sort: S.sort, q: S.q });
  }
  function refresh() { if (A) { saveViewState(); render(); } }

  // ---------- filtros ----------
  const matches = (c, skip) => {
    if (isHiddenCase(c)) return false;
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
  function render() { if (!statusTabs().some(t => t[0] === S.st)) S.st = "TODOS"; const list = currentList(); renderTop(list); renderList(list); }
  function renderTop(list) {
    // Os números dos cartões e dos filtros acompanham a data selecionada.
    const all = (S.dt === "TUDO" ? A.cases : A.cases.filter(c => c.dia === S.dt)).filter(c => !isHiddenCase(c)), reg = S.reg;
    const nHid = A.cases.filter(isHiddenCase).length, ub = $("#fUnhide");
    if (ub) { ub.hidden = !nHid; ub.textContent = `👁 Mostrar ocultos (${nHid})`; }
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

    $("#fSt").innerHTML = statusTabs().map(([k, t]) => {
      const n = all.filter(c => (!S.reg.size || S.reg.has(c.regiao)) && valOk(c) && (k === "TODOS" || c.status === k)).length;
      const on = S.st === k;
      return `<button data-s="${esc(k)}" class="${on ? "on" : ""}"${stStyle(k, on ? "tabOn" : "tab")}>${esc(t)} <i>${n}</i></button>`;
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
    $("#fList").classList.toggle("has-tratando", !!tratando);
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
    const caso = `<div class="lgbox"><small>Abrir Logistic</small><div class="lgpair"><a class="btn pri" target="_blank" rel="noopener" href="${LOGISTIC_URL}" data-lg="${c.id}" title="Copia o ID e abre o Logistic no navegador normal">🌐 Normal ↗</a><button type="button" class="btn lgan" data-lga="${c.id}" title="Copia o link do Logistic para colar numa janela anônima">🕶 Anônimo</button></div></div>`;
    // Mensagens da aba "Mensagem Logistic" direto na linha: um clique copia a mensagem
    const msgTrat = `<div class="lgbox msgbox"><small>Mensagem Logistic</small><div class="msgchips">${MSGS.map(([t, m], i) => `<button type="button" class="mini msgchip" data-msgc="${i}" title="${esc(m)}">${esc(t)}</button>`).join("")}</div></div>`;
    const evid = u.length ? `<div class="fotos"><a class="btn ph" target="_blank" rel="noopener" href="${esc(u[0])}" title="Abrir a foto no Drive">📷 Ver foto</a>${u.slice(1).map((x, i) => `<a class="btn sm" target="_blank" rel="noopener" href="${esc(x)}" title="Abrir a foto ${i + 2}">📷 ${i + 2}</a>`).join("")}</div>` : (L.evid ? `<span class="mu" title="${esc(L.evid)}">arquivo sem link</span>` : "");
    const SEL = [["RECUSADA", "RECUSADA"], ["ANEXADA", "ANEXADA"], ["ANULADA", "ANULADA"], ["FATURADA", "FATURADA"], ["NÃO SUBIR", "EM ANALISE"], ...extraStatuses().map(x => [x, x])];
    const orig = L.edited ? L.origStatus : L.status;
    const extra = c.status !== "PENDENTE" && !SEL.some(x => x[0] === c.status) ? `<option value="${esc(c.status)}" selected>${esc(c.status)}</option>` : "";
    const sel = `<select class="stsel" data-sel="${c.id}" data-s="${esc(c.status)}"${stStyle(c.status, "sel")} title="Marcar o status deste pacote">${orig === "PENDENTE" ? `<option value=""${c.status === "PENDENTE" ? " selected" : ""}>— A validar —</option>` : ""}${SEL.map(([v, t]) => `<option value="${v}"${c.status === v ? " selected" : ""}>${t}</option>`).join("")}${extra}</select>`;
    const vNow = L.validador || "", vExtra = vNow && !VALIDADORES.some(v => N(v) === N(vNow)) ? `<option value="${esc(vNow)}" selected>${esc(vNow)}</option>` : "";
    const vsel = `<select class="valsel" data-val="${c.id}" data-v="${esc(N(vNow))}" title="Quem validou este pacote">${vNow ? "" : '<option value="" selected>— Validador —</option>'}${VALIDADORES.map(v => `<option value="${v}"${N(v) === N(vNow) ? " selected" : ""}>${v}</option>`).join("")}${vExtra}</select>`;
    const mr = ["RECUSADA", "NÃO SUBIR"].includes(c.status) ? `<input class="mr" data-mr="${c.id}" placeholder="${c.status === "NÃO SUBIR" ? "Motivo da análise (escreva aqui)" : "Motivo da recusa (escreva aqui)"}" value="${esc(L.motRecusa)}">` : "";
    const hist = `<div class="h hh">${c.recusas}× recusada neste ID · ${c.tent} envio${c.tent > 1 ? "s" : ""}</div>` + c.att.map((a, ix) => ({ a, ix })).reverse().map(({ a, ix }) => `<div class="h"><span>${fmtDT(a.ts)}</span><span>${esc(a.validador) || "—"}</span><span class="bd ${BADGE[a.status] || ""}"${stStyle(a.status, "badge")}>${esc(badge(a.status))}</span><span>${esc(prettyMotivo(a.motivo)) || "—"}</span>${a.urls.length ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(a.urls[0])}" title="Abrir a foto desse envio">📷</a>` : ""}${a.motRecusa ? `<em>Motivo da recusa: ${esc(a.motRecusa)}</em>` : ""}</div>`).join("");
    return `<div class="fr${c.recusas >= 2 ? " hot" : ""}${L.edited ? " ed" : ""}${c.id === tratando ? " trat" : ""}${selectedIds.has(c.id) ? " selected" : ""}" data-id="${c.id}">
  <div class="c1"><b class="idv">${c.id}</b><button class="mini" data-cp="${c.id}" title="Copiar ID">⧉</button><button class="mini remove-id" data-remove="${c.id}" title="Ocultar este ID: some da lista e não entra na cópia nem no BAIXAR FORMS">✕</button><div class="mu">${c.code ? esc(c.code) + " · " : ""}${esc(c.regiao)}${c.lote ? " · enviado em lote" : ""}</div>${L.focal ? `<div class="mu focal">Focal: ${esc(L.focal)}</div>` : ""}<button class="mini cpall" data-cpall="${c.id}" title="Copiar mensagem completa">⧉ Copiar mensagem ID, base e focal</button></div>
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
    $("#fList").classList.toggle("has-tratando", !!id);
    if (!id) return;
    const row = document.querySelector(`#fList .fr[data-id="${id}"]`);
    if (row) {
      row.classList.add("trat");
      row.querySelector(".c3").insertAdjacentHTML("beforeend", tratTag(id));
    }
  }
  function removeId(id) {
    if (!id) return;
    id = String(id);
    const c = byId.get(id);
    hiddenMap[id] = c ? caseTs(c) : 0;
    saveHidden();
    selectedIds.delete(id);
    tratando = tratando === id ? null : tratando;
    render();
    toast(`ID ${id} ocultado: some da lista e não entra na cópia nem no BAIXAR FORMS. Volta se chegar um envio novo desse ID, ou em “Mostrar ocultos”.`);
  }
  function toggleSelected(id) {
    id = String(id);
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    const row = document.querySelector(`#fList .fr[data-id="${id}"]`);
    if (row) row.classList.toggle("selected", selectedIds.has(id));
    updateSelectionHint();
  }
  function clearSelected() {
    selectedIds.clear();
    document.querySelectorAll("#fList .fr.selected").forEach(row => row.classList.remove("selected"));
    updateSelectionHint();
  }
  function updateSelectionHint() {
    const el = $("#fSelectionHint");
    if (el) el.textContent = selectedIds.size ? `${selectedIds.size} linha${selectedIds.size === 1 ? "" : "s"} selecionada${selectedIds.size === 1 ? "" : "s"} · Ctrl+C para copiar` : "Use Ctrl+clique para selecionar linhas e Ctrl+C para copiar no Forms (cole na célula VALIDADOR).";
  }
  // Clicar em qualquer coisa da linha: primeiro faz a ação clicada (copiar ID, mensagem, abrir Logistic…)
  // e SÓ DEPOIS abre o pacote centralizado (TRATANDO), já com a ação feita. Não usamos mais o foco/mousedown
  // para abrir, porque a linha saltava para o centro antes do clique terminar e o clique se perdia.
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
    const row = e.target.closest(".fr");
    if (row && (e.ctrlKey || e.metaKey) && !e.target.closest("button,a,select,input,textarea")) {
      e.preventDefault(); e.stopPropagation(); toggleSelected(row.dataset.id); return;
    }
    if (e.target.closest("[data-untrat]")) { markTrat(null); return; }
    const remove = e.target.closest("[data-remove]");
    if (remove) { e.preventDefault(); e.stopPropagation(); removeId(remove.dataset.remove); return; }
    const t = e.target.closest("[data-cp],[data-cpall],[data-h],[data-lg],[data-lga],[data-msgc]");
    if (t) doAction(t);
    // selects abrem a lista nativa: o pacote é aberto quando você escolhe (evento change), não no clique
    if (row && !e.target.closest("select")) markTrat(row.dataset.id);
  });
  function doAction(t) {
    if (t.dataset.msgc !== undefined) {
      const m = MSGS[Number(t.dataset.msgc)];
      if (m) { copy(m[1]); flash(t, "✓ copiado"); }
      return;
    }
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
    if (t.dataset.h) { const h = t.closest(".fr").querySelector(".hist"); h.hidden = !h.hidden; }
  }
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
    markTrat(c.id); // mudou status/validador: a ação já foi feita, agora abre centralizado
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
  // ---------- janela "Status e cores" ----------
  function stCfgHtml() {
    const list = [["PENDENTE", "A VALIDAR", 0], ["RECUSADA", "RECUSADA", 0], ["ANEXADA", "ANEXADA", 0], ["ANULADA", "ANULADA", 0], ["FATURADA", "FATURADA", 0], ["NÃO SUBIR", "EM ANALISE", 0], ...extraStatuses().map(x => [x, x, 1])];
    const rows = list.map(([k, t, ex]) => {
      const c = stColor(k), nCases = A ? A.cases.filter(z => z.status === k).length : 0;
      return `<div class="frow"><span class="bd" style="background:${c};color:${textOn(c)};min-width:120px;text-align:center">${esc(t)}</span><input type="color" data-stc="${esc(k)}" value="${c}" title="Escolher a cor"><span class="mu">${ex ? (stCfg.custom.includes(k) ? "criado aqui" : "veio no arquivo") : "padrão"} · ${nCases} pacote${nCases === 1 ? "" : "s"}</span>${ex && stCfg.custom.includes(k) ? `<button type="button" class="mini" data-stdel="${esc(k)}" title="Remover este status criado aqui">✕</button>` : ""}</div>`;
    }).join("");
    return `<div class="dbox"><h2>🎨 Status e cores</h2><p class="mu">Qualquer status novo que aparecer na coluna <b>STATUS DA EVIDÊNCIA</b> do arquivo já entra sozinho (aba, seletor e cor). O arquivo baixado do Forms não leva a cor dos chips, por isso a cor se escolhe aqui e fica salva neste navegador.</p>${rows}<div class="frow"><input id="stNew" type="text" maxlength="40" placeholder="Novo status (ex.: EM REVISÃO)"><input id="stNewC" type="color" value="#6b7a99"><button id="stAdd" class="pri" type="button">＋ Adicionar</button></div><div class="frow"><button id="stReset" type="button">Restaurar cores padrão</button><button id="stClose" type="button">Fechar ✕</button></div></div>`;
  }
  function openStCfg() {
    let ov = $("#stcfg");
    const refill = () => { ov.innerHTML = stCfgHtml(); };
    const apply = () => { saveStCfg(); if (A) render(); refill(); };
    if (!ov) {
      ov = document.createElement("div"); ov.id = "stcfg"; ov.className = "ov"; document.body.append(ov);
      ov.addEventListener("click", e => {
        if (e.target === ov || e.target.id === "stClose") { ov.hidden = true; return; }
        const del = e.target.closest("[data-stdel]");
        if (del) { const k = del.dataset.stdel; stCfg.custom = stCfg.custom.filter(x => x !== k); delete stCfg.colors[k]; apply(); return; }
        if (e.target.id === "stReset") { stCfg.colors = {}; apply(); return; }
        if (e.target.id === "stAdd") {
          const raw = ($("#stNew").value || "").trim();
          if (!raw) { toast("Digite o nome do novo status."); return; }
          const nome = normStatus(raw);
          if (BUILTIN_ST.has(nome)) { toast("Esse status já existe na lista padrão."); return; }
          if (!stCfg.custom.includes(nome)) stCfg.custom.push(nome);
          stCfg.colors[nome] = $("#stNewC").value;
          apply(); toast(`Status “${nome}” adicionado. Ele já aparece na aba e no seletor de cada pacote.`);
        }
      });
      ov.addEventListener("change", e => { const i = e.target.closest("[data-stc]"); if (i) { stCfg.colors[i.dataset.stc] = i.value; apply(); } });
    }
    refill(); ov.hidden = false;
  }
  $("#fStCfg").onclick = openStCfg;
  $("#fUnhide").onclick = () => { hiddenMap = {}; saveHidden(); selectedIds.clear(); render(); toast("Os IDs ocultos voltaram para a lista."); };
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
    // quando você mexeu (status/validador/motivo) em cada resposta; edições antigas, sem data, não entram
    const edAt = new Map(A.cases.filter(c => c.last.edited).map(c => [c.last.i, c.last.editAt || 0]));
    const allHeaders = allHdrs();
    const tsCol = C.ts || allHeaders.find(isTimestampKey) || "Carimbo de data/hora";
    const header = Core.formsOrder(allHeaders, C, tsCol, true);
    let nEd = 0;
    const picked = out.map((r, i) => ({ r, i })).filter(({ r, i }) => {
      if (rowHidden(r)) return false;
      const d = parseTs(r[tsCol]);
      const inR = !!d && d >= from && d <= to, ed = edIdx.has(i);
      // Entra no arquivo: (a) resposta com carimbo dentro do período, ou (b) resposta de outro dia que
      // VOCÊ alterou aqui dentro do período (ex.: Forms de ontem à noite validado hoje). A linha segue
      // com o carimbo original do Forms. Alterações feitas antes do período não voltam.
      const at = edAt.get(i) || 0, inEdit = ed && at >= from.getTime() && at <= to.getTime();
      const keep = (inR || inEdit) && (!only || ed);
      if (keep && ed) nEd++;
      return keep;
    });
    // sempre na ordem cronológica do Forms, sem linhas repetidas
    const rows = Core.chronoDedupe(picked, C.id, tsCol).map(x => x.r);
    const fmt = (k, h) => `${fmtDay(k).slice(0, 5)} ${pad2(h)}:00`;
    const label = `${fmtDay(d1)} ${pad2(h1)}:00 → ${fmtDay(d2)} ${pad2(h2)}:59`;
    const fullDays = h1 === 0 && h2 === 23;
    const fname = d1 === d2 && fullDays ? `Forms_${dmy(d1)}.xlsx` : `Forms_${dmy(d1)}_${pad2(h1)}h_a_${dmy(d2)}_${pad2(h2)}h.xlsx`;
    return { rows, header, copyHdr: copyHeader(allHeaders, C, tsCol), tsCol, label, fname, nEd, bad: from > to };
  }
  function dlRefresh() {
    if (!forms || !A) { $("#dlInfo").textContent = "Nenhum Forms carregado neste navegador. Feche esta janela e anexe o Forms (.ods/.xlsx/.csv) na aba Análise Forms primeiro."; $("#dlXlsx").disabled = $("#dlCopy").disabled = true; return; }
    if ($("#dlDate2").value < $("#dlDate").value) $("#dlDate2").value = $("#dlDate").value;
    const { rows, label, nEd, bad } = dayData();
    if (bad) { $("#dlInfo").textContent = "O fim do período está antes do começo."; $("#dlXlsx").disabled = $("#dlCopy").disabled = true; return; }
    $("#dlInfo").innerHTML = `<b>${label}</b>: ${rows.length} resposta${rows.length === 1 ? "" : "s"}${nEd ? ` · ${nEd} alterada${nEd === 1 ? "" : "s"} por você` : ""}`;
    $("#dlXlsx").disabled = $("#dlCopy").disabled = !rows.length;
  }
  const setHoje = () => { const t = todayKey(); $("#dlDate").value = t; $("#dlDate2").value = t; $("#dlH1").value = 0; $("#dlH2").value = 23; };
  const lockPeriodo = on => ["#dlDate", "#dlDate2", "#dlH1", "#dlH2"].forEach(s => { $(s).disabled = on; });
  $("#fDown").onclick = () => {
    // A janela SEMPRE abre. Se o Forms ainda não foi carregado neste navegador, ela avisa em vez de ficar muda.
    try {
      setHoje(); lockPeriodo(true);
      $("#dlTabs").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.d === "hoje"));
      $("#dl").hidden = false; dlRefresh();
    } catch (err) {
      console.error(err); $("#dl").hidden = false;
      $("#dlInfo").textContent = "Erro ao preparar o arquivo: " + (err && err.message || err);
    }
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
  // Ao colar no Forms, o carimbo de data/hora não vai junto: a cópia começa na coluna VALIDADOR
  // (na ordem original das colunas do Forms) e segue até o fim.
  const copyHeader = (allHeaders, C, tsCol) => Core.formsOrder(allHeaders, C, tsCol, false);
  function selectedFormsTsv() {
    if (!A || !forms || !selectedIds.size) return "";
    const { out } = Core.applyEdits(forms, A);
    const C = A.cols;
    const allHeaders = allHdrs();
    const tsCol = C.ts || allHeaders.find(isTimestampKey) || "Carimbo de data/hora";
    const header = copyHeader(allHeaders, C, tsCol);
    // Só o envio ATUAL de cada pacote selecionado (1 selecionado = 1 linha; N selecionados = N linhas).
    const rows = Core.currentRowIndexes(A, selectedIds).map(i => out[i]).filter(r => !rowHidden(r));
    return rows.map(r => header.map(h => cellTxt(exportValue(r, h)).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
  }
  function selectedHeaderNames() {
    const allHeaders = allHdrs();
    return copyHeader(allHeaders, A.cols, A.cols.ts || allHeaders.find(isTimestampKey) || "Carimbo de data/hora");
  }
  async function copySelectedForms(btn) {
    if (!selectedIds.size) { toast("Use Ctrl+clique para selecionar pelo menos uma linha."); return; }
    const tsv = selectedFormsTsv();
    if (!tsv) { toast("Não encontrei linhas válidas para copiar."); return; }
    await copy(tsv);
    if (btn) flash(btn, "✓ copiado");
    toast("Copiado: " + selectedHeaderNames().slice(0, 8).join(" → ") + ". Cole na célula VALIDADOR da primeira linha vazia do Forms.");
    updateSelectionHint();
  }
  $("#fCopySelected").onclick = e => copySelectedForms(e.currentTarget);
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
  // copia só as linhas (sem cabeçalho e sem carimbo), separadas por tab: cole na célula VALIDADOR da primeira linha vazia
  $("#dlCopy").onclick = async e => {
    const { rows, copyHdr } = dayData(); if (!rows.length) return;
    const outHeader = copyHdr;
    const tsv = rows.map(r => outHeader.map(h => cellTxt(exportValue(r, h)).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
    await copy(tsv); flash(e.target, `✓ ${rows.length} linhas copiadas`);
  };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { $("#dl").hidden = true; markTrat(null); clearSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !e.target.closest("input,textarea,select")) {
      if (selectedIds.size) { e.preventDefault(); copySelectedForms(); }
    }
  });

  // ---------- Mensagem para Logistic ----------
  const DEFAULT_MSGS = [
    ["Entregue", "O cliente confirma o recebimento do produto"],
    ["PNR Cartão", "O cliente confirma recebimento do cartão."],
    ["Baixado pelo Meli", "A baixa de entrega não foi feita pelo driver"],
    ["Produto diferente", "A entrega foi realizada corretamente, porém o vendedor enviou o produto diferente do que foi comprado"],
    ["Item faltante", "O vendedor enviou o pedido incompleto para o cliente."]
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
