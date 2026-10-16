(function(){
'use strict';

const REGIONAL_ORDER = ['ESPÍRITO SANTO','MINAS GERAIS','BAHIA','SÃO PAULO','RIO DE JANEIRO'];
const REGIONAL_LABELS = {'TODOS':'TODOS OS REGIONAIS','ESPÍRITO SANTO':'ESPÍRITO SANTO','MINAS GERAIS':'MINAS GERAIS','BAHIA':'NORDESTE','RIO DE JANEIRO':'RIO DE JANEIRO','SÃO PAULO':'SÃO PAULO'};
const STATE_COLORS = {'ESPÍRITO SANTO':'#00e676','MINAS GERAIS':'#00c853','BAHIA':'#26a69a','RIO DE JANEIRO':'#ffd700','SÃO PAULO':'#008a3c'};
const BUCKET_LABELS = {ATE2:'Até 2 dias','3A6':'3 a 6 dias','7A10':'7 a 10 dias',MAIS11:'Mais de 11 dias'};
const BUCKET_KEYS = ['ATE2','3A6','7A10','MAIS11'];
const REASON_LABELS = {'MISSING':'Pacote faltando','UNVISITED_ADDRESS':'Endereço não visitado','BUYER_ABSENT':'Comprador ausente','BUYER_REJECTED':'Comprador recusou','BUSINESS_CLOSED':'Estabelecimento fechado','BAD_ADDRESS':'Endereço incorreto','MISSROUTED':'Roteirizado incorretamente','INACCESSIBLE_ADDRESS':'Endereço inacessível','BLOCKED_BY_KEYWORD':'Bloqueado por palavra-chave','BUYER_MOVED':'Comprador mudou-se'};
const REASON_WORD_LABELS = {MISSING:'faltando',PACKAGE:'pacote',SHIPMENT:'envio',ORDER:'pedido',NOT:'não',DELIVERED:'entregue',DELIVERY:'entrega',UNDELIVERABLE:'não entregue',UNVISITED:'não visitado',ADDRESS:'endereço',BUYER:'comprador',CUSTOMER:'cliente',ABSENT:'ausente',REJECTED:'recusou',REFUSED:'recusado',BUSINESS:'estabelecimento',CLOSED:'fechado',BAD:'incorreto',WRONG:'incorreto',INVALID:'inválido',MISSROUTED:'roteirizado incorretamente',ROUTE:'rota',ROUTED:'roteirizado',INACCESSIBLE:'inacessível',BLOCKED:'bloqueado',KEYWORD:'palavra-chave',MOVED:'mudou-se',DAMAGED:'danificado',LOST:'perdido',CANCELLED:'cancelado',CANCELED:'cancelado',NO:'sem',ACCESS:'acesso',AVAILABLE:'disponível',WEATHER:'clima',TRAFFIC:'trânsito',RETRY:'tentar novamente',OTHER:'outro',UNKNOWN:'desconhecido',ERROR:'erro'};

const STORAGE_KEY='spot_dashboard_registros_v4';
const IMPORTS_KEY='spot_dashboard_imports_v1';
const DRIVER_MAP_KEY='spot_dashboard_drivermap_v2';
const OFF_BUCKET_KEY='spot_off_bucket_v2';
const SELECTED_IMPORT_KEY='spot_selected_import_v1';
const THEME_KEY='spot_dashboard_theme_v1';
const LOST_ROUTES_KEY='spot_dashboard_lost_routes_v1';
let LOST_ROUTES=[];
let pendingLostFile=null;
let exportLostOnlyMode=false;
const PASSWORD_CONFIRM='Mudar123';
const PUBLIC_VIEW_MODE=new URLSearchParams(window.location.search).get('modo')==='publico';
if(PUBLIC_VIEW_MODE) document.documentElement.classList.add('public-view-mode');
function checkPassword(v){ return v!=null && v.trim().toLowerCase()===PASSWORD_CONFIRM.toLowerCase(); }

let IMPORTS=[];
let RETURN_SHEETS=[];
let DRIVER_MAP={};
let driverFileName=null, driverSavedAt=null, driverRows=0;
let STATE_DATA={};
let currentTab='TODOS';
let currentBaseFilter='TODAS';
let topBasesMode='TODOS';
let offendersSearch=''; let offendersThreshold=0;
let offendersBucket='TODOS';
const offendersCollapsedRegionals=new Set();
let regionalNav={level:'list', regional:null};
let lostRouteNav={level:'list', regional:null};
let lostRouteSearch='';
let regionalSearch='';
let regionalBaseBucket='TODOS';
let regionalAgeFilter='TODOS';
let selectedImportId=null;
let importsHistCollapsed=false;
let historyDayFilters=new Set();
let returnHistMonth='';
let returnHistCollapsed=false;
let importsHistMonth='';
let pendingImportFile=null;
let importDateManuallySet=false, lostDateManuallySet=false;
let pendingReturnFile=null;
let pendingDriverFile=null;
let exportSeedEntries=null;
let chartAnaliseDia=null, chartAnaliseRegional=null, chartAnaliseOfensoras=null;
let analiseBaseRows=[];
let revStatusFilter='TODOS';
let motoristaSelecionado='';
const chartValueLabels={id:'chartValueLabels',afterDatasetsDraw(chart){const ctx=chart.ctx;const horizontal=chart.options.indexAxis==='y';ctx.save();ctx.font='700 10px Arial';ctx.fillStyle=cssColor('--text-primary','#f5f5f5');ctx.textBaseline='middle';chart.data.datasets.forEach((dataset,di)=>{const meta=chart.getDatasetMeta(di);meta.data.forEach((bar,i)=>{const value=dataset.data[i];if(value==null)return;const pos=bar.tooltipPosition();if(horizontal){ctx.textAlign='left';ctx.fillText(fmtBRL(value),Math.max(pos.x,bar.base)+7,pos.y);}else{ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(fmtBRL(value),pos.x,pos.y-6);}});});ctx.restore();}};

/* ===== UTILITÁRIOS ===== */
function norm(v){ return v==null?'':String(v).trim().toUpperCase(); }
function parseBRNumber(v){
  if(v==null||v==='') return 0;
  if(typeof v==='number') return Number.isFinite(v)?v:0;
  let s=String(v).trim().replace(/[^0-9,.-]/g,''); if(!s) return 0;
  const comma=s.lastIndexOf(','), dot=s.lastIndexOf('.');
  if(comma>=0&&dot>=0) s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(comma>=0) s=s.replace(/\./g,'').replace(',','.');
  else if(/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  const n=Number(s); return Number.isFinite(n)?n:0;
}
function fmtBRL(v){ return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function fmtInt(v){ return (v||0).toLocaleString('pt-BR'); }
function fmtDateShort(d){ return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); }
function escHtml(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
const THEME_LABELS={dark:'Escuro original',light:'Branco com verde'};
function applyTheme(theme){
  if(theme==='pink') theme='light';
  if(!THEME_LABELS[theme]) theme='dark';
  document.documentElement.classList.remove('theme-light','theme-pink');
  if(theme!=='dark') document.documentElement.classList.add('theme-'+theme);
  try{ localStorage.setItem(THEME_KEY,theme); }catch(e){}
  document.querySelectorAll('.theme-option').forEach(btn=>btn.classList.toggle('active',btn.dataset.theme===theme));
  [chartAnaliseDia,chartAnaliseRegional,chartAnaliseOfensoras].forEach(chart=>{ if(chart) chart.update(); });
}
function cssColor(name,fallback){ const value=getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return value||fallback; }
function initThemePicker(){
  const picker=document.getElementById('themePicker'), button=document.getElementById('themeButton'), menu=document.getElementById('themeMenu');
  if(!picker||!button||!menu) return;
  let saved='dark';
  try{ saved=localStorage.getItem(THEME_KEY)||'dark'; }catch(e){}
  applyTheme(saved);
  button.addEventListener('click',function(e){ e.stopPropagation(); const open=menu.classList.toggle('show'); button.setAttribute('aria-expanded',String(open)); });
  menu.addEventListener('click',function(e){ const option=e.target.closest('.theme-option'); if(!option) return; applyTheme(option.dataset.theme); menu.classList.remove('show'); button.setAttribute('aria-expanded','false'); });
  document.addEventListener('click',function(e){ if(!picker.contains(e.target)){ menu.classList.remove('show'); button.setAttribute('aria-expanded','false'); } });
}
function getDriverName(id){ if(!id) return 'Não identificado'; return DRIVER_MAP[String(id).trim()] || ('Motorista '+id); }
function friendlyReason(raw){ const k=norm(raw); if(!k) return 'Não informado'; if(REASON_LABELS[k]) return REASON_LABELS[k]; const words=k.split(/[_\s-]+/).filter(Boolean).map(w=>REASON_WORD_LABELS[w]||w.toLowerCase()); const text=words.join(' ').trim(); return text?text.charAt(0).toUpperCase()+text.slice(1):'Não informado'; }
function diasParado(date, referencia){
  if(date && typeof date==='object' && date.diasPlanilha!==null && date.diasPlanilha!==undefined && Number.isFinite(Number(date.diasPlanilha))) return Math.max(0,Number(date.diasPlanilha));
  const imp=(typeof getSelectedImport==='function')?getSelectedImport():null;
  const t=new Date((referencia||((imp&&imp.importDate)?imp.importDate+'T00:00:00':new Date()))); t.setHours(0,0,0,0);
  const rawDate=date&&typeof date==='object'&&'date' in date?date.date:date;
  const d=(rawDate instanceof Date)?new Date(rawDate.getTime()):parseDateBR(rawDate); d.setHours(0,0,0,0);
  if(isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((t-d)/86400000));
}
function riscoDiasParado(dias){
  const n=Number(dias)||0;
  if(n>=2) return {key:'alto',label:'Alto',title:'Mais de 48 horas parado'};
  if(n>=1) return {key:'medio',label:'Médio',title:'Entre 24 e 48 horas parado'};
  return {key:'baixo',label:'Baixo',title:'Menos de 24 horas parado'};
}
function fmtDateFullBR(v){ const d=v instanceof Date?v:new Date(v); return isNaN(d)?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function bucketOf(dias){ if(dias<=2) return 'ATE2'; if(dias<=6) return '3A6'; if(dias<=10) return '7A10'; return 'MAIS11'; }
/* Cores de atraso: até 2 dias azul, 3 a 6 laranja, 7 a 10 vermelho, 11+ vermelho forte */
function diasClass(dias){ if(dias<=2) return 'dias-ok'; if(dias===3) return 'dias-3'; if(dias===4) return 'dias-4'; return 'dias-5'; }
function diasFillExcel(dias){ if(dias<=2) return '#BDD7EE'; if(dias<=3) return '#F4B183'; if(dias===4) return '#F4CCCC'; return '#C00000'; }
function resumo(txt,max){ const s=String(txt||'').trim(); if(!s) return '—'; return s.length>max ? s.slice(0,max-1)+'…' : s; }
let FIRST_IMPORT_DATE_INDEX=null;
function firstImportDateForPackage(pacote, fallbackDate){
  const key=String(pacote||'').trim();
  if(!key || !IMPORTS.length) return fallbackDate ? new Date(fallbackDate) : new Date();
  if(!FIRST_IMPORT_DATE_INDEX){
    const ordered=IMPORTS.slice().sort((a,b)=>((a.importDate||'9999-99-99')+'|'+(a.savedAt||'')).localeCompare((b.importDate||'9999-99-99')+'|'+(b.savedAt||'')));
    FIRST_IMPORT_DATE_INDEX=new Map();
    ordered.forEach(imp=>(imp.entries||[]).forEach(e=>{ const packageKey=String(e.pacote||'').trim(); if(packageKey&&!FIRST_IMPORT_DATE_INDEX.has(packageKey)) FIRST_IMPORT_DATE_INDEX.set(packageKey,imp.importDate); }));
  }
  const first=FIRST_IMPORT_DATE_INDEX.get(key);
  return first ? new Date(first+'T00:00:00') : (fallbackDate ? new Date(fallbackDate) : new Date());
}
function regionalFromBasePrefix(base){
  if(!base) return null;
  if(base.startsWith('SES')||base.startsWith('EES')||base.startsWith('EBA')) return 'ESPÍRITO SANTO';
  if(base.startsWith('SMG')||base.startsWith('EMG')) return 'MINAS GERAIS';
  if(base.startsWith('SBA')) return 'BAHIA';
  if(base.startsWith('SRJ')||base.startsWith('ERJ')) return 'RIO DE JANEIRO';
  if(base.startsWith('SSP')) return 'SÃO PAULO';
  return null;
}
const SVC_BASES=new Set(['SES1','SES2','SES3','SMG1','SMG2','SMG3','SMG5','SMG6','SMG8','SMG11','SMG12','SMG13','SMG14','SMG15','SRJ1','SRJ2','SRJ3','SRJ4','SRJ5','SRJ6','SRJ7','SRJ8','SRJ10','SRJ12','SRJ13']);
const XPT_BASES=new Set(['EBA32','EES3','EES6','EES8','EMG8','EMG17','EMG21','EMG25','EMG39','EMG40','ERJ2','ERJ6']);
function normalizeBaseCode(codeRaw){ const code=norm(codeRaw); if(!code) return ''; if(/^BR[A-Z]/.test(code)) return ''; return code; }
function classifyBaseCode(code, originRegional){
  if(!code) return null;
  if(SVC_BASES.has(code)) return 'SVC';
  if(XPT_BASES.has(code)) return 'XPT';
  if(originRegional==='BAHIA'||originRegional==='SÃO PAULO') return 'SVC';
  if(/^S(ES|MG|RJ|BA|SP)/.test(code)) return 'SVC';
  if(/^E(ES|MG|RJ|BA)/.test(code)) return 'XPT';
  return null;
}
function findRegionalByBase(baseName){ for(const r of REGIONAL_ORDER){ if(!STATE_DATA[r]) continue; if(STATE_DATA[r].entries.some(e=>e.base===baseName)) return r; } return null; }
const BASE_RELATIONS={SMG3:['EMG40'],EMG40:['SMG3'],SMG13:['EMG8','EMG25'],EMG8:['SMG13'],EMG25:['SMG13']};
function basePartners(base){
  const code=normalizeBaseCode(base); if(BASE_RELATIONS[code]) return BASE_RELATIONS[code];
  const m=code.match(/^[SE]([A-Z]+)(\d+)$/); if(!m) return [];
  const prefix=m[1], n=m[2], candidate=(code[0]==='S'?'E':'S')+prefix+n;
  return candidate!==code && (SVC_BASES.has(candidate)||XPT_BASES.has(candidate)) ? [candidate] : [];
}
function basePartner(base){ return basePartners(base).join(' & '); }
function baseInfoLabel(base){
  const code=normalizeBaseCode(base); if(!code) return '';
  const tipo=classifyBaseCode(code,regionalFromBasePrefix(code))||''; const partner=basePartner(code);
  return partner ? `${code} <small class=\"base-relation\">${tipo} de ${partner}</small>` : `${code} <small class=\"base-relation\">${tipo}</small>`;
}

function baseInfoText(base){ const code=normalizeBaseCode(base); const tipo=classifyBaseCode(code,regionalFromBasePrefix(code))||'base'; const partner=basePartner(code); return partner?`${code} ${tipo} de ${partner}`:`${code} ${tipo}`; }
function normalizePackageKey(v){
  let s=String(v??'').replace(/\u00a0/g,' ').trim().replace(/\s+/g,'');
  if(/^[+-]?\d+(?:[\.,]\d+)?e[+-]?\d+$/i.test(s)){ const n=Number(s.replace(',','.')); if(Number.isFinite(n)) s=String(Math.trunc(n)); }
  if(/^\d+\.0+$/.test(s)) s=s.replace(/\.0+$/,'');
  return s;
}
function parseDateBR(v){ if(v instanceof Date) return v; if(typeof v==='number'){ const e=new Date(Date.UTC(1899,11,30)); return new Date(e.getTime()+v*86400000); } const s=String(v||'').trim(); const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m) return new Date(Number(m[3]),Number(m[2])-1,Number(m[1])); const f=new Date(s); return isNaN(f)?new Date():f; }
function parsePlanilhaDias(v){
  if(v==null||v==='') return null;
  if(typeof v==='number'&&Number.isFinite(v)) return Math.max(0,Math.round(v));
  const s=norm(v).replace(/Á/g,'A');
  if(/ATE\s*2|AT[EÉ]\s*2/.test(s)) return 2;
  if(/3\s*A\s*6/.test(s)) return 3;
  if(/7\s*A\s*10/.test(s)) return 7;
  if(/MAIS|\+\s*11|11\s*OU/.test(s)) return 11;
  const n=s.match(/-?\d+(?:[\.,]\d+)?/); return n?Math.max(0,Math.round(Number(n[0].replace(',','.')))):null;
}
function findDaysColumn(idx){
  const keys=Object.keys(idx);
  const preferred=['DIAS_PARADO','DIAS PARADO','DIAS_PARADOS','AGING','DAYS_STUCK','DAYS_PARADO','DIAS EM RISCO'];
  for(const key of preferred){ if(idx[key]!==undefined) return idx[key]; }
  const key=keys.find(k=>(k.includes('DIAS')||k.includes('DAYS')||k.includes('AGING'))&&(k.includes('PARAD')||k.includes('STUCK')||k.includes('LOST')||k.includes('RISCO')||k==='AGING'));
  return key===undefined?undefined:idx[key];
}
function parseDelimitedText(text,delim){ const rows=[]; let row=[],field='',inQ=false; for(let i=0;i<text.length;i++){ const c=text[i]; if(inQ){ if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else inQ=false; } else field+=c; } else if(c==='"'){ inQ=true; } else if(c===delim){ row.push(field);field=''; } else if(c==='\r'){ } else if(c==='\n'){ row.push(field);field=''; rows.push(row);row=[]; } else field+=c; } if(field.length||row.length){ row.push(field);rows.push(row); } return rows.filter(r=>!(r.length===1&&r[0].trim()==='')); }
function detectDelimiter(text){
  const sample=String(text||'').split(/\r?\n/).filter(line=>line.trim()!=='').slice(0,16).join('\n');
  const candidates=[',',';','\t'];
  let best=',', bestScore=Infinity;
  candidates.forEach(delim=>{
    const parsed=parseDelimitedText(sample,delim), widths=parsed.map(row=>row.length);
    if(widths.length<2){if(widths[0]>1&&bestScore===Infinity)best=delim;return;}
    const data=widths.slice(1), sorted=data.slice().sort((a,b)=>a-b), median=sorted[Math.floor(sorted.length/2)]||1;
    const mean=data.reduce((sum,n)=>sum+n,0)/data.length;
    const variance=data.reduce((sum,n)=>sum+(n-mean)*(n-mean),0)/data.length;
    const score=Math.abs(widths[0]-median)*10+variance+Math.abs(mean-median)-widths[0]*0.001;
    if(score<bestScore){bestScore=score;best=delim;}
  });
  return best;
}
function buildHeaderIndex(hr){ const idx={}; (hr||[]).forEach((h,i)=>idx[norm(h)]=i); return idx; }

function buildEntriesFromRawRows(rows){
  if(!rows||!rows.length) return null;
  const idx=buildHeaderIndex(rows[0]);
  const colData=idx['DATA_INSUCESSO'], colDias=findDaysColumn(idx), colFacil=idx['SHP_LG_FACILITY_ID'], colDest=idx['ROUTE_DESTINATION_FACILTY_ID'], colGmv=idx['GMV_BRL'], colPacote=idx['SHP_SHIPMENT_ID'], colProduto=idx['SHP_ITEM_DESC'], colDriver=idx['SHP_LG_DRIVER_ID'], colRota=idx['SHP_LG_ROUTE_ID'], colMotivo=idx['SHP_LG_INSUCCESS_REASON'];
  if(colData===undefined||colFacil===undefined||colGmv===undefined) return null;
  const out=[];
  for(let r=1;r<rows.length;r++){
    const row=rows[r]; if(!row||!row.length) continue;
    const baseSvc=norm(row[colFacil]); if(!baseSvc) continue;
    const originRegional=regionalFromBasePrefix(baseSvc);
    if(!originRegional) continue;
    const destCode=colDest!==undefined?normalizeBaseCode(row[colDest]):'';
    let finalBase, tipo;
    if(!destCode || originRegional==='BAHIA' || originRegional==='SÃO PAULO'){
      finalBase=baseSvc; tipo='SVC';
    } else {
      const cls=classifyBaseCode(destCode, originRegional);
      if(cls){ finalBase=destCode; tipo=cls; } else { finalBase=baseSvc; tipo='SVC'; }
    }
    out.push({
      base:finalBase, valor:parseBRNumber(row[colGmv]), date:parseDateBR(row[colData]), diasPlanilha:colDias!==undefined?parsePlanilhaDias(row[colDias]):null, tipo,
      pacote:colPacote!==undefined?normalizePackageKey(row[colPacote]):'',
      produto:colProduto!==undefined?String(row[colProduto]||'').trim():'',
      driverId:colDriver!==undefined?String(row[colDriver]||'').trim():'',
      rota:colRota!==undefined?String(row[colRota]||'').trim():'',
      motivo:colMotivo!==undefined?friendlyReason(row[colMotivo]):'Não informado'
    });
  }
  return out;
}
function normalizeReturnHeader(v){
  return norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
}
/* Cabeçalho só é reconhecido por nome EXATO da coluna. Antes usava includes(): uma linha de dados com
   'Pacote faltando' no MOTIVO e 'motivo/observação...' na justificativa virava "cabeçalho" e desalinhava
   todo o bloco da base (observações perdidas). */
const RETURN_PKG_KEY_RE=/^(ID|ID_?(DO_)?(PACOTE|SHIPMENT)|PACOTE(_ID)?|N_?(DO_)?PACOTE|NUMERO_(DO_)?PACOTE|COD(IGO)?_(DO_)?PACOTE|SHIPMENT(_ID)?|SHP_SHIPMENT_ID)$/;
const RETURN_JUST_KEY_RE=/^(JUSTIFICATIVAS?(_.*)?|OBSERVACAO|OBSERVACOES|OBS|RAZAO|MOTIVO)$/;
const RETURN_SITUATION_KEY_RE=/^(?:SITUACAO|SITUATION|STATUS|FILA)(?:_|$)/;
const SITUATION_OPTIONS=[
  {label:'Para solução de problema',color:'#f3d316',font:'#1d1d1d'},
  {label:'Despachar',color:'#f3d316',font:'#1d1d1d'},
  {label:'Faltante',color:'#ff8a00',font:'#111111'},
  {label:'Não encontrado no ato do carregamento',color:'#ef3f56',font:'#ffffff'},
  {label:'Parado',color:'#ff8a00',font:'#111111'},
  {label:'Em rota de entrega',color:'#9be15d',font:'#163300'},
  {label:'Entregue',color:'#00a83b',font:'#ffffff'},
  {label:'Em outra base',color:'#f3d316',font:'#1d1d1d'},
  {label:'Para devolver',color:'#c7a0ff',font:'#24103f'},
  {label:'Devolução',color:'#8e44ad',font:'#ffffff'},
  {label:'Devolução | Comprador recusou',color:'#5b176f',font:'#ffffff'},
  {label:'Perdido',color:'#ef3f56',font:'#ffffff'},
  {label:'Outros',color:'#4da3ff',font:'#07182d'}
];
const SITUATION_BY_LABEL=Object.fromEntries(SITUATION_OPTIONS.map(item=>[item.label,item]));
function isReturnPackageKey(k){ return RETURN_PKG_KEY_RE.test(k); }
function isReturnJustKey(k){ return RETURN_JUST_KEY_RE.test(k); }
function isReturnSituationKey(k){ return RETURN_SITUATION_KEY_RE.test(k); }
const RETURN_SITUATION_PRIMARY_RE=/^(?:SITUACAO|SITUATION|STATUS)(?:_|$)/;
const RETURN_QUEUE_RE=/^FILA(?:_|$)/;
function returnSituationColumnKey(keys){ return keys.find(k=>RETURN_SITUATION_PRIMARY_RE.test(k))||keys.find(k=>RETURN_QUEUE_RE.test(k))||null; }
function findReturnHeader(rows){
  const max=Math.min(rows?.length||0,60);
  for(let rowIndex=0;rowIndex<max;rowIndex++){
    const raw=rows[rowIndex]||[], keys=raw.map(normalizeReturnHeader);
    const hasPackage=keys.some(isReturnPackageKey);
    const hasJust=keys.some(isReturnJustKey);
    const hasSituation=keys.some(isReturnSituationKey);
    if(hasPackage&&(hasJust||hasSituation )&&!keys.some(k=>/^\d{8,}$/.test(k))) return {rowIndex,keys};
  }
  return null;
}
function buildReturnRowsFromRawRows(rows,photosByRow){
  if(!rows||!rows.length) return null;
  const headers=[];
  for(let rowIndex=0;rowIndex<rows.length;rowIndex++){ const raw=rows[rowIndex]||[], keys=raw.map(normalizeReturnHeader); const hasPackage=keys.some(isReturnPackageKey); const hasJust=keys.some(isReturnJustKey); const hasSituation=keys.some(isReturnSituationKey); if(hasPackage&&(hasJust||hasSituation)&&!keys.some(k=>/^\d{8,}$/.test(k))) headers.push({rowIndex,keys}); }
  if(!headers.length) return null;
  const out=[];
  headers.forEach((header,headerIndex)=>{
    const idx={}; header.keys.forEach((key,i)=>{if(key&&!Object.prototype.hasOwnProperty.call(idx,key)) idx[key]=i;});
    const colPacote=idx['PACOTE']!==undefined?idx['PACOTE']:(Object.keys(idx).find(isReturnPackageKey)!==undefined?idx[Object.keys(idx).find(isReturnPackageKey)]:undefined);
    const colBase=idx['BASE']!==undefined?idx['BASE']:(idx['SHP_LG_FACILITY_ID']!==undefined?idx['SHP_LG_FACILITY_ID']:undefined);
    const colRota=idx['ROTA']!==undefined?idx['ROTA']:(idx['ID_DA_ROTA']!==undefined?idx['ID_DA_ROTA']:(idx['SHP_LG_ROUTE_ID']!==undefined?idx['SHP_LG_ROUTE_ID']:idx['ROUTE']));
    const colDriver=idx['MOTORISTA']!==undefined?idx['MOTORISTA']:(idx['ID_DO_MOTORISTA']!==undefined?idx['ID_DO_MOTORISTA']:(idx['SHP_LG_DRIVER_ID']!==undefined?idx['SHP_LG_DRIVER_ID']:idx['DRIVER']));
    const colJust=idx['OBSERVACAO']!==undefined?idx['OBSERVACAO']:(idx['JUSTIFICATIVA']!==undefined?idx['JUSTIFICATIVA']:(Object.keys(idx).find(isReturnJustKey)!==undefined?idx[Object.keys(idx).find(isReturnJustKey)]:undefined));
    const situationHeader=returnSituationColumnKey(Object.keys(idx)); const colSituation=situationHeader!==null?idx[situationHeader]:undefined;
    const colPhoto=Object.keys(idx).find(k=>k.includes('FOTO')||k.includes('IMAGEM')||k.includes('PHOTO'))!==undefined?idx[Object.keys(idx).find(k=>k.includes('FOTO')||k.includes('IMAGEM')||k.includes('PHOTO'))]:undefined;
    if(colPacote===undefined || (colJust===undefined && colSituation===undefined)) return;
    const end=headerIndex+1<headers.length?headers[headerIndex+1].rowIndex:rows.length;
    for(let r=header.rowIndex+1;r<end;r++){
      const row=rows[r]||[], pacote=normalizePackageKey(row[colPacote]);
      if(!pacote || pacote==='PACOTE') continue;
      const justificativa=colJust!==undefined?String(row[colJust]??'').trim():'';
      const situacao=SITUATION_BY_LABEL[String(row[colSituation]??'').trim()]?String(row[colSituation]??'').trim():'';
      const photoCell=colPhoto!==undefined?String(row[colPhoto]??'').trim():'';
      const photo=photosByRow?.[r]||null;
      const photoIndicator=photoCell==='FOTO ANEXADA'||photoCell==='PHOTO ATTACHED'||Boolean(photo);
      if(!justificativa && !situacao && !photoIndicator) continue;
      out.push({pacote,rota:colRota!==undefined?normalizePackageKey(row[colRota]):'',base:normalizeBaseCode(row[colBase]??''),driverId:colDriver!==undefined?normalizePackageKey(row[colDriver]):'',justificativa,situacao,photo,photoIndicator,updatedAt:new Date().toISOString()});
    }
  });
  return out.length?out:null;
}
function xmlNodes(xml,tag){ return Array.from(xml?.getElementsByTagNameNS('*',tag)||[]); }
function joinZipPath(base,target){ const parts=(base+'/'+String(target||'')).split('/'),out=[]; parts.forEach(p=>{if(!p||p==='.')return;if(p==='..')out.pop();else out.push(p);}); return out.join('/'); }
function relMap(xml){ const out={}; xmlNodes(xml,'Relationship').forEach(n=>{out[n.getAttribute('Id')]=n.getAttribute('Target')||'';}); return out; }
async function extractWorkbookPhotos(buffer){
  if(typeof JSZip==='undefined') return {};
  const zip=await JSZip.loadAsync(buffer), photoSheets={};
  const readXml=async path=>{const f=zip.file(path);return f?new DOMParser().parseFromString(await f.async('string'),'application/xml'):null;};
  const richRelXml=await readXml('xl/richData/richValueRel.xml'), richRelsXml=await readXml('xl/richData/_rels/richValueRel.xml.rels'), richValueXml=await readXml('xl/richData/rdrichvalue.xml'), metadataXml=await readXml('xl/metadata.xml');
  const richRelIds=xmlNodes(richRelXml,'rel').map(n=>n.getAttribute('r:id')||n.getAttribute('id')||'');
  const richRelTargets=relMap(richRelsXml);
  const richValues=xmlNodes(richValueXml,'rv').map(rv=>xmlNodes(rv,'v').map(v=>Number(v.textContent||0)));
  const vmToRv={}; xmlNodes(metadataXml,'rc').forEach((n,i)=>{vmToRv[String(i+1)]=Number(n.getAttribute('v')??i);});
  const embeddedImagePath=Object.keys(zip.files).find(p=>/^xl\/media\//i.test(p)&&!zip.files[p].dir)||null;
  const photoData=async mediaPath=>{
    const file=mediaPath&&zip.file(mediaPath); if(!file)return null;
    const ext=(mediaPath.split('.').pop()||'png').toLowerCase(), mime=ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='gif'?'image/gif':ext==='webp'?'image/webp':'image/png';
    return `data:${mime};base64,${await file.async('base64')}`;
  };
  const richPhotoForCell=async cell=>{
    const vm=cell?.getAttribute('vm'); if(!vm)return null;
    const rvIndex=vmToRv[vm]??(Number(vm)-1), values=richValues[rvIndex]; if(!values||!values.length)return null;
    const relId=richRelIds[Number(values[0])], target=richRelTargets[relId]; if(!target)return null;
    return photoData(joinZipPath('xl/richData',target));
  };
  const wb=await readXml('xl/workbook.xml'), wbRel=relMap(await readXml('xl/_rels/workbook.xml.rels'));
  for(const sheet of xmlNodes(wb,'sheet')){
    const name=sheet.getAttribute('name')||'', rid=sheet.getAttribute('r:id')||sheet.getAttribute('id'), target=wbRel[rid]; if(!target)continue;
    const sheetPath=target.startsWith('/')?target.slice(1):joinZipPath('xl',target), sheetDir=sheetPath.slice(0,sheetPath.lastIndexOf('/'));
    const sheetRelPath=sheetDir+'/_rels/'+sheetPath.slice(sheetPath.lastIndexOf('/')+1)+'.rels', sheetRel=relMap(await readXml(sheetRelPath));
    const sheetXml=await readXml(sheetPath), richPhotos={};
    await Promise.all(xmlNodes(sheetXml,'c').filter(c=>c.getAttribute('vm')).map(async cell=>{const photo=await richPhotoForCell(cell)||await photoData(embeddedImagePath);if(photo){const row=Number(String(cell.getAttribute('r')||'').match(/\d+/)?.[0]||0)-1;if(row>=0)richPhotos[row]=photo;}}));
    if(Object.keys(richPhotos).length) photoSheets[name]=richPhotos;
    const drawing=xmlNodes(sheetXml,'drawing')[0]; if(!drawing)continue;
    const drawPath=joinZipPath(sheetDir,sheetRel[drawing.getAttribute('r:id')||drawing.getAttribute('id')]); if(!drawPath)continue;
    const drawDir=drawPath.slice(0,drawPath.lastIndexOf('/')), drawRelPath=drawDir+'/_rels/'+drawPath.slice(drawPath.lastIndexOf('/')+1)+'.rels', drawRel=relMap(await readXml(drawRelPath)), drawXml=await readXml(drawPath); if(!drawXml)continue;
    const photos={};
    await Promise.all(xmlNodes(drawXml,'twoCellAnchor').concat(xmlNodes(drawXml,'oneCellAnchor')).map(async anchor=>{
      const from=xmlNodes(anchor,'from')[0], row=Number(xmlNodes(from,'row')[0]?.textContent||-1), pic=xmlNodes(anchor,'pic')[0], blip=pic&&xmlNodes(pic,'blip')[0]; if(row<0||!blip)return;
      const mediaPath=joinZipPath(drawDir,drawRel[blip.getAttribute('r:embed')||blip.getAttribute('embed')]); const file=zip.file(mediaPath); if(!file)return;
      const ext=(mediaPath.split('.').pop()||'png').toLowerCase(), mime=ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='gif'?'image/gif':ext==='webp'?'image/webp':'image/png'; photos[row]=`data:${mime};base64,${await file.async('base64')}`;
    })); photoSheets[name]=Object.assign(photoSheets[name]||{},photos);
  }
  return photoSheets;
}
async function buildReturnRowsFromWorkbook(wb,buffer){
  const photoSheets=await extractWorkbookPhotos(buffer);
  const combined=[];
  (wb?.SheetNames||[]).forEach(sheetName=>{
    const ws=wb.Sheets[sheetName];
    if(!ws) return;
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true,cellDates:true});
    const parsed=buildReturnRowsFromRawRows(rows,photoSheets[sheetName]||{});
    if(parsed?.length) parsed.forEach(row=>{ row._sheetName=sheetName; });
    if(parsed?.length) combined.push(...parsed);
  });
  return combined.length?combined:null;
}
function buildLostRoutesFromRawRows(rows){
  if(!rows||!rows.length) return null;
  let headerIndex=-1, idx={};
  for(let r=0;r<Math.min(rows.length,40);r++){
    const keys=(rows[r]||[]).map(normalizeReturnHeader);
    const hasPkg=keys.some(k=>isReturnPackageKey(k)||/^(ID_DO_ENVIO|ID_DO_SHIPMENT|SHIPMENT_ID|PACKAGE_ID)$/.test(k)||/PACOTE|SHIPMENT|PACKAGE/.test(k));
    const hasOrigin=keys.some(k=>/ORIGEM|ORIGIN|FACILITY/.test(k));
    const hasDest=keys.some(k=>/DESTINO|DESTINATION|DEST/.test(k));
    if(hasPkg&&(hasOrigin||hasDest||keys.some(k=>/ROTA|ROUTE/.test(k)))){ headerIndex=r; keys.forEach((k,i)=>{if(k&&!Object.prototype.hasOwnProperty.call(idx,k))idx[k]=i;}); break; }
  }
  if(headerIndex<0) return null;
  const first=(...names)=>{for(const n of names){if(idx[n]!==undefined)return idx[n];} const k=Object.keys(idx).find(k=>names.some(n=>k.includes(n))); return k===undefined?undefined:idx[k];};
  const colPacote=first('PACOTE','ID_DO_PACOTE','ID_DO_ENVIO','ID_DO_SHIPMENT','SHP_SHIPMENT_ID','SHIPMENT_ID','ID');
  const colOrig=first('ORIGEM','ORIGIN','CENTRO_DE_ORIGEM','ORIGIN_CENTER','FACILITY_ID','SHP_LG_FACILITY_ID');
  const colDest=first('DESTINO','DESTINATION','CENTRO_DE_DESTINO','DESTINATION_CENTER','DESTINATION_FACILITY','ROUTE_DESTINATION_FACILTY_ID');
  const colRota=first('ROTA','ROUTE','ID_DA_ROTA','SHP_LG_ROUTE_ID');
  const colDriver=first('MOTORISTA','DRIVER','ID_DO_TRANSPORTADOR','ID_DO_MOTORISTA','ID_DO_CARRIER','SHP_LG_DRIVER_ID');
  const colBase=first('BASE','BASE_ATUAL','FACILITY','SHP_LG_FACILITY_ID');
  const colProduto=first('PRODUTO','PRODUCT','ITEM','SHP_ITEM_DESC');
  const colValor=first('VALOR_DO_PEDIDO','VALOR_DO_PACOTE','VALOR','ORDER_VALUE','GMV_BRL','GMV');
  const colDias=first('DIAS_DE_ATRASO','DIAS_DE_PARADO','DAYS','AGING');
  const colData=first('DATA','DATE','DATA_DE_ENTRADA_NO_LOR','DATA_INSUCESSO');
  const colMotivo=first('MOTIVO','MOTIVO_DA_NAO_ENTREGA','REASON','STATUS');
  const out=[];
  for(let r=headerIndex+1;r<rows.length;r++){
    const row=rows[r]||[], pacote=normalizePackageKey(colPacote!==undefined?row[colPacote]:''); if(!pacote) continue;
    const origem=normalizeBaseCode(colOrig!==undefined?row[colOrig]:''); const destino=normalizeBaseCode(colDest!==undefined?row[colDest]:''); const base=normalizeBaseCode(colBase!==undefined?row[colBase]:(origem||destino));
    const risk=IMPORTS.flatMap(i=>i.entries||[]).find(e=>normalizePackageKey(e.pacote)===pacote);
    const parsedDias=colDias!==undefined?parsePlanilhaDias(row[colDias]):null;
    const rawMotivo=colMotivo!==undefined?String(row[colMotivo]??'').trim():'';
    out.push({pacote,origem,destino,base:base||risk?.base||'',rota:colRota!==undefined?normalizePackageKey(row[colRota]):(risk?.rota||''),driverId:colDriver!==undefined?normalizePackageKey(row[colDriver]):(risk?.driverId||''),produto:colProduto!==undefined?String(row[colProduto]||'').trim():(risk?.produto||''),motivo:rawMotivo?friendlyReason(rawMotivo):(risk?.motivo||'Perdido em rota'),date:colData!==undefined?parseDateBR(row[colData]):new Date(),valor:colValor!==undefined?parseBRNumber(row[colValor]):Number(risk?.valor||0),dias:parsedDias??Number(risk?.dias||0),diasPlanilha:parsedDias,riskBase:risk?.base||'',riskDriverId:risk?.driverId||''});
  }
  return out.length?out:null;
}
function persistLostRoutes(){try{localStorage.setItem(LOST_ROUTES_KEY,JSON.stringify(LOST_ROUTES));}catch(e){console.warn('Perdidos em rota mantidos apenas nesta sessão.',e);}}
function loadPersistedLostRoutes(){try{const raw=localStorage.getItem(LOST_ROUTES_KEY);return raw?JSON.parse(raw).map(e=>({...e,date:new Date(e.date)})):[];}catch(e){return [];}}
var EXPORT_CACHE=null;
function buildExportCache(){
  const risk=new Map();
  IMPORTS.forEach(i=>(i.entries||[]).forEach(r=>{const k=normalizePackageKey(r.pacote); if(!risk.has(k)) risk.set(k,r);}));
  const selectedDay=getSelectedImport()?.importDate||document.getElementById('impDia')?.value||'';
  const selected=returnSheetForDate(selectedDay);
  const sheets=[...(selected?[selected]:[]),...RETURN_SHEETS.filter(sheet=>!selected||sheet.id!==selected.id).sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')))];
  const push=(m,k,row)=>{ if(!k) return; let l=m.get(k); if(!l){l=[];m.set(k,l);} l.push(row); };
  const idx=sheets.map(sheet=>{const pkg=new Map(),route=new Map();(sheet.rows||[]).forEach(row=>{push(pkg,normalizePackageKey(row.pacote),row);push(route,normalizePackageKey(row.rota||row.route),row);});return {pkg,route};});
  return {risk,idx};
}
function returnRecordFast(entry,key,routeKey){
  const C=EXPORT_CACHE; let empty=null;
  for(const x of C.idx){ const best=chooseReturnRow(key?(x.pkg.get(key)||[]):[],entry); if(best&&returnRowHasContent(best)) return best; if(best&&!empty) empty=best; }
  const baseE=normalizeBaseCode(entry.base);
  for(const x of C.idx){ const m=routeKey?(x.route.get(routeKey)||[]).filter(row=>!row.base||normalizeBaseCode(row.base)===baseE):[]; const exact=m.find(returnRowHasContent)||m[0]; if(exact) return exact; }
  for(const x of C.idx){ const m=routeKey?(x.route.get(routeKey)||[]):[]; const any=m.find(returnRowHasContent)||m[0]; if(any) return any; }
  return empty;
}
function showExportBusy(msg){ let el=document.getElementById('exportBusyToast'); if(!el){el=document.createElement('div');el.id='exportBusyToast';el.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1f1f1f;color:#fff;padding:12px 20px;border-radius:10px;font:600 13px sans-serif;z-index:99999;box-shadow:0 6px 24px rgba(0,0,0,.4)';document.body.appendChild(el);} el.textContent=msg; }
function hideExportBusy(){ document.getElementById('exportBusyToast')?.remove(); }
function lostRouteMatchesRisk(e){ if(EXPORT_CACHE) return EXPORT_CACHE.risk.get(normalizePackageKey(e.pacote))||null; return IMPORTS.flatMap(i=>i.entries||[]).find(r=>normalizePackageKey(r.pacote)===normalizePackageKey(e.pacote))||null;}
function motivoExibicaoLost(e){ const risk=lostRouteMatchesRisk(e); const raw=String(e?.motivo||'').trim(); const candidate=raw&&raw!=='Perdido em rota'?raw:String(risk?.motivo||'').trim(); if(!candidate||candidate==='Perdido em rota') return 'Perdido em rota'; return friendlyReason(candidate); }
function lostRouteArrow(e){const risk=e.riskBase||lostRouteMatchesRisk(e)?.base||''; const lost=e.base||e.origem||e.destino||''; if(!risk||!lost||risk===lost)return ''; return `↔ pode estar em ${baseInfoText(risk)} (Risco LM) ou ${baseInfoText(lost)} (Perdido em rota)`;}

function buildDriverMapFromRawRows(rows){
  if(!rows||!rows.length) return null;
  const idx=buildHeaderIndex(rows[0]);
  const colId=idx['ID DO TRANSPORTADOR'], colNome=idx['NOME DO TRANSPORTADOR'];
  if(colId===undefined||colNome===undefined) return null;
  const map={};
  for(let r=1;r<rows.length;r++){ const row=rows[r]; if(!row||!row.length) continue; const id=String(row[colId]||'').trim(); const nome=String(row[colNome]||'').trim(); if(id&&nome) map[id]=nome; }
  return map;
}

/* ===== ESTADO ===== */
function rebuildStateData(){
  FIRST_IMPORT_DATE_INDEX=null;
  const byPacote=new Map();
  const sorted=IMPORTS.slice().sort((a,b)=>(a.importDate+a.turno).localeCompare(b.importDate+b.turno));
  sorted.forEach(imp=>{ (imp.entries||[]).forEach(e=>{ const key=e.pacote||(e.base+'|'+e.date+'|'+e.valor+'|'+Math.random()); byPacote.set(key,e); }); });
  const data={};
  byPacote.forEach(e=>{ const r=regionalFromBasePrefix(e.base); if(!r) return; if(!data[r]) data[r]={entries:[]}; data[r].entries.push(e); });
  STATE_DATA=data;
}

/* ===== PERSISTÊNCIA ===== */
const IMPORTS_DB_NAME='spot_dashboard_imports_db_v1'; let importsDbPromise=null;
function serializeImports(){ return IMPORTS.map(imp=>({...imp,entries:(imp.entries||[]).map(e=>({...e,date:e.date instanceof Date?e.date.toISOString():e.date}))})); }
function openImportsDB(){
  if(importsDbPromise) return importsDbPromise;
  importsDbPromise=new Promise((resolve,reject)=>{ if(!window.indexedDB){reject(new Error('IndexedDB indisponível'));return;} const req=indexedDB.open(IMPORTS_DB_NAME,1); req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('app'))req.result.createObjectStore('app',{keyPath:'key'});}; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
  return importsDbPromise;
}
async function persistImports(){
  const payload=serializeImports();
  try{ const db=await openImportsDB(); await new Promise((resolve,reject)=>{const tx=db.transaction('app','readwrite');tx.objectStore('app').put({key:'imports',payload});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  catch(err){ try{localStorage.setItem(IMPORTS_KEY,JSON.stringify(payload));}catch(fallbackErr){console.warn('Planilhas mantidas nesta sessão; armazenamento local cheio.',fallbackErr);} }
}
async function loadPersistedImports(){
  try{ const db=await openImportsDB(); const record=await new Promise((resolve,reject)=>{const tx=db.transaction('app','readonly'),req=tx.objectStore('app').get('imports');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); if(record&&Array.isArray(record.payload)) return record.payload.map(imp=>({...imp,entries:(imp.entries||[]).map(e=>({...e,date:new Date(e.date)}))})); }
  catch(err){ console.warn('IndexedDB indisponível; tentando armazenamento legado.',err); }
  try{ const raw=localStorage.getItem(IMPORTS_KEY); if(!raw)return []; const parsed=JSON.parse(raw); const result=parsed.map(imp=>({...imp,entries:(imp.entries||[]).map(e=>({...e,date:new Date(e.date)}))})); IMPORTS=result; persistImports(); return result; }catch(err){return [];}
}
function serializeReturnSheets(){ return RETURN_SHEETS.map(sheet=>({...sheet,rows:(sheet.rows||[]).map(row=>({...row}))})); }
async function persistReturnSheets(){
  const payload=serializeReturnSheets();
  try{ const db=await openImportsDB(); await new Promise((resolve,reject)=>{const tx=db.transaction('app','readwrite');tx.objectStore('app').put({key:'returnSheets',payload});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); }
  catch(err){ try{ localStorage.setItem('spot_dashboard_return_sheets_v1',JSON.stringify(payload)); }catch(e){ console.warn('Observações mantidas nesta sessão; armazenamento cheio.',e); } }
}
async function loadPersistedReturnSheets(){
  try{ const db=await openImportsDB(); const record=await new Promise((resolve,reject)=>{const tx=db.transaction('app','readonly'),req=tx.objectStore('app').get('returnSheets');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); if(record&&Array.isArray(record.payload)) return record.payload; }
  catch(err){ console.warn('Não foi possível ler as planilhas de retorno.',err); }
  try{ const raw=localStorage.getItem('spot_dashboard_return_sheets_v1'); return raw?JSON.parse(raw):[]; }catch(e){ return []; }
}
function returnSheetForDate(day){ return RETURN_SHEETS.slice().filter(s=>s.importDate===day).sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')))[0]||null; }
function latestReturnSheet(){ return RETURN_SHEETS.slice().sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')))[0]||null; }
function returnRowHasContent(row){ return Boolean(row&&(String(row.justificativa||'').trim()||String(row.situacao||'').trim()||row.photo||row.photoIndicator)); }
function chooseReturnRow(rows,entry){
  if(!rows||!rows.length) return null;
  const baseKey=normalizeBaseCode(entry?.base), routeKey=normalizePackageKey(entry?.rota), driverKey=normalizePackageKey(entry?.driverId);
  return rows.slice().sort((a,b)=>{
    const score=row=>{
      let n=returnRowHasContent(row)?1000:0;
      if(baseKey&&normalizeBaseCode(row.base)===baseKey)n+=30;
      if(routeKey&&normalizePackageKey(row.rota||row.route)===routeKey)n+=20;
      if(driverKey&&normalizePackageKey(row.driverId)===driverKey)n+=10;
      return n;
    };
    return score(b)-score(a);
  })[0];
}
function returnRecordForEntry(entry){
  const key=normalizePackageKey(entry.pacote);
  const routeKey=normalizePackageKey(entry.rota);
  const driverKey=normalizePackageKey(entry.driverId);
  if(!key&&!routeKey) return null;
  if(EXPORT_CACHE) return returnRecordFast(entry,key,routeKey);
  const selectedDay=getSelectedImport()?.importDate||document.getElementById('impDia')?.value||'';
  const selected=returnSheetForDate(selectedDay);
  const sheets=[...(selected?[selected]:[]),...RETURN_SHEETS.filter(sheet=>!selected||sheet.id!==selected.id).sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')))];
  /* Pacote é a chave principal. Rota, base e motorista só desempateiam
     duplicidades; mudança de rota não quebra o vínculo da observação. */
  let emptyPackageMatch=null;
  for(const sheet of sheets){
    const packageMatches=(sheet.rows||[]).filter(row=>key&&normalizePackageKey(row.pacote)===key);
    const best=chooseReturnRow(packageMatches,entry);
    if(best&&returnRowHasContent(best)) return best;
    if(best&&!emptyPackageMatch) emptyPackageMatch=best;
  }
  for(const sheet of sheets){
    const routeMatches=(sheet.rows||[]).filter(row=>routeKey&&normalizePackageKey(row.rota||row.route)===routeKey && (!row.base || normalizeBaseCode(row.base)===normalizeBaseCode(entry.base)));
    const exact=routeMatches.find(returnRowHasContent)||routeMatches[0];
    if(exact) return exact;
  }
  for(const sheet of sheets){
    const routeMatches=(sheet.rows||[]).filter(row=>routeKey&&normalizePackageKey(row.rota||row.route)===routeKey);
    const any=routeMatches.find(returnRowHasContent)||routeMatches[0];
    if(any) return any;
  }
  return emptyPackageMatch||null;
}
function entryHasJustification(entry){ const row=returnRecordForEntry(entry); return Boolean(row&&(String(row.justificativa||'').trim()||String(row.situacao||'').trim()||row.photo||row.photoIndicator)); }
function justifiedCount(entries){ return (entries||[]).filter(entryHasJustification).length; }
function percentLabel(count,total){ return total?Math.round((count/total)*100)+'%':'0%'; }
function findManualReturnRecord(pacote,rota){ const p=normalizePackageKey(pacote), r=normalizePackageKey(rota); for(const sheet of RETURN_SHEETS){ const found=(sheet.rows||[]).find(row=>row.manualEditedAt&&((p&&normalizePackageKey(row.pacote)===p)||(r&&normalizePackageKey(row.rota||row.route)===r))); if(found) return found; } return null; }
function activeReturnRows(){ const sheet=returnSheetForDate(getSelectedImport()?.importDate||''); return sheet?.rows||[]; }
function ensureReturnSheetForActiveDate(){
  const day=getSelectedImport()?.importDate||document.getElementById('impDia')?.value||todayStr();
  let sheet=returnSheetForDate(day);
  if(!sheet){ sheet={id:'ret-'+Date.now(),importDate:day,fileName:'Edição manual',savedAt:new Date().toISOString(),rows:[]}; RETURN_SHEETS.push(sheet); }
  return sheet;
}
function persistDriverMap(){ try{ localStorage.setItem(DRIVER_MAP_KEY, JSON.stringify({fileName:driverFileName, savedAt:driverSavedAt, rows:driverRows, map:DRIVER_MAP})); }catch(err){ console.error(err); } }
function loadPersistedDriverMap(){ try{ const raw=localStorage.getItem(DRIVER_MAP_KEY); return raw?JSON.parse(raw):null; }catch(err){ return null; } }
function saveOffendersBucket(){ try{ localStorage.setItem(OFF_BUCKET_KEY, offendersBucket); }catch(e){} }
function loadOffendersBucket(){ try{ return localStorage.getItem(OFF_BUCKET_KEY)||'TODOS'; }catch(e){ return 'TODOS'; } }
function saveSelectedImport(){ try{ if(selectedImportId) localStorage.setItem(SELECTED_IMPORT_KEY, selectedImportId); else localStorage.removeItem(SELECTED_IMPORT_KEY); }catch(e){} }
function loadSelectedImport(){ try{ return localStorage.getItem(SELECTED_IMPORT_KEY)||null; }catch(e){ return null; } }
/* Tenta ler o horário de corte embutido no nome do arquivo (ex.: ..._1005.csv -> 10:05).
   Se não achar um padrão de 4 dígitos válido como HHMM, cai para o horário em que foi importado. */
function extractFileTime(fileName){
  const m=String(fileName||'').match(/\d{4}-\d{2}-\d{2}_(\d{4})(?=\.[A-Za-z0-9]+$)/);
  if(!m) return null;
  const hh=m[1].slice(0,2), mm=m[1].slice(2,4);
  if(Number(hh)>23||Number(mm)>59) return null;
  return hh+':'+mm;
}
function extractFileTurno(fileName){
  const name=String(fileName||'');
  const exact=extractFileTime(name);
  const withoutDate=name.replace(/20\d{2}[-_.]\d{1,2}[-_.]\d{1,2}/g,' ').replace(/(?:^|[^\d])\d{1,2}[-_.]\d{1,2}(?:[^\d]|$)/g,' ');
  const match=withoutDate.match(/(?:^|[_ ])([01]?\d)(?::([0-5]\d)|h([0-5]\d)?)?(?=[ _.-]|$)/i);
  const fallback=exact||(match?(match[1]+(match[2]||match[3]?':'+(match[2]||match[3]):'')):null);
  if(!fallback) return null;
  return Number(String(fallback).split(':')[0])>=15?'Tarde':'Manhã';
}
function extractFileDate(fileName){
  const s=String(fileName||'');
  let m=s.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if(m){const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),date=new Date(y,mo-1,d);if(date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d)return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
  m=s.match(/(?:^|[^\d])(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})(?:[^\d]|$)/);
  if(m){const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]),date=new Date(y,mo-1,d);if(date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d)return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
  m=s.match(/(?:^|[^\d])(\d{1,2})[-_.](\d{1,2})(?:[^\d]|$)/);
  if(m){const d=Number(m[1]),mo=Number(m[2]),y=new Date().getFullYear(),date=new Date(y,mo-1,d);if(date.getFullYear()===y&&date.getMonth()===mo-1&&date.getDate()===d)return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
  return null;
}
function importDisplayTime(imp){ return extractFileTime(imp.fileName) || new Date(imp.savedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }

/* ===== IMPORTAÇÃO ===== */
function updateImportUI(){
  renderDashboardImportSelector();
  const returnBox=document.getElementById('lastImportReturn'); const returnSheet=latestReturnSheet()||returnSheetForDate(document.getElementById('impDia')?.value||getSelectedImport()?.importDate||'');
  if(returnBox){ returnBox.style.display=returnSheet?'block':'none'; if(returnSheet){ document.getElementById('lastImportReturnDt').textContent=new Date(returnSheet.savedAt).toLocaleString('pt-BR'); document.getElementById('lastImportReturnMeta').innerHTML=fmtInt((returnSheet.rows||[]).length)+' observação(ões)<br>'+escHtml(returnSheet.fileName)+'<br>Vinculada ao dia '+String(returnSheet.importDate).split('-').reverse().join('/'); } }
  const lostBox=document.getElementById('lastImportLost');
  if(lostBox){ if(LOST_ROUTES.length){ lostBox.style.display='block'; const lastLost=LOST_ROUTES[LOST_ROUTES.length-1]; document.getElementById('lastImportLostDt').textContent=new Date().toLocaleString('pt-BR'); document.getElementById('lastImportLostMeta').innerHTML=fmtInt(LOST_ROUTES.length)+' pacote(s)<br>'+escHtml(lastLost.fileName||'Arquivo importado')+'<br>Atualizado em '+escHtml(String(lastLost.importDate||todayStr()).split('-').reverse().join('/')); } else lostBox.style.display='none'; }
  const box=document.getElementById('lastImportRisco');
  if(IMPORTS.length){
    const last=IMPORTS.slice().sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0];
    box.style.display='block';
    document.getElementById('lastImportRiscoDt').textContent=new Date(last.savedAt).toLocaleString('pt-BR');
    document.getElementById('lastImportRiscoMeta').innerHTML=fmtInt(last.entries.length)+' linha(s)<br><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9.5 12 5 6M14.5 12l-5 6"/></svg> '+escHtml(last.fileName)+'<br>Dia '+last.importDate.split('-').reverse().join('/')+' &middot; '+escHtml(last.turno);
  } else { box.style.display='none'; }
  const dbox=document.getElementById('lastImportDriver');
  if(driverFileName){ dbox.style.display='block'; document.getElementById('lastImportDriverDt').textContent=driverSavedAt?new Date(driverSavedAt).toLocaleString('pt-BR'):'—'; document.getElementById('lastImportDriverMeta').innerHTML=fmtInt(driverRows)+' motorista(s) mapeados<br><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 16.2c.6-1.4 2-2.2 3.5-2.2s2.9.8 3.5 2.2M15 10h4M15 13.5h4"/></svg> '+escHtml(driverFileName); }
  else { dbox.style.display='none'; }
  renderImportsHistory();
  renderReturnHistory();
}
function renderDashboardImportSelector(){
  const select=document.getElementById('dashboardImportSelect'); if(!select)return;
  const ordered=IMPORTS.slice().sort((a,b)=>String(b.importDate||'').localeCompare(String(a.importDate||''))||({'Manhã':0,'Tarde':1}[a.turno]??9)-({'Manhã':0,'Tarde':1}[b.turno]??9)||String(b.savedAt||'').localeCompare(String(a.savedAt||'')));
  select.innerHTML=ordered.length?ordered.map(imp=>'<option value="'+escHtml(imp.id)+'">'+escHtml(String(imp.importDate||'').split('-').reverse().join('/')+' · '+(imp.turno||'Turno')+' · '+(imp.fileName||'Arquivo'))+'</option>').join(''):'<option value="">Nenhuma planilha importada</option>';
  select.value=selectedImportId&&ordered.some(imp=>imp.id===selectedImportId)?selectedImportId:(ordered[0]?.id||'');
  if(select.value && select.value!==selectedImportId){ selectedImportId=select.value; saveSelectedImport(); }
}
function returnLinksForImport(imp){
  return RETURN_SHEETS.filter(sheet=>sheet.importDate===imp?.importDate).map(sheet=>{
    const ids=new Set((sheet.rows||[]).map(row=>normalizePackageKey(row.pacote)).filter(Boolean));
    const count=(imp?.entries||[]).filter(entry=>ids.has(normalizePackageKey(entry.pacote))).length;
    return {sheet,count};
  });
}
function renderImportsHistory(){
  const tbody=document.getElementById('importsHistBody'); const empty=document.getElementById('importsHistEmpty'); const monthInput=document.getElementById('importsHistMonth');
  renderImportsMonthChips();
  const turnoOrdem={'Manhã':0,'Tarde':1};
  const list=IMPORTS.slice().filter(imp=>!importsHistMonth||String(imp.importDate||'').slice(0,7)===importsHistMonth).sort((a,b)=>b.importDate.localeCompare(a.importDate)||(turnoOrdem[a.turno]??9)-(turnoOrdem[b.turno]??9)||b.savedAt.localeCompare(a.savedAt));
  if(monthInput) monthInput.value=importsHistMonth;
  if(!list.length){ tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  let lastMonth='';
  tbody.innerHTML=list.map(imp=>{
    const isActive=imp.id===selectedImportId;
    const month=String(imp.importDate||'').slice(0,7); const [yy,mm]=month.split('-'); const monthLabel=month?new Date(Number(yy),Number(mm)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}):'Mês não informado'; const separator=month!==lastMonth?`<tr class="history-month-row"><td colspan="7">${escHtml(monthLabel)}</td></tr>`:''; lastMonth=month;
    const linked=returnLinksForImport(imp); const linkedHtml=linked.length?linked.map(item=>'<span class="return-link-chip">'+escHtml(item.sheet.fileName||'Retorno')+' <b>'+fmtInt(item.count)+' pacotes</b></span>').join(''):'<span class="return-no-link">Nenhum retorno no dia</span>';
    return separator+`<tr class="${isActive?'active-import-row':''}" data-import-id="${escHtml(imp.id)}" title="Clique para exibir esta planilha na Visão Geral">`
      +`<td>${imp.importDate.split('-').reverse().join('/')}${isActive?' <span class="tag dias-ok">ATUAL</span>':''}</td>`
      +`<td>${escHtml(imp.turno)}</td>`
      +`<td>${escHtml(imp.fileName)}</td>`
      +`<td>${fmtInt(imp.entries.length)}</td>`
      +`<td><div class="return-linked-list">${linkedHtml}</div></td>`
      +`<td>${new Date(imp.savedAt).toLocaleString('pt-BR')}</td>`
      +`<td><button type="button" class="del-btn" data-del-import="${escHtml(imp.id)}" title="Excluir esta importação"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg></button></td>`
      +`</tr>`;
  }).join('');
}
function linkedReturnImports(sheet){
  const saved=Array.isArray(sheet?.linkedImports)?sheet.linkedImports:[];
  const candidates=IMPORTS.filter(imp=>imp.importDate===sheet?.importDate);
  const list=saved.length?saved.map(x=>IMPORTS.find(imp=>imp.id===x.id)||x):candidates;
  return list.map(imp=>{
    const rows=sheet?.rows||[]; const ids=new Set(rows.map(r=>normalizePackageKey(r.pacote)).filter(Boolean));
    const count=(imp.entries||[]).filter(e=>ids.has(normalizePackageKey(e.pacote))).length;
    return {...imp,linkedCount:count};
  });
}
function renderReturnHistory(){
  const body=document.getElementById('returnHistoryBody'), empty=document.getElementById('returnHistoryEmpty'); if(!body||!empty)return;
  const list=RETURN_SHEETS.slice().sort((a,b)=>String(b.importDate||'').localeCompare(String(a.importDate||''))||Number(b.historyOrder||0)-Number(a.historyOrder||0)||String(b.savedAt||'').localeCompare(String(a.savedAt||''))).filter(s=>!returnHistMonth||String(s.importDate||'').slice(0,7)===returnHistMonth);
  empty.style.display=list.length?'none':'block';
  body.innerHTML=list.map(sheet=>{
    const links=linkedReturnImports(sheet); const linked=links.length?links.map(imp=>'<span class="return-link-chip">'+escHtml(imp.fileName||'Arquivo')+' · '+escHtml(imp.turno||'Turno')+' <b>'+fmtInt(imp.linkedCount||0)+' pacotes</b></span>').join(''):'<span class="return-no-link">Nenhuma planilha de pacotes no mesmo dia.</span>';
    const tabs=(sheet.sheetNames||Array.from(new Set((sheet.rows||[]).map(r=>r._sheetName).filter(Boolean))));
    return '<tr data-return-id="'+escHtml(sheet.id)+'"><td>'+escHtml(String(sheet.importDate||'').split('-').reverse().join('/'))+'</td><td><strong>'+escHtml(sheet.fileName||'Arquivo sem nome')+'</strong></td><td><div class="return-tabs">'+(tabs.length?tabs.map(t=>'<span>'+escHtml(t)+'</span>').join(''):'—')+'</div></td><td>'+fmtInt((sheet.rows||[]).filter(r=>String(r.justificativa||'').trim()).length)+' / '+fmtInt((sheet.rows||[]).length)+'</td><td><div class="return-linked-list">'+linked+'</div></td><td>'+escHtml(new Date(sheet.savedAt).toLocaleString('pt-BR'))+'</td><td><button type="button" class="del-btn" data-del-return="'+escHtml(sheet.id)+'" title="Excluir esta planilha de retorno"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l-1-13M10 11v5M14 11v5"/></svg></button></td></tr>';
  }).join('');
  renderReturnMonthChips();
}
function renderReturnMonthChips(){
  const box=document.getElementById('returnMonthChips'); if(!box)return;
  const months=Array.from(new Set(RETURN_SHEETS.map(s=>String(s.importDate||'').slice(0,7)).filter(Boolean))).sort().reverse();
  box.innerHTML=months.map(month=>{const [y,m]=month.split('-');const label=new Date(Number(y),Number(m)-1,1).toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return '<span class="history-month-folder '+(returnHistMonth===month?'active':'')+'"><button type="button" class="month-select" data-return-month="'+month+'">▰ '+label+' '+y+'</button><button type="button" class="month-delete" data-delete-return-month="'+month+'" title="Excluir retornos do mês"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l-1-13M10 11v5M14 11v5"/></svg></button></span>';}).join('');
}
function renderImportsMonthChips(){
  const box=document.getElementById('importsMonthChips'); if(!box)return;
  const months=Array.from(new Set(IMPORTS.map(i=>String(i.importDate||'').slice(0,7)).filter(Boolean))).sort().reverse();
  box.innerHTML=months.map(month=>{const [y,m]=month.split('-');const label=new Date(Number(y),Number(m)-1,1).toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase();return `<span class="history-month-folder ${importsHistMonth===month?'active':''}"><button type="button" class="month-select" data-month-select="${month}" title="Abrir pasta ${label}/${y}">▰ ${label} ${y}</button><button type="button" class="month-delete" data-delete-month="${month}" title="Excluir somente este mês" aria-label="Excluir a pasta ${label} ${y}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg></button></span>`;}).join('');
}
document.getElementById('returnHistMonth').addEventListener('change',e=>{returnHistMonth=e.target.value||'';renderReturnHistory();});
document.getElementById('btnClearReturnMonth').addEventListener('click',()=>{returnHistMonth='';renderReturnHistory();});
document.getElementById('btnToggleReturnFolder').addEventListener('click',function(){const open=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',String(!open));document.getElementById('returnMonthChips').classList.toggle('folder-closed',open);});
document.getElementById('returnMonthChips').addEventListener('click',e=>{const monthBtn=e.target.closest('[data-return-month]');if(monthBtn){returnHistMonth=monthBtn.dataset.returnMonth;renderReturnHistory();return;}const del=e.target.closest('[data-delete-return-month]');if(!del)return;const month=del.dataset.deleteReturnMonth;if(!confirm('Excluir todas as planilhas de retorno deste mês? Esta ação não pode ser desfeita.'))return;RETURN_SHEETS=RETURN_SHEETS.filter(s=>String(s.importDate||'').slice(0,7)!==month);if(returnHistMonth===month)returnHistMonth='';persistReturnSheets();updateImportUI();});
document.getElementById('returnHistoryBody').addEventListener('click',e=>{const del=e.target.closest('[data-del-return]');if(!del)return;e.stopPropagation();if(!confirm('Excluir esta planilha de retorno e suas observações? Esta ação não pode ser desfeita.'))return;RETURN_SHEETS=RETURN_SHEETS.filter(s=>s.id!==del.dataset.delReturn);persistReturnSheets();updateImportUI();if(Object.keys(STATE_DATA).length)renderAll();});
document.getElementById('btnToggleReturnHist').addEventListener('click',function(){returnHistCollapsed=!returnHistCollapsed;document.getElementById('returnHistoryCard').style.display=returnHistCollapsed?'none':'block';document.getElementById('returnHistCaret').style.transform=returnHistCollapsed?'rotate(-90deg)':'rotate(0)';});
document.getElementById('importsHistMonth').addEventListener('change',function(e){ importsHistMonth=e.target.value||''; renderImportsHistory(); });
document.getElementById('btnClearImportsMonth').addEventListener('click',function(){ importsHistMonth=''; renderImportsHistory(); });
document.getElementById('btnToggleSheetsFolder').addEventListener('click',function(){ const open=this.getAttribute('aria-expanded')==='true'; this.setAttribute('aria-expanded',String(!open)); this.title=open?'Abrir pasta Planilhas':'Fechar pasta Planilhas'; document.getElementById('importsMonthChips').classList.toggle('folder-closed',open); });
document.getElementById('importsMonthChips').addEventListener('click',function(e){
  const select=e.target.closest('[data-month-select]'); if(select){ importsHistMonth=select.dataset.monthSelect; renderImportsHistory(); return; }
  const del=e.target.closest('[data-delete-month]'); if(!del)return; const month=del.dataset.deleteMonth; const [y,m]=month.split('-'); const label=new Date(Number(y),Number(m)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}); if(!confirm('Excluir todas as planilhas de '+label+'? Esta ação não pode ser desfeita.'))return;
  IMPORTS=IMPORTS.filter(imp=>String(imp.importDate||'').slice(0,7)!==month); if(importsHistMonth===month)importsHistMonth=''; if(selectedImportId&&!IMPORTS.some(imp=>imp.id===selectedImportId)){selectedImportId=null;saveSelectedImport();} persistImports(); rebuildStateData(); updateImportUI(); if(IMPORTS.length){document.getElementById('emptyState').style.display='none';renderAll();}else document.getElementById('emptyState').style.display='block';
});
document.getElementById('importsHistBody').addEventListener('click', function(e){
  const del=e.target.closest('[data-del-import]');
  if(del){
    e.stopPropagation();
    if(!confirm('Excluir esta importação do histórico? Essa ação não pode ser desfeita.')) return;
    deleteImport(del.dataset.delImport);
    return;
  }
  const row=e.target.closest('[data-import-id]');
  if(row){
    selectedImportId=row.dataset.importId; saveSelectedImport();
    currentTab='TODOS'; currentBaseFilter='TODAS'; topBasesMode='TODOS'; regionalAgeFilter='TODOS';
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.state==='TODOS'));
    renderImportsHistory();
    if(Object.keys(STATE_DATA).length) renderAll();
  }
});
function deleteImport(id){
  IMPORTS=IMPORTS.filter(imp=>imp.id!==id);
  persistImports();
  rebuildStateData();
  if(selectedImportId===id){ selectedImportId=null; saveSelectedImport(); }
  updateImportUI();
  if(Object.keys(STATE_DATA).length){ document.getElementById('emptyState').style.display='none'; renderAll(); }
  else { document.getElementById('emptyState').style.display='block'; }
}
document.getElementById('btnToggleImportsHist').addEventListener('click', function(){
  importsHistCollapsed=!importsHistCollapsed;
  document.getElementById('importsHistCard').style.display=importsHistCollapsed?'none':'block';
  document.getElementById('importsHistCaret').style.transform=importsHistCollapsed?'rotate(-90deg)':'rotate(0)';
});
function finishImportMain(entries, fileName, importDate, turno){
  if(!entries || !entries.length){ alert('Não encontrei registros de nenhum dos 5 regionais reconhecidos nesta planilha.'); return; }
  importDateManuallySet=false;
  const novoId=Date.now()+'';
  IMPORTS.push({ id:novoId, importDate, turno, fileName, savedAt:new Date().toISOString(), entries });
  persistImports();
  rebuildStateData();
  selectedImportId=novoId; saveSelectedImport(); /* a planilha recém-importada passa a ser a exibida */
  document.getElementById('emptyState').style.display='none';
  currentTab='TODOS'; currentBaseFilter='TODAS'; topBasesMode='TODOS';
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.state==='TODOS'));
  updateImportUI();
  renderAll();
}
['input','change'].forEach(evt=>document.getElementById('impDia').addEventListener(evt,()=>{importDateManuallySet=true;}));
document.getElementById('fileInput').addEventListener('change', function(e){
  const file=e.target.files[0]; if(!file)return; pendingImportFile=file; document.getElementById('btnConfirmImport').disabled=false; document.getElementById('btnConfirmImport').textContent='OK';
  const dateFromName=extractFileDate(file.name); if(dateFromName&&!importDateManuallySet) document.getElementById('impDia').value=dateFromName;
  const turnoFromName=extractFileTurno(file.name); if(turnoFromName) document.getElementById('impTurno').value=turnoFromName;
  e.target.value='';
});
document.getElementById('btnConfirmImport').addEventListener('click',function(){
  const file=pendingImportFile; if(!file)return; this.disabled=true; this.textContent='Lendo...';
  const importDate = document.getElementById('impDia').value || new Date().toISOString().slice(0,10);
  const turno = document.getElementById('impTurno').value;
  const reader=new FileReader();
  if(/\.csv$/i.test(file.name)){
    reader.onload=function(evt){ try{ let text=String(evt.target.result||'').replace(/^\uFEFF/,''); const delim=detectDelimiter(text); const entries=buildEntriesFromRawRows(parseDelimitedText(text,delim)); if(!entries){ alert('Não reconheci as colunas esperadas neste CSV.'); return; } finishImportMain(entries,file.name,importDate,turno); }catch(err){ console.error(err); alert('Erro ao carregar o CSV.'); } finally{pendingImportFile=null;document.getElementById('btnConfirmImport').textContent='OK';} };
    reader.readAsText(file,'UTF-8');
  } else {
    reader.onload=function(evt){ try{ const wb=XLSX.read(new Uint8Array(evt.target.result),{type:'array',cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true,cellDates:true}); const entries=buildEntriesFromRawRows(rows); if(!entries){ alert('Não reconheci as colunas esperadas nesta planilha.'); return; } finishImportMain(entries,file.name,importDate,turno); }catch(err){ console.error(err); alert('Erro ao carregar o Excel.'); } finally{pendingImportFile=null;document.getElementById('btnConfirmImport').textContent='OK';} };
    reader.readAsArrayBuffer(file);
  }
});
document.getElementById('fileInputReturn').addEventListener('change', function(e){
  const file=e.target.files[0]; if(!file)return; pendingReturnFile=file; document.getElementById('btnConfirmReturn').disabled=false; document.getElementById('btnConfirmReturn').textContent='OK';
  e.target.value='';
});
document.getElementById('btnConfirmReturn').addEventListener('click',function(){
  const file=pendingReturnFile; if(!file)return; this.disabled=true; this.textContent='Lendo...';
  const importDate=todayStr(); const reader=new FileReader();
  const finish=(rows,parseError)=>{
    const normalizedRows=(Array.isArray(rows)?rows:[]).filter(row=>normalizePackageKey(row.pacote)&&(String(row.justificativa||'').trim()||String(row.situacao||'').trim()||row.photo||row.photoIndicator)).map(row=>({...row,pacote:normalizePackageKey(row.pacote),base:normalizeBaseCode(row.base),rota:normalizePackageKey(row.rota),driverId:normalizePackageKey(row.driverId),justificativa:String(row.justificativa||'').trim(),situacao:SITUATION_BY_LABEL[String(row.situacao||'').trim()]?String(row.situacao||'').trim():'',photoIndicator:Boolean(row.photoIndicator||row.photo),updatedAt:new Date().toISOString()}));
    const linkedImports=IMPORTS.filter(imp=>imp.importDate===importDate).map(imp=>({id:imp.id,fileName:imp.fileName,turno:imp.turno,entries:(imp.entries||[]).length}));
    const sheetNames=Array.from(new Set(normalizedRows.map(row=>row._sheetName).filter(Boolean)));
    const incomingIds=new Set(normalizedRows.map(row=>normalizePackageKey(row.pacote)).filter(Boolean));
    const incomingName=String(file.name||'').trim().toLowerCase();
    const sameFileIndex=RETURN_SHEETS.findIndex(sheet=>sheet.importDate===importDate&&String(sheet.fileName||'').trim().toLowerCase()===incomingName);
    let replacementIndex=sameFileIndex;
    if(replacementIndex<0&&incomingIds.size){
      let bestOverlap=0;
      RETURN_SHEETS.forEach((sheet,index)=>{
        if(sheet.importDate!==importDate)return;
        const oldIds=new Set((sheet.rows||[]).map(row=>normalizePackageKey(row.pacote)).filter(Boolean));
        const overlap=Array.from(incomingIds).filter(id=>oldIds.has(id)).length;
        if(overlap>bestOverlap){bestOverlap=overlap;replacementIndex=index;}
      });
    }
    const previous=replacementIndex>=0?RETURN_SHEETS[replacementIndex]:null;
    /* Mescla em vez de substituir: preserva observação/foto já salvas (ex.: adicionadas direto no dash)
       quando a planilha reimportada não traz um valor novo para aquele pacote. Assim, anexar a planilha de
       novo não apaga o que já foi anexado/escrito no dash — só atualiza o que a planilha realmente trouxer. */
    const mergedRowsMap=new Map();
    (previous?.rows||[]).forEach(row=>{ const key=normalizePackageKey(row.pacote)+'|'+normalizeBaseCode(row.base||''); mergedRowsMap.set(key,{...row}); });
    normalizedRows.forEach(row=>{
      const packageKey=normalizePackageKey(row.pacote);
      const key=packageKey+'|'+normalizeBaseCode(row.base||'');
      const current=mergedRowsMap.get(key);
      const legacyMatches=RETURN_SHEETS.flatMap(sheet=>sheet.rows||[]).filter(item=>normalizePackageKey(item.pacote)===packageKey);
      const legacyWithPhoto=legacyMatches.find(item=>item.photo);
      const old=current?.photo?current:(legacyWithPhoto||current||legacyMatches[0]);
      if(!old){ mergedRowsMap.set(key,row); return; }
      mergedRowsMap.set(key,{...old,...row,
        photo: row.photo || old.photo || null,
        photoIndicator: Boolean(row.photoIndicator || row.photo || old.photoIndicator || old.photo),
        justificativa: (old.manualEditedAt && String(old.justificativa||'').trim()) ? old.justificativa : (String(row.justificativa||'').trim() || old.justificativa || ''),
        situacao: row.situacao || old.situacao || '',
        manualEditedAt: old.manualEditedAt || row.manualEditedAt || null
      });
    });
    const mergedRows=Array.from(mergedRowsMap.values());
    const replacement={id:previous?.id||'ret-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),historyOrder:previous?.historyOrder||Date.now(),importDate,fileName:file.name,savedAt:new Date().toISOString(),rows:mergedRows,sheetNames,linkedImports};
    if(replacementIndex>=0) RETURN_SHEETS.splice(replacementIndex,1,replacement); else RETURN_SHEETS.push(replacement);
    persistReturnSheets(); updateImportUI(); if(Object.keys(STATE_DATA).length) renderAll();
    if(parseError) alert('O arquivo foi salvo no histórico de hoje, mas algumas colunas não foram reconhecidas: '+parseError);
  };
  if(/\.csv$/i.test(file.name)){ reader.onload=e=>{ try{const text=String(e.target.result||'').replace(/^\uFEFF/,'');const delim=detectDelimiter(text);const rows=buildReturnRowsFromRawRows(parseDelimitedText(text,delim));finish(rows,rows?'':'Não encontrei uma linha com pacote e observação');}catch(err){console.error(err);finish([],err.message||'erro de leitura do CSV');}finally{pendingReturnFile=null;this.textContent='OK';} }; reader.readAsText(file,'UTF-8'); }
  else { reader.onload=async e=>{ try{const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});const rows=await buildReturnRowsFromWorkbook(wb,e.target.result);finish(rows,rows?'':'Não encontrei uma aba com pacote e observação');}catch(err){console.error(err);finish([],err.message||'erro de leitura do Excel');}finally{pendingReturnFile=null;this.textContent='OK';} }; reader.readAsArrayBuffer(file); }
});
document.getElementById('fileInputLost').addEventListener('change',function(e){const file=e.target.files[0];if(!file)return;pendingLostFile=file;document.getElementById('btnConfirmLost').disabled=false;document.getElementById('btnConfirmLost').textContent='OK';e.target.value='';});
document.getElementById('btnConfirmLost').addEventListener('click',function(){const file=pendingLostFile;if(!file)return;this.disabled=true;this.textContent='Lendo...';const reader=new FileReader();const finish=rows=>{if(!rows){alert('Não reconheci a planilha. Preciso encontrar colunas de pacote e origem/destino/rota.');return;}LOST_ROUTES=rows.map(e=>({...e,importDate:todayStr(),fileName:file.name}));persistLostRoutes();updateImportUI();renderLostRoutesPage();};if(/\.csv$/i.test(file.name)){reader.onload=e=>{try{const text=String(e.target.result||'').replace(/^\uFEFF/,'');const delim=detectDelimiter(text);finish(buildLostRoutesFromRawRows(parseDelimitedText(text,delim)));}catch(err){finish(null);}finally{pendingLostFile=null;this.textContent='OK';}};reader.readAsText(file,'UTF-8');}else{reader.onload=e=>{try{const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});let rows=null;for(const name of wb.SheetNames){rows=buildLostRoutesFromRawRows(XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:true,cellDates:true}));if(rows)break;}finish(rows);}catch(err){finish(null);}finally{pendingLostFile=null;this.textContent='OK';}};reader.readAsArrayBuffer(file);}});
document.getElementById('fileInputDrivers').addEventListener('change', function(e){
  const file=e.target.files[0]; if(!file)return; pendingDriverFile=file; document.getElementById('btnConfirmDrivers').disabled=false; document.getElementById('btnConfirmDrivers').textContent='OK'; e.target.value='';
});
document.getElementById('btnConfirmDrivers').addEventListener('click',function(){
  const file=pendingDriverFile; if(!file)return; this.disabled=true; this.textContent='Lendo...';
  const reader=new FileReader();
  reader.onload=function(evt){ try{ const wb=XLSX.read(new Uint8Array(evt.target.result),{type:'array',cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true,cellDates:true}); const map=buildDriverMapFromRawRows(rows); if(!map){ alert('Não reconheci as colunas esperadas (ID do transportador, Nome do transportador).'); return; } DRIVER_MAP=map; driverFileName=file.name; driverSavedAt=new Date().toISOString(); driverRows=Object.keys(map).length; persistDriverMap(); updateImportUI(); if(Object.keys(STATE_DATA).length) renderAll(); }catch(err){ console.error(err); alert('Erro ao carregar o relatório de motoristas.'); } finally{pendingDriverFile=null;document.getElementById('btnConfirmDrivers').textContent='OK';} };
  reader.readAsArrayBuffer(file);
});

/* ===== NAVEGAÇÃO ===== */
function setPage(page){
  if(PUBLIC_VIEW_MODE && page!=='geral' && page!=='regional') page='geral';
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  ['geral','ofensores','regional','lostroutes','diaria','analise','analisebase','revertido','importados'].forEach(p=>{
    document.getElementById('page-'+p).classList.toggle('active', p===page);
  });
  document.getElementById('subtabsBar').style.display = page==='geral' ? 'block' : 'none';
  if(page==='ofensores') renderOffenders();
  if(page==='regional'){ regionalNav={level:'list',regional:null}; renderRegionalPage(); }
  if(page==='lostroutes'){ lostRouteNav={level:'list',regional:null}; renderLostRoutesPage(); }
  if(page==='diaria') renderDiaria();
  if(page==='analise') renderAnalise();
  if(page==='analisebase') renderAnaliseBase();
  if(page==='revertido') renderRevertido();
}
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click', ()=>setPage(btn.dataset.page)));

/* ===== VISÃO GERAL ===== */
function scopedRegionals(){ const activeData=getActiveDataByRegional(); if(currentTab==='TODOS') return REGIONAL_ORDER.filter(r=>activeData[r]); return activeData[currentTab]?[currentTab]:[]; }
function allEntriesScoped(){ return scopedEntriesFromImport(getSelectedImport()); }
function computeKPIs(){ const list=allEntriesScoped(); let svc=0,xpt=0; const bases=new Set(); list.forEach(e=>{ if(e.tipo==='SVC') svc+=e.valor; else xpt+=e.valor; bases.add(e.base); }); return {svc,xpt,total:svc+xpt,pacotes:list.length,baseCount:bases.size}; }
/* ===== Planilha ativa (selecionada no Histórico de Importações) =====
   Os 4 cartões de KPI da Visão Geral mostram o valor dessa planilha específica,
   não o acumulado de todas as importações. */
function getSelectedImport(){
  if(!IMPORTS.length) return null;
  let imp=IMPORTS.find(i=>i.id===selectedImportId);
  if(!imp){ imp=IMPORTS.slice().sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0]; selectedImportId=imp.id; saveSelectedImport(); }
  return imp;
}
/* A Visão Geral, Ofensores e Regional/Base são retratos da planilha ativa.
   STATE_DATA continua existindo apenas para reconstruir o histórico e as análises
   comparativas; nunca deve alimentar os totais do dia selecionado. */
function getActiveEntries(){
  /* A Visão Geral é um retrato da planilha escolhida no Histórico.
     Manhã - Tarde aparece somente como indicador auxiliar, nunca como o
     valor principal da planilha ativa. */
  const imp=getSelectedImport();
  return imp ? (imp.entries||[]).slice() : [];
}
function getActiveDataByRegional(){
  const data={};
  getActiveEntries().forEach(e=>{
    const r=regionalFromBasePrefix(e.base);
    if(!r) return;
    if(!data[r]) data[r]={entries:[]};
    data[r].entries.push(e);
  });
  return data;
}
function scopedEntriesFromList(list){
  let result=Array.isArray(list)?list.slice():[];
  if(currentTab!=='TODOS') result=result.filter(e=>regionalFromBasePrefix(e.base)===currentTab);
  if(currentBaseFilter!=='TODAS') result=result.filter(e=>e.base===currentBaseFilter);
  return result;
}
function scopedEntriesFromImport(imp){
  if(!imp) return [];
  return scopedEntriesFromList(imp.entries);
}
function sumMetrics(list){ let svc=0,xpt=0; const bases=new Set(); list.forEach(e=>{ if(e.tipo==='SVC') svc+=e.valor; else xpt+=e.valor; bases.add(e.base); }); return {svc,xpt,total:svc+xpt,pacotes:list.length,baseCount:bases.size}; }
/* Une manhã + tarde SEM contar duas vezes o mesmo pacote: um pacote que já estava
   parado de manhã e continua parado à tarde é a mesma unidade de valor perdido —
   só entra como "a mais" o que é realmente novo na tarde (pacote não visto de manhã). */
function unionEntriesSemDuplicar(listaBase, listaMaisRecente){
  const mapa=new Map();
  (listaBase||[]).forEach(e=>{ const chave=e.pacote||('m_'+e.base+'|'+e.date+'|'+e.valor+'|'+Math.random()); mapa.set(chave,e); });
  (listaMaisRecente||[]).forEach(e=>{ const chave=e.pacote||('t_'+e.base+'|'+e.date+'|'+e.valor+'|'+Math.random()); mapa.set(chave,e); });
  return Array.from(mapa.values());
}
function findTurnoImport(date, turno){
  const candidatos=IMPORTS.filter(i=>i.importDate===date && i.turno===turno);
  if(!candidatos.length) return null;
  return candidatos.slice().sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0];
}
function getTurnoImportForDay(date, turno){
  const ativa=getSelectedImport();
  if(ativa && ativa.importDate===date && ativa.turno===turno) return ativa;
  return findTurnoImport(date, turno);
}
function marcarEntradasDaImportacao(imp){
  return (imp&&Array.isArray(imp.entries)?imp.entries:[]).map(e=>({...e,_importDate:imp.importDate,_turno:imp.turno}));
}
function labelTurnosDoDia(date){
  const temManha=!!findTurnoImport(date,'Manhã');
  const temTarde=!!findTurnoImport(date,'Tarde');
  if(temManha&&temTarde) return 'Manhã - Tarde';
  if(temManha) return 'Manhã';
  if(temTarde) return 'Tarde';
  return '—';
}
/* Visão operacional do dia: manhã + tarde sem duplicar o mesmo pacote.
   A tabela ainda consegue separar os dois turnos pelos conjuntos do dia. */
function entriesAcumuladasDoDia(date){
  if(!date) return [];
  const manha=findTurnoImport(date,'Manhã'), tarde=findTurnoImport(date,'Tarde');
  return unionEntriesSemDuplicar(marcarEntradasDaImportacao(manha),marcarEntradasDaImportacao(tarde));
}
function updateActivePlanilhaBadge(imp){
  const el=document.getElementById('activePlanilhaBadge'); if(!el) return;
  if(!imp){ el.innerHTML='Nenhuma planilha importada'; el.removeAttribute('title'); return; }
  const dateStr=imp.importDate.split('-').reverse().join('/');
  const turno=imp.turno||'Turno não informado';
  const fileName=imp.fileName||'Arquivo sem nome';
  el.innerHTML='<b>PLANILHA ATIVA</b> '+dateStr+' · '+escHtml(turno)+'<span class="active-planilha-file">'+escHtml(fileName)+'</span>';
  el.title='A Visão Geral está mostrando somente esta planilha: '+fileName;
}
function computeAgingCounts(list){ const out={ATE2:{cnt:0,val:0},'3A6':{cnt:0,val:0},'7A10':{cnt:0,val:0},MAIS11:{cnt:0,val:0}}; list.forEach(e=>{ const b=bucketOf(diasParado(e)); out[b].cnt++; out[b].val+=e.valor; }); return out; }
function renderAgingStrip(elId, list, onClick){
  const el=document.getElementById(elId); if(!el) return;
  const counts=computeAgingCounts(list);
  el.innerHTML=BUCKET_KEYS.map(b=>`<div class="aging-chip ${counts[b].cnt?'':'vazio'}" data-bucket="${b}"><div class="lbl">${BUCKET_LABELS[b]}</div><div class="cnt">${fmtInt(counts[b].cnt)}</div><div class="val">${fmtBRL(counts[b].val)}</div></div>`).join('');
  el.querySelectorAll('.aging-chip').forEach(chip=>chip.addEventListener('click', ()=>onClick(chip.dataset.bucket)));
}
function populateBaseSelect(){
  const sel=document.getElementById('baseSelect');
  sel.innerHTML='<option value="TODAS">Todas as Bases da Regional</option>';
  const activeRegionalEntries=currentTab==='TODOS'?[]:getActiveEntries().filter(e=>regionalFromBasePrefix(e.base)===currentTab);
  if(currentTab==='TODOS'||!activeRegionalEntries.length){ document.getElementById('baseFilterBar').style.display='none'; currentBaseFilter='TODAS'; return; }
  document.getElementById('baseFilterBar').style.display='flex';
  const bases=new Set(activeRegionalEntries.map(e=>e.base));
  Array.from(bases).sort().forEach(b=>{ const o=document.createElement('option'); o.value=b; o.textContent=b; if(b===currentBaseFilter) o.selected=true; sel.appendChild(o); });
}
async function captureDashboardElement(selector,filename){
  const alvo=document.querySelector(selector); if(!alvo||typeof html2canvas!=='function') return;
  const previous={overflow:alvo.style.overflow,height:alvo.style.height,maxHeight:alvo.style.maxHeight,display:alvo.style.display};
  const scrollWidth=Math.max(alvo.scrollWidth,alvo.offsetWidth,document.documentElement.clientWidth);
  const scrollHeight=Math.max(alvo.scrollHeight,alvo.offsetHeight);
  try{
    alvo.style.overflow='visible'; alvo.style.height='auto'; alvo.style.maxHeight='none'; alvo.style.display='block';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const canvas=await html2canvas(alvo,{backgroundColor:cssColor('--bg-main','#080808'),scale:Math.min(2,window.devicePixelRatio||2),useCORS:true,logging:false,allowTaint:false,width:scrollWidth,height:scrollHeight,windowWidth:scrollWidth,windowHeight:scrollHeight,scrollX:0,scrollY:0});
    const a=document.createElement('a'); a.download=filename+'-'+new Date().toISOString().slice(0,10)+'.png'; a.href=canvas.toDataURL('image/png'); a.click();
  }finally{ alvo.style.overflow=previous.overflow; alvo.style.height=previous.height; alvo.style.maxHeight=previous.maxHeight; alvo.style.display=previous.display; }
}
function renderAll(){
  populateBaseSelect();

  const activeImp=getSelectedImport();
  updateActivePlanilhaBadge(activeImp);
  const activeMetrics=sumMetrics(scopedEntriesFromList(getActiveEntries()));
  const refDate=activeImp?activeImp.importDate:null;
  const manhaImp=refDate?getTurnoImportForDay(refDate,'Manhã'):null;
  const tardeImp=refDate?getTurnoImportForDay(refDate,'Tarde'):null;
  const manha=sumMetrics(scopedEntriesFromImport(manhaImp));
  const tarde=sumMetrics(scopedEntriesFromImport(tardeImp));

  document.getElementById('kpiSvc').textContent=fmtBRL(activeMetrics.svc);
  document.getElementById('kpiXpt').textContent=fmtBRL(activeMetrics.xpt);
  document.getElementById('kpiTotal').textContent=fmtBRL(activeMetrics.total);
  document.getElementById('kpiPacotes').textContent=fmtInt(activeMetrics.pacotes);
  const justificados=justifiedCount(getActiveEntries()); const justEl=document.getElementById('kpiJustificados'); if(justEl) justEl.textContent='Justificado '+String(justificados).padStart(2,'0')+' / '+fmtInt(activeMetrics.pacotes);
  document.getElementById('kpiSvcSub').textContent='Manhã '+(manhaImp?fmtBRL(manha.svc):'—');
  document.getElementById('kpiXptSub').textContent='Manhã '+(manhaImp?fmtBRL(manha.xpt):'—');
  document.getElementById('kpiTotalSub').textContent=(manhaImp?'Manhã: '+fmtBRL(manha.total):'Manhã: —')+' · '+(tardeImp?'Tarde: '+fmtBRL(tarde.total):'Tarde: —');
  document.getElementById('kpiTotalSoma').textContent='';
  const deltaEl=document.getElementById('kpiTotalDelta');
  if(manhaImp && tardeImp){
    const delta=tarde.total-manha.total;
    if(delta>0.004){
      deltaEl.className='delta-badge up'; deltaEl.style.display='inline-flex';
      deltaEl.textContent='Valor subiu '+fmtBRL(delta)+' em relação à manhã';
    } else if(delta<-0.004){
      deltaEl.className='delta-badge down'; deltaEl.style.display='inline-flex';
      deltaEl.textContent='Valor desceu '+fmtBRL(Math.abs(delta))+' em relação à manhã';
    } else {
      deltaEl.style.display='none'; deltaEl.textContent='';
    }
  } else {
    deltaEl.style.display='none'; deltaEl.textContent='';
  }
  document.getElementById('kpiPacotesSub').textContent='Manhã '+(manhaImp?fmtInt(manha.pacotes)+' pacotes':'—');
  document.getElementById('kpiRegistros').textContent=activeMetrics.baseCount+' bases no filtro';

  /* Os cartões de dias parados representam a planilha ativa, linha a linha.
     Não usar STATE_DATA aqui, pois ele consolida o histórico e remove pacotes
     repetidos entre importações, fazendo a soma ficar menor que o total da planilha. */
  const agingEntries=scopedEntriesFromList(getActiveEntries());
  renderAgingStrip('agingStripGeral', agingEntries, (b)=>openAgingDetail(b, agingEntries));
  renderRegionaisChart();
  renderOffendersStripGeral();
}
function renderRegionaisChart(){
  const el=document.getElementById('regionaisStrip'); if(!el) return;
  const activeData=getActiveDataByRegional();
  const dataMap={};
  Object.keys(activeData).forEach(r=>{ dataMap[r]=activeData[r].entries.reduce((a,e)=>a+Number(e.valor||0),0); });
  const data=REGIONAL_ORDER.filter(r=>dataMap[r]!==undefined).map(r=>({r,valor:dataMap[r]})).sort((a,b)=>b.valor-a.valor);
  if(!data.length){ el.innerHTML='<div class="history-empty">Sem dados para exibir.</div>'; return; }
  const max=data[0].valor||1;
  el.innerHTML=data.map(d=>`<div class="offenders-row" data-regional="${escHtml(d.r)}"><span class="obase">${escHtml(REGIONAL_LABELS[d.r]||d.r)}</span><div class="obar"><div class="obar-fill" style="width:${Math.max(4,(d.valor/max)*100)}%"></div></div><span class="oval">${fmtBRL(d.valor)}</span></div>`).join('');
  el.querySelectorAll('.offenders-row').forEach(row=>row.addEventListener('click', function(){
    const rName=row.dataset.regional; currentTab=rName; currentBaseFilter='TODAS';
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.state===rName));
    renderAll();
  }));
}
function renderOffendersStripGeral(){
  const el=document.getElementById('offendersStripGeral');
  const map={};
  scopedEntriesFromImport(getSelectedImport()).forEach(e=>{ if(topBasesMode!=='TODOS'&&e.tipo!==topBasesMode) return; map[e.base]=(map[e.base]||0)+Number(e.valor||0); });
  const arr=Object.entries(map).map(([base,valor])=>({base,valor})).sort((a,b)=>b.valor-a.valor).slice(0,12);
  if(!arr.length){ el.innerHTML='<div class="history-empty">Sem bases no filtro atual.</div>'; return; }
  const max=arr[0].valor||1;
  el.innerHTML=arr.map(a=>`<div class="offenders-row" data-base="${escHtml(a.base)}"><span class="obase">${escHtml(a.base)}</span><div class="obar"><div class="obar-fill" style="width:${Math.max(4,(a.valor/max)*100)}%"></div></div><span class="oval">${fmtBRL(a.valor)}</span></div>`).join('');
  el.querySelectorAll('.offenders-row').forEach(row=>row.addEventListener('click', ()=>openBaseOverlay(row.dataset.base)));
}
document.getElementById('topBasesToggle').addEventListener('click', function(e){
  const btn=e.target.closest('.toggle-btn'); if(!btn) return;
  topBasesMode=btn.dataset.mode;
  document.querySelectorAll('#topBasesToggle .toggle-btn').forEach(b=>b.classList.toggle('active',b===btn));
  renderOffendersStripGeral();
});
document.getElementById('subtabsBar').addEventListener('click', function(e){
  const btn=e.target.closest('.tab-btn'); if(!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  currentTab=btn.dataset.state; currentBaseFilter='TODAS';
  if(Object.keys(STATE_DATA).length) renderAll();
});
document.getElementById('baseSelect').addEventListener('change', function(e){ currentBaseFilter=e.target.value; renderAll(); });

/* ===== TABELA DE PACOTES / OVERLAY ===== */
/* Conjuntos de pacotes que estão na importação de Manhã / Tarde do dia da planilha
   selecionada — usados tanto para exibir a coluna "Planilha" quanto para filtrar
   por turno em qualquer tabela de pacotes (overlay, base, ofensores, etc). */
function planilhaSetsDoDia(){
  const refImp=getSelectedImport();
  const refDate=refImp?refImp.importDate:null;
  const manhaImp=refDate?getTurnoImportForDay(refDate,'Manhã'):null;
  const tardeImp=refDate?getTurnoImportForDay(refDate,'Tarde'):null;
  return {
    manha:new Set((manhaImp?manhaImp.entries:[]).map(x=>x.pacote).filter(Boolean)),
    tarde:new Set((tardeImp?tardeImp.entries:[]).map(x=>x.pacote).filter(Boolean))
  };
}
function classificaPlanilha(pacote, sets){
  if(!pacote) return null;
  if(sets.manha.has(pacote) && sets.tarde.has(pacote)) return 'AMBAS';
  if(sets.tarde.has(pacote)) return 'TARDE';
  if(sets.manha.has(pacote)) return 'MANHA';
  return null;
}
function entradaPertenceAoPeriodo(e, period, sets){
  if(period==='MANHA') return sets.manha.has(String(e.pacote||''));
  /* Pacote que já estava de manhã e continuou à tarde permanece na aba
     Manhã; Tarde mostra somente o que entrou de novo nesse turno. */
  if(period==='TARDE') return sets.tarde.has(String(e.pacote||'')) && !sets.manha.has(String(e.pacote||''));
  return true;
}
function sortEntriesByMode(list, mode){
  if(mode==='MT' || mode==='TM'){
    const sets=planilhaSetsDoDia();
    const rankFor=(e)=>{ const c=classificaPlanilha(e.pacote,sets); if(mode==='MT') return c==='MANHA'||c==='AMBAS'?0:c==='TARDE'?1:2; return c==='TARDE'||c==='AMBAS'?0:c==='MANHA'?1:2; };
    return list.slice().sort((a,b)=>{ const ra=rankFor(a), rb=rankFor(b); if(ra!==rb) return ra-rb; return b.valor-a.valor; });
  }
  return list.slice().sort((a,b)=>b.valor-a.valor);
}
function situationClass(value){ const i=SITUATION_OPTIONS.findIndex(item=>item.label===String(value||'')); return i>=0?'situation-'+i:'situation-empty'; }
function situationSelectHtml(entry,row){ const value=String(row?.situacao||''); const options='<option value="">Selecionar</option>'+SITUATION_OPTIONS.map(item=>'<option value="'+escHtml(item.label)+'" '+(item.label===value?'selected':'')+'>'+escHtml(item.label)+'</option>').join(''); return '<select class="situation-select '+situationClass(value)+'" data-situation-pacote="'+escHtml(entry.pacote||'')+'" data-situation-base="'+escHtml(entry.base||'')+'" aria-label="Situação (lista clicável)">'+options+'</select>'; }
function situationStyle(value){ return situationClass(value); }
const OVERLAY_PAGE_SIZE=100;
function renderPackageTable(entries, limit=entries.length, rowsOnly=false, tableFlags={}){
  if(!entries.length) return '<div class="history-empty">Nenhum pacote encontrado.</div>';
  /* "Planilha" mostra se o pacote está na importação de Manhã ou de Tarde do dia
     atualmente selecionado — nunca busca em dias anteriores. "Na planilha desde"
     continua sendo a data mais antiga em que o pacote apareceu, essa sim olhando
     todo o histórico. */
  const sets=planilhaSetsDoDia();
  const hasRoutePath=tableFlags.hasRoutePath??entries.some(e=>e.origem||e.destino);
  const showLostRisk=tableFlags.showLostRisk??String(overlayCtx?.title||'').startsWith('Perdidos em rota');
  const rows=entries.slice(0,limit).map(e=>{
    const dias=diasParado(e);
    const risco=riscoDiasParado(dias);
    const desde=firstImportDateForPackage(e.pacote,e.date);
    const classif=classificaPlanilha(e.pacote,sets);
    const classifExibida=typeof overlayCtx!=='undefined'&&(['MANHA','TARDE'].includes(overlayCtx.period)) ? overlayCtx.period : classif;
    const planilhaHtml = classifExibida==='AMBAS' ? '<span class="tag ambas">Manhã + Tarde</span>' : classifExibida==='TARDE' ? '<span class="tag tarde">Tarde</span>' : classifExibida==='MANHA' ? '<span class="tag manha">Manhã</span>' : '—';
    const just=returnRecordForEntry(e); const situationHtml=situationSelectHtml(e,just); const origin=escHtml(e.origem||'—'); const destination=e.destino?escHtml(e.destino):'<span class="missing-destination" title="Destino não informado">✕</span>'; const routePath=hasRoutePath?'<td>'+origin+' → '+destination+'</td>':''; const displayReason=e.motivo; const justText=just?.justificativa||'—'; const photo=just?.photo?`<button class="just-photo" type="button" data-just-photo-view="${escHtml(e.pacote||'')}" data-just-base="${escHtml(e.base||'')}">Ver foto</button><button class="just-photo-delete" type="button" data-just-photo-delete="${escHtml(e.pacote||'')}" data-just-base="${escHtml(e.base||'')}">Excluir foto</button>`:''; return `<tr><td><span class="tag ${e.tipo.toLowerCase()}">${e.tipo}</span></td><td><strong>${e.base?baseInfoLabel(e.base):'—'}</strong></td><td>${escHtml(e.pacote)||'—'}</td><td>${escHtml(e.rota)||'—'}</td>${routePath}<td class="ellipsis" title="${escHtml(e.produto)}">${escHtml(resumo(e.produto,60))}</td><td>${escHtml(displayReason)}</td><td><button type="button" class="driver-link" data-driver="${escHtml(e.driverId||'')}">${escHtml(getDriverName(e.driverId))}</button></td><td><span class="tag ${diasClass(dias)}">${dias}d</span></td>${showLostRisk?`<td><span class="lost-risk-badge ${risco.key}" title="${risco.title}"><i></i>${risco.label}</span></td>`:''}<td><strong>${fmtBRL(e.valor)}</strong></td><td>${situationHtml}</td><td class="observation-cell"><div class="just-cell"><span title="${escHtml(justText)}">${escHtml(resumo(justText,38))}</span>${photo}<button class="just-edit" type="button" data-just-pacote="${escHtml(e.pacote||'')}" data-just-base="${escHtml(e.base||'')}">${just?'Editar':'Adicionar'}</button>${just?`<button class="just-delete" type="button" data-just-delete="${escHtml(e.pacote||'')}" data-just-base="${escHtml(e.base||'')}">Excluir</button>`:''}<label class="just-photo-btn">Foto<input type="file" accept="image/*" data-just-photo="${escHtml(e.pacote||'')}" data-just-base="${escHtml(e.base||'')}"></label></div></td><td>${planilhaHtml}</td><td>${escHtml('Desde '+fmtDateFullBR(desde))}</td></tr>`;
  }).join('');
  if(rowsOnly) return rows;
  return `<div class="table-scroll" style="max-height:460px;"><table><thead><tr><th>Tipo</th><th>Base</th><th>Pacote</th><th>Rota</th>${hasRoutePath?'<th>Origem → Destino</th>':''}<th>Produto</th><th>Motivo</th><th>Motorista</th><th>Dias Parado</th>${showLostRisk?'<th>Risco</th>':''}<th>Valor</th><th>Situação</th><th>Observação</th><th>Planilha</th><th>Na planilha desde</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
/* Contexto do detalhe: guarda os pacotes da base/faixa aberta para permitir
   busca, filtro por turno e ordenação sem fechar a janela. */
let overlayCtx={title:'',prefix:'',entries:[],bucket:'TODOS',search:'',period:'TODOS',sortMode:'VALOR'};
function overlaySearchBase(){
  const q=overlayCtx.search.trim().toUpperCase();
  let list=overlayCtx.entries;
  if(q) list=list.filter(e=>String(e.pacote||'').toUpperCase().includes(q)
    || getDriverName(e.driverId).toUpperCase().includes(q)
    || String(e.rota||'').toUpperCase().includes(q)
    || String(e.produto||'').toUpperCase().includes(q)
    || String(e.base||'').toUpperCase().includes(q));
  if(overlayCtx.period==='JUSTIFICADOS'){
    list=list.filter(e=>{ const row=returnRecordForEntry(e); return Boolean(row && (String(row.justificativa||'').trim() || String(row.situacao||'').trim() || row.photo)); });
  } else if(overlayCtx.period!=='TODOS'){
    const sets=planilhaSetsDoDia();
    list=list.filter(e=>entradaPertenceAoPeriodo(e,overlayCtx.period,sets));
  }
  return list;
}
function overlayFiltered(){
  let list=overlaySearchBase();
  if(overlayCtx.buckets?.length) list=list.filter(e=>overlayCtx.buckets.includes(bucketOf(diasParado(e))));
  return sortEntriesByMode(list, overlayCtx.sortMode);
}
function sortBtnLabel(mode){
  if(mode==='MT') return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h10M4 18h5"/></svg> Ordem: Manhã → Tarde';
  if(mode==='TM') return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h10M4 18h5"/></svg> Ordem: Tarde → Manhã';
  return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h10M4 18h5"/></svg> Ordem: Valor';
}
function abrirModalOcultarDias(entries, contexto, onlyLostRoutes=false){
  const diasDisponiveis=Array.from(new Set((entries||[]).map(e=>Math.floor(diasParado(e))).filter(Number.isFinite))).sort((a,b)=>a-b);
  const faixas=BUCKET_KEYS.slice();
  const diasOpcoes=Array.from(new Set([1,2,3,4,5,6,...diasDisponiveis])).sort((a,b)=>a-b);
  if(!(entries||[]).length){ baixarRetorno(entries,contexto); return; }
  document.getElementById('hideDaysModal')?.remove();
  const modal=document.createElement('div'); modal.id='hideDaysModal'; modal.className='overlay export-config-overlay show';
  const faixaNome={ATE2:'1–2 DIAS','3A6':'3–6 DIAS','7A10':'7–10 DIAS',MAIS11:'11+ DIAS'};
  const options=()=>'<div class="export-age-options-title">FAIXAS</div>'+faixas.map(bucket=>'<label class="export-day-option"><input type="checkbox" value="bucket:'+bucket+'"> <span><strong>'+faixaNome[bucket]+'</strong></span></label>').join('')+'<div class="export-age-options-title">DIAS AVULSOS</div>'+diasOpcoes.map(day=>'<label class="export-day-option"><input type="checkbox" value="day:'+day+'"> <span><strong>'+day+' DIA'+(day===1?'':'S')+'</strong></span></label>').join('');
  const groupHtml=(name,count)=>'<div class="export-age-config hide-days-group" data-hide-group="'+count+'"><div class="export-days-head"><strong>'+name+' ABA/BLOCO — NÃO CONTER:</strong></div><div class="export-days-list hide-days-options">'+options()+'</div><small class="export-age-help">Vai gerar: ES, MG, BA, SP e RJ</small>'+(count>1?'<button type="button" class="btn-reset hide-days-remove" data-remove-hide-group>Remover esta aba</button>':'')+'</div>';
  modal.innerHTML='<div class="export-config-panel" role="dialog" aria-modal="true" aria-labelledby="hideDaysTitle">'
    +'<div class="overlay-head"><div><h2 id="hideDaysTitle">Configurar abas da planilha</h2><div class="osub">Cada bloco abaixo cria novamente as abas ES, MG, BA, SP e RJ no mesmo arquivo.</div></div><button type="button" class="overlay-close" data-hide-days-close>Fechar</button></div>'
    +groupHtml('PRIMEIRA',1)
    +'<button type="button" class="btn-reset hide-days-add" data-add-hide-group>+ ADICIONAR MAIS ABAS REGIONAIS</button>'
    +(onlyLostRoutes?'':'<label class="export-lost-option" style="margin-top:14px;"><input type="checkbox" data-hide-include-lost> <strong>PACOTES EM ROTA</strong><small>Criar uma aba separada no mesmo arquivo</small></label>')
    +'<div class="hide-days-help">A segunda aba/bloco será criada no mesmo arquivo e terá novamente ES, MG, BA, SP e RJ, com os dias que você selecionar para ela.</div>'
    +'<div class="export-config-actions"><button type="button" class="btn-reset" data-hide-days-close>Cancelar</button><button type="button" class="btn-primary" data-hide-days-confirm>Baixar planilha</button></div>'
    +'</div>';
  document.body.appendChild(modal);
  const close=()=>{modal.remove();document.getElementById('baseOverlay')?.classList.remove('show');document.removeEventListener('keydown',esc);};
  const esc=(ev)=>{if(ev.key==='Escape')close();};
  document.addEventListener('keydown',esc);
  modal.addEventListener('click',ev=>{
    if(ev.target===modal||ev.target.closest('[data-hide-days-close]')){close();return;}
    if(ev.target.closest('[data-add-hide-group]')){
      const count=modal.querySelectorAll('.hide-days-group').length+1;
      const group=document.createElement('div'); group.innerHTML=groupHtml(['PRIMEIRA','SEGUNDA','TERCEIRA','QUARTA'][count-1]||count+'ª',count);
      modal.querySelector('[data-add-hide-group]').before(group.firstElementChild);
      if(count>=4)ev.target.remove();
      return;
    }
    if(ev.target.closest('[data-remove-hide-group]')){ev.target.closest('.hide-days-group')?.remove();return;}
    if(ev.target.closest('[data-hide-days-confirm]')){
      const ageGroups=[];
      modal.querySelectorAll('.hide-days-group').forEach(group=>{
        const marcados=Array.from(group.querySelectorAll('input:checked')).map(input=>input.value);
        const ocultosFaixas=new Set(marcados.filter(value=>value.startsWith('bucket:')).map(value=>value.slice(7)));
        const ocultosDias=new Set(marcados.filter(value=>value.startsWith('day:')).map(value=>Number(value.slice(4))));
        const incluidos=diasDisponiveis.filter(day=>!ocultosFaixas.has(bucketOf(day))&&!ocultosDias.has(day)).map(day=>[day,day]);
        const nomes=marcados.map(value=>value.startsWith('bucket:')?faixaNome[value.slice(7)]:value.slice(4)+' DIA'+(value==='day:1'?'':'S'));
        if(incluidos.length)ageGroups.push({key:'CUSTOM',label:nomes.length?nomes.join(' + '):'TODOS OS DIAS',ranges:incluidos});
      });
      if(!ageGroups.length){alert('Deixe pelo menos uma faixa disponível em uma das abas.');return;}
      const includeLostRoutes=Boolean(modal.querySelector('[data-hide-include-lost]')?.checked); close();
      if(onlyLostRoutes){
        entries=entries.filter(entry=>ageGroups.some(group=>ageGroupMatches(entry,group)));
        if(!entries.length){alert('Nenhum pacote em rota atende aos dias parados selecionados.');return;}
      }
      baixarRetornoFormatado(entries,{ageGroups,orderMode:'VALOR',dateOrder:[],includeLostRoutes,onlyLostRoutes:onlyLostRoutes,lostRows:onlyLostRoutes?entries:undefined});
    }
  });
}
function renderOverlayBody(){
  const driverDetail=document.getElementById('overlayDriverDetail'); if(driverDetail) driverDetail.remove();
  const list=overlayFiltered();
  const counts=computeAgingCounts(overlaySearchBase());
  const chips=document.getElementById('overlayAging');
  chips.innerHTML=BUCKET_KEYS.map(b=>`<div class="aging-chip ${overlayCtx.bucket===b?'active':''} ${counts[b].cnt?'':'vazio'}" data-bucket="${b}"><div class="lbl">${BUCKET_LABELS[b]}</div><div class="cnt">${fmtInt(counts[b].cnt)}</div><div class="val">${fmtBRL(counts[b].val)}</div></div>`).join('');
  const tbl=document.getElementById('overlayTable');
  overlayCtx.renderedList=list;
  overlayCtx.renderedCount=Math.min(OVERLAY_PAGE_SIZE,list.length);
  const tableFlags={hasRoutePath:(overlayCtx.entries||[]).some(e=>e.origem||e.destino),showLostRisk:String(overlayCtx.title||'').startsWith('Perdidos em rota')};
  tbl.innerHTML = list.length ? renderPackageTable(list,OVERLAY_PAGE_SIZE)
    : '<div class="history-empty">Nenhum pacote para este filtro. Clique de novo na faixa marcada ou limpe a busca para ver todos.</div>';
  const scroll=tbl.querySelector('.table-scroll');
  if(scroll&&overlayCtx.renderedCount<list.length) scroll.addEventListener('scroll',()=>{
    if(scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight>160) return;
    const start=overlayCtx.renderedCount, end=Math.min(start+OVERLAY_PAGE_SIZE,overlayCtx.renderedList.length);
    if(end<=start) return;
    const tbody=scroll.querySelector('tbody');
    if(tbody) tbody.insertAdjacentHTML('beforeend',renderPackageTable(overlayCtx.renderedList.slice(start,end),end-start,true,tableFlags));
    overlayCtx.renderedCount=end;
  });
  document.querySelectorAll('#overlayPeriodBar .period-preset').forEach(b=>b.classList.toggle('active', b.dataset.period===overlayCtx.period));
  const sortBtn=document.getElementById('overlaySortBtn'); if(sortBtn) sortBtn.innerHTML=sortBtnLabel(overlayCtx.sortMode);
  document.getElementById('overlaySub').textContent=
    (overlayCtx.prefix?overlayCtx.prefix+' · ':'')+fmtInt(list.length)+' pacote(s) · '+fmtBRL(list.reduce((a,e)=>a+e.valor,0))
    +(overlayCtx.buckets?.length?' · '+overlayCtx.buckets.map(b=>BUCKET_LABELS[b]).join(' + '):'')
    +(overlayCtx.period!=='TODOS'?' · '+(overlayCtx.period==='MANHA'?'Manhã':overlayCtx.period==='TARDE'?'Tarde':'Justificados'):'');
}
function openOverlayEntries(title, prefix, entries, bucket){
  overlayCtx={title, prefix:prefix||'', entries:entries||[], bucket:bucket||'TODOS', buckets:bucket&&bucket!=='TODOS'?[bucket]:[], search:'', period:'TODOS', sortMode:'VALOR'};
  document.getElementById('overlayTitle').textContent=title;
  document.getElementById('overlayBody').innerHTML=
    '<div class="overlay-tools"><div class="search-box" style="width:100%;max-width:380px;">'
    +'<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>'
    +'<input type="text" id="overlaySearch" placeholder="Buscar por ID do pacote, motorista, rota ou produto..." autocomplete="off"></div>'
    +'<div class="presets" id="overlayPeriodBar">'
    +'<button type="button" class="preset-btn period-preset active" data-period="TODOS">Todos</button>'
    +'<button type="button" class="preset-btn period-preset" data-period="MANHA">Manhã</button>'
    +'<button type="button" class="preset-btn period-preset" data-period="TARDE">Tarde</button>'
    +'<button type="button" class="preset-btn period-preset justified-preset" data-period="JUSTIFICADOS">Justificados</button>'
    +'</div>'
    +'<button type="button" class="preset-btn" id="overlaySortBtn">'+sortBtnLabel('VALOR')+'</button>'
    +(String(title||'').startsWith('Base ')?'<button type="button" class="preset-btn" id="overlayLostRoutesBtn" title="Ver pacotes em rota desta base">Pacote em Rota</button>':'')
    +'<button type="button" class="btn-reset" id="overlayResetFiltros">Mostrar todos</button>'
    +'<button type="button" class="dl-btn" id="overlayDownload" style="margin-left:0;" title="Baixar planilha de retorno destes pacotes" aria-label="Baixar planilha de retorno destes pacotes"><svg class="ico" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg></button></div>'
    +'<div class="aging-strip" id="overlayAging"></div><div id="overlayTable"></div>';
  renderOverlayBody();
  document.getElementById('overlayLostRoutesBtn')?.addEventListener('click',()=>{const prev=overlayCtx;const base=normalizeBaseCode(overlayCtx.entries[0]?.base||'');const list=LOST_ROUTES.filter(x=>lostPrimaryBase(x)===base);openLostRoutesOverlay(base,list);const tools=document.querySelector('#overlayBody .overlay-tools');if(tools){const back=document.createElement('button');back.type='button';back.className='preset-btn';back.id='overlayBackToBase';back.textContent='← Voltar para a base';back.addEventListener('click',()=>openOverlayEntries(prev.title,prev.prefix,prev.entries,prev.bucket));tools.prepend(back);}});
  document.getElementById('baseOverlay').classList.add('show');
  const inp=document.getElementById('overlaySearch');
  if(inp) setTimeout(()=>inp.focus(),50);
}
function openBaseOverlay(base, bucket){
  /* Dentro do detalhe da base, Todos representa o dia inteiro: manhã + tarde.
     A linha continua única quando o mesmo pacote aparece nos dois turnos e a
     coluna Planilha identifica essa situação como Manhã - Tarde. */
  const active=getSelectedImport();
  const dayEntries=active ? entriesAcumuladasDoDia(active.importDate) : getActiveEntries();
  const entries=dayEntries.filter(e=>e.base===base);
  const regional=entries.length?regionalFromBasePrefix(entries[0].base):findRegionalByBase(base);
  openOverlayEntries('Base '+baseInfoText(base), regional?REGIONAL_LABELS[regional]:'', entries, bucket);
}
function openAgingDetail(bucket, entries){
  openOverlayEntries('Pacotes por dias parado', '', entries, bucket);
}
function motoristaNaFaixa(e, faixa){
  if(!faixa || faixa==='TODOS') return true;
  const d=Number(diasParado(e));
  if(faixa==='ATE2') return d>=1 && d<=2;
  if(faixa==='3A6') return d>=3 && d<=6;
  if(faixa==='7A11') return d>=7 && d<=11;
  return false;
}
function motoristaMetricasDoDia(driverId, day, faixa){
  const manha=(findTurnoImport(day,'Manhã')?.entries||[]).filter(e=>String(e.driverId||'')===String(driverId||'')&&motoristaNaFaixa(e,faixa));
  const tarde=(findTurnoImport(day,'Tarde')?.entries||[]).filter(e=>String(e.driverId||'')===String(driverId||'')&&motoristaNaFaixa(e,faixa));
  const manhaMap=new Map(manha.map(e=>[String(e.pacote||''),e])), tardeMap=new Map(tarde.map(e=>[String(e.pacote||''),e]));
  const atual=tarde.length?tarde:manha, atuais=new Set(atual.map(e=>String(e.pacote||'')).filter(Boolean));
  const pacotesManha=new Set(manha.map(e=>String(e.pacote||'')).filter(Boolean));
  const pacotesTarde=new Set(tarde.map(e=>String(e.pacote||'')).filter(Boolean));
  const saiuDaPlanilha=tarde.length?new Set([...pacotesManha].filter(id=>!pacotesTarde.has(id))).size:0;
  const allIds=new Set([...manhaMap.keys(),...tardeMap.keys()].filter(Boolean));
  const comparacoes=Array.from(allIds).map(id=>{const m=manhaMap.get(id),t=tardeMap.get(id);return {id,manha:m,tarde:t,delta:m&&t?(t.valor-m.valor):0,turno:m&&t?'TARDE':t?'TARDE':'MANHA'};});
  const diasOfensora=new Set(), diasPorFaixa={ATE2:new Set(),'3A6':new Set(), '7A11':new Set()};
  IMPORTS.filter(imp=>!day||imp.importDate<=day).forEach(imp=>{(imp.entries||[]).forEach(e=>{if(String(e.driverId||'')!==String(driverId||'')) return; const d=Number(diasParado(e,String(imp.importDate||day||'')+'T00:00:00')); diasOfensora.add(String(imp.importDate)); if(d>=1&&d<=2) diasPorFaixa.ATE2.add(String(imp.importDate)); else if(d>=3&&d<=6) diasPorFaixa['3A6'].add(String(imp.importDate)); else if(d>=7&&d<=11) diasPorFaixa['7A11'].add(String(imp.importDate));});});
  return {vezes:diasOfensora.size,vezesPorFaixa:{ATE2:diasPorFaixa.ATE2.size,'3A6':diasPorFaixa['3A6'].size,'7A11':diasPorFaixa['7A11'].size},atuais,pacotesManha:pacotesManha.size,pacotesTarde:pacotesTarde.size,totalAtual:atuais.size,saiuDaPlanilha,comparacoes};
}
function motoristaOfensorNoPeriodo(driverId, inicio, fim){
  const porDia=new Map();
  availableImportDates().filter(day=>(!inicio||day>=inicio)&&(!fim||day<=fim)).forEach(day=>{
    snapshotEntriesForDay(day).forEach(e=>{
      if(String(e.driverId||'')!==String(driverId||'')) return;
      const d=Number(diasParado(e,String(day)+'T00:00:00'));
      const faixa=d>=7&&d<=11?'7A11':d>=3&&d<=6?'3A6':d>=1&&d<=2?'ATE2':null;
      const nivel=faixa==='7A11'?3:faixa==='3A6'?2:faixa==='ATE2'?1:0;
      if(nivel>(porDia.get(day)?.nivel||0)) porDia.set(day,{faixa,nivel});
    });
  });
  const out={ATE2:0,'3A6':0,'7A11':0}; porDia.forEach(item=>{if(item.faixa) out[item.faixa]++;});
  return {vezes:Object.values(out).reduce((a,b)=>a+b,0),vezesPorFaixa:out};
}
function pacoteTurnoLabel(comp){ return comp.manha&&comp.tarde ? 'Manhã - Tarde' : comp.tarde ? 'Tarde' : 'Manhã'; }
function pacoteDeltaHtml(comp){
  if(comp.manha&&comp.tarde){ const diff=(Number(comp.tarde.valor)||0)-(Number(comp.manha.valor)||0); if(Math.abs(diff)>0.005) return `<span class="driver-delta ${diff>0?'delta-up':'delta-down'}">${diff>0?'↑':'↓'} ${diff>0?'+':''}${fmtBRL(Math.abs(diff))}</span>`; return '<span class="driver-delta delta-same">Manhã - Tarde</span>'; }
  return '<span class="driver-delta delta-same">'+(comp.tarde?'Tarde':'Manhã')+'</span>';
}
function renderOverlayDriverDetail(driverId, faixa){
  faixa=faixa||'TODOS';
  const day=getSelectedImport()?.importDate||availableImportDates().slice(-1)[0]||'';
  const currentEntries=snapshotEntriesForDay(day).filter(e=>String(e.driverId||'')===String(driverId||''));
  const entries=[]; availableImportDates().forEach(historyDay=>snapshotEntriesForDay(historyDay).forEach(e=>{if(String(e.driverId||'')===String(driverId||''))entries.push({day:historyDay,e});}));
  const metricas=motoristaMetricasDoDia(driverId,day,faixa), periodoInicio=document.getElementById('revComparar')?.value||availableImportDates()[0]||'', periodoFim=document.getElementById('revAtual')?.value||day, ofensoresPeriodo=motoristaOfensorNoPeriodo(driverId,periodoInicio,periodoFim), total=currentEntries.filter(e=>motoristaNaFaixa(e,faixa)).reduce((s,e)=>s+(Number(e.valor)||0),0);
  const old=document.getElementById('overlayDriverDetail'); if(old)old.remove(); const panel=document.createElement('div'); panel.id='overlayDriverDetail'; panel.className='driver-detail-panel';
  const packageRows=metricas.comparacoes.map(comp=>{const e=comp.tarde||comp.manha;return `<tr><td>${escHtml(comp.id)}</td><td>${escHtml(e.base||'—')}</td><td>${escHtml(pacoteTurnoLabel(comp))}</td><td><strong>${fmtBRL(e.valor)}</strong></td><td>${pacoteDeltaHtml(comp)}</td></tr>`;}).join('');
  const ofensorFaixas='<div class="driver-offender-breakdown"><span class="driver-age-blue" style="color:#000!important">1–2 dias: <strong style="color:#000!important">'+fmtInt(ofensoresPeriodo.vezesPorFaixa.ATE2)+'</strong></span><span class="driver-age-yellow" style="color:#000!important">3–6 dias: <strong style="color:#000!important">'+fmtInt(ofensoresPeriodo.vezesPorFaixa['3A6'])+'</strong></span><span class="driver-age-red" style="color:#000!important">7–11 dias: <strong style="color:#000!important">'+fmtInt(ofensoresPeriodo.vezesPorFaixa['7A11'])+'</strong></span></div>';
  panel.innerHTML='<div class="driver-detail-head"><div><h3>'+escHtml(getDriverName(driverId))+'</h3><div class="osub">Detalhes do motorista · ofensor contado por dia</div></div><button type="button" class="overlay-close" id="overlayDriverClose">Fechar detalhes</button></div>'
    +'<div class="rev-kpis"><div class="rev-kpi"><div class="lbl">Motorista</div><div class="val">'+escHtml(getDriverName(driverId))+'</div></div><div class="rev-kpi"><div class="lbl">Valor em risco</div><div class="val">'+fmtBRL(total)+'</div></div><div class="rev-kpi"><div class="lbl">Vezes ofensor</div><div class="val">'+fmtInt(ofensoresPeriodo.vezes)+'</div>'+ofensorFaixas+'</div><div class="rev-kpi driver-current-kpi"><div class="lbl">Pacotes atuais do motorista</div><div class="val">'+fmtInt(metricas.totalAtual)+'</div><div class="driver-package-counts"><span>Manhã: <strong>'+fmtInt(metricas.pacotesManha)+'</strong></span><span>Tarde: <strong>'+fmtInt(metricas.pacotesTarde)+'</strong> <em class="driver-turn-delta">'+(metricas.pacotesTarde>metricas.pacotesManha?'(pegou +'+fmtInt(metricas.pacotesTarde-metricas.pacotesManha)+' pacotes)':metricas.pacotesTarde<metricas.pacotesManha?'('+fmtInt(metricas.pacotesTarde-metricas.pacotesManha)+' pacote'+(Math.abs(metricas.pacotesTarde-metricas.pacotesManha)===1?'':'s')+')':'(igual à manhã)')+'</em></span><span class="driver-total-count">Possui total de: <strong>'+fmtInt(metricas.totalAtual)+'</strong> pacotes.</span>'+(metricas.saiuDaPlanilha?'<span class="driver-left-count">Saiu da planilha: <strong>'+fmtInt(metricas.saiuDaPlanilha)+'</strong></span>':'')+'</div></div></div>'
    +'<div class="rev-table-wrap"><table class="rev-table"><thead><tr><th>Pacote</th><th>Base</th><th>Planilha</th><th>Valor atual</th><th>Variação</th></tr></thead><tbody>'+(packageRows||'<tr><td colspan="5" class="history-empty">Nenhum pacote atual.</td></tr>')+'</tbody></table></div>'
    +'<div class="driver-history-note">Comparação: seta para baixo = valor menor ou pacote que saiu da planilha; seta para cima vermelha = valor maior. Um pacote presente de manhã e à tarde aparece como <strong>Manhã - Tarde</strong>.</div>';
  document.getElementById('overlayBody').appendChild(panel); document.getElementById('overlayDriverClose').addEventListener('click',()=>panel.remove()); setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'nearest'}),20);
}
document.getElementById('overlayBody').addEventListener('change', function(e){ if(e.target?.dataset?.justPhoto){ attachJustificationPhoto(e.target); return; } if(e.target?.dataset?.situationPacote) updateSituation(e.target); });
async function updateSituation(select){ const scroll=captureOverlayScroll(); const pacote=select.dataset.situationPacote||'',base=select.dataset.situationBase||'',value=SITUATION_BY_LABEL[select.value]?select.value:''; select.className='situation-select '+situationClass(value); const sheet=ensureReturnSheetForActiveDate(); let row=findReturnRow(pacote,base); if(!row){row={pacote:normalizePackageKey(pacote),base:normalizeBaseCode(base||''),justificativa:'',situacao:'',photo:null};sheet.rows.push(row);} row.situacao=value; row.manualEditedAt=new Date().toISOString(); row.updatedAt=new Date().toISOString(); await persistReturnSheets(); renderOverlayBody(); restoreOverlayScroll(scroll); updateImportUI(); }

document.getElementById('overlayBody').addEventListener('input', function(e){
  if(e.target && e.target.id==='overlaySearch'){ overlayCtx.search=e.target.value; renderOverlayBody(); }
});
function findReturnRow(pacote,base){ const sheet=ensureReturnSheetForActiveDate(); const key=normalizePackageKey(pacote); return (sheet.rows||[]).find(row=>normalizePackageKey(row.pacote)===key && (!base||!row.base||normalizeBaseCode(row.base)===normalizeBaseCode(base))); }
function captureOverlayScroll(){ const el=document.querySelector('#overlayTable .table-scroll')||document.getElementById('overlayBody'); return el?{top:el.scrollTop,left:el.scrollLeft}:null; }
function restoreOverlayScroll(pos){ if(!pos)return; requestAnimationFrame(()=>{const el=document.querySelector('#overlayTable .table-scroll')||document.getElementById('overlayBody'); if(el){el.scrollTop=pos.top;el.scrollLeft=pos.left;}}); }
function askJustificationText(current){
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML='<div style="background:#fff;color:#111;border-radius:12px;padding:18px;width:min(560px,100%);box-shadow:0 10px 40px rgba(0,0,0,.4);font-family:sans-serif"><div style="font-weight:700;margin-bottom:8px">Observação do pacote</div><textarea id="justTextArea" rows="6" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:8px;font:14px sans-serif;resize:vertical" placeholder="Cole ou digite a observação aqui"></textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" id="justCancel" style="padding:8px 14px;border:1px solid #bbb;background:#f4f4f4;border-radius:8px;cursor:pointer">Cancelar</button><button type="button" id="justSave" style="padding:8px 14px;border:0;background:#ee4d2d;color:#fff;border-radius:8px;cursor:pointer;font-weight:700">Salvar</button></div></div>';
    document.body.appendChild(ov);
    const ta=ov.querySelector('#justTextArea'); ta.value=current||''; ta.focus(); ta.select();
    const done=v=>{ ov.remove(); resolve(v); };
    ov.querySelector('#justCancel').onclick=()=>done(null);
    ov.querySelector('#justSave').onclick=()=>done(ta.value);
    ov.addEventListener('mousedown',e=>{ if(e.target===ov) done(null); });
    ta.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); done(null); } if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) done(ta.value); });
  });
}
async function editJustification(pacote,base){
  const row=findReturnRow(pacote,base); const current=row?.justificativa||'';
  const raw=await askJustificationText(current); if(raw===null)return;
  const value=String(raw).replace(/\u00a0/g,' ').replace(/[\r\n\t]+/g,' ').replace(/\s{2,}/g,' ').trim();
  if(!value && current && !confirm('O campo está vazio. Isso vai apagar a observação atual. Continuar?')) return;
  const scroll=captureOverlayScroll(); const sheet=ensureReturnSheetForActiveDate(); let target=findReturnRow(pacote,base);
  if(!target){ target={pacote:normalizePackageKey(pacote),base:normalizeBaseCode(base||''),justificativa:'',photo:null}; sheet.rows.push(target); }
  target.justificativa=value; target.manualEditedAt=new Date().toISOString(); target.updatedAt=new Date().toISOString();
  await persistReturnSheets(); renderOverlayBody(); restoreOverlayScroll(scroll); updateImportUI();
}
function deleteJustification(pacote,base){ if(!confirm('Excluir a observação deste pacote?'))return; const scroll=captureOverlayScroll(); const sheet=returnSheetForDate(getSelectedImport()?.importDate||''); if(!sheet)return; const key=normalizePackageKey(pacote); sheet.rows=(sheet.rows||[]).filter(row=>!(normalizePackageKey(row.pacote)===key&&(!base||!row.base||normalizeBaseCode(row.base)===normalizeBaseCode(base))));persistReturnSheets();renderOverlayBody();restoreOverlayScroll(scroll);updateImportUI(); }
function deleteJustificationPhoto(pacote,base){
  if(!confirm('Excluir a foto desta observação?')) return;
  const sheet=returnSheetForDate(getSelectedImport()?.importDate||''); if(!sheet) return;
  const row=(sheet.rows||[]).find(item=>String(item.pacote||'')===String(pacote||'')&&(!base||!item.base||item.base===base));
  if(!row) return;
  const scroll=captureOverlayScroll(); row.photo=null; row.updatedAt=new Date().toISOString();
  if(!String(row.justificativa||'').trim()) sheet.rows=(sheet.rows||[]).filter(item=>item!==row);
  persistReturnSheets(); renderOverlayBody(); restoreOverlayScroll(scroll); updateImportUI();
}
let photoViewerNat=null, photoViewerToken=0, photoViewerBlobUrl=null;
function fitPhotoViewer(){
  const viewer=document.getElementById('justPhotoViewer'), image=document.getElementById('justPhotoViewerImage'), stage=document.getElementById('justPhotoViewerStage');
  if(!viewer||!image||!stage||!photoViewerNat||!viewer.classList.contains('show')) return;
  const nw=photoViewerNat.w, nh=photoViewerNat.h, head=viewer.querySelector('.photo-viewer-head');
  const mobile=window.innerWidth<=700, padX=mobile?36:48, headH=(head?head.offsetHeight:70)+10;
  const availW=Math.max(200,window.innerWidth*(mobile?0.98:0.96)-padX), availH=Math.max(160,window.innerHeight*0.96-headH-(mobile?24:40));
  const scale=Math.min(availW/nw,availH/nh,4), w=Math.round(nw*scale), h=Math.round(nh*scale);
  const imp=(el,p,v)=>el.style.setProperty(p,v,'important'); imp(stage,'width',w+'px'); imp(stage,'height',h+'px'); imp(stage,'max-height','none'); imp(image,'width',w+'px'); imp(image,'height',h+'px'); imp(image,'max-width','none'); imp(image,'max-height','none');
  const sub=viewer.querySelector('.photo-viewer-head .osub'); if(sub) sub.textContent='Resolução original: '+nw+' × '+nh+' px · use os controles para ampliar';
}
window.addEventListener('resize',fitPhotoViewer);
/* Reamostragem de alta qualidade: amplia a foto em etapas (2x) com suavização 'high' e aplica
   máscara de nitidez (unsharp mask) para o texto pequeno ficar legível ao ampliar/dar zoom. */
function photoBoxBlur(src,dst,w,h,r){
  const tmp=new Uint8ClampedArray(src.length), d=2*r+1;
  for(let y=0;y<h;y++){ const row=y*w*4; for(let c=0;c<3;c++){ let sum=0; for(let k=-r;k<=r;k++) sum+=src[row+Math.min(w-1,Math.max(0,k))*4+c];
    for(let x=0;x<w;x++){ tmp[row+x*4+c]=sum/d; const a=Math.min(w-1,x+r+1), b=Math.max(0,x-r); sum+=src[row+a*4+c]-src[row+b*4+c]; } } }
  for(let x=0;x<w;x++){ for(let c=0;c<3;c++){ let sum=0; for(let k=-r;k<=r;k++) sum+=tmp[Math.min(h-1,Math.max(0,k))*w*4+x*4+c];
    for(let y=0;y<h;y++){ dst[y*w*4+x*4+c]=sum/d; const a=Math.min(h-1,y+r+1), b=Math.max(0,y-r); sum+=tmp[a*w*4+x*4+c]-tmp[b*w*4+x*4+c]; } } }
}
async function enhancePhotoViewer(token){
  const viewer=document.getElementById('justPhotoViewer'), image=document.getElementById('justPhotoViewerImage'), stage=document.getElementById('justPhotoViewerStage');
  if(!viewer||!image||!stage||!photoViewerNat) return;
  const nw=photoViewerNat.w, nh=photoViewerNat.h, dpr=Math.max(1,window.devicePixelRatio||1);
  const fittedW=parseFloat(stage.style.width)||nw;
  let f=Math.min(8,Math.max(1,(fittedW*dpr*4)/nw));
  const maxPixels=20e6; if(nw*nh*f*f>maxPixels) f=Math.sqrt(maxPixels/(nw*nh));
  if(f<1.25) return;
  const tw=Math.round(nw*f), th=Math.round(nh*f);
  await new Promise(r=>setTimeout(r,30));
  if(token!==photoViewerToken) return;
  let cur=image, cw=nw, ch=nh;
  while(cw<tw){
    const nx=Math.min(tw,cw*2), ny=Math.round(nx*nh/nw), cv=document.createElement('canvas'); cv.width=nx; cv.height=ny;
    const ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high'; ctx.drawImage(cur,0,0,cw,ch,0,0,nx,ny);
    cur=cv; cw=nx; ch=ny;
  }
  const ctx=cur.getContext('2d'), data=ctx.getImageData(0,0,cw,ch), px=data.data, blur=new Uint8ClampedArray(px.length);
  const radius=Math.max(1,Math.round(f*0.55)); photoBoxBlur(px,blur,cw,ch,radius);
  const amount=1.1;
  for(let i=0;i<px.length;i+=4){ px[i]=px[i]+amount*(px[i]-blur[i]); px[i+1]=px[i+1]+amount*(px[i+1]-blur[i+1]); px[i+2]=px[i+2]+amount*(px[i+2]-blur[i+2]); }
  ctx.putImageData(data,0,0);
  const blob=await new Promise(r=>cur.toBlob(r,'image/png')); if(!blob||token!==photoViewerToken) return;
  if(photoViewerBlobUrl) URL.revokeObjectURL(photoViewerBlobUrl);
  photoViewerBlobUrl=URL.createObjectURL(blob); image.dataset.enh='1'; image.src=photoViewerBlobUrl;
}
let photoViewerReturnFocus=null;
let photoViewerZoom=1, photoPanX=0, photoPanY=0, photoDragging=false, photoDragStartX=0, photoDragStartY=0, photoPanStartX=0, photoPanStartY=0;
function applyPhotoZoom(){
  const image=document.getElementById('justPhotoViewerImage'), label=document.getElementById('justPhotoZoomLabel');
  if(image){ image.style.transform='translate('+photoPanX+'px,'+photoPanY+'px) scale('+photoViewerZoom+')'; image.style.transition='none'; }
  if(label) label.textContent=Math.round(photoViewerZoom*100)+'%';
}
function setPhotoZoom(value){ photoViewerZoom=Math.max(.5,Math.min(8,Number(value)||1)); applyPhotoZoom(); }
function resetPhotoView(){ photoViewerZoom=1; photoPanX=0; photoPanY=0; applyPhotoZoom(); }
function beginPhotoPan(e){
  if(e.button!==undefined&&e.button!==0)return;
  photoDragging=true; photoDragStartX=e.clientX; photoDragStartY=e.clientY; photoPanStartX=photoPanX; photoPanStartY=photoPanY;
  const stage=document.getElementById('justPhotoViewerStage'); if(stage){stage.classList.add('dragging');stage.setPointerCapture?.(e.pointerId);} e.preventDefault();
}
function movePhotoPan(e){ if(!photoDragging)return; photoPanX=photoPanStartX+(e.clientX-photoDragStartX); photoPanY=photoPanStartY+(e.clientY-photoDragStartY); applyPhotoZoom(); e.preventDefault(); }
function endPhotoPan(e){ if(!photoDragging)return; photoDragging=false; document.getElementById('justPhotoViewerStage')?.classList.remove('dragging'); try{document.getElementById('justPhotoViewerStage')?.releasePointerCapture?.(e.pointerId);}catch(_){} }

function openJustificationPhoto(pacote,base){
  const row=returnRecordForEntry({pacote,base});
  if(!row?.photo) return;
  const viewer=document.getElementById('justPhotoViewer'); const image=document.getElementById('justPhotoViewerImage');
  if(!viewer||!image) return;
  photoViewerReturnFocus=document.activeElement;
  photoPanX=0; photoPanY=0; photoViewerZoom=1; photoViewerNat=null; const token=++photoViewerToken;
  if(photoViewerBlobUrl){ URL.revokeObjectURL(photoViewerBlobUrl); photoViewerBlobUrl=null; }
  image.alt='Foto da observação do pacote '+String(pacote||''); image.style.imageRendering='auto'; image.dataset.enh='0';
  const onLoaded=()=>{ if(image.dataset.enh==='1'){applyPhotoZoom();return;} if(!image.naturalWidth||photoViewerNat) return; photoViewerNat={w:image.naturalWidth,h:image.naturalHeight}; fitPhotoViewer(); applyPhotoZoom(); enhancePhotoViewer(token); };
  image.onload=onLoaded; image.src=row.photo; applyPhotoZoom();
  viewer.classList.add('show'); viewer.setAttribute('aria-hidden','false'); if(image.complete&&image.naturalWidth&&image.dataset.enh!=='1') onLoaded();
  document.getElementById('justPhotoViewerClose')?.focus();
}
function closeJustificationPhoto(){
  const viewer=document.getElementById('justPhotoViewer'); const image=document.getElementById('justPhotoViewerImage');
  if(!viewer) return;
  photoViewerToken++; viewer.classList.remove('show'); viewer.setAttribute('aria-hidden','true'); if(image){ image.removeAttribute('src'); image.dataset.enh='0'; } if(photoViewerBlobUrl){ URL.revokeObjectURL(photoViewerBlobUrl); photoViewerBlobUrl=null; }
  if(photoViewerReturnFocus && typeof photoViewerReturnFocus.focus==='function') photoViewerReturnFocus.focus();
  photoViewerReturnFocus=null;
}
function attachJustificationPhoto(input){ const pacote=input.dataset.justPhoto||'',base=input.dataset.justBase||'',file=input.files?.[0];if(!file)return;const scroll=captureOverlayScroll();const reader=new FileReader();reader.onload=()=>{const sheet=ensureReturnSheetForActiveDate();let row=findReturnRow(pacote,base);if(!row){row={pacote,base,justificativa:'',photo:null};sheet.rows.push(row);}row.photo=String(reader.result||'');row.manualEditedAt=row.manualEditedAt||new Date().toISOString();row.updatedAt=new Date().toISOString();persistReturnSheets();renderOverlayBody();restoreOverlayScroll(scroll);updateImportUI();};reader.readAsDataURL(file); }
document.getElementById('overlayBody').addEventListener('click', function(e){
  const photoView=e.target.closest('[data-just-photo-view]'); if(photoView){ openJustificationPhoto(photoView.dataset.justPhotoView,photoView.dataset.justBase); return; }
  const photoDel=e.target.closest('[data-just-photo-delete]'); if(photoDel){ deleteJustificationPhoto(photoDel.dataset.justPhotoDelete,photoDel.dataset.justBase); return; }
  const edit=e.target.closest('[data-just-pacote]'); if(edit){ editJustification(edit.dataset.justPacote,edit.dataset.justBase); return; }
  const delJust=e.target.closest('[data-just-delete]'); if(delJust){ deleteJustification(delJust.dataset.justDelete,delJust.dataset.justBase); return; }
  if(e.target.closest('#overlayResetFiltros')){
    overlayCtx.bucket='TODOS'; overlayCtx.buckets=[]; overlayCtx.search=''; overlayCtx.period='TODOS'; overlayCtx.sortMode='VALOR';
    const inp=document.getElementById('overlaySearch'); if(inp) inp.value='';
    renderOverlayBody(); return;
  }
  if(e.target.closest('#overlayDownload')){
    const lista=overlayFiltered();
    const contexto=overlayCtx.title+(overlayCtx.buckets?.length?' · '+overlayCtx.buckets.map(b=>BUCKET_LABELS[b]).join(' + '):'');
    if(overlayCtx.title==='Pacotes por dias parado') abrirModalOcultarDias(lista,contexto);
    else if(String(overlayCtx.title||'').startsWith('Perdidos em rota')) abrirModalOcultarDias(lista,'Pacotes em rota',true);
    else abrirModalOcultarDias(lista, contexto, false);
    return;
  }
  const periodBtn=e.target.closest('.period-preset');
  if(periodBtn){ overlayCtx.period=periodBtn.dataset.period; renderOverlayBody(); return; }
  const sortBtn=e.target.closest('#overlaySortBtn');
  if(sortBtn){ overlayCtx.sortMode = overlayCtx.sortMode==='VALOR'?'MT':(overlayCtx.sortMode==='MT'?'TM':'VALOR'); renderOverlayBody(); return; }
  const chip=e.target.closest('.aging-chip');
  if(chip){ const b=chip.dataset.bucket; const multi=e.ctrlKey||e.metaKey; let selected=new Set(overlayCtx.buckets||[]); if(multi){ if(selected.has(b)) selected.delete(b); else selected.add(b); } else { selected=selected.size===1&&selected.has(b)?new Set():new Set([b]); } overlayCtx.buckets=Array.from(selected); overlayCtx.bucket=overlayCtx.buckets.length===1?overlayCtx.buckets[0]:'TODOS'; renderOverlayBody(); }
});
document.getElementById('overlayClose').addEventListener('click', ()=>document.getElementById('baseOverlay').classList.remove('show'));
document.getElementById('baseOverlay').addEventListener('click', function(e){ if(e.target===this) this.classList.remove('show'); });
document.getElementById('justPhotoViewerClose').addEventListener('click', closeJustificationPhoto);
document.getElementById('justPhotoZoomOut').addEventListener('click',()=>setPhotoZoom(photoViewerZoom-.25));
document.getElementById('justPhotoZoomIn').addEventListener('click',()=>setPhotoZoom(photoViewerZoom+.25));
document.getElementById('justPhotoZoomFit').addEventListener('click',resetPhotoView);
document.getElementById('justPhotoViewerStage').addEventListener('pointerdown',beginPhotoPan);
document.getElementById('justPhotoViewerStage').addEventListener('pointermove',movePhotoPan);
document.addEventListener('pointermove',movePhotoPan);
document.addEventListener('pointerup',endPhotoPan);
document.getElementById('justPhotoViewerStage').addEventListener('pointerup',endPhotoPan);
document.getElementById('justPhotoViewerStage').addEventListener('pointercancel',endPhotoPan);
document.getElementById('justPhotoViewerStage').addEventListener('pointerleave',endPhotoPan);
document.getElementById('justPhotoViewerStage').addEventListener('wheel',e=>{if(!document.getElementById('justPhotoViewer').classList.contains('show'))return;e.preventDefault();setPhotoZoom(photoViewerZoom+(e.deltaY<0?.15:-.15));},{passive:false});
document.getElementById('justPhotoViewer').addEventListener('click', function(e){ if(e.target===this) closeJustificationPhoto(); });
document.getElementById('overlayBody').addEventListener('click',function(e){const btn=e.target.closest('.driver-link');if(!btn)return;e.preventDefault();renderOverlayDriverDetail(btn.dataset.driver||'');});
document.addEventListener('keydown', function(e){
  if(e.key!=='Escape')return;
  const photoViewer=document.getElementById('justPhotoViewer');
  if(photoViewer?.classList.contains('show')){closeJustificationPhoto();return;}
  const driverPanel=document.getElementById('overlayDriverDetail');
  if(driverPanel){driverPanel.remove();return;}
  if(!motoristaSelecionado)document.getElementById('baseOverlay').classList.remove('show');
});

/* ===== OFENSORES POR REGIONAL ===== */
function computeOffendersData(){
  const result=[];
  const activeByRegional=getActiveDataByRegional();
  REGIONAL_ORDER.forEach(r=>{
    if(!activeByRegional[r]) return;
    const baseMap={};
    activeByRegional[r].entries.forEach(e=>{ if(!baseMap[e.base]) baseMap[e.base]={base:e.base,entries:[]}; baseMap[e.base].entries.push(e); });
    const bases=Object.values(baseMap).map(b=>({...b, valor:b.entries.reduce((a,e)=>a+e.valor,0)})).sort((a,b)=>b.valor-a.valor);
    result.push({regional:r, bases});
  });
  return result;
}
function matchesOffenderSearch(base, entries){
  const q=offendersSearch.trim().toUpperCase(); if(!q) return true;
  if(String(base).toUpperCase().includes(q)) return true;
  return entries.some(e=>(e.produto||'').toUpperCase().includes(q)||(e.pacote||'').toUpperCase().includes(q)||(e.rota||'').toUpperCase().includes(q)||getDriverName(e.driverId).toUpperCase().includes(q));
}
function bucketFilterEntries(entries, bucket){
  const b=bucket||'TODOS';
  if(b==='TODOS') return entries;
  return entries.filter(e=>bucketOf(diasParado(e))===b);
}
/* Filtro de dias parado agora é GERAL: uma escolha só, aplicada a todas as regionais. */
function getOffendersBucket(){ return offendersBucket||'TODOS'; }
/* Bases visíveis de uma regional, já com dias parado + valor mínimo + busca aplicados */
function visibleBasesFor(reg){
  const bucket=getOffendersBucket();
  return reg.bases.map(b=>{
    const entries=bucketFilterEntries(b.entries,bucket);
    return {base:b.base, entries, valor:entries.reduce((a,e)=>a+e.valor,0)};
  }).filter(b=>{
    if(!b.entries.length) return false;
    if(offendersThreshold>0 && b.valor<offendersThreshold) return false;
    return matchesOffenderSearch(b.base,b.entries);
  }).sort((a,b)=>b.valor-a.valor);
}
function renderOffendersAgingBar(){
  const bar=document.getElementById('offendersAgingBar'); if(!bar) return;
  const todas=getActiveEntries();
  const counts=computeAgingCounts(todas);
  const sel=getOffendersBucket();
  const items=[['TODOS','Todos',todas.length],['ATE2','Até 2',counts.ATE2.cnt],['3A6','3 a 6',counts['3A6'].cnt],['7A10','7 a 10',counts['7A10'].cnt],['MAIS11','+11',counts.MAIS11.cnt]];
  bar.innerHTML=items.map(([k,l,n])=>`<button type="button" class="preset-btn aging-preset ${sel===k?'active':''}" data-bucket="${k}">${l} (${fmtInt(n)})</button>`).join('');
}
function renderOffenders(){
  const container=document.getElementById('offendersList');
  const info=document.getElementById('offendersFiltersInfo');
  const data=computeOffendersData();
  renderOffendersAgingBar();
  const bucket=getOffendersBucket();
  const partes=[];
  if(bucket!=='TODOS') partes.push(BUCKET_LABELS[bucket]);
  if(offendersThreshold>0) partes.push('valor mínimo '+fmtBRL(offendersThreshold));
  if(offendersSearch.trim()) partes.push('busca "'+offendersSearch.trim()+'"');
  info.textContent = partes.length ? 'Filtros ativos: '+partes.join(' · ') : 'Sem filtros ativos';

  if(!data.length){ container.innerHTML='<div class="history-empty" style="padding:40px 0;">Importe uma planilha para ver os ofensores.</div>'; return; }

  let html=''; let algum=false;
  data.forEach(reg=>{
    const visible=visibleBasesFor(reg);
    if(!visible.length) return; /* regional some da lista quando nenhuma base atende ao filtro */
    algum=true;
    const color=STATE_COLORS[reg.regional]||'#00e676';
    const isCollapsed=offendersCollapsedRegionals.has(reg.regional);
    const regTotal=visible.reduce((a,b)=>a+b.valor,0);
    const regPac=visible.reduce((a,b)=>a+b.entries.length,0);
    const body='<div class="offender-base-list">'+visible.map(b=>{
      return `<div class="offender-base-row"><div class="offender-base-head" data-open-base="${escHtml(b.base)}"><svg class="ico offender-caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7"/></svg><span class="offender-base-code">${escHtml(b.base)}</span><span class="offender-base-valor">${fmtBRL(b.valor)}</span><span class="offender-base-pacotes">${fmtInt(b.entries.length)} pacote(s)</span></div></div>`;
    }).join('')+'</div>';
    html+=`<div class="offender-card" style="border-left-color:${color};">
      <div class="offender-card-head" data-regional-toggle="${escHtml(reg.regional)}">
        <svg class="ico offender-card-caret ${isCollapsed?'collapsed':''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 9 7 7 7-7"/></svg>
        <span class="offender-regional-dot" style="background:${color};"></span>
        <h3>${escHtml(REGIONAL_LABELS[reg.regional]||reg.regional)}</h3>
        <span class="offender-regional-count">${fmtInt(visible.length)} base(s)</span>
        <span class="offender-regional-total">${fmtBRL(regTotal)} · ${fmtInt(regPac)} pacotes</span>
      </div>
      <div style="display:${isCollapsed?'none':'block'};">${body}</div>
    </div>`;
  });
  if(!algum) html='<div class="history-empty" style="padding:30px 0 10px;">Nenhuma base atende aos filtros atuais. Use "Limpar todos os filtros" para voltar.</div>';
  container.innerHTML=html;
}
document.getElementById('offendersSearch').addEventListener('input', function(e){ offendersSearch=e.target.value; renderOffenders(); });
function setOffendersThreshold(v){
  offendersThreshold=(isNaN(v)||v<0)?0:v;
  document.querySelectorAll('#thresholdPresets .preset-btn').forEach(b=>b.classList.toggle('active', Number(b.dataset.val)===offendersThreshold));
  renderOffenders();
  const origem=document.getElementById('revOrigem'); if(origem&&origem.value==='OFENSORES') renderRevertido();
  const diariaOrigem=document.getElementById('diariaOrigem'); if(diariaOrigem&&diariaOrigem.value==='OFENSORES') renderDiaria();
}
document.getElementById('offendersThreshold').addEventListener('input', function(e){ const v=parseFloat(String(e.target.value).replace(',', '.')); setOffendersThreshold(isNaN(v)?0:v); });
document.getElementById('thresholdPresets').addEventListener('click', function(e){
  const btn=e.target.closest('.preset-btn'); if(!btn) return;
  const v=Number(btn.dataset.val);
  document.getElementById('offendersThreshold').value=v||'';
  setOffendersThreshold(v);
});
document.getElementById('offendersAgingBar').addEventListener('click', function(e){
  const btn=e.target.closest('.aging-preset'); if(!btn) return;
  offendersBucket=btn.dataset.bucket||'TODOS'; saveOffendersBucket();
  renderOffenders();
});
document.getElementById('btnResetOffenders').addEventListener('click', function(){
  offendersBucket='TODOS'; saveOffendersBucket();
  offendersSearch=''; document.getElementById('offendersSearch').value='';
  document.getElementById('offendersThreshold').value='';
  offendersCollapsedRegionals.clear();
  setOffendersThreshold(0);
});
document.getElementById('offendersList').addEventListener('click', function(e){
  const baseHead=e.target.closest('[data-open-base]');
  if(baseHead){ openBaseOverlay(baseHead.dataset.openBase); return; }
  const regHead=e.target.closest('[data-regional-toggle]');
  if(regHead){ const key=regHead.dataset.regionalToggle; if(offendersCollapsedRegionals.has(key)) offendersCollapsedRegionals.delete(key); else offendersCollapsedRegionals.add(key); renderOffenders(); return; }
});

/* ===== PLANILHA DE RETORNO (.xlsx com cores, compatível com Excel/OneDrive) =====
   Dias parado: até 2 verde · 3 amarelo · 4 laranja · 5+ vermelho */
const XLSX_COLS=[['BASE',12],['PACOTE',16],['ROTA',14],['PRODUTO',46],['MOTIVO',22],['MOTORISTA',28],['DIAS PARADO',13],['VALOR (R$)',18],['Situação',32],['OBSERVAÇÃO',34],['FOTO JUSTIFICATIVA',22],['RESOLVIDO',12],['TUTORIAL DE COMO ANEXAR FOTO',16]];
const LOST_XLSX_COLS=[['BASE',12],['PACOTE',16],['ROTA',14],['PRODUTO',46],['MOTIVO',22],['MOTORISTA',28],['DIAS PARADO',13],['RISCO',12],['VALOR (R$)',18],['Situação',32],['OBSERVAÇÃO',34],['FOTO JUSTIFICATIVA',22],['RESOLVIDO',12],['TUTORIAL DE COMO ANEXAR FOTO',16]];
const ORIGIN_XLSX_COLS=[['BASE',12],['PACOTE',16],['ROTA',14],['ORIGEM',14],['DESTINO',14],['PRODUTO',60]];
function riscoStyle(dias){ const k=riscoDiasParado(dias).key; return k==='alto'?20:(k==='medio'?21:22); }
function riscoTexto(dias){ return riscoDiasParado(dias).label.toUpperCase(); }
const STYLES_XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
+'<fonts count="7">'
+'<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>'
+'<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>'
+'<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
+'<font><b/><sz val="14"/><color rgb="FF000000"/><name val="Calibri"/></font>'
+'<font><b/><sz val="8"/><color rgb="FFFF0000"/><name val="Calibri"/></font>'
+'<font><sz val="9"/><color rgb="FF000000"/><name val="Calibri"/></font>'
+'<font><b/><sz val="9"/><color rgb="FFFF0000"/><name val="Calibri"/></font>'
+'</fonts>'
+'<fills count="23">'
+'<fill><patternFill patternType="none"/></fill>'
+'<fill><patternFill patternType="gray125"/></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FF1F1F1F"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFB7D9F7"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFFFEB9C"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFFFCC99"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFF4A6B7"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FF00C853"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFE53935"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFC62828"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FF8E0000"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFF3D316"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFFF8A00"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFEF3F56"/><bgColor indexed="64"/></patternFill></fill>'
+'<fill><patternFill patternType="solid"><fgColor rgb="FFF3D316"/><bgColor indexed="64"/></patternFill></fill>' /* 14 situação amarelo */
+'<fill><patternFill patternType="solid"><fgColor rgb="FFFF8A00"/><bgColor indexed="64"/></patternFill></fill>' /* 15 situação laranja */
+'<fill><patternFill patternType="solid"><fgColor rgb="FFEF3F56"/><bgColor indexed="64"/></patternFill></fill>' /* 16 situação vermelho */
+'<fill><patternFill patternType="solid"><fgColor rgb="FF9BE15D"/><bgColor indexed="64"/></patternFill></fill>' /* 17 situação verde claro */
+'<fill><patternFill patternType="solid"><fgColor rgb="FF00A83B"/><bgColor indexed="64"/></patternFill></fill>' /* 18 situação verde escuro */
+'<fill><patternFill patternType="solid"><fgColor rgb="FFC7A0FF"/><bgColor indexed="64"/></patternFill></fill>' /* 19 situação roxo claro */
+'<fill><patternFill patternType="solid"><fgColor rgb="FF8E44AD"/><bgColor indexed="64"/></patternFill></fill>' /* 20 situação roxo */
+'<fill><patternFill patternType="solid"><fgColor rgb="FF5B176F"/><bgColor indexed="64"/></patternFill></fill>' /* 21 situação roxo escuro */
+'<fill><patternFill patternType="solid"><fgColor rgb="FF4DA3FF"/><bgColor indexed="64"/></patternFill></fill>' /* 22 situação azul */
+'</fills>'
+'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
+'<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>'
+'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
+'<cellXfs count="32">'
+'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'                                                                        /* 0 padrao */
+'<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'                                                          /* 1 titulo */
+'<xf numFmtId="0" fontId="1" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' /* 2 faixa regional */
+'<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="0"/></xf>' /* 3 cabecalho */
+'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'                                                         /* 4 texto */
+'<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' /* 5 dias azul */
+'<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' /* 6 dias amarelo */
+'<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' /* 7 dias laranja */
+'<xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' /* 8 dias rosa-avermelhado */
+'<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>'                                   /* 9 valor */
+'<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 10 total rotulo */
+'<xf numFmtId="4" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>'                     /* 11 total valor */
+'<xf numFmtId="0" fontId="1" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' /* 12 dias 6 vermelho */
+'<xf numFmtId="0" fontId="1" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' /* 13 dias 7 vermelho forte */
+'<xf numFmtId="0" fontId="2" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' /* 14 dias 8+ vermelho muito forte */
+'<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="0"/></xf>'
+'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
+'<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
+'<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
+'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
+'<xf numFmtId="0" fontId="2" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 20 risco ALTO */
+'<xf numFmtId="0" fontId="2" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 21 risco MEDIO */
+'<xf numFmtId="0" fontId="1" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 22 risco BAIXO */
+'<xf numFmtId="0" fontId="0" fillId="14" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 23 situação amarelo */
+'<xf numFmtId="0" fontId="0" fillId="15" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 24 situação laranja */
+'<xf numFmtId="0" fontId="2" fillId="16" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 25 situação vermelho */
+'<xf numFmtId="0" fontId="0" fillId="17" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 26 situação verde claro */
+'<xf numFmtId="0" fontId="2" fillId="18" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 27 situação verde escuro */
+'<xf numFmtId="0" fontId="0" fillId="19" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 28 situação roxo claro */
+'<xf numFmtId="0" fontId="2" fillId="20" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 29 situação roxo */
+'<xf numFmtId="0" fontId="2" fillId="21" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 30 situação roxo escuro */
+'<xf numFmtId="0" fontId="0" fillId="22" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' /* 31 situação azul */
+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
+buildSituationDxfs()+'</styleSheet>';
function colName(i){ let s='',n=i+1; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26);} return s; }
function xmlEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''); }
function compressRefs(refs){ /* ['J5','J6','J7','J10'] -> 'J5:J7 J10' */
  const out=[]; let start=null,prev=null,col=null;
  const flush=()=>{ if(start===null)return; out.push(start===prev?col+start:col+start+':'+col+prev); start=null; prev=null; };
  refs.forEach(ref=>{ const m=/^([A-Z]+)(\d+)$/.exec(ref); if(!m)return; const c=m[1], n=Number(m[2]); if(start!==null && c===col && n===prev+1){ prev=n; return; } flush(); col=c; start=n; prev=n; });
  flush(); return out.join(' ');
}
function cTxt(col,row,v,st){ return '<c r="'+colName(col)+row+'" s="'+st+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(v)+'</t></is></c>'; }
function cNum(col,row,v,st){ const n=parseBRNumber(v); return '<c r="'+colName(col)+row+'" s="'+st+'"><v>'+(Math.round(n*100)/100)+'</v></c>'; }
function buildSituationDxfs(){
  const argb=h=>'FF'+String(h||'#000000').replace('#','').toUpperCase();
  /* No dxf (formatação condicional) o preenchimento sólido usa bgColor; só com fgColor o Excel pinta de preto. Uma entrada por opção, na mesma ordem de SITUATION_OPTIONS (dxfId = índice). */
  return '<dxfs count="'+SITUATION_OPTIONS.length+'">'+SITUATION_OPTIONS.map(item=>'<dxf><font><b/><color rgb="'+argb(item.font)+'"/></font><fill><patternFill patternType="solid"><fgColor rgb="'+argb(item.color)+'"/><bgColor rgb="'+argb(item.color)+'"/></patternFill></fill></dxf>').join('')+'</dxfs>';
}
function situationStyleId(value){ const v=String(value||''); if(!v)return 4; if(v==='Para solução de problema'||v==='Despachar'||v==='Em outra base')return 23; if(v==='Faltante'||v==='Parado')return 24; if(v==='Não encontrado no ato do carregamento'||v==='Perdido')return 25; if(v==='Em rota de entrega')return 26; if(v==='Entregue')return 27; if(v==='Para devolver')return 28; if(v==='Devolução')return 29; if(v==='Devolução | Comprador recusou')return 30; if(v==='Outros')return 31; return 4; }
function diasStyle(dias){ if(dias<=2) return 5; if(dias===3) return 6; if(dias===4) return 7; if(dias===5) return 8; if(dias===6) return 12; if(dias===7) return 13; return 14; }
function buildSheetXml(grupos, contexto, opts){
  const lost=Boolean(opts&&opts.lost), COLS=lost?LOST_XLSX_COLS:XLSX_COLS, N=COLS.length, LASTC=colName(N-1), valCol=lost?8:7;
  let rows='', merges=[], situationRefs=[], r=0;
  const linhaVazia=()=>{ r++; rows+='<row r="'+r+'" ht="15" customHeight="1"/>'; };
  r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+cTxt(0,r,'Planilha de retorno — Parceiro Spot · '+fmtDateFullBR(new Date())+(contexto?(typeof contexto==='string'?contexto:(contexto.selectedDays?.length?'Dias '+contexto.selectedDays.map(d=>d.split('-').reverse().join('/')).join(', '):'')):''),1)+'</row>';
  merges.push('A'+r+':'+LASTC+r);
  grupos.forEach(g=>{
    const linhas=g.linhas;
    const valorReg=linhas.reduce((a,x)=>a+parseBRNumber(x.e.valor),0);
    linhaVazia();
    r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'
      +cTxt(0,r,(REGIONAL_LABELS[g.regional]||g.regional)+' — '+fmtInt(linhas.length)+' pacote(s) — '+fmtBRL(valorReg),2);
    for(let c=1;c<N;c++) rows+='<c r="'+colName(c)+r+'" s="2"/>';
    rows+='</row>';
    merges.push('A'+r+':'+LASTC+r);
    r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+COLS.map((cc,i)=>cTxt(i,r,cc[0],3)).join('')+'</row>';
    linhas.forEach(({base,e})=>{
      const dias=diasParado(e);
      const dataRowNumber=r+1;
      const retorno=returnRecordForEntry(e), situacao=String(retorno?.situacao||''), justificativa=String(retorno?.justificativa||'').trim(), resolvido=(justificativa||situacao)?'Resolvido':'Pendente';
      r++; situationRefs.push(colName(valCol+1)+r);
      const fotoOk=Boolean(retorno?.photo||retorno?.photoIndicator);
      const tut='Clicar em ANEXAR FOTO > botão Inserir (no topo) > Imagem > Este dispositivo > depois de abrir a foto, clicar no ícone pequeno de paisagem com quadradinho que fica ao lado da foto que abriu.';
      const cells=[cTxt(0,r,base,4),cTxt(1,r,e.pacote||'',4),cTxt(2,r,e.rota||'',4),cTxt(3,r,resumo(e.produto,45),4),cTxt(4,r,e.motivo||'',16),cTxt(5,r,getDriverName(e.driverId),4),cNum(6,r,dias,diasStyle(dias))];
      if(lost) cells.push(cTxt(7,r,riscoTexto(dias),riscoStyle(dias)));
      cells.push(cNum(valCol,r,e.valor,18),cTxt(valCol+1,r,situacao, situationStyleId(situacao)),cTxt(valCol+2,r,justificativa,4),cTxt(valCol+3,r,fotoOk?'FOTO ANEXADA':'ANEXAR FOTO',fotoOk?19:17),cTxt(valCol+4,r,resolvido,4),cTxt(valCol+5,r,tut,15));
      rows+='<row r="'+r+'" ht="15" customHeight="1">'+cells.join('')+'</row>';
    });
    r++;
    { const tc=[cTxt(0,r,'Total '+(REGIONAL_LABELS[g.regional]||g.regional),10)]; for(let c=1;c<N;c++) tc.push(c===valCol?cNum(c,r,valorReg,18):cTxt(c,r,'',4));
      rows+='<row r="'+r+'" ht="15" customHeight="1">'+tc.join('')+'</row>'; }
    merges.push('A'+r+':'+colName(valCol-1)+r);
  });
  linhaVazia();
  if(lost){
    r++; rows+='<row r="'+r+'">'+cTxt(0,r,'Legenda de risco',1)+'</row>';
    r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+cTxt(0,r,'BAIXO',22)+cTxt(1,r,'< 24h',4)+'</row>';
    r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+cTxt(0,r,'MÉDIO',21)+cTxt(1,r,'24h a 48h',4)+'</row>';
    r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+cTxt(0,r,'ALTO',20)+cTxt(1,r,'> 48h',4)+'</row>';
  } else {
    r++; rows+='<row r="'+r+'">'+cTxt(0,r,'Legenda dias parado',1)+'</row>';
    r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+cTxt(0,r,'Até 2 dias',5)+cTxt(1,r,'3 dias',6)+cTxt(2,r,'4 dias',7)+cTxt(3,r,'5 dias ou mais',8)+'</row>';
  }
  const cols='<cols>'+COLS.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+c[1]+'" customWidth="1"/>').join('')+'</cols>';
  const mc = merges.length ? '<mergeCells count="'+merges.length+'">'+merges.map(m=>'<mergeCell ref="'+m+'"/>').join('')+'</mergeCells>' : '';
  const situationList=SITUATION_OPTIONS.map(item=>item.label).join(',');
  /* Lista inline compatível com Excel Online; as 13 opções ocupam 199 caracteres (limite do Excel: 255). */
  const dv=situationRefs.length?'<dataValidations count="1"><dataValidation type="list" allowBlank="1" showDropDown="0" showInputMessage="1" showErrorMessage="1" errorTitle="Situação" error="Escolha uma Situação da lista." sqref="'+compressRefs(situationRefs)+'"><formula1>'+xmlEsc('"'+situationList+'"')+'</formula1></dataValidation></dataValidations>':'';
  const situationRange=situationRefs.length?situationRefs[0]+':'+situationRefs[situationRefs.length-1]:'';
  const cf=situationRefs.length?'<conditionalFormatting sqref="'+situationRange+'">'+SITUATION_OPTIONS.map((item,i)=>'<cfRule type="cellIs" dxfId="'+i+'" priority="'+(i+1)+'" operator="equal"><formula>'+xmlEsc('\"'+item.label+'\"')+'</formula></cfRule>').join('')+'</conditionalFormatting>':'';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    +cols+'<sheetData>'+rows+'</sheetData>'+mc+cf+dv+'</worksheet>';
}
function buildOriginSheetXml(list){
  let rows='', r=1; const N=ORIGIN_XLSX_COLS.length;
  rows+='<row r="1" ht="15" customHeight="1">'+cTxt(0,1,'Origem e destino dos pacotes em rota — '+fmtDateFullBR(new Date()),1)+'</row>';
  r++; rows+='<row r="'+r+'" ht="15" customHeight="1"></row>';
  r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+ORIGIN_XLSX_COLS.map((c,i)=>cTxt(i,r,c[0],3)).join('')+'</row>';
  list.forEach(e=>{ r++; rows+='<row r="'+r+'" ht="15" customHeight="1">'+[lostPrimaryBase(e)||e.base||e.origem||'',e.pacote||'',e.rota||'',e.origem||'—',e.destino||'—',e.produto||''].map((v,i)=>cTxt(i,r,v,4)).join('')+'</row>'; });
  const cols='<cols>'+ORIGIN_XLSX_COLS.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+c[1]+'" customWidth="1"/>').join('')+'</cols>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+cols+'<sheetData>'+rows+'</sheetData><mergeCells count="1"><mergeCell ref="A1:'+colName(N-1)+'1"/></mergeCells></worksheet>';
}
function buildLostSheets(list){
  const porBase=list.reduce((m,e)=>{const b=lostPrimaryBase(e)||e.base||e.origem||'SEM BASE';(m[b]=m[b]||[]).push({...e,valor:Number(e.valor||0),tipo:'SVC',produto:e.produto||'',motivo:motivoExibicaoLost(e)});return m;},{});
  const groups=Object.entries(porBase).map(([base,linhas])=>({regional:base,linhas:linhas.map(e=>({base,e}))}));
  const ordered=[].concat(...groups.map(g=>g.linhas.map(l=>l.e)));
  return [
    {reg:'PACOTES EM ROTA',groupKey:'LOST',groupLabel:'Pacotes em rota',xml:buildSheetXml(groups,'Pacotes em rota',{lost:true})},
    {reg:'ORIGEM',groupKey:'ORIGEM',groupLabel:'Origem',xml:buildOriginSheetXml(ordered)}
  ];
}
function agruparPorRegional(entries){
  const porReg={};
  entries.forEach(e=>{ const r=regionalFromBasePrefix(e.base)||'OUTROS'; (porReg[r]=porReg[r]||[]).push(e); });
  const ordem=REGIONAL_ORDER.filter(r=>porReg[r]).concat(Object.keys(porReg).filter(r=>REGIONAL_ORDER.indexOf(r)<0));
  return ordem.map(r=>{
    const totalBase={};
    porReg[r].forEach(e=>{ totalBase[e.base]=(totalBase[e.base]||0)+e.valor; });
    const linhas=porReg[r].slice().sort((a,b)=> (totalBase[b.base]-totalBase[a.base]) || (b.valor-a.valor))
      .map(e=>({base:e.base, e}));
    return {regional:r, linhas};
  });
}
function baixarRetorno(entries, contexto){
  baixarRetornoFormatado(entries, contexto);
}
function exportDateKey(value, fallback=''){
  if(value instanceof Date && !isNaN(value.getTime())){
    const y=value.getFullYear(), m=String(value.getMonth()+1).padStart(2,'0'), d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const raw=String(value??'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0,10);
  const br=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if(br) return `${br[3]}-${String(br[2]).padStart(2,'0')}-${String(br[1]).padStart(2,'0')}`;
  const parsed=new Date(raw);
  if(!isNaN(parsed.getTime())) return exportDateKey(parsed);
  return String(fallback||'').slice(0,10);
}
function lostExportDateKey(entry){ return exportDateKey(entry?.date,entry?.importDate); }
/* Exportação formatada: uma aba por regional, blocos separados por base e observações atuais. */
const REGIONAL_FILE_NAMES={'ESPÍRITO SANTO':'Espírito Santo','MINAS GERAIS':'Minas Gerais','BAHIA':'Bahia','SÃO PAULO':'São Paulo','RIO DE JANEIRO':'Rio de Janeiro','OUTROS':'Outras Bases'};
const PAGE_FILE_NAMES={geral:'Visão Geral',ofensores:'Ofensores',regional:'Regional e Base',lostroutes:'Pacotes em Rota',diaria:'Visão Diária',analise:'Análise',revertido:'Pacote Revertido',importados:'Importados'};
function dateFileBR(d){ return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear(); }
/* Nome do arquivo: "<Aba> - <Regional> - <dd-mm-aaaa>.xlsx" */
function exportFileName(entries,contexto){
  const page=document.querySelector('.nav-btn.active')?.dataset.page||'geral';
  const lostOnly=Boolean(contexto?.onlyLostRoutes);
  const aba=lostOnly?'Pacotes em Rota':(PAGE_FILE_NAMES[page]||'Planilha');
  let key=null;
  if(page==='lostroutes') key=(lostRouteNav.level==='bases'&&lostRouteNav.regional!=='TODAS')?lostRouteNav.regional:'TODOS';
  else if(page==='regional'&&!lostOnly) key=(regionalNav.level==='bases'&&regionalNav.regional!=='TODAS')?regionalNav.regional:'TODOS';
  else if(page==='diaria'&&!lostOnly) key=document.getElementById('diariaRegional')?.value||'TODOS';
  if(!key){ const regs=new Set((entries||[]).map(e=>lostOnly?lostRouteRegion(e):(regionalFromBasePrefix(e.base)||'OUTROS'))); key=regs.size===1?[...regs][0]:'TODOS'; }
  const regional=REGIONAL_FILE_NAMES[key]||'Todas as Regionais';
  let data=dateFileBR(new Date());
  const sel=contexto?.selectedDays;
  if(page==='diaria'&&!lostOnly){ const v=document.getElementById('diariaDia')?.value; if(v) data=dateFileBR(new Date(v+'T00:00:00')); }
  else if(sel&&sel.length){ const f=s=>dateFileBR(new Date(s+'T00:00:00')); data=sel.length===1||sel[0]===sel[sel.length-1]?f(sel[0]):f(sel[0])+' a '+f(sel[sel.length-1]); }
  return (aba+' - '+regional+' - '+data).replace(/[\\\/:*?"<>|]/g,' ')+'.xlsx';
}
function baixarRetornoFormatado(entries, contexto){
  showExportBusy('Gerando planilha...');
  setTimeout(()=>{ try{ EXPORT_CACHE=buildExportCache(); baixarRetornoFormatadoImpl(entries,contexto); }catch(err){ console.error(err); hideExportBusy(); alert('Não foi possível gerar o arquivo.'); } finally{ EXPORT_CACHE=null; } },30);
}
function baixarRetornoFormatadoImpl(entries, contexto){
  if(!entries||!entries.length){ hideExportBusy(); alert('Nenhum pacote no filtro atual para exportar.'); return; }
  if(typeof JSZip==='undefined'){ hideExportBusy(); alert('Não consegui gerar o Excel: a biblioteca de compactação não carregou.'); return; }
  const ageGroups=contexto?.ageGroups?.length?contexto.ageGroups:[{key:'TODOS',label:'Todos os dias'}];
  const sheets=[];
  const standaloneLostRows=Array.isArray(contexto?.lostRows)?contexto.lostRows:LOST_ROUTES;
  const standaloneLost=Boolean(contexto?.onlyLostRoutes && standaloneLostRows.length);
  const lostSheetWanted=Boolean(!standaloneLost && contexto?.includeLostRoutes && LOST_ROUTES.length);
  if(standaloneLost){ sheets.push(...buildLostSheets(standaloneLostRows)); }
  if(!standaloneLost) ageGroups.forEach(group=>{
    const groupEntries=entries.filter(e=>ageGroupMatches(e,group));
    const porReg={}; REGIONAL_ORDER.forEach(reg=>porReg[reg]=[]); groupEntries.forEach(e=>{const reg=regionalFromBasePrefix(e.base)||'OUTROS';(porReg[reg]=porReg[reg]||[]).push(e);});
    const ordem=REGIONAL_ORDER.concat(Object.keys(porReg).filter(r=>!REGIONAL_ORDER.includes(r)));
    ordem.forEach(reg=>{const porBase={};(porReg[reg]||[]).forEach(e=>(porBase[e.base]=porBase[e.base]||[]).push(e));const grupos=Object.keys(porBase).sort().map(base=>({regional:base,linhas:porBase[base].slice().sort((a,b)=>{const da=(contexto?.dateOrder||[]).indexOf(a._exportDate),db=(contexto?.dateOrder||[]).indexOf(b._exportDate);return (da<0?999:da)-(db<0?999:db)||((b.valor||0)-(a.valor||0));}).map(e=>({base:e.base,e}))}));sheets.push({reg,groupKey:group.key,groupLabel:group.label,xml:buildSheetXml(grupos,contexto)});});
  });
  if(lostSheetWanted){ sheets.push(...buildLostSheets(LOST_ROUTES)); }
  const zip=new JSZip(); const sheetOverrides=sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheetOverrides+'</Types>');
  zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  const short={'ESPÍRITO SANTO':'ES','MINAS GERAIS':'MG','BAHIA':'BA','SÃO PAULO':'SP','RIO DE JANEIRO':'RJ'}; const xl=zip.folder('xl'), usados=new Set(), names=sheets.map((s,i)=>{const base=(short[s.reg]||s.reg||('Regional '+(i+1))).replace(/[\/*?:\[\]]/g,' ').trim().slice(0,31);let label=base,n=2;while(usados.has(label)){const sufixo=' '+n++;label=base.slice(0,31-sufixo.length)+sufixo;}usados.add(label);return {label,i};});
  xl.file('workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map(n=>'<sheet name="'+xmlEsc(n.label)+'"'+(sheets[n.i].hidden?' state="hidden"':'')+' sheetId="'+(n.i+1)+'" r:id="rId'+(n.i+1)+'"/>').join('')+'</sheets></workbook>');
  xl.folder('_rels').file('workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  xl.file('styles.xml',STYLES_XML); const wsFolder=xl.folder('worksheets'); sheets.forEach((s,i)=>wsFolder.file('sheet'+(i+1)+'.xml',s.xml));
  zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE',compressionOptions:{level:1}}).then(blob=>{hideExportBusy();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=exportFileName(entries,contexto);document.body.appendChild(a);a.click();setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1500);}).catch(err=>{console.error(err);hideExportBusy();alert('Não foi possível gerar o arquivo neste navegador.');});
}
const EXPORT_AGE_OPTIONS=[['3_6','3–6 dias'],['3_7','3–7 dias'],['1_2','1–2 dias'],['8_10','8–10 dias'],['11_PLUS','11 dias ou mais'],['TODOS','Todos os dias em atraso'],['CUSTOM','Escolher dias específicos']];
function parseManualAgeSpec(value){
  const raw=String(value||'').trim(); if(!raw)return null; const ranges=[];
  for(const part of raw.split(',')){const token=part.trim();if(!token)continue;const match=token.match(/^(\d+)\s*(?:-|–|a)\s*(\d+)$/i);if(match){const min=Number(match[1]),max=Number(match[2]);if(max<min)return null;ranges.push([min,max]);}else if(/^\d+$/.test(token)){const n=Number(token);ranges.push([n,n]);}else return null;}
  return ranges.length?ranges:null;
}
function manualAgeMatches(days,spec){return (spec||[]).some(([min,max])=>days>=min&&days<=max);}
function ageGroupMatches(entry,group){
  const days=diasParado(entry); if(!group||group.key==='TODOS')return true;
  if(group.key==='3_6')return days>=3&&days<=6;
  if(group.key==='3_7')return days>=3&&days<=7;
  if(group.key==='1_2')return days>=1&&days<=2;
  if(group.key==='8_10')return days>=8&&days<=10;
  if(group.key==='11_PLUS')return days>=11;
  return group.key==='CUSTOM' ? manualAgeMatches(days,group.ranges) : true;
}
function ageSelectHtml(value){return '<select class="export-extra-age">'+EXPORT_AGE_OPTIONS.map(o=>'<option value="'+o[0]+'" '+(o[0]===value?'selected':'')+'>'+o[1]+'</option>').join('')+'</select><div class="export-custom-age" hidden><span>dias:</span><input type="text" class="export-age-days" placeholder="ex.: 3, 5, 7-9"><small>use vírgula e/ou intervalo</small></div>';}
function renderExtraAgeGroups(){const box=document.getElementById('exportExtraAgeGroups');if(!box)return;box.innerHTML=Array.from(box.querySelectorAll('.export-extra-age-row')).length?box.innerHTML:'';}
function openExportConfig(seedEntries=null, lostOnly=false){
  if(!lostOnly && !IMPORTS.length){alert('Importe uma planilha de pacotes antes de baixar o retorno.');return;}
  exportLostOnlyMode=Boolean(lostOnly);
  exportSeedEntries=Array.isArray(seedEntries)&&seedEntries.length?seedEntries.map(e=>({...e})):null;
  const box=document.getElementById('exportDaysList');
  const days=lostOnly?Array.from(new Set((seedEntries||LOST_ROUTES).map(lostExportDateKey).filter(Boolean))).sort():availableImportDates();
  document.getElementById('exportMainAge').value='TODOS'; document.getElementById('exportMainCustomAge').hidden=true; document.getElementById('exportExtraAgeGroups').innerHTML='';
  box.innerHTML=days.map(day=>{const meta=lostOnly?fmtInt((seedEntries||LOST_ROUTES).filter(e=>lostExportDateKey(e)===day).length)+' pacote(s) em rota':IMPORTS.filter(i=>i.importDate===day).map(i=>escHtml(i.turno||'Turno')+' · '+escHtml(i.fileName||'Arquivo')).join(' | ');return '<label class="export-day-option"><input type="checkbox" value="'+day+'" checked><span><strong>'+day.split('-').reverse().join('/')+'</strong><small>'+meta+'</small></span></label>';}).join('');
  const agingEntries=exportSeedEntries||IMPORTS.flatMap(i=>i.entries||[]); const agingDays=Array.from(new Set(agingEntries.map(e=>Math.floor(diasParado(e))).filter(Number.isFinite))).sort((a,b)=>a-b);
  document.getElementById('exportAgingExcludeList').innerHTML=agingDays.length?agingDays.map(day=>'<label class="export-day-option"><input type="checkbox" value="'+day+'"><span><strong>'+day+' dia'+(day===1?'':'s')+'</strong><small>pacotes parados</small></span></label>').join(''):'<small class="export-age-help">Não há dias de pacote parado disponíveis para excluir.</small>';
  document.getElementById('exportConfigOverlay').classList.add('show');
}
function closeExportConfig(){document.getElementById('exportConfigOverlay').classList.remove('show');}
document.getElementById('btnDownloadOfensores').addEventListener('click',()=>{
  const entries=computeOffendersData().flatMap(reg=>visibleBasesFor(reg).flatMap(base=>base.entries));
  abrirModalOcultarDias(entries,'Pacotes por dias parado',false);
});
document.getElementById('exportConfigClose').addEventListener('click',closeExportConfig);
document.getElementById('exportConfigCancel').addEventListener('click',closeExportConfig);
document.getElementById('exportSelectAllDays').addEventListener('click',()=>document.querySelectorAll('#exportDaysList input').forEach(i=>i.checked=true));
document.getElementById('exportClearAgingExclude').addEventListener('click',()=>document.querySelectorAll('#exportAgingExcludeList input').forEach(i=>i.checked=false));
function toggleCustomAge(select,box){const custom=box.querySelector('.export-custom-age');if(custom)custom.hidden=select.value!=='CUSTOM';}
document.getElementById('exportMainAge').addEventListener('change',function(){document.getElementById('exportMainCustomAge').hidden=this.value!=='CUSTOM';});
document.getElementById('exportAddAgeGroup').addEventListener('click',()=>{const box=document.getElementById('exportExtraAgeGroups');const row=document.createElement('div');row.className='export-extra-age-row';const blockNumber=box.querySelectorAll('.export-extra-age-row').length+2;row.innerHTML='<label>'+blockNumber+'º bloco · ES / MG / BA / SP / RJ</label>'+ageSelectHtml('1_2')+'<button type="button" class="btn-reset export-remove-age">Remover</button>';const select=row.querySelector('.export-extra-age');select.addEventListener('change',()=>toggleCustomAge(select,row));row.querySelector('.export-remove-age').addEventListener('click',()=>row.remove());box.appendChild(row);});
document.getElementById('exportConfigConfirm').addEventListener('click',()=>{
  const selected=Array.from(document.querySelectorAll('#exportDaysList input:checked')).map(i=>i.value); if(!selected.length){alert('Selecione pelo menos um dia.');return;}
  const order=document.getElementById('exportOrder').value; const chunk=Math.max(1,Number(document.getElementById('exportChunkSize').value)||1); const imports=IMPORTS.filter(i=>selected.includes(i.importDate)); let entries=[];
  if(exportSeedEntries){
    const prepared=exportSeedEntries.map(e=>({...e,_exportDate:exportLostOnlyMode?lostExportDateKey(e):(e._exportDate||getSelectedImport()?.importDate||selected[selected.length-1]),_exportTurno:e._exportTurno||getSelectedImport()?.turno||''}));
    entries=prepared.filter(e=>selected.includes(e._exportDate));
    if(exportLostOnlyMode && !entries.length) entries=prepared;
  }
  else imports.forEach(imp=>{let list=(imp.entries||[]).slice();if(currentTab!=='TODOS')list=list.filter(e=>regionalFromBasePrefix(e.base)===currentTab);if(currentBaseFilter!=='TODAS')list=list.filter(e=>e.base===currentBaseFilter);entries.push(...list.map(e=>({...e,_exportDate:imp.importDate,_exportTurno:imp.turno})));});
  if(!entries.length){alert('Nenhum pacote encontrado nos dias e filtros selecionados.');return;}
  const bucket=getOffendersBucket(); if(bucket!=='TODOS')entries=entries.filter(e=>bucketOf(diasParado(e))===bucket);
  const excludedAging=new Set(Array.from(document.querySelectorAll('#exportAgingExcludeList input:checked')).map(i=>Number(i.value))); if(excludedAging.size)entries=entries.filter(e=>!excludedAging.has(Math.floor(diasParado(e))));
  const dateOrder=selected.slice().sort((a,b)=>order==='DATA_DESC'?b.localeCompare(a):a.localeCompare(b));
  if(order==='TODAS') entries.sort((a,b)=>{const ra=regionalFromBasePrefix(a.base)||'';const rb=regionalFromBasePrefix(b.base)||'';return ra.localeCompare(rb)||String(a.base).localeCompare(String(b.base));});
  else entries.sort((a,b)=>{const da=dateOrder.indexOf(a._exportDate),db=dateOrder.indexOf(b._exportDate);if(da!==db)return da-db;const ta=a._exportTurno==='Manhã'?0:1,tb=b._exportTurno==='Manhã'?0:1;if(order==='TARDE_MANHA'&&ta!==tb)return tb-ta;if(order==='MANHA_TARDE'&&ta!==tb)return ta-tb;return Number(b.valor||0)-Number(a.valor||0);});
  const mainSelect=document.getElementById('exportMainAge'); const mainKey=mainSelect.value; const mainSpec=document.getElementById('exportMainAgeDays')?.value||''; const mainRanges=mainKey==='CUSTOM'?parseManualAgeSpec(mainSpec):null;
  if(mainKey==='CUSTOM'&&!mainRanges){alert('Informe dias válidos, por exemplo: 3, 5, 7-9.');return;}
  const ageGroups=[{key:mainKey,label:mainKey==='CUSTOM'?mainSpec:mainSelect.selectedOptions[0].textContent,ranges:mainRanges}];
  let invalidExtra=false;
  document.querySelectorAll('.export-extra-age-row').forEach(row=>{const sel=row.querySelector('.export-extra-age');const key=sel.value;const spec=row.querySelector('.export-age-days')?.value||'';const ranges=key==='CUSTOM'?parseManualAgeSpec(spec):null;if(key==='CUSTOM'&&!ranges){invalidExtra=true;return;}if(!ageGroups.some(g=>g.key===key&&JSON.stringify(g.ranges||[])===JSON.stringify(ranges||[])))ageGroups.push({key,label:key==='CUSTOM'?spec:sel.selectedOptions[0].textContent,ranges});});
  if(invalidExtra){alert('Informe uma faixa válida para cada aba regional adicional.');return;}
  if(exportLostOnlyMode){
    entries=entries.filter(entry=>ageGroups.some(group=>ageGroupMatches(entry,group)));
    if(!entries.length){alert('Nenhum pacote em rota atende aos dias parados selecionados.');return;}
  }
  const includeLost=exportLostOnlyMode||Boolean(document.getElementById('exportIncludeLostRoutes')?.checked);
  closeExportConfig();baixarRetornoFormatado(entries,{dateOrder,orderMode:order,chunkSize:chunk,selectedDays:selected,ageGroups,includeLostRoutes:includeLost,onlyLostRoutes:exportLostOnlyMode,lostRows:exportLostOnlyMode?entries:undefined}); exportLostOnlyMode=false;
});

/* Filtros rápidos da aba Regionais, no mesmo padrão da faixa operacional. */
const REGIONAL_SHORT_LABELS={'ESPÍRITO SANTO':'ES','MINAS GERAIS':'MG','BAHIA':'BA','SÃO PAULO':'SP','RIO DE JANEIRO':'RJ'};
function regionalAgeMatches(entry, filter){
  if(!filter||filter==='TODOS') return true;
  const [regional,range]=String(filter).split('|');
  if(regional && regionalFromBasePrefix(entry.base)!==regional) return false;
  const days=diasParado(entry);
  return range==='3_7' ? days>=3&&days<=7 : range==='1_2' ? days>=1&&days<=2 : true;
}
function renderRegionalAgeTabs(){
  const buttons=[{value:'TODOS',label:'TODOS OS DIAS',cls:'all'}];
  REGIONAL_ORDER.forEach(r=>{buttons.push({value:r+'|3_7',label:(REGIONAL_SHORT_LABELS[r]||r)+' 3-7 DIAS',cls:'late'});});
  REGIONAL_ORDER.forEach(r=>{buttons.push({value:r+'|1_2',label:(REGIONAL_SHORT_LABELS[r]||r)+' 1-2 DIAS',cls:'early'});});
  return '<div class="regional-age-tabs" aria-label="Filtrar regionais por dias em atraso">'+buttons.map(b=>'<button type="button" class="regional-age-tab '+b.cls+(regionalAgeFilter===b.value?' active':'')+'" data-regional-age="'+escHtml(b.value)+'">'+escHtml(b.label)+'</button>').join('')+'</div>';
}
let LOST_RISK_MAP=null, LOST_RISK_SIG='';
/* Base de cada pacote na planilha LOST (Risco). O mais recente vence. */
function lostRiskMap(){
  const sig=IMPORTS.length+':'+IMPORTS.reduce((a,i)=>a+(i.entries||[]).length,0);
  if(LOST_RISK_MAP&&LOST_RISK_SIG===sig) return LOST_RISK_MAP;
  const m=new Map();
  IMPORTS.slice().sort((a,b)=>((a.importDate||'')+(a.turno||'')).localeCompare((b.importDate||'')+(b.turno||''))).forEach(i=>(i.entries||[]).forEach(r=>{const k=normalizePackageKey(r.pacote); if(k&&r.base) m.set(k,r.base);}));
  LOST_RISK_MAP=m; LOST_RISK_SIG=sig; return m;
}
/* Base principal: se o pacote já está numa base na planilha LOST (ex.: EMG25, destino da origem SMG13), ele fica nela. */
function lostPrimaryBase(e){
  /* Pacote que já foi distribuído para uma base de destino fica nela; só o que não tem destino fica na base de origem. */
  const dest=normalizeBaseCode(e.destino||''); if(dest) return dest;
  const risk=normalizeBaseCode(lostRiskMap().get(normalizePackageKey(e.pacote))||e.riskBase||'');
  return risk||normalizeBaseCode(e.base)||normalizeBaseCode(e.origem)||normalizeBaseCode(e.destino)||'';
}
function lostAllBases(e){
  const out=[]; [lostPrimaryBase(e),e.base,e.origem,e.destino,e.riskBase].forEach(b=>{const c=normalizeBaseCode(b); if(c&&!out.includes(c)) out.push(c);}); return out;
}
function lostComplementBases(e){ const p=lostPrimaryBase(e); return lostAllBases(e).filter(b=>b!==p); }
function lostRouteRegion(e){ return regionalFromBasePrefix(lostPrimaryBase(e))||lostAllBases(e).map(regionalFromBasePrefix).find(Boolean)||'OUTROS'; }
function lostRouteEntriesForRegion(region){ return LOST_ROUTES.filter(e=>region==='TODOS'||lostRouteRegion(e)===region); }
function restoreSearchFocus(id,position){ const input=document.getElementById(id); if(!input)return; input.focus(); try{input.setSelectionRange(position,position);}catch(e){} }
function renderLostRoutesPage(){
  const content=document.getElementById('lostRoutesContent'); if(!content)return;
  const query=lostRouteSearch.trim().toUpperCase();
  const matchesSearch=e=>!query||[e.pacote,e.driverId,getDriverName(e.driverId),e.rota,e.base,lostPrimaryBase(e),e.origem,e.destino,e.produto,e.motivo].some(value=>String(value||'').toUpperCase().includes(query));
  const rows=LOST_ROUTES.filter(matchesSearch);
  const crumb=document.getElementById('lostRoutesBreadcrumb');
  const searchBox='<label class="regional-search-box lost-search-box"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="lostRouteSearch" type="search" value="'+escHtml(lostRouteSearch)+'" placeholder="Buscar pacote, motorista, rota ou base..." autocomplete="off"></label>';
  if(!rows.length){ crumb.innerHTML='<strong>Perdidos em rota</strong>'+searchBox; content.innerHTML='<div class="history-empty" style="padding:40px 0;">'+(LOST_ROUTES.length?'Nenhum pacote encontrado para esta busca.':'Anexe a planilha de Perdidos em rota em Importados para visualizar os pacotes.')+'</div>'; const input=document.getElementById('lostRouteSearch'); input?.addEventListener('input',()=>{lostRouteSearch=input.value;const pos=lostRouteSearch.length;renderLostRoutesPage();restoreSearchFocus('lostRouteSearch',pos);}); return; }
  const byRegion={}; rows.forEach(e=>{const r=lostRouteRegion(e);(byRegion[r]=byRegion[r]||[]).push(e);});
  if(lostRouteNav.level==='list'){
    crumb.innerHTML='<strong>Todas as regionais</strong>'+searchBox+'<span class="lost-count">'+fmtInt(rows.length)+' pacote(s)</span><button type="button" class="dl-btn lost-download-btn" id="btnDownloadLostRoutes" title="Baixar pacotes em rota"><svg class="ico" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg></button><button type="button" class="mini-camera" id="btnCapturaLostRoutes" title="Capturar regionais de perdidos em rota"><svg class="ico" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5l1-2h6l1 2"/></svg></button>';
    let html='<div class="regional-grid lost-summary"><div class="regional-card" data-lost-region="TODAS"><div class="rname">Todas as regionais</div><div class="rsub">'+fmtInt(rows.length)+' pacote(s) em rota</div><div class="rval">'+fmtBRL(rows.reduce((a,e)=>a+Number(e.valor||0),0))+'</div></div>';
    REGIONAL_ORDER.forEach(r=>{const list=byRegion[r];if(!list)return;html+=`<div class="regional-card" data-lost-region="${escHtml(r)}"><div class="rname">${escHtml(REGIONAL_LABELS[r]||r)}</div><div class="rsub">${fmtInt(list.length)} pacote(s) em rota</div><div class="rval">${fmtBRL(list.reduce((a,e)=>a+Number(e.valor||0),0))}</div></div>`;});
    if(byRegion.OUTROS) html+=`<div class="regional-card" data-lost-region="OUTROS"><div class="rname">Outras bases</div><div class="rsub">${fmtInt(byRegion.OUTROS.length)} pacote(s) em rota</div><div class="rval">${fmtBRL(byRegion.OUTROS.reduce((a,e)=>a+Number(e.valor||0),0))}</div></div>`;
    content.innerHTML='<div class="aging-strip lost-routes-aging" id="lostRoutesAging"></div>'+html+'</div>';
    renderAgingStrip('lostRoutesAging',rows,()=>{});
    document.getElementById('btnDownloadLostRoutes')?.addEventListener('click',()=>abrirModalOcultarDias(rows,'Pacotes em rota',true));
    document.getElementById('lostRouteSearch')?.addEventListener('input',e=>{lostRouteSearch=e.target.value;const pos=lostRouteSearch.length;renderLostRoutesPage();restoreSearchFocus('lostRouteSearch',pos);});
    document.getElementById('btnCapturaLostRoutes')?.addEventListener('click',()=>captureDashboardElement('#lostRoutesPage','perdidos-em-rota-regionais'));
    content.querySelectorAll('[data-lost-region]').forEach(card=>card.addEventListener('click',()=>{lostRouteNav={level:'bases',regional:card.dataset.lostRegion};renderLostRoutesPage();}));
    return;
  }
  const r=lostRouteNav.regional; const entries=rows.filter(e=>r==='TODAS'||lostRouteRegion(e)===r); const byBase={}; entries.forEach(e=>{const b=lostPrimaryBase(e)||'SEM BASE';(byBase[b]=byBase[b]||[]).push(e);});
  /* Bases que só aparecem como complemento (ex.: SMG13 ligada a EMG25) também ganham card, para nenhuma base ficar de fora. */
  /* Quantidade REAL de cada base: só conta o pacote na base onde ele está de fato (base principal). Pacote que já está em outra base não é somado na base complementar. */
  const ownByBase={}; rows.forEach(e=>{ const b=lostPrimaryBase(e)||'SEM BASE';(ownByBase[b]=ownByBase[b]||[]).push(e);});
  crumb.innerHTML=`<a data-lost-back="list">Todas as regionais</a> <svg class="ico" viewBox="0 0 24 24" style="width:9px;height:9px;"><path d="m9 5 7 7-7 7"/></svg> <strong>${escHtml(r==='TODAS'?'Todas as bases':(REGIONAL_LABELS[r]||'Outras bases'))}</strong>${searchBox}<span class="lost-count">${fmtInt(entries.length)} pacote(s)</span><button type="button" class="dl-btn lost-download-btn" id="btnDownloadLostBases" title="Baixar pacotes em rota desta regional"><svg class="ico" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg></button><button type="button" class="mini-camera" id="btnCapturaLostBases" title="Capturar bases de perdidos em rota"><svg class="ico" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5l1-2h6l1 2"/></svg></button>`;
  const cardList=Object.keys(byBase).map(b=>({base:b,list:byBase[b],comp:false})).sort((a,b)=>a.base.localeCompare(b.base));
  let html='<div class="base-grid lost-base-grid">';
  cardList.forEach(({base,list,comp})=>{
    const cc={}; if(!comp) list.forEach(e=>lostComplementBases(e).forEach(b=>{cc[b]=(cc[b]||0)+1;}));
    const chips=Object.keys(cc).map(b=>({b,own:(ownByBase[b]||[]).length})).sort((x,y)=>y.own-x.own||x.b.localeCompare(y.b)).map(({b,own})=>`<button type="button" class="lost-comp-chip${own?'':' empty'}" data-lost-comp="${escHtml(b)}" data-lost-parent="${escHtml(base)}"${own?'':' disabled'} title="${own?'Ver os '+own+' pacote(s) que estão em '+escHtml(b):escHtml(b)+' não tem pacotes próprios (já estão em outras bases)'}">${escHtml(b)}<span>${fmtInt(own)}</span></button>`).join('');
    const sub=comp?'Complementar · clique para ver os pacotes':'Clique para ver os pacotes';
    html+=`<div class="base-card lost-base-card${comp?' comp-only':''}" data-lost-base="${escHtml(base)}"${comp?' data-lost-comp-only="1"':''}><div class="base-card-head"><div><div class="bname">${baseInfoLabel(base)}</div><div class="breg">${escHtml(REGIONAL_LABELS[regionalFromBasePrefix(base)]||regionalFromBasePrefix(base)||'Base informada')}</div></div><div><div class="bpac">${fmtInt(list.length)} pacote(s)</div></div></div><div class="base-justified lost-arrow-summary">${sub}</div>${chips?'<div class="lost-comp-row"><span>Complementar:</span>'+chips+'</div>':''}</div>`;
  });
  content.innerHTML=html+'</div>';
  document.getElementById('btnDownloadLostBases')?.addEventListener('click',()=>abrirModalOcultarDias(entries,'Pacotes em rota',true));
  document.getElementById('lostRouteSearch')?.addEventListener('input',e=>{lostRouteSearch=e.target.value;const pos=lostRouteSearch.length;renderLostRoutesPage();restoreSearchFocus('lostRouteSearch',pos);});
  document.getElementById('btnCapturaLostBases')?.addEventListener('click',()=>captureDashboardElement('#lostRoutesPage','perdidos-em-rota-bases'));
  content.querySelectorAll('[data-lost-base]').forEach(card=>card.addEventListener('click',()=>{const b=card.dataset.lostBase; openLostRoutesOverlay(b,byBase[b]||[],'');}));
  content.querySelectorAll('[data-lost-comp]').forEach(chip=>chip.addEventListener('click',ev=>{ev.stopPropagation();const c=chip.dataset.lostComp,p=chip.dataset.lostParent; openLostRoutesOverlay(c,ownByBase[c]||[],'');}));
  crumb.querySelector('[data-lost-back="list"]').addEventListener('click',()=>{lostRouteNav={level:'list',regional:null};renderLostRoutesPage();});
}
function openLostRoutesOverlay(base,rows,parent){
  const mapped=rows.map(e=>{const p=lostPrimaryBase(e)||e.base||e.origem||base; return {...e,base:p,tipo:classifyBaseCode(p,regionalFromBasePrefix(p))||'SVC',motivo:motivoExibicaoLost(e),valor:Number(e.valor||0),driverId:e.driverId||lostRouteMatchesRisk(e)?.driverId||''};});
  mapped.forEach(e=>{e.isLost=true;}); openOverlayEntries('Perdidos em rota · '+baseInfoText(base)+(parent&&parent!==base?' · complementar de '+parent:''),'',mapped,'TODOS');
}

/* ===== REGIONAL E BASE ===== */
function regionalSearchFold(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();}
function regionalHistoricalMatches(query,activeEntries){
  const q=regionalSearchFold(query).trim(); if(!q)return [];
  const activeKeys=new Set((activeEntries||[]).map(e=>normalizePackageKey(e.pacote)).filter(Boolean)), found=new Map();
  IMPORTS.forEach(imp=>{
    const date=String(imp.importDate||'').slice(0,10), turno=imp.turno==='Tarde'?'Tarde':'Manhã';
    const order=date+'|'+(turno==='Tarde'?'1':'0')+'|'+String(imp.savedAt||'');
    (imp.entries||[]).forEach(e=>{
      const key=normalizePackageKey(e.pacote); if(!key||activeKeys.has(key))return;
      const driver=getDriverName(e.driverId);
      const haystack=[e.pacote,e.driverId,driver,e.rota,e.base,e.produto,e.motivo].map(regionalSearchFold).join(' ');
      if(!haystack.includes(q))return;
      const previous=found.get(key); if(!previous||order>=previous._historyOrder)found.set(key,{...e,_historyDate:date,_historyTurno:turno,_historyOrder:order});
    });
  });
  return Array.from(found.values()).sort((a,b)=>b._historyOrder.localeCompare(a._historyOrder)||String(a.pacote).localeCompare(String(b.pacote)));
}
function renderRegionalHistoricalMatches(query,activeEntries){
  if(!String(query||'').trim())return '';
  const matches=regionalHistoricalMatches(query,activeEntries), limit=100, shown=matches.slice(0,limit);
  const rows=shown.map(e=>{
    const detail=[e.produto,e.motivo].filter(Boolean).map(v=>String(v).trim()).filter(Boolean).join(' · ')||'—';
    const date=e._historyDate?fmtDateFullBR(new Date(e._historyDate+'T00:00:00')):'—';
    return '<tr class="regional-history-completed" data-history-pacote="'+escHtml(e.pacote||'')+'" data-history-base="'+escHtml(e.base||'')+'" data-history-date="'+escHtml(e._historyDate||'')+'" title="Clique para abrir os detalhes deste pacote histórico"><td><strong>'+escHtml(e.pacote||'—')+'</strong></td><td>'+escHtml(getDriverName(e.driverId))+'</td><td>'+escHtml(e.rota||'—')+'</td><td>'+escHtml(e.base||'—')+'</td><td class="ellipsis" title="'+escHtml(detail)+'">'+escHtml(resumo(detail,72))+'</td><td>'+date+' · '+escHtml(e._historyTurno||'')+'</td><td><span class="regional-history-status">JÁ FINALIZADO</span></td></tr>';
  }).join('');
  return '<section class="regional-history-panel"><div class="regional-history-head"><div><h3>Histórico · fora da planilha ativa</h3><p>Resultados antigos da busca, separados dos totais atuais. A opacidade indica que o pacote não está na planilha selecionada.</p></div><span class="regional-history-count">'+fmtInt(matches.length)+' registro(s)'+(matches.length>limit?' · mostrando '+limit:'')+'</span></div>'+(rows?'<div class="regional-history-scroll"><table class="regional-history-table"><thead><tr><th>ID do pacote</th><th>Motorista</th><th>Rota</th><th>Base</th><th>Produto / motivo</th><th>Encontrado em</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="regional-history-empty">Nenhum registro anterior correspondente a “'+escHtml(query)+'”.</div>')+'</section>';
}
function renderRegionalPage(){
  const crumb=document.getElementById('regionalBreadcrumb'); const content=document.getElementById('regionalContent');
  const activeImp=getSelectedImport();
  const activeEntries=getActiveEntries();
  if(!activeEntries.length){ crumb.innerHTML=''; content.innerHTML='<div class="history-empty" style="padding:40px 0;">Importe uma planilha para ver as regionais.</div>'; return; }
  const query=regionalSearch.trim().toUpperCase(),foldedQuery=regionalSearchFold(query);
  const visibleEntries=query?activeEntries.filter(e=>[e.pacote,e.driverId,e.rota,getDriverName(e.driverId)].some(value=>regionalSearchFold(value).includes(foldedQuery))):activeEntries;
  const regionalEntries=visibleEntries.filter(e=>regionalAgeMatches(e,regionalAgeFilter));
  const activeData={};
  regionalEntries.forEach(e=>{const regional=regionalFromBasePrefix(e.base)||'OUTROS';if(!activeData[regional])activeData[regional]={entries:[]};activeData[regional].entries.push(e);});
  if(regionalNav.level==='list'){
    const turnosDoDia=activeImp?labelTurnosDoDia(activeImp.importDate):'';
    crumb.innerHTML='<strong>Todas as regionais</strong><label class="regional-search-box"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input id="regionalSearch" type="search" value="'+escHtml(regionalSearch)+'" placeholder="Buscar ID do pacote, rota ou motorista..." autocomplete="off"></label>'+(activeImp?'<span class="active-planilha-badge" style="margin-left:auto;"><b>'+(turnosDoDia==='Manhã - Tarde'?'PLANILHAS':'PLANILHA')+'</b> '+activeImp.importDate.split('-').reverse().join('/')+' · '+turnosDoDia+'</span>':'');
    const totalVal=regionalEntries.reduce((a,e)=>a+Number(e.valor||0),0);
    let html='<div class="regional-grid">';
    const allJust=justifiedCount(regionalEntries); html+=`<div class="regional-card" data-r="TODAS"><div class="rname">Todas as bases</div><div class="rsub">${fmtInt(regionalEntries.length)} pacote(s)${query?' encontrados':''} · Soma somente da planilha ativa</div><div class="rval">${fmtBRL(totalVal)}</div><button type="button" class="regional-justified-btn" data-reg-just="TODAS">JUSTIFICADOS <span>${fmtInt(allJust)} / ${fmtInt(regionalEntries.length)} (${percentLabel(allJust,regionalEntries.length)})</span></button></div>`;
    REGIONAL_ORDER.forEach(r=>{ if(!activeData[r]) return; const d=activeData[r]; const val=d.entries.reduce((a,e)=>a+Number(e.valor||0),0); const justCount=justifiedCount(d.entries); html+=`<div class="regional-card" data-r="${escHtml(r)}"><div class="rname">${escHtml(REGIONAL_LABELS[r]||r)}</div><div class="rsub">${fmtInt(d.entries.length)} pacote(s) · somente esta planilha</div><div class="rval">${fmtBRL(val)}</div><button type="button" class="regional-justified-btn" data-reg-just="${escHtml(r)}">JUSTIFICADOS <span>${fmtInt(justCount)} / ${fmtInt(d.entries.length)} (${percentLabel(justCount,d.entries.length)})</span></button></div>`; });
    html+='</div>';
    content.innerHTML=html+renderRegionalHistoricalMatches(query,activeEntries);
    content.querySelectorAll('[data-regional-age]').forEach(btn=>btn.addEventListener('click',ev=>{ev.stopPropagation();regionalAgeFilter=btn.dataset.regionalAge;renderRegionalPage();}));
    const searchInput=document.getElementById('regionalSearch'); if(searchInput){searchInput.addEventListener('input',()=>{regionalSearch=searchInput.value;const pos=regionalSearch.length;renderRegionalPage();restoreSearchFocus('regionalSearch',pos);});}
    content.querySelectorAll('[data-history-pacote]').forEach(row=>row.addEventListener('click',()=>{const pacote=row.dataset.historyPacote||'',base=row.dataset.historyBase||'',day=row.dataset.historyDate||'';const found=regionalHistoricalMatches(regionalSearch,activeEntries).find(e=>String(e.pacote||'')===pacote&&String(e.base||'')===base&&String(e._historyDate||'')===day);if(found){const opened={...found};delete opened._historyDate;delete opened._historyTurno;delete opened._historyOrder;openOverlayEntries('Histórico · '+pacote,REGIONAL_LABELS[regionalFromBasePrefix(base)]||'', [opened], 'TODOS');}}));
    content.querySelectorAll('.regional-justified-btn').forEach(btn=>btn.addEventListener('click',ev=>{ev.stopPropagation();const r=btn.dataset.regJust;const entries=r==='TODAS'?visibleEntries:(activeData[r]?.entries||[]);const label=r==='TODAS'?'Todas as bases':(REGIONAL_LABELS[r]||r);openOverlayEntries('Justificados · '+label,'',entries,'TODOS');overlayCtx.period='JUSTIFICADOS';renderOverlayBody();}));
    content.querySelectorAll('.regional-card').forEach(c=>c.addEventListener('click', ()=>{ regionalNav={level:'bases',regional:c.dataset.r}; renderRegionalPage(); }));
  } else {
    const r=regionalNav.regional;
    const isAllBases=r==='TODAS';
    const entriesForRegion=isAllBases?activeEntries:(activeData[r]?.entries||[]);
    if(!entriesForRegion.length){ regionalNav={level:'list',regional:null}; renderRegionalPage(); return; }
    crumb.innerHTML=`<a data-back="list">Todas as regionais</a> <svg class="ico" viewBox="0 0 24 24" style="width:9px;height:9px;"><path d="m9 5 7 7-7 7"/></svg> <strong>${escHtml(isAllBases?'Todas as bases':(REGIONAL_LABELS[r]||r))}</strong><button type="button" class="mini-camera" id="btnCapturaBases" title="Capturar bases" aria-label="Capturar bases"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5l1-2h6l1 2"/></svg></button>`;
    const d={entries:entriesForRegion};
    const filteredEntries=bucketFilterEntries(d.entries, regionalBaseBucket);
    const baseMap={};
    filteredEntries.forEach(e=>{ if(!baseMap[e.base]) baseMap[e.base]={base:e.base,valor:0,entries:[]}; baseMap[e.base].valor+=e.valor; baseMap[e.base].entries.push(e); });
    const bases=Object.values(baseMap).sort((a,b)=>b.valor-a.valor);
    const max=bases.length?bases[0].valor:1;
    const counts=computeAgingCounts(d.entries);
    let html='<div class="aging-strip" id="regBaseAging">'
      +BUCKET_KEYS.map(b=>`<div class="aging-chip ${regionalBaseBucket===b?'active':''} ${counts[b].cnt?'':'vazio'}" data-bucket="${b}"><div class="lbl">${BUCKET_LABELS[b]}</div><div class="cnt">${fmtInt(counts[b].cnt)}</div><div class="val">${fmtBRL(counts[b].val)}</div></div>`).join('')
      +'</div><div class="base-grid">';
    if(!bases.length){
      html+=`<div class="history-empty" style="grid-column:1/-1;padding:30px 0;">Nenhum pacote com ${escHtml(BUCKET_LABELS[regionalBaseBucket].toLowerCase())} nesta regional.</div>`;
    } else {
      bases.forEach(b=>{ const baseRegional=regionalFromBasePrefix(b.base)||r; const nivel=b.valor>=20000?'red':b.valor>=10000?'orange':b.valor>=1000?'yellow':'blue'; const justBase=justifiedCount(b.entries); html+=`<div class="base-card offender-${nivel}" data-base="${escHtml(b.base)}"><div class="base-card-head"><div><div class="bname">${baseInfoLabel(b.base)}</div><div class="breg">${escHtml(REGIONAL_LABELS[baseRegional]||baseRegional||'Regional não identificada')}</div></div><div><div class="bval">${fmtBRL(b.valor)}</div><div class="bpac">${fmtInt(b.entries.length)} pacote(s)</div></div></div><div class="bbar"><div class="bbar-fill" style="width:${Math.max(4,(b.valor/max)*100)}%"></div></div><div class="base-justified">Justificados: <strong>${fmtInt(justBase)} / ${fmtInt(b.entries.length)}</strong> (${percentLabel(justBase,b.entries.length)})</div></div>`; });
    }
    html+='</div>';
    content.innerHTML=html;
    document.getElementById('btnCapturaBases').addEventListener('click',()=>captureDashboardElement('#regionalContent','regional-e-bases-'+String(r).toLowerCase().replace(/\s+/g,'-')));
    document.getElementById('regBaseAging').querySelectorAll('.aging-chip').forEach(chip=>chip.addEventListener('click', ()=>{
      const b=chip.dataset.bucket;
      regionalBaseBucket = (regionalBaseBucket===b) ? 'TODOS' : b;
      renderRegionalPage();
    }));
    content.querySelectorAll('.base-card').forEach(c=>c.addEventListener('click', ()=>{const matched=regionalSearch.trim()?entriesForRegion.filter(e=>e.base===c.dataset.base):[];if(matched.length)openOverlayEntries('Pacote(s) encontrado(s)','Busca: '+regionalSearch.trim(),matched,regionalBaseBucket);else openBaseOverlay(c.dataset.base, regionalBaseBucket);}));
    crumb.querySelector('[data-back="list"]').addEventListener('click', ()=>{ regionalNav={level:'list',regional:null}; regionalBaseBucket='TODOS'; renderRegionalPage(); });
  }
}

/* ===== VISÃO DIÁRIA ===== */
function populateDiariaDia(){
  const sel=document.getElementById('diariaDia');
  const days=Array.from(new Set(IMPORTS.map(i=>i.importDate))).sort().reverse();
  const cur=sel.value;
  if(sel.tagName==='INPUT'){
    if(cur) return;
    sel.value=days[0]||todayStr();
    return;
  }
  sel.innerHTML=days.map(d=>`<option value="${d}">${d.split('-').reverse().join('/')}</option>`).join('') || '<option value="">Sem importações</option>';
  if(days.includes(cur)) sel.value=cur;
}
function renderDiaria(){
  populateDiariaDia();
  const dia=document.getElementById('diariaDia').value;
  const regSel=document.getElementById('diariaRegional');
  if(!regSel.dataset.filled){ regSel.innerHTML='<option value="TODOS">Todos os Regionais</option>'+REGIONAL_ORDER.map(r=>`<option value="${r}">${REGIONAL_LABELS[r]}</option>`).join(''); regSel.dataset.filled='1'; }
  const regional=regSel.value; const origem=document.getElementById('diariaOrigem').value; const ordem=document.getElementById('diariaOrdem')?.value||'VALOR'; const basesOfensor=origem==='OFENSORES'?basesDosOfensoresPorValor(offendersThreshold):null; const tipo=document.querySelector('#diariaTipoToggle .toggle-btn.active').dataset.mode;
  document.getElementById('diariaTitle').textContent='Visão Diária · Lost — '+(dia?dia.split('-').reverse().join('/'):'—')+' · '+(regional==='TODOS'?'Todos os Regionais':REGIONAL_LABELS[regional])+(origem==='OFENSORES'?' · Bases de Ofensores por Regional':'');

  const dayImports=IMPORTS.filter(i=>i.importDate===dia);
  const manha=dayImports.find(i=>i.turno==='Manhã');
  const tarde=dayImports.find(i=>i.turno==='Tarde');
  const source = tarde || manha;
  let entries = source ? source.entries.slice() : [];
  if(regional!=='TODOS') entries=entries.filter(e=>regionalFromBasePrefix(e.base)===regional);
  if(basesOfensor) entries=entries.filter(e=>basesOfensor.has(e.base));
  if(tipo!=='TODOS') entries=entries.filter(e=>e.tipo===tipo);

  const manhaCount={}, tardeCount={};
  (manha?manha.entries:[]).forEach(e=>{ if(regional!=='TODOS'&&regionalFromBasePrefix(e.base)!==regional) return; if(basesOfensor&&!basesOfensor.has(e.base)) return; if(tipo!=='TODOS'&&e.tipo!==tipo) return; manhaCount[e.base]=(manhaCount[e.base]||0)+1; });
  (tarde?tarde.entries:[]).forEach(e=>{ if(regional!=='TODOS'&&regionalFromBasePrefix(e.base)!==regional) return; if(basesOfensor&&!basesOfensor.has(e.base)) return; if(tipo!=='TODOS'&&e.tipo!==tipo) return; tardeCount[e.base]=(tardeCount[e.base]||0)+1; });

  renderAgingStrip('diariaAging', entries, ()=>{});
  const baseMap={};
  entries.forEach(e=>{ if(!baseMap[e.base]) baseMap[e.base]={base:e.base, regional:regionalFromBasePrefix(e.base), valor:0}; baseMap[e.base].valor+=e.valor; });
  const bases=Object.values(baseMap).sort((a,b)=>b.valor-a.valor);
  if(ordem==='JUSTIFICADOS') bases.sort((a,b)=>{ const aj=justifiedCount(entries.filter(e=>e.base===a.base)), bj=justifiedCount(entries.filter(e=>e.base===b.base)); return (bj-aj)||(b.valor-a.valor); });

  const tbody=document.getElementById('diariaBody');
  if(!bases.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#737373;padding:24px;">Sem dados para este dia/filtro.</td></tr>'; return; }
  let totalM=0,totalT=0,totalV=0;
  tbody.innerHTML=bases.map(b=>{ const m=manhaCount[b.base]||0, t=tardeCount[b.base]||0, baseEntries=entries.filter(e=>e.base===b.base), justBase=justifiedCount(baseEntries); totalM+=m; totalT+=t; totalV+=b.valor; return `<tr><td>${escHtml(REGIONAL_LABELS[b.regional]||b.regional||'—')}</td><td><strong>${baseInfoLabel(b.base)}</strong></td><td>${fmtInt(m)}</td><td>${fmtInt(t)}</td><td><strong>${fmtBRL(b.valor)}</strong></td><td><strong>${fmtInt(justBase)} / ${fmtInt(baseEntries.length)}</strong> (${percentLabel(justBase,baseEntries.length)})</td></tr>`; }).join('')
    + `<tr class="diaria-total-row"><td colspan="2"><strong>TOTAL &middot; ${bases.length} base(s)</strong></td><td><strong>${fmtInt(totalM)}</strong></td><td><strong>${fmtInt(totalT)}</strong></td><td><strong>${fmtBRL(totalV)}</strong></td><td><strong>${fmtInt(justifiedCount(entries))} / ${fmtInt(entries.length)}</strong> (${percentLabel(justifiedCount(entries),entries.length)})</td></tr>`;
}
document.getElementById('diariaDia').addEventListener('change', renderDiaria);
document.getElementById('diariaRegional').addEventListener('change', renderDiaria);
document.getElementById('diariaOrigem').addEventListener('change', renderDiaria);
document.getElementById('diariaOrdem').addEventListener('change', renderDiaria);
document.getElementById('diariaTipoToggle').addEventListener('click', function(e){ const btn=e.target.closest('.toggle-btn'); if(!btn) return; document.querySelectorAll('#diariaTipoToggle .toggle-btn').forEach(b=>b.classList.toggle('active',b===btn)); renderDiaria(); });
[['btnCapturaGeral','#page-geral','pagina-inicial'],['btnCapturaOfensores','#page-ofensores','ofensores-por-regional'],['btnCapturaDiaria','#page-diaria','visao-diaria'],['btnCapturaAnaliseBase','#page-analisebase','analise-base'],['btnCapturaAnalise','#page-analise','analise'],['btnCapturaAnaliseTopo','#page-analise','analise'],['btnCapturaRevertido','#page-revertido','pacote-revertido']].forEach(([id,selector,name])=>document.getElementById(id)?.addEventListener('click',()=>captureDashboardElement(selector,name)));

/* ===== ANÁLISE DE PACOTE DIÁRIO ===== */
function availableImportDates(){ return Array.from(new Set(IMPORTS.map(i=>i.importDate).filter(Boolean))).sort(); }
function snapshotEntriesForDay(day){
  const imps=IMPORTS.filter(i=>i.importDate===day).slice().sort((a,b)=>String(a.savedAt||'').localeCompare(String(b.savedAt||'')));
  const map=new Map();
  imps.forEach(imp=>(imp.entries||[]).forEach(e=>{ const k=String(e.pacote||'').trim()||('__'+e.base+'|'+e.driverId+'|'+e.valor+'|'+e.date); map.set(k,e); }));
  return Array.from(map.values());
}
function selectedPeriodEntries(){
  const de=document.getElementById('analiseDe').value, ate=document.getElementById('analiseAte').value, reg=document.getElementById('analiseRegional').value;
  const tipo=document.querySelector('#analiseTipoToggle .toggle-btn.active')?.dataset.mode||'TODOS';
  return availableImportDates().filter(d=>(!de||d>=de)&&(!ate||d<=ate)).map(day=>({day,entries:snapshotEntriesForDay(day).filter(e=>(reg==='TODOS'||regionalFromBasePrefix(e.base)===reg)&&(tipo==='TODOS'||e.tipo===tipo))}));
}
function dateInputSet(id,value){ const el=document.getElementById(id); if(el) el.value=value||''; }
function enableNativeDatePickers(){
  ['diariaDia','analiseDe','analiseAte','impDia'].forEach(id=>{
    const el=document.getElementById(id); if(!el||el.dataset.pickerReady) return;
    el.dataset.pickerReady='1';
    el.addEventListener('click',()=>{ if(typeof el.showPicker==='function'){ try{el.showPicker();}catch(e){} } });
  });
}

function isoShift(iso,days){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
enableNativeDatePickers();
function analysisMetricsBetween(start,end,reg,tipo){
  if(!start||!end||start>end) return null;
  const days=availableImportDates().filter(d=>d>=start&&d<=end); if(!days.length) return null;
  const entries=days.flatMap(d=>snapshotEntriesForDay(d)).filter(e=>(reg==='TODOS'||regionalFromBasePrefix(e.base)===reg)&&(tipo==='TODOS'||e.tipo===tipo));
  return {pacotes:entries.length,valor:entries.reduce((s,e)=>s+(Number(e.valor)||0),0)};
}
function analysisDeltaHtml(current,previous,format,unit){
  if(current===null||current===undefined||!previous) return '<span class="analise-delta same">— '+unit+' indisponível</span>';
  const diff=current-previous, cls=diff<-.005?'down':diff>.005?'up':'same', sign=diff>0?'+':diff<0?'−':'';
  return '<span class="analise-delta '+cls+'">'+(sign||'')+' '+format(Math.abs(diff))+' '+unit+'</span>';
}
function renderAnalysisComparisons(de,ate,reg,tipo,current){
  if(!de||!ate) return;
  const startObj=new Date(de+'T00:00:00'), endObj=new Date(ate+'T00:00:00'), days=Math.round((endObj-startObj)/86400000)+1;
  const prevStart=isoShift(de,-7), prevEnd=isoShift(ate,-7), nextStart=isoShift(de,7), nextEnd=isoShift(ate,7);
  const previous=analysisMetricsBetween(prevStart,prevEnd,reg,tipo), next=analysisMetricsBetween(nextStart,nextEnd,reg,tipo);
  const rangeLabel=(start,end)=>fmtDateShort(new Date(start+'T00:00:00'))+' a '+fmtDateShort(new Date(end+'T00:00:00'));
  const today=todayStr(), weekday=(new Date(today+'T00:00:00').getDay()+6)%7, currentWeekStart=isoShift(today,-weekday), currentWeekEnd=isoShift(currentWeekStart,6);
  const nextWeekName=nextStart>=currentWeekStart&&nextStart<=currentWeekEnd?'semana atual':nextStart>currentWeekEnd?'semana seguinte':'semana seguinte ao período';
  const previousLabel=(days===1?'vs semana anterior (':'vs semana anterior ('+days+' dias · ')+rangeLabel(prevStart,prevEnd)+')';
  const nextLabel=(days===1?'vs '+nextWeekName+' (':'vs '+nextWeekName+' ('+days+' dias · ')+rangeLabel(nextStart,nextEnd)+')';
  const fmtN=n=>fmtInt(n), fmtV=n=>fmtBRL(n);
  document.getElementById('anPacotesDelta').innerHTML=analysisDeltaHtml(current.pacotes,previous?.pacotes,fmtN,'pacotes '+previousLabel)+'<br>'+analysisDeltaHtml(current.pacotes,next?.pacotes,fmtN,'pacotes '+nextLabel);
  document.getElementById('anValorDelta').innerHTML=analysisDeltaHtml(current.valor,previous?.valor,fmtV,'valor '+previousLabel)+'<br>'+analysisDeltaHtml(current.valor,next?.valor,fmtV,'valor '+nextLabel);
}
function renderAnalise(){
  const dates=availableImportDates();
  const deEl=document.getElementById('analiseDe'), ateEl=document.getElementById('analiseAte'), regEl=document.getElementById('analiseRegional');
  if(!regEl.dataset.filled){ regEl.innerHTML='<option value="TODOS">Todas</option>'+REGIONAL_ORDER.map(r=>'<option value="'+r+'">'+(REGIONAL_LABELS[r]||r)+'</option>').join(''); regEl.dataset.filled='1'; }
  if(!ateEl.value) dateInputSet('analiseAte',dates[dates.length-1]||todayStr());
  if(!deEl.value){const end=ateEl.value||todayStr();const weekday=new Date(end+'T00:00:00').getDay();dateInputSet('analiseDe',isoShift(end,weekday===0?-6:1-weekday));}
  if(!dates.length){ document.getElementById('analisePeriodo').textContent='Análise de Pacote Diário — sem dados importados'; return; }
  const rows=selectedPeriodEntries(), all=rows.flatMap(x=>x.entries);
  const total=all.reduce((s,e)=>s+e.valor,0), svc=all.filter(e=>e.tipo==='SVC').reduce((s,e)=>s+e.valor,0), xpt=all.filter(e=>e.tipo==='XPT').reduce((s,e)=>s+e.valor,0);
  document.getElementById('anPacotes').textContent=fmtInt(all.length); document.getElementById('anValor').textContent=fmtBRL(total); document.getElementById('anSvc').textContent=fmtBRL(svc); document.getElementById('anXpt').textContent=fmtBRL(xpt);
  const de=deEl.value, ate=ateEl.value; document.getElementById('analisePeriodo').textContent='Análise de Pacote Diário · '+(de?fmtDateFullBR(new Date(de+'T00:00:00')):'—')+' a '+(ate?fmtDateFullBR(new Date(ate+'T00:00:00')):'—')+' ('+fmtInt(rows.length)+' dias com planilha)';
  renderAnalysisComparisons(de,ate,regEl.value,document.querySelector('#analiseTipoToggle .toggle-btn.active')?.dataset.mode||'TODOS',{pacotes:all.length,valor:total});
  const byReg={}; const byBase={}; rows.forEach(r=>r.entries.forEach(e=>{ const reg=regionalFromBasePrefix(e.base)||'OUTROS'; byReg[reg]=(byReg[reg]||0)+e.valor; byBase[e.base]=(byBase[e.base]||0)+e.valor; }));
  function analysisEntriesForImport(imp){
    const reg=document.getElementById('analiseRegional').value;
    const tipo=document.querySelector('#analiseTipoToggle .toggle-btn.active')?.dataset.mode||'TODOS';
    return (imp?.entries||[]).filter(e=>(reg==='TODOS'||regionalFromBasePrefix(e.base)===reg)&&(tipo==='TODOS'||e.tipo===tipo));
  }
  const dailyTurnos=rows.map(r=>{
    const manha=sumMetrics(analysisEntriesForImport(findTurnoImport(r.day,'Manhã'))).total;
    const tarde=sumMetrics(analysisEntriesForImport(findTurnoImport(r.day,'Tarde'))).total;
    return {manha,tarde,soma:manha+tarde};
  });
  if(chartAnaliseDia){chartAnaliseDia.destroy();chartAnaliseDia=null;}
  chartAnaliseDia=new Chart(document.getElementById('chartAnaliseDia'),{type:'bar',data:{labels:rows.map(r=>{const d=new Date(r.day+'T00:00:00');return [r.day.split('-').reverse().slice(0,2).join('/'),WEEKDAY_ABBR[d.getDay()]];}),datasets:[{data:rows.map(r=>r.entries.reduce((s,e)=>s+e.valor,0)),backgroundColor:'#00c853',borderRadius:4,maxBarThickness:22,barPercentage:.9,categoryPercentage:.95}]},plugins:[chartValueLabels],options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:24}},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items.length?'Dia '+items[0].label:'',label:c=>{const t=dailyTurnos[c.dataIndex]||{manha:0,tarde:0};return ['Manhã: '+fmtBRL(t.manha),'Tarde: '+fmtBRL(t.tarde)];}}}},scales:{x:{ticks:{color:cssColor('--text-secondary','#a3a3a3'),font:{size:10}},grid:{display:false}},y:{ticks:{color:cssColor('--text-secondary','#a3a3a3'),callback:v=>fmtBRL(v)},grid:{display:false}}}}});
  const regs=Object.entries(byReg).sort((a,b)=>b[1]-a[1]); if(chartAnaliseRegional){chartAnaliseRegional.destroy();chartAnaliseRegional=null;} chartAnaliseRegional=new Chart(document.getElementById('chartAnaliseRegional'),{type:'bar',data:{labels:regs.map(x=>REGIONAL_LABELS[x[0]]||x[0]),datasets:[{data:regs.map(x=>x[1]),backgroundColor:'#00c853',borderRadius:6,maxBarThickness:28}]},plugins:[chartValueLabels],options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtBRL(c.raw)}}},scales:{x:{ticks:{display:false},grid:{display:false}},y:{ticks:{color:cssColor('--text-primary','#fff')},grid:{display:false}}}}});
  const bases=Object.entries(byBase).sort((a,b)=>b[1]-a[1]).slice(0,8); if(chartAnaliseOfensoras){chartAnaliseOfensoras.destroy();chartAnaliseOfensoras=null;} chartAnaliseOfensoras=new Chart(document.getElementById('chartAnaliseOfensoras'),{type:'bar',data:{labels:bases.map(x=>x[0]),datasets:[{data:bases.map(x=>x[1]),backgroundColor:'#008a3c',borderRadius:6,maxBarThickness:24}]},plugins:[chartValueLabels],options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtBRL(c.raw)}}},scales:{x:{ticks:{display:false},grid:{display:false}},y:{ticks:{color:cssColor('--text-primary','#fff')},grid:{display:false}}}}});
}
['analiseDe','analiseAte','analiseRegional'].forEach(id=>document.getElementById(id).addEventListener('change',renderAnalise));
document.getElementById('analisePeriodos').addEventListener('click',e=>{const b=e.target.closest('[data-days]');if(!b)return;const ds=availableImportDates(),end=ds[ds.length-1];if(!end)return;const n=Number(b.dataset.days);dateInputSet('analiseAte',end);if(n===7){const weekday=new Date(end+'T00:00:00').getDay();dateInputSet('analiseDe',isoShift(end,weekday===0?-6:1-weekday));}else dateInputSet('analiseDe',n?ds[Math.max(0,ds.length-n)]:ds[0]);renderAnalise();});
document.getElementById('analiseTipoToggle').addEventListener('click',e=>{const b=e.target.closest('.toggle-btn');if(!b)return;document.querySelectorAll('#analiseTipoToggle .toggle-btn').forEach(x=>x.classList.toggle('active',x===b));renderAnalise();});

/* ===== ANÁLISE POR BASE ===== */
function monthKeyFromDate(day){ return String(day||'').slice(0,7); }
function shiftMonthKey(key,delta){ const [y,m]=String(key).split('-').map(Number); const d=new Date(y,(m||1)-1+delta,1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function monthLabelBR(key){ const [y,m]=String(key).split('-').map(Number); return new Date(y,(m||1)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase()); }
function baseAnalysisFilteredEntries(day){
  const reg=document.getElementById('analiseBaseRegional')?.value||'TODOS';
  const base=document.getElementById('analiseBaseBase')?.value||'TODAS';
  return snapshotEntriesForDay(day).filter(e=>(reg==='TODOS'||regionalFromBasePrefix(e.base)===reg)&&(base==='TODAS'||e.base===base));
}
function baseAnalysisDateRows(){
  const de=document.getElementById('analiseBaseDe')?.value||'', ate=document.getElementById('analiseBaseAte')?.value||'';
  return availableImportDates().filter(d=>(!de||d>=de)&&(!ate||d<=ate)).map(day=>{ const entries=baseAnalysisFilteredEntries(day); const svc=entries.filter(e=>e.tipo==='SVC').reduce((sum,e)=>sum+(Number(e.valor)||0),0); const xpt=entries.filter(e=>e.tipo==='XPT').reduce((sum,e)=>sum+(Number(e.valor)||0),0); return {day,entries,valor:entries.reduce((sum,e)=>sum+(Number(e.valor)||0),0),svc,xpt}; }).filter(row=>row.entries.length);
}
function populateAnaliseBaseFilters(){
  const reg=document.getElementById('analiseBaseRegional'), base=document.getElementById('analiseBaseBase');
  const regCur=reg.value||'TODOS', baseCur=base.value||'TODAS';
  if(!reg.dataset.filled){ reg.innerHTML='<option value="TODOS">Todas as regionais</option>'+REGIONAL_ORDER.map(r=>'<option value="'+escHtml(r)+'">'+escHtml(REGIONAL_LABELS[r]||r)+'</option>').join(''); reg.dataset.filled='1'; }
  reg.value=REGIONAL_ORDER.includes(regCur)?regCur:'TODOS';
  const bases=Array.from(new Set(IMPORTS.flatMap(i=>(i.entries||[])).map(e=>e.base).filter(Boolean).filter(b=>reg.value==='TODOS'||regionalFromBasePrefix(b)===reg.value))).sort();
  base.innerHTML='<option value="TODAS">Todas as bases</option>'+bases.map(b=>'<option value="'+escHtml(b)+'">'+escHtml(b)+'</option>').join('');
  base.value=bases.includes(baseCur)?baseCur:'TODAS';
}
function renderAnaliseBaseDetalhe(month){
  const card=document.getElementById('anBaseDetalheCard'), body=document.getElementById('anBaseDiaBody'); if(!card||!body)return;
  const rows=analiseBaseRows.filter(row=>monthKeyFromDate(row.day)===month); card.hidden=false;
  const reg=document.getElementById('analiseBaseRegional').value, base=document.getElementById('analiseBaseBase').value;
  const selection=base==='TODAS'?(reg==='TODOS'?'Todas as bases':REGIONAL_LABELS[reg]||reg):base;
  document.getElementById('anBaseDetalheTitulo').textContent='Detalhe diário · '+monthLabelBR(month)+' · '+selection;
  body.innerHTML=rows.length?rows.map(row=>{ const d=new Date(row.day+'T00:00:00'); return '<tr><td><strong>'+escHtml(row.day.split('-').reverse().join('/'))+'</strong></td><td>'+WEEKDAY_ABBR[d.getDay()]+'</td><td><strong>'+fmtBRL(row.valor)+'</strong></td><td>'+fmtInt(row.entries.length)+'</td><td>'+fmtBRL(row.svc)+'</td><td>'+fmtBRL(row.xpt)+'</td></tr>'; }).join(''):'<tr><td colspan="6" class="base-analysis-empty">Nenhum dado neste mês para o filtro atual.</td></tr>';
  card.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderAnaliseBase(){
  const dates=availableImportDates(), de=document.getElementById('analiseBaseDe'), ate=document.getElementById('analiseBaseAte');
  populateAnaliseBaseFilters();
  if(!dates.length){ document.getElementById('anBaseMesBody').innerHTML='<tr><td colspan="6" class="base-analysis-empty">Importe planilhas para visualizar o histórico por base.</td></tr>'; return; }
  if(!ate.value) dateInputSet('analiseBaseAte',dates[dates.length-1]);
  if(!de.value) dateInputSet('analiseBaseDe',shiftMonthKey(monthKeyFromDate(ate.value||dates[dates.length-1]),-5)+'-01');
  if(de.value>ate.value) dateInputSet('analiseBaseDe',ate.value);
  analiseBaseRows=baseAnalysisDateRows();
  const months={}; analiseBaseRows.forEach(row=>{ const key=monthKeyFromDate(row.day); if(!months[key])months[key]={month:key,valor:0,pacotes:0,dias:0}; months[key].valor+=row.valor; months[key].pacotes+=row.entries.length; months[key].dias++; });
  const list=Object.values(months).sort((a,b)=>b.month.localeCompare(a.month));
  const total=analiseBaseRows.reduce((sum,r)=>sum+r.valor,0); document.getElementById('anBaseValor').textContent=fmtBRL(total); document.getElementById('anBasePacotes').textContent=fmtInt(analiseBaseRows.reduce((sum,r)=>sum+r.entries.length,0)); document.getElementById('anBaseMeses').textContent=fmtInt(list.length); document.getElementById('anBaseDias').textContent=fmtInt(analiseBaseRows.length);
  const reg=document.getElementById('analiseBaseRegional').value, base=document.getElementById('analiseBaseBase').value; const selection=base==='TODAS'?(reg==='TODOS'?'Todas as bases':REGIONAL_LABELS[reg]||reg):base; document.getElementById('anBaseTitulo').textContent=selection;
  const body=document.getElementById('anBaseMesBody'); body.innerHTML=list.length?list.map(row=>'<tr data-analysis-month="'+row.month+'"><td class="month-link">'+escHtml(monthLabelBR(row.month))+'</td><td><strong>'+fmtBRL(row.valor)+'</strong></td><td>'+fmtInt(row.pacotes)+'</td><td>'+fmtInt(row.dias)+'</td><td>'+fmtBRL(row.dias?row.valor/row.dias:0)+'</td><td class="month-link">Ver dias →</td></tr>').join(''):'<tr><td colspan="6" class="base-analysis-empty">Nenhum dado encontrado para o período, regional ou base selecionada.</td></tr>';
  document.getElementById('anBaseDetalheCard').hidden=true;
}
document.getElementById('analiseBaseRegional').addEventListener('change',()=>{ document.getElementById('analiseBaseBase').value='TODAS'; renderAnaliseBase(); });
document.getElementById('analiseBaseBase').addEventListener('change',renderAnaliseBase);
['analiseBaseDe','analiseBaseAte'].forEach(id=>document.getElementById(id).addEventListener('change',renderAnaliseBase));
document.getElementById('analiseBasePeriodos').addEventListener('click',e=>{ const btn=e.target.closest('[data-months]'); if(!btn)return; const dates=availableImportDates(), end=dates[dates.length-1]; if(!end)return; const months=Number(btn.dataset.months)||6; dateInputSet('analiseBaseAte',end); dateInputSet('analiseBaseDe',shiftMonthKey(monthKeyFromDate(end),-(months-1))+'-01'); document.querySelectorAll('#analiseBasePeriodos .preset-btn').forEach(x=>x.classList.toggle('active',x===btn)); renderAnaliseBase(); });
document.getElementById('anBaseMesBody').addEventListener('click',e=>{ const row=e.target.closest('[data-analysis-month]'); if(row)renderAnaliseBaseDetalhe(row.dataset.analysisMonth); });
document.getElementById('anBaseFecharDetalhe').addEventListener('click',()=>{document.getElementById('anBaseDetalheCard').hidden=true;});
/* ===== PACOTE REVERTIDO ===== */
function basesDosOfensoresPorValor(minimo){
  const map={};
  getActiveEntries().forEach(e=>{map[e.base]=(map[e.base]||0)+(Number(e.valor)||0);});
  return new Set(Object.keys(map).filter(base=>map[base]>=Math.max(0,Number(minimo)||0)));
}
/* Prazo de tratamento: pacote que entrou no dia D tem até D+1 às 10h para ser tratado. */
const REV_PRAZO_HORA=10;
function revHoraSnapshot(day){
  const imps=IMPORTS.filter(i=>i.importDate===day);
  let max=-1;
  imps.forEach(imp=>{
    let mins=null;
    const t=extractFileTime(imp.fileName);
    if(t){mins=Number(t.slice(0,2))*60+Number(t.slice(3,5));}
    else if(imp.savedAt){const d=new Date(imp.savedAt);if(!isNaN(d))mins=d.getHours()*60+d.getMinutes();}
    if(mins!==null&&mins>max)max=mins;
  });
  return max<0?24*60:max; /* sem horário conhecido: considera fim do dia */
}
function revPacoteVencido(entry,atualDay,horaMin){
  const dias=diasParado(entry,new Date(atualDay+'T00:00:00'));
  if(dias>=2)return true;                 /* entrou antes de ontem: prazo já passou */
  if(dias===1)return horaMin>=REV_PRAZO_HORA*60; /* entrou ontem: só vence depois das 10h */
  return false;                           /* entrou hoje: ainda no prazo */
}
function renderRevertido(){
  const dates=availableImportDates(), atual=document.getElementById('revAtual'), comp=document.getElementById('revComparar'), regSel=document.getElementById('revRegional'), baseSel=document.getElementById('revBase'), origemSel=document.getElementById('revOrigem');
  if(!regSel.dataset.filled){regSel.innerHTML='<option value="TODOS">Todas</option>'+REGIONAL_ORDER.map(r=>'<option value="'+r+'">'+(REGIONAL_LABELS[r]||r)+'</option>').join('');regSel.dataset.filled='1';}
  if(!atual.value)atual.value=dates[dates.length-1]||todayStr(); if(!comp.value)comp.value=dates[Math.max(0,dates.length-2)]||isoShift(atual.value,-1);
  if(!dates.length){document.getElementById('revPeriodo').textContent='Pacote Revertido — sem dados importados';document.getElementById('revBody').innerHTML='<tr><td colspan="11" class="history-empty">Escolha datas no calendário; importe planilhas para comparar os pacotes.</td></tr>';return;}
  if(atual.value<comp.value){const temp=atual.value;atual.value=comp.value;comp.value=temp;}
  const reg=regSel.value;
  const origem=origemSel.value;
  const basesOfensor=origem==='OFENSORES'?basesDosOfensoresPorValor(offendersThreshold):null;
  const currentBase=baseSel.value;
  const baseOptions=Array.from(new Set(IMPORTS.flatMap(i=>(i.entries||[])).filter(e=>(reg==='TODOS'||regionalFromBasePrefix(e.base)===reg)&&(!basesOfensor||basesOfensor.has(e.base))).map(e=>e.base))).sort();
  baseSel.innerHTML='<option value="TODAS">Todas as bases</option>'+baseOptions.map(b=>'<option value="'+escHtml(b)+'">'+escHtml(b)+'</option>').join('');
  baseSel.value=baseOptions.includes(currentBase)?currentBase:'TODAS';
  const old=snapshotEntriesForDay(comp.value), cur=snapshotEntriesForDay(atual.value), oldMap=new Map(old.map(e=>[String(e.pacote||'').trim(),e])), curMap=new Map(cur.map(e=>[String(e.pacote||'').trim(),e]));
  const rangeDates=dates.filter(d=>d>=comp.value&&d<=atual.value), history=new Map();
  rangeDates.forEach(d=>snapshotEntriesForDay(d).forEach(e=>{const k=String(e.pacote||'').trim();if(!k)return;if(!history.has(k))history.set(k,[]);history.get(k).push({day:d,value:Number(e.valor)||0,entry:e});}));
  const bases={}; const add=(base)=>{if(!bases[base])bases[base]={base,reg:regionalFromBasePrefix(base)||'OUTROS',before:0,reverted:0,removedUnconfirmed:0,current:0,persistent:0,persistentSemRisco:0,persistentComRisco:0,alternating:0,up:0,vencidoQtd:0,vencidoValor:0,driver:{}};return bases[base];};
  const packageKeys=new Set([...oldMap.keys(),...curMap.keys()].filter(Boolean));
  packageKeys.forEach(k=>{
    const before=oldMap.get(k), after=curMap.get(k), ref=after||before, b=add(ref.base), beforeValue=before?Number(before.valor)||0:0, afterValue=after?Number(after.valor)||0:0;
    b.before+=beforeValue;
    if(!after){b.reverted+=beforeValue;}
    else if(beforeValue-afterValue>0.005){b.reverted+=beforeValue-afterValue;}
    else if(before){b.persistent++;if(diasParado(after)<=2)b.persistentSemRisco++;else b.persistentComRisco++;}
    const values=(history.get(k)||[]).map(x=>x.value); let changes=0, lastSign=0;
    for(let i=1;i<values.length;i++){const diff=values[i]-values[i-1], sign=Math.abs(diff)<=0.005?0:(diff>0?1:-1);if(sign&&lastSign&&sign!==lastSign)changes++;if(sign)lastSign=sign;}
    if(changes>0)b.alternating++; if(after&&before&&afterValue-beforeValue>0.005)b.up+=afterValue;
  });
  rangeDates.forEach(d=>snapshotEntriesForDay(d).forEach(e=>{const b=add(e.base);const id=String(e.driverId||'Não identificado');if(!b.driver[id])b.driver[id]={count:0,value:0,currentValue:0};b.driver[id].count++;b.driver[id].value+=Number(e.valor)||0;}));
  cur.forEach(e=>{const b=add(e.base);const id=String(e.driverId||'Não identificado');if(!b.driver[id])b.driver[id]={count:0,value:0,currentValue:0};b.driver[id].currentValue+=Number(e.valor)||0;});
  const basesList=Object.values(bases).filter(b=>(reg==='TODOS'||b.reg===reg)&&(!basesOfensor||basesOfensor.has(b.base))&&(baseSel.value==='TODAS'||b.base===baseSel.value));
  const horaAtual=revHoraSnapshot(atual.value);
  cur.forEach(e=>{const b=bases[e.base];if(b&&revPacoteVencido(e,atual.value,horaAtual)){b.vencidoQtd++;b.vencidoValor+=Number(e.valor)||0;}});
  const rows=basesList.map(b=>{const driver=Object.entries(b.driver).sort((a,z)=>z[1].count-a[1].count||z[1].value-a[1].value)[0];b.driverId=driver?driver[0]:'';b.driverName=driver?getDriverName(driver[0]):'Não identificado';b.driverRisk=driver?(driver[1].currentValue||driver[1].value):0;b.driverCount=driver?driver[1].count:0;return b;}).sort((a,b)=>b.reverted-a.reverted||b.current-a.current);
  rows.forEach(b=>{b.current=cur.filter(e=>e.base===b.base).reduce((s,e)=>s+(Number(e.valor)||0),0);b.status=b.reverted>0.005?'green':(b.vencidoQtd>0?'red':(b.removedUnconfirmed>0.005?'removed':'orange'));});
  const valueMinRaw=document.getElementById('revValorMin')?.value.trim()||'';
  const valueMin=valueMinRaw?parseBRNumber(valueMinRaw):null;
  const selectedRows=rows.filter(b=>revStatusFilter==='TODOS'||(revStatusFilter==='red'?b.status==='red':(revStatusFilter==='green'?b.status==='green':(revStatusFilter==='removed'?b.status==='removed':b.status==='orange'))));
  const rangeRows=selectedRows.filter(b=>{const amount=revStatusFilter==='red'?b.vencidoValor:(revStatusFilter==='green'?b.reverted:(revStatusFilter==='removed'?b.removedUnconfirmed:b.current));return valueMin===null||amount>=valueMin;});
  const kpiRows=rangeRows, totalRev=kpiRows.reduce((s,b)=>s+b.reverted,0), totalRemoved=kpiRows.reduce((s,b)=>s+b.removedUnconfirmed,0), totalCur=kpiRows.reduce((s,b)=>s+b.current,0), basesRev=revStatusFilter==='TODOS'?kpiRows.filter(b=>b.reverted>0).length:kpiRows.length, persistentSafe=kpiRows.reduce((s,b)=>s+b.persistentSemRisco,0), persistentRisk=kpiRows.reduce((s,b)=>s+b.persistentComRisco,0), totalVenc=kpiRows.reduce((s,b)=>s+b.vencidoValor,0), kpiValue=revStatusFilter==='red'?totalVenc:(revStatusFilter==='removed'?totalRemoved:totalRev);
  const riskPercent=totalCur>0?(totalVenc/totalCur)*100:0, potentialCurrent=totalCur+totalVenc;
  document.getElementById('revValorEstava').textContent=fmtBRL(kpiRows.reduce((s,b)=>s+b.before,0));document.getElementById('revKpiValorLabel').textContent=revStatusFilter==='red'?'Valor não revertido':'Valor revertido';
  document.getElementById('revKpiRiscoLabel').textContent='Valor atual';document.getElementById('revKpiNaoLabel').textContent='% em risco';
  document.getElementById('revKpiBasesLabel').textContent=revStatusFilter==='red'?'Bases sem reversão':'Bases com reversão';
  const revValueEl=document.getElementById('revValor');revValueEl.textContent=(revStatusFilter==='red'?'↓ ':'')+fmtBRL(kpiValue);revValueEl.classList.toggle('rev-value-at-risk',revStatusFilter==='red');document.getElementById('revBases').textContent=fmtInt(basesRev);document.getElementById('revRisco').textContent=fmtBRL(totalCur);
  const riskButton=document.getElementById('revNaoRevertido');riskButton.textContent=riskPercent.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';riskButton.dataset.riskValue=String(totalVenc);riskButton.dataset.currentValue=String(totalCur);riskButton.dataset.potentialValue=String(potentialCurrent);riskButton.setAttribute('aria-expanded','false');document.getElementById('revRiskDetail').hidden=true;document.getElementById('revRiskDetail').innerHTML='';
  document.getElementById('revPersistentesSemRisco').textContent=fmtInt(persistentSafe);document.getElementById('revPersistentesComRisco').textContent=fmtInt(persistentRisk);document.getElementById('revPeriodo').textContent='Pacote Revertido · '+fmtDateFullBR(new Date(comp.value+'T00:00:00'))+' → '+fmtDateFullBR(new Date(atual.value+'T00:00:00'));
  const visibleRows=kpiRows;
  document.getElementById('revBody').innerHTML=visibleRows.length?visibleRows.map(b=>{const delta=b.current-b.before;const deltaClass=delta<-.005?'down':delta>.005?'up':'same';const deltaText=delta<-.005?'− '+fmtBRL(Math.abs(delta)):delta>.005?'+ '+fmtBRL(delta):fmtBRL(0);return '<tr class="status-'+b.status+'"><td><span class="rev-status '+b.status+'"><i class="rev-dot '+b.status+'"></i>'+({green:'Redução confirmada',orange:'Em prazo',red:'Não revertido',removed:'Saiu sem confirmação'}[b.status])+'</span></td><td>'+escHtml(REGIONAL_LABELS[b.reg]||b.reg)+'</td><td><strong>'+escHtml(b.base)+'</strong></td><td><strong>'+fmtBRL(b.before)+'</strong></td><td>'+fmtBRL(b.current)+'</td><td>'+fmtBRL(b.reverted)+'</td><td>'+fmtBRL(b.removedUnconfirmed)+'</td><td><span class="value-delta '+deltaClass+'">'+deltaText+'</span></td><td>'+fmtInt(b.persistentSemRisco)+'</td><td>'+fmtInt(b.persistentComRisco)+'</td><td><button type="button" class="driver-link" data-driver="'+escHtml(b.driverId)+'">'+escHtml(b.driverName)+'</button></td><td>'+fmtBRL(b.driverRisk)+'</td><td>'+fmtInt(b.driverCount)+'</td></tr>';}).join(''):'<tr><td colspan="13" class="history-empty">Nenhuma base encontrada para as datas e filtros selecionados.</td></tr>';
}
['revAtual','revComparar','revRegional','revBase','revOrigem'].forEach(id=>document.getElementById(id).addEventListener('change',renderRevertido));
document.getElementById('revQuick').addEventListener('click',e=>{const b=e.target.closest('[data-days]');if(!b)return;const ds=availableImportDates(),idx=ds.indexOf(document.getElementById('revAtual').value);const i=idx<0?ds.length-1:idx;document.getElementById('revAtual').value=ds[i];document.getElementById('revComparar').value=ds[Math.max(0,i-Number(b.dataset.days))];renderRevertido();});
document.getElementById('revLegend').addEventListener('click',e=>{const btn=e.target.closest('.rev-filter');if(!btn)return;revStatusFilter=btn.dataset.status;document.querySelectorAll('#revLegend .rev-filter').forEach(x=>x.classList.toggle('active',x===btn));renderRevertido();});
document.getElementById('revValorMin').addEventListener('input',renderRevertido);
document.getElementById('revNaoRevertido').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.currentTarget.click();}});
document.getElementById('revNaoRevertido').addEventListener('click',e=>{const btn=e.currentTarget,detail=document.getElementById('revRiskDetail');const expanded=btn.getAttribute('aria-expanded')==='true';if(expanded){btn.setAttribute('aria-expanded','false');detail.hidden=true;return;}const risk=Number(btn.dataset.riskValue)||0,current=Number(btn.dataset.currentValue)||0,potential=Number(btn.dataset.potentialValue)||0;detail.innerHTML='<div class="risk-detail-row"><span>Valor atual</span><strong>'+fmtBRL(current)+'</strong></div><div class="risk-detail-row risk-detail-danger"><span>Se não tratar o valor vencido</span><strong>↑ '+fmtBRL(potential)+'</strong></div><small>O valor não revertido vencido (48h+) soma '+fmtBRL(risk)+' em pacotes vencidos há mais de 48 horas.</small>';detail.hidden=false;btn.setAttribute('aria-expanded','true');});
document.getElementById('revBody').addEventListener('click',e=>{const btn=e.target.closest('.driver-link');if(!btn)return;motoristaSelecionado=btn.dataset.driver||'';renderMotoristas();document.getElementById('motoristaDetalhePanel').scrollTop=0;});
function renderMotoristas(){
  const rows=[];
  const comparar=document.getElementById('revComparar')?.value||'';
  const atual=document.getElementById('revAtual')?.value||'';
  const inicio=comparar&&atual?comparar:availableImportDates()[0]||'';
  const fim=atual||availableImportDates().slice(-1)[0]||'';
  const diasPeriodo=availableImportDates().filter(day=>(!inicio||day>=inicio)&&(!fim||day<=fim));
  const diasHistorico=availableImportDates().filter(day=>(!inicio||day>=inicio)&&(!fim||day<=fim));
  diasPeriodo.forEach(day=>snapshotEntriesForDay(day).forEach(e=>{if(e.driverId)rows.push({day,e});}));
  const historicoRows=[];
  diasHistorico.forEach(day=>snapshotEntriesForDay(day).forEach(e=>{if(e.driverId)historicoRows.push({day,e});}));
  const ids=Array.from(new Set(rows.map(x=>String(x.e.driverId)))).sort((a,b)=>getDriverName(a).localeCompare(getDriverName(b),'pt-BR'));
  const selected=ids.includes(motoristaSelecionado)?motoristaSelecionado:''; const filtered=selected?rows.filter(x=>String(x.e.driverId)===selected):[]; const historicoFiltered=selected?historicoRows.filter(x=>String(x.e.driverId)===selected):[]; const total=filtered.reduce((s,x)=>s+x.e.valor,0); const diasOfensor=new Set(), diasPorFaixa={ATE2:new Set(),'3A6':new Set(),'7A11':new Set()}, maiorFaixaPorDia=new Map(); historicoFiltered.forEach(x=>{const d=Number(diasParado(x.e,String(x.day)+'T00:00:00')); const faixa=d>=7&&d<=11?'7A11':d>=3&&d<=6?'3A6':d>=1&&d<=2?'ATE2':null; const nivel=faixa==='7A11'?3:faixa==='3A6'?2:faixa==='ATE2'?1:0; if(nivel>(maiorFaixaPorDia.get(x.day)?.nivel||0)) maiorFaixaPorDia.set(x.day,{faixa,nivel});}); maiorFaixaPorDia.forEach((item,day)=>{if(!item.faixa)return; diasOfensor.add(day); diasPorFaixa[item.faixa].add(day);}); const pacotes=new Set(filtered.map(x=>String(x.e.pacote||'')).filter(Boolean));
  document.getElementById('motoristaDetalhePanel').style.display=selected?'block':'none';
  const latestDriverDay=filtered.length?filtered.map(x=>x.day).sort().slice(-1)[0]:''; const turnoMetricas=selected&&latestDriverDay?motoristaMetricasDoDia(selected,latestDriverDay):{totalAtual:pacotes.size}; document.getElementById('motoristaNome').textContent=selected?getDriverName(selected):'—';document.getElementById('motoristaValor').textContent=fmtBRL(total);document.getElementById('motoristaOcorrencias').textContent=fmtInt(diasOfensor.size);document.getElementById('motoristaOfensorFaixas').innerHTML='<div class="driver-offender-breakdown"><span class="driver-age-blue" style="color:#000!important">1–2 dias: <strong style="color:#000!important">'+fmtInt(diasPorFaixa.ATE2.size)+'</strong></span><span class="driver-age-yellow" style="color:#000!important">3–6 dias: <strong style="color:#000!important">'+fmtInt(diasPorFaixa['3A6'].size)+'</strong></span><span class="driver-age-red" style="color:#000!important">7–11 dias: <strong style="color:#000!important">'+fmtInt(diasPorFaixa['7A11'].size)+'</strong></span></div>';document.getElementById('motoristaPacotes').textContent=fmtInt(turnoMetricas.totalAtual);document.getElementById('motoristaBody').innerHTML=filtered.length?filtered.sort((a,b)=>b.day.localeCompare(a.day)).map(x=>'<tr><td>'+escHtml(x.day.split('-').reverse().join('/'))+'</td><td>'+escHtml(REGIONAL_LABELS[regionalFromBasePrefix(x.e.base)]||regionalFromBasePrefix(x.e.base)||'—')+'</td><td>'+escHtml(x.e.base)+'</td><td>'+escHtml(x.e.pacote||'—')+'</td><td>'+escHtml(x.e.tipo||'—')+'</td><td><strong>'+fmtBRL(x.e.valor)+'</strong></td><td>'+escHtml(x.e.motivo||'—')+'</td></tr>').join(''):'<tr><td colspan="7" class="history-empty">Selecione um motorista para ver os pacotes e ocorrências.</td></tr>';
}
document.getElementById('motoristaDetalheFechar').addEventListener('click',()=>{motoristaSelecionado='';document.getElementById('motoristaDetalhePanel').style.display='none';});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&motoristaSelecionado){motoristaSelecionado='';document.getElementById('motoristaDetalhePanel').style.display='none';}});

const WEEKDAY_ABBR=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
function todayStr(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
document.getElementById('impDia').value=todayStr();

/* ===== INICIALIZAÇÃO ===== */
(async function init(){
  initThemePicker();
  if(PUBLIC_VIEW_MODE) setPage('geral');
  const savedDrv=loadPersistedDriverMap();
  if(savedDrv && savedDrv.map && Object.keys(savedDrv.map).length){ DRIVER_MAP=savedDrv.map; driverFileName=savedDrv.fileName; driverSavedAt=savedDrv.savedAt; driverRows=savedDrv.rows||Object.keys(savedDrv.map).length; }
  offendersBucket=loadOffendersBucket();
  IMPORTS=await loadPersistedImports();
  RETURN_SHEETS=await loadPersistedReturnSheets();
  LOST_ROUTES=loadPersistedLostRoutes();
  selectedImportId=loadSelectedImport();
  if(IMPORTS.length){ rebuildStateData(); document.getElementById('emptyState').style.display='none'; renderAll(); }
  updateImportUI();
})();

})();
