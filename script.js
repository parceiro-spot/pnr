const $ = s => document.querySelector(s);
const ST = ["Com penalidade", "Aguardando comprovante"];
let pnr = null, bsc = null, rows = [], total = 0, statusAll = {};
let cur = ST[0], tipo = "TODOS", data = "TUDO", regional = "TODAS", charts = [];
const brl = v => v.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
const ddmm = d => d.split("-").reverse().join("/");
const isXPT = b => (b || "").toString().trim().toUpperCase().startsWith("E");
const regionBases = {
  "ESPÍRITO SANTO": { xpt: ["EES", "EBA"], svc: ["SES"] },
  "MINAS GERAIS": { xpt: ["EMG"], svc: ["SMG"] },
  "NORDESTE": { xpt: [], svc: ["SBA"] },
  "RIO DE JANEIRO": { xpt: ["ERJ"], svc: ["SRJ"] },
  "SÃO PAULO": { xpt: [], svc: ["SSP"] }
};
const regionName = value => {
  const norm = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  return Object.keys(regionBases).find(r => norm(r) === norm(value)) || "";
};
const regionForBase = base => {
  const norm = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const b = norm(base);
  return Object.keys(regionBases).find(r => [...regionBases[r].xpt, ...regionBases[r].svc].some(code => b === norm(code) || b.startsWith(norm(code)))) || "";
};
// Cada caso tem UMA base só (igual à planilha Análise PNR): o tipo (XPT/SVC) vem dela.
const rowBases = r => [r.base];
const rowHasXPT = r => isXPT(r.base);
const rowHasSVC = r => !isXPT(r.base);
const basesForRow = r => [r.base];
const matchesRegional = r => regional === "TODAS" || basesForRow(r).some(b => regionForBase(b) === regional);
const displayBase = r => r.base;
const field = (r, names) => {
  const norm = s => (s || "").replace(/^\uFEFF/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const wanted = names.map(norm), keys = Object.keys(r || {});
  const key = keys.find(k => wanted.includes(norm(k))) || keys.find(k => wanted.some(n => norm(k).includes(n)));
  return key ? (r[key] || "").toString().trim() : "";
};
const routeKey = value => (value || "").toString().trim().toUpperCase().replace(/\s+/g, "");
const getRegional = r => field(r, ["REGIONAL", "REGIAO", "REGIONAL DE ATENDIMENTO", "REGIONAL OPERACIONAL"]);
// Aceita formatos como "R$ 48.00", "R$ 1.234,56" e "R$ 1,234.56".
function money(v) {
  let s = (v ?? "").toString().trim().replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (comma >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return Number(s) || 0;
}

// O BSC tem ~180 mil linhas x 36 colunas (35 MB). Ler tudo de uma vez travava a aba.
// Agora lê em pedaços (a tela continua viva, com %) e guarda só ROTAS, XPT e SVC.
const findKey = (r, names) => {
  const norm = s => (s || "").replace(/^\uFEFF/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const wanted = names.map(norm), keys = Object.keys(r || {});
  return keys.find(k => wanted.includes(norm(k))) || keys.find(k => wanted.some(n => norm(k).includes(n)));
};
function bscKeep() {
  let K = null;
  return r => {
    K ??= {rota: findKey(r, ["ROTAS", "IDROTA", "ID DA ROTA", "ROTA"]), xpt: findKey(r, ["XPT"]), svc: findKey(r, ["SVC"])};
    return {ROTAS: r[K.rota], XPT: r[K.xpt], SVC: r[K.svc]};
  };
}
function load(file, st, cb, box, keep) {
  $(st).textContent = "lendo " + file.name + "… 0%";
  const out = [];
  Papa.parse(file, {header: true, skipEmptyLines: true, chunkSize: 2 * 1024 * 1024,
    chunk: res => {
      for (const r of res.data) out.push(keep ? keep(r) : r);
      $(st).textContent = "lendo " + file.name + "… " + Math.min(99, Math.round(res.meta.cursor / file.size * 100)) + "%";
    },
    complete: () => {
      cb(out); $(st).textContent = file.name + " · " + out.length.toLocaleString("pt-BR") + " linhas";
      $(box).classList.add("ok");
      setTimeout(build, 30);
    },
    error: e => { $(st).textContent = "erro ao ler " + file.name + ": " + (e && e.message || e); }
  });
}
function wire(box, input, st, cb, mkKeep) {
  const go = f => f && load(f, st, cb, box, mkKeep && mkKeep());
  $(input).onchange = e => go(e.target.files[0]);
  $(box).ondragover = e => e.preventDefault();
  $(box).ondrop = e => { e.preventDefault(); go(e.dataTransfer.files[0]); };
}
wire("#d1", "#f1", "#s1", d => pnr = d);
wire("#d2", "#f2", "#s2", d => bsc = d, bscKeep);

const vazio = v => { v = (v || "").toString().trim().toUpperCase(); return ["", "NULL", "ND", "#N/D"].includes(v) || v.startsWith("BRN"); };

function build() {
  if (!pnr || !bsc) { $("#info").textContent = "Falta subir " + (pnr ? "o SRM BSC." : "o LOGISTICS_PNR."); return; }
  $("#info").textContent = "";
  const mp = new Map();
  for (const r of bsc) {
    const k = routeKey(field(r, ["ROTAS", "IDROTA", "ID DA ROTA", "ROTA"]));
    if (k && !mp.has(k)) mp.set(k, {
      xpt: field(r, ["XPT"]),
      svc: field(r, ["SVC"])
    });
  }
  rows = []; statusAll = {}; total = pnr.length;
  let achou = 0, brnFora = 0;
  for (const r of pnr) {
    const st = field(r, ["STATUS"]);
    statusAll[st] = (statusAll[st] || 0) + 1;
    if (!ST.includes(st)) continue;
    const orig = field(r, ["ESTAÇÃO DE ORIGEM", "ORIGEM"]), rota = field(r, ["ID DA ROTA", "IDROTA", "ROTA"]);
    const hit = mp.get(routeKey(rota)), x = hit?.xpt || "", svc = hit?.svc || "";
    const ok = !!hit;
    if (ok) achou++;
    // Mesma regra das colunas CHECK/BASES do Relatório da planilha da Luiza:
    //  - rota não achada na BSC (ou sem SVC)  -> estação de origem do LOGISTICS
    //  - XPT = null                          -> base SVC da BSC
    //  - senão                               -> base XPT da BSC
    const nulo = v => ["", "NULL"].includes((v || "").toString().trim().toUpperCase());
    const base = (!hit || nulo(svc)) ? orig.trim() : (nulo(x) ? svc.trim() : x.trim());
    // Na aba Análise da planilha as bases BRN ficam desmarcadas no filtro: esses casos não entram em nada.
    if (/^BRN/i.test(base)) { brnFora++; continue; }
    const reg = regionForBase(base);
    rows.push({
      data: field(r, ["DATA DO CASO"]).slice(0, 10), status: st, id: field(r, ["ID DE ENVIO"]),
      valor: money(field(r, ["VALOR DA COMPRA"])),
      base, regional: reg, orig, rota, ok, xpt: x, svc
    });
  }
  const regs = Object.keys(regionBases);
  const oldReg = regional;
  $("#fRegional").innerHTML = '<option value="TODAS">Todas as regionais</option>' + regs.map(r => `<option value="${r}">${r}</option>`).join("");
  regional = regs.includes(oldReg) ? oldReg : "TODAS";
  $("#fRegional").value = regional;
  $("#fRegional").onchange = e => { regional = e.target.value; render(); };
  const dts = [...new Set(rows.map(r => r.data))].sort().reverse();
  $("#fData").innerHTML = '<option value="TUDO">(Tudo)</option>' + dts.map(d => `<option value="${d}">${ddmm(d)}</option>`).join("");
  $("#fData").onchange = e => { data = e.target.value; render(); };
  $("#fStatus").innerHTML = ""; $("#fTipo").innerHTML = "";
  ST.forEach(s => seg("#fStatus", s, () => cur === s, () => cur = s));
  [["TODOS", "Todas (XPT + SVC)"], ["XPT", "XPT"], ["SVC", "SVC"]].forEach(([k, t]) => seg("#fTipo", t, () => tipo === k, () => tipo = k));
  $("#bShot").onclick = () => shot(false); $("#bCopy").onclick = () => shot(true); 
  const n = s => rows.filter(r => r.status === s);
  const vsum = a => a.reduce((t, r) => t + r.valor, 0);
  $("#resumo").innerHTML =
    k("Casos na bandeja", total.toLocaleString("pt-BR"), "linhas do LOGISTICS_PNR (todos os status)") +
    ST.map(s => k(s, n(s).length.toLocaleString("pt-BR"), brl(vsum(n(s))) + " em aberto")).join("") +
    k("Rotas achadas no BSC", achou.toLocaleString("pt-BR"), "de " + rows.length.toLocaleString("pt-BR") + " casos filtrados; o resto usa a base de origem");
  $("#app").hidden = false;
  render();
}
const k = (t, v, s) => `<div class="k"><small>${t}</small><div>${v}</div><em>${s}</em></div>`;
function seg(box, text, on, set) {
  const b = document.createElement("button"); b.textContent = text; b._on = on;
  b.className = on() ? "on" : "";
  b.onclick = () => { set(); $(box).querySelectorAll("button").forEach(x => x.classList.toggle("on", x._on())); render(); };
  $(box).append(b);
}
// Escala de cor do Excel (2ª opção): menor = verde, mediana = amarelo, maior = vermelho
function colorFn(vals) {
  const s = [...vals].sort((a, b) => a - b), lo = s[0], hi = s[s.length - 1], md = s[Math.floor((s.length - 1) / 2)];
  const C = [[99, 190, 123], [255, 235, 132], [248, 105, 107]];
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  return v => hi === lo ? mix(C[1], C[1], 0) : v <= md ? mix(C[0], C[1], md === lo ? 1 : (v - lo) / (md - lo)) : mix(C[1], C[2], hi === md ? 1 : (v - md) / (hi - md));
}
function agg(list) {
  const m = {}; for (const r of list) { const o = m[r.base] ??= {q: 0, v: 0}; o.q++; o.v += r.valor; } return m;
}
const num = v => v.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const topLabel = {
  id: "top",
  afterDatasetsDraw(c) {
    const {ctx} = c, d = c.data.datasets[0], rot = d.labels.length > 14;
    ctx.save(); ctx.font = "bold 12px Segoe UI, Arial"; ctx.fillStyle = getComputedStyle(document.body).color;
    c.getDatasetMeta(0).data.forEach((bar, i) => {
      ctx.save();
      if (rot) { ctx.translate(bar.x + 4, bar.y - 6); ctx.rotate(-Math.PI / 2); ctx.textAlign = "left"; ctx.fillText(d.labels[i], 0, 0); }
      else { ctx.textAlign = "center"; ctx.fillText(d.labels[i], bar.x, bar.y - 6); }
      ctx.restore();
    });
    ctx.restore();
  }
};
function vbar(id, keys, vals, colors, texts) {
  charts.push(new Chart($(id), {
    type: "bar", plugins: [topLabel],
    data: {labels: keys.map(ddmm), datasets: [{data: vals, backgroundColor: colors, labels: texts}]},
    options: {maintainAspectRatio: false, animation: false, layout: {padding: {top: keys.length > 14 ? 90 : 24}},
      plugins: {legend: {display: false}, tooltip: {enabled: false}},
      scales: {y: {display: false}, x: {grid: {display: false}, ticks: {autoSkip: false, font: {size: 12, weight: "bold"}}}}}
  }));
}
function render() {
  charts.forEach(c => c.destroy()); charts = [];
  const byTipo = r => r.status === cur && matchesRegional(r) &&
    (tipo === "TODOS" || (tipo === "XPT" ? rowHasXPT(r) : rowHasSVC(r)));
  const list = rows.filter(r => byTipo(r) && (data === "TUDO" || r.data === data)).map(r => ({...r, base: displayBase(r)}));
  const tot = list.reduce((t, r) => t + r.valor, 0);
  const P = $("#panel");
  P.innerHTML = `<h2 class="ttl">${cur}</h2><p class="tsub">Tipo: ${tipo === "TODOS" ? "XPT + SVC" : tipo} · Data: ${data === "TUDO" ? "(Tudo)" : ddmm(data)} · ${list.length} casos · ${brl(tot)} em aberto</p>
  <div class="tabs">
   <div class="card"><h3>BASES × QUANTIDADE</h3><p>Número de casos por base. Vermelho = mais casos. Clique numa base para ver o detalhe.</p><table class="xl" id="t1"></table></div>
   <div class="card"><h3>BASE × VALOR EM ABERTO</h3><p>Soma do valor das PNR por base. Vermelho = maior valor. Clique numa base para ver o detalhe.</p><table class="xl" id="t2"></table></div>
  </div>
  <div class="card" style="margin-top:12px"><h3>Quantidade por data</h3><p>Casos por data do caso (considera o status e o tipo escolhidos, todas as datas).</p><div class="cv" style="height:320px"><canvas id="c3"></canvas></div></div>
  <div class="card" style="margin-top:12px"><h3>Valor por data</h3><p>Valor em aberto por data do caso.</p><div class="cv" style="height:320px"><canvas id="c4"></canvas></div></div>`;
  if (!list.length) { P.insertAdjacentHTML("beforeend", '<div class="msg">Sem registros nesse filtro.</div>'); return; }
  const A = agg(list), keys = Object.keys(A);
  const byQ = [...keys].sort((a, b) => A[b].q - A[a].q || A[b].v - A[a].v), byV = [...keys].sort((a, b) => A[b].v - A[a].v);
  const cq = colorFn(keys.map(x => A[x].q)), cv = colorFn(keys.map(x => A[x].v));
  $("#t1").innerHTML = "<tr><th>BASES</th><th>QUANTIDADE</th></tr>" +
    byQ.map(x => `<tr data-b="${x}"><td>${x}</td><td class=q style="background:${cq(A[x].q)}">${A[x].q}</td></tr>`).join("") +
    `<tr class=tot><td>Total Geral</td><td class=q>${list.length}</td></tr>`;
  $("#t2").innerHTML = "<tr><th>BASE</th><th>VALOR EM ABERTO</th></tr>" +
    byV.map(x => `<tr data-b="${x}"><td>${x}</td><td class=v style="background:${cv(A[x].v)}"><div><span>R$</span><span>${num(A[x].v)}</span></div></td></tr>`).join("") +
    `<tr class=tot><td>Total Geral</td><td class=v><div><span>R$</span><span>${num(tot)}</span></div></td></tr>`;
  document.querySelectorAll("#panel tr[data-b]").forEach(tr => tr.onclick = () => openDetail(tr.dataset.b));
  const D = {};
  for (const r of rows.filter(byTipo)) { const o = D[r.data] ??= {q: 0, v: 0}; o.q++; o.v += r.valor; }
  const ds = Object.keys(D).sort(), dq = colorFn(ds.map(d => D[d].q)), dv = colorFn(ds.map(d => D[d].v));
  Chart.defaults.color = getComputedStyle(document.body).color;
  vbar("#c3", ds, ds.map(d => D[d].q), ds.map(d => dq(D[d].q)), ds.map(d => String(D[d].q)));
  vbar("#c4", ds, ds.map(d => D[d].v), ds.map(d => dv(D[d].v)), ds.map(d => "R$ " + Math.round(D[d].v).toLocaleString("pt-BR")));
}
function openDetail(base) {
  const items = rows.filter(r => displayBase(r) === base && matchesRegional(r) &&
    (tipo === "TODOS" || (tipo === "XPT" ? rowHasXPT(r) : rowHasSVC(r))) && (data === "TUDO" || r.data === data));
  const tb = (s, cor) => {
    const l = items.filter(r => r.status === s).sort((a, b) => b.valor - a.valor);
    return `<div class="card"><table class="xl d"><tr><th style="background:${cor}">DATA</th><th style="background:${cor}">STATUS</th><th style="background:${cor}">ID DA PNR</th><th style="background:${cor}">QTD</th><th style="background:${cor}">VALOR DAS PNR</th></tr>` +
      l.map(r => `<tr><td>${ddmm(r.data)}</td><td>${r.status}</td><td>${r.id}</td><td class=q>1</td><td class=v><div><span>R$</span><span>${num(r.valor)}</span></div></td></tr>`).join("") +
      `<tr class=tot><td colspan=3>Total ${s}</td><td class=q>${l.length}</td><td class=v><div><span>R$</span><span>${num(l.reduce((t, r) => t + r.valor, 0))}</span></div></td></tr></table></div>`;
  };
  $("#dpanel").innerHTML = `<h2 class="ttl">${base} · ${isXPT(base) ? "XPT" : "SVC"}</h2><p class="tsub">Detalhe de cada PNR · Data: ${data === "TUDO" ? "(Tudo)" : ddmm(data)} · ordenado do maior valor para o menor</p><div class="tabs">${tb(ST[0], "#70AD47")}${tb(ST[1], "#4472C4")}</div>`;
  $("#modal").hidden = false; $("#modal").scrollTop = 0; curBase = base;
}
let curBase = "";
$("#mClose").onclick = () => $("#modal").hidden = true;
$("#mShot").onclick = () => shot(false, $("#dpanel"), `PNR_detalhe_${curBase}.png`);
$("#mCopy").onclick = () => shot(true, $("#dpanel"), `PNR_detalhe_${curBase}.png`);
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#modal").hidden = true; });
const canvas = (el = $("#panel")) => html2canvas(el, {backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2});
async function dl(c, name) {
  const blob = await new Promise(r => c.toBlob(r));
  try { const D = window.claude && await claude.use("downloads"); if (D) { await D.save({filename: name, data: blob}); return; } } catch (e) { if (e && e.code === "declined") return; }
  const a = document.createElement("a"); a.download = name; a.href = URL.createObjectURL(blob); a.click();
}
const sync = () => document.querySelectorAll("#fStatus button, #fTipo button").forEach(x => x.classList.toggle("on", x._on()));
async function shot(copy, el, nm) {
  const c = await canvas(el);
  if (copy) {
    try { const b = await new Promise(r => c.toBlob(r)); await navigator.clipboard.write([new ClipboardItem({"image/png": b})]); alert("Print copiado! Cole com Ctrl+V."); return; } catch (e) {}
  }
  await dl(c, nm || `PNR_${cur.replace(/ /g, "_")}_${tipo}.png`);
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#theme").textContent = t === "dark" ? "☀️ Tema claro" : "🌙 Tema escuro";
  try { localStorage.setItem("tema", t); } catch (e) {}
  if (rows.length && !$("#app").hidden) render();
}
$("#theme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
{ let t = null; try { t = localStorage.getItem("tema"); } catch (e) {}
  setTheme(t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")); }
