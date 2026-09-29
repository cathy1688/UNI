/**
 * UNI 监控面板 — Cloudflare Worker
 *
 * - scheduled（Cron 每小时整点）：抓取 DeFiLlama + CoinGecko，计算快照写入 KV（key="snapshot"）
 * - GET  /api/snapshot：读取 KV 快照；KV 为空则先触发一次抓取再返回
 * - POST /api/refresh ：手动刷新快照
 * - 其他路径：托管 public/ 静态前端
 *
 * 抓取失败时 try/catch，保留 KV 中的旧快照，不覆盖。
 */

// 构建时由 scripts/build.mjs 注入 public/index.html 的完整内容
const INDEX_HTML = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\" />\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n<title>UNI 监控面板</title>\n<script src=\"https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js\"></script>\n<style>\n  :root {\n    --bg: #0b0e14;\n    --card: #131926;\n    --card2: #182031;\n    --border: #232d42;\n    --text: #e8edf5;\n    --muted: #9aa4b8;\n    --faint: #5d687d;\n    --green: #34d17b;\n    --red: #f0524f;\n    --amber: #e8a33d;\n    --gold: #d9a441;\n  }\n  * { box-sizing: border-box; margin: 0; padding: 0; }\n  body {\n    background: var(--bg);\n    color: var(--text);\n    font-family: -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", system-ui, sans-serif;\n    padding: 24px 20px 40px;\n  }\n  #app { max-width: 1240px; margin: 0 auto; }\n  header.top { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }\n  header.top h1 { font-size: 26px; letter-spacing: 1px; }\n  header.top .tagline { color: var(--muted); font-size: 13px; margin-top: 6px; }\n  .meta { text-align: right; font-size: 12px; color: var(--faint); }\n  .meta button {\n    margin-top: 8px; background: var(--card2); color: var(--text);\n    border: 1px solid var(--border); border-radius: 8px;\n    padding: 8px 16px; font-size: 13px; cursor: pointer;\n  }\n  .meta button:hover { border-color: var(--gold); }\n  .meta button:disabled { opacity: 0.5; cursor: default; }\n  .card {\n    background: var(--card); border: 1px solid var(--border);\n    border-radius: 14px; padding: 24px; margin-bottom: 16px;\n  }\n  .card h2 { font-size: 16px; margin-bottom: 14px; letter-spacing: 1px; }\n  .note { font-size: 12px; color: var(--faint); margin-top: 10px; }\n\n  /* 结论区 */\n  .verdict { display: grid; grid-template-columns: 1fr 1.5fr; gap: 28px; align-items: center; }\n  .v-label { font-size: 13px; color: var(--muted); margin-bottom: 10px; letter-spacing: 2px; }\n  .v-text { font-size: 56px; font-weight: 800; letter-spacing: 2px; line-height: 1.15; }\n  .v-explain { color: var(--muted); font-size: 14px; margin-top: 12px; line-height: 1.7; }\n  .v-right { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }\n  .metric {\n    background: var(--card2); border: 1px solid var(--border);\n    border-radius: 12px; padding: 28px 20px; text-align: center;\n  }\n  .m-label { font-size: 13px; color: var(--muted); letter-spacing: 2px; margin-bottom: 14px; }\n  .m-value { font-size: 36px; font-weight: 700; line-height: 1.2; }\n  .m-sub { font-size: 14px; color: var(--faint); font-weight: 400; margin-top: 8px; }\n\n  /* KPI 一行五卡 */\n  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }\n  .kpi {\n    background: var(--card); border: 1px solid var(--border);\n    border-radius: 12px; padding: 18px 16px;\n  }\n  .kpi .k-label { font-size: 12px; color: var(--muted); letter-spacing: 1px; margin-bottom: 10px; }\n  .kpi .k-value { font-size: 24px; font-weight: 700; }\n  .kpi .k-sub { font-size: 12px; color: var(--faint); margin-top: 8px; }\n  .kpi .k-sub b { color: var(--gold); font-weight: 600; }\n\n  /* 图表 */\n  .sec-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 10px; }\n  .sec-head h2 { margin-bottom: 0; }\n  .tabs { display: flex; gap: 8px; }\n  .tabs button {\n    background: transparent; color: var(--muted); border: 1px solid var(--border);\n    border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;\n  }\n  .tabs button.on { background: var(--gold); border-color: var(--gold); color: #111; font-weight: 600; }\n\n  .grid2 { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; }\n  table { width: 100%; border-collapse: collapse; font-size: 14px; }\n  th, td { text-align: right; padding: 12px 8px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }\n  th:first-child, td:first-child { text-align: left; }\n  th { color: var(--muted); font-weight: 500; font-size: 12px; }\n  td.hl { color: var(--gold); font-weight: 600; }\n\n  .div-meta { font-size: 13px; color: var(--muted); margin-bottom: 10px; font-variant-numeric: tabular-nums; }\n  .div-text { font-size: 15px; line-height: 1.8; }\n  .div-text.warn { color: var(--amber); }\n\n  footer { text-align: center; color: var(--faint); font-size: 12px; margin-top: 24px; }\n  .err { background: #2a1518; border: 1px solid #5a2326; color: #f08a88; border-radius: 12px; padding: 24px; text-align: center; }\n\n  @media (max-width: 960px) {\n    .verdict { grid-template-columns: 1fr; }\n    .kpis { grid-template-columns: repeat(2, 1fr); }\n    .grid2 { grid-template-columns: 1fr; }\n    .v-text { font-size: 42px; }\n  }\n</style>\n</head>\n<body>\n<div id=\"app\">\n  <header class=\"top\">\n    <div>\n      <h1>UNI 监控面板</h1>\n      <p class=\"tagline\">让我知道什么时候买不贵</p>\n    </div>\n    <div class=\"meta\">\n      <div id=\"metaTime\">加载中…</div>\n      <button id=\"btnRefresh\">立即刷新</button>\n    </div>\n  </header>\n\n  <div id=\"errBox\"></div>\n\n  <section class=\"card verdict\">\n    <div class=\"v-left\">\n      <div class=\"v-label\">当前结论</div>\n      <div class=\"v-text\" id=\"vText\">…</div>\n      <div class=\"v-explain\" id=\"vExplain\">…</div>\n    </div>\n    <div class=\"v-right\">\n      <div class=\"metric\">\n        <div class=\"m-label\">主收益率</div>\n        <div class=\"m-value\" id=\"mYield\">…</div>\n      </div>\n      <div class=\"metric\">\n        <div class=\"m-label\">估值档位</div>\n        <div class=\"m-value\" id=\"mTier\">…</div>\n      </div>\n      <div class=\"metric\">\n        <div class=\"m-label\">收入方向</div>\n        <div class=\"m-value\" id=\"mDir\">…</div>\n        <div class=\"m-sub\" id=\"mDirSub\"></div>\n      </div>\n    </div>\n  </section>\n\n  <section class=\"kpis\" id=\"kpis\"></section>\n\n  <section class=\"card\">\n    <div class=\"sec-head\">\n      <h2>协议收入</h2>\n      <div class=\"tabs\" id=\"tabs\">\n        <button data-w=\"7d\">7天</button>\n        <button data-w=\"30d\" class=\"on\">30天</button>\n        <button data-w=\"90d\">90天</button>\n        <button data-w=\"all\">打开开关以来</button>\n      </div>\n    </div>\n    <div id=\"chart\" style=\"height: 420px;\"></div>\n    <p class=\"note\">分链堆叠为协议收入口径；UTC 当天未完成数据已排除；灰色虚线为 8 月基线。</p>\n  </section>\n\n  <section class=\"grid2\">\n    <div class=\"card\" style=\"margin-bottom:0\">\n      <h2>收入年化收益率</h2>\n      <p class=\"note\" id=\"mcapLine\" style=\"margin:0 0 6px\"></p>\n      <table id=\"yTable\">\n        <thead><tr><th>口径</th><th>年化收入</th><th>÷ 流通市值</th><th>÷ FDV</th></tr></thead>\n        <tbody></tbody>\n      </table>\n    </div>\n    <div class=\"card\" style=\"margin-bottom:0\">\n      <h2>主收益率</h2>\n      <div id=\"gauge\" style=\"height: 250px;\"></div>\n      <p class=\"note\">主收益率 = 30天日均协议收入 × 365 ÷ FDV</p>\n    </div>\n  </section>\n\n  <section class=\"card\" style=\"margin-top:16px\">\n    <h2>价格与收入</h2>\n    <div class=\"div-meta\" id=\"priceMeta\"></div>\n    <div class=\"div-text\" id=\"divText\"></div>\n  </section>\n\n  <footer>每小时整点自动刷新 · 数据源 DeFiLlama / CoinGecko</footer>\n</div>\n\n<script>\nlet SNAP = null, chart = null, gaugeChart = null, curWin = '30d';\nconst CHAIN_ORDER = ['Robinhood Chain', 'Ethereum', 'Base', 'Arbitrum', 'BSC', 'Polygon', 'OP Mainnet', '其他'];\nconst CHAIN_COLORS = {\n  'Robinhood Chain': '#e8a33d', 'Ethereum': '#4f9cf0', 'Base': '#2f6fed',\n  'Arbitrum': '#28a0f0', 'BSC': '#f0b90b', 'Polygon': '#8247e5',\n  'OP Mainnet': '#ff0420', '其他': '#3a455c'\n};\n\nconst fmtM = (v) => {\n  if (v == null || isNaN(v)) return '—';\n  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';\n  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';\n  if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';\n  return '$' + v.toFixed(0);\n};\nconst fmtPct = (v, d = 1) => (v == null || isNaN(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';\nconst fmtMult = (v) => '×' + v.toFixed(2);\n\nconst VERDICT_COLOR = {\n  '可以买（不贵）': '#34d17b',\n  '便宜但动量弱，等企稳或分批': '#34d17b',\n  '合理，等回调': '#e8a33d',\n  '不动': '#9aa4b8',\n  '不动，等回调': '#e8a33d',\n  '不动（贵）': '#f0524f'\n};\n\nasync function load() {\n  const r = await fetch('/api/snapshot');\n  const j = await r.json();\n  if (j.error) {\n    document.getElementById('errBox').innerHTML =\n      `<div class=\"err\">数据暂不可用：${j.error}，请稍后点击\"立即刷新\"重试。</div>`;\n    return;\n  }\n  SNAP = j;\n  renderAll();\n}\n\nfunction renderAll() {\n  const s = SNAP, v = s.verdict;\n  // header\n  const ft = new Date(s.fetchedAt);\n  const bj = ft.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });\n  document.getElementById('metaTime').textContent = `完整数据截至 ${s.d0} UTC · 抓取 ${bj}（北京）`;\n\n  // 结论区\n  const vc = VERDICT_COLOR[v.text] || '#e8edf5';\n  const vText = document.getElementById('vText');\n  vText.textContent = v.text;\n  vText.style.color = vc;\n  document.getElementById('vExplain').textContent = v.explain;\n  document.getElementById('mYield').textContent = v.yieldPct.toFixed(2) + '%';\n  document.getElementById('mYield').style.color = vc;\n  document.getElementById('mTier').textContent = v.tier;\n  document.getElementById('mDir').textContent = v.direction;\n  document.getElementById('mDir').style.color = v.direction === '在涨' ? '#34d17b' : v.direction === '在跌' ? '#f0524f' : '#9aa4b8';\n  const dp = v.dirPct;\n  document.getElementById('mDirSub').textContent = `7天相对30天 ${dp > 0 ? '+' : ''}${dp.toFixed(1)}%`;\n\n  // KPI 一行五卡\n  const k = s.kpi;\n  const cards = [\n    { label: `今日 · ${s.d0.slice(5)}`, value: fmtM(k.today.v), sub: `<b>${fmtMult(k.today.mult)}</b> 相对8月基线` },\n    { label: '7天日均', value: fmtM(k.avg7.v), sub: `<b>${fmtMult(k.avg7.mult)}</b> 相对8月基线` },\n    { label: '30天日均', value: fmtM(k.avg30.v), sub: `<b>${fmtMult(k.avg30.mult)}</b> 相对8月基线` },\n    { label: '年初至今', value: fmtM(k.ytd.sum), sub: `${k.ytd.days}天 · 日均${fmtM(k.ytd.avg)} · <b>${fmtMult(k.ytd.mult)}</b>` },\n    { label: 'Robinhood 收入占比', value: (k.robinhood.share30 * 100).toFixed(1) + '%', sub: `7天 ${(k.robinhood.share7 * 100).toFixed(1)}% · 30天 ${(k.robinhood.share30 * 100).toFixed(1)}%` },\n  ];\n  document.getElementById('kpis').innerHTML = cards.map(c =>\n    `<div class=\"kpi\"><div class=\"k-label\">${c.label}</div><div class=\"k-value\">${c.value}</div><div class=\"k-sub\">${c.sub}</div></div>`\n  ).join('');\n\n  renderChart();\n  renderTable();\n  renderGauge();\n  renderDivergence();\n}\n\nfunction winLen() {\n  const n = SNAP.series.dates.length;\n  return curWin === '7d' ? 7 : curWin === '30d' ? 30 : curWin === '90d' ? 90 : n;\n}\n\nfunction renderChart() {\n  const s = SNAP, n = winLen();\n  const dates = s.series.dates.slice(-n).map(d => d.slice(5));\n  const series = CHAIN_ORDER\n    .filter(ch => s.series.chains[ch])\n    .map(ch => ({\n      name: ch, type: 'bar', stack: 'rev',\n      data: s.series.chains[ch].slice(-n),\n      itemStyle: { color: CHAIN_COLORS[ch] },\n      emphasis: { focus: 'series' }\n    }));\n  series.push({\n    name: '7天均线', type: 'line', data: s.series.ma7.slice(-n),\n    lineStyle: { color: '#34d17b', width: 2 }, symbol: 'none', smooth: true\n  });\n  series.push({\n    name: '30天均线', type: 'line', data: s.series.ma30.slice(-n),\n    lineStyle: { color: '#e8a33d', width: 2 }, symbol: 'none', smooth: true\n  });\n  series.push({\n    name: '8月基线', type: 'line', data: new Array(n).fill(Math.round(s.augBaseline)),\n    lineStyle: { color: '#8b94a7', width: 1.5, type: 'dashed' }, symbol: 'none'\n  });\n\n  if (!chart) chart = echarts.init(document.getElementById('chart'));\n  chart.setOption({\n    backgroundColor: 'transparent',\n    tooltip: {\n      trigger: 'axis',\n      backgroundColor: '#182031', borderColor: '#232d42', textStyle: { color: '#e8edf5' },\n      valueFormatter: (v) => v == null ? '—' : fmtM(v)\n    },\n    legend: {\n      textStyle: { color: '#9aa4b8' }, top: 0,\n      type: 'scroll', pageTextStyle: { color: '#9aa4b8' }\n    },\n    grid: { left: 56, right: 12, top: 40, bottom: 28 },\n    xAxis: { type: 'category', data: dates, axisLabel: { color: '#5d687d', fontSize: 11 } },\n    yAxis: {\n      type: 'value',\n      axisLabel: { color: '#5d687d', formatter: (v) => v >= 1e6 ? (v / 1e6) + 'M' : (v / 1e3) + 'K' },\n      splitLine: { lineStyle: { color: '#1a2233' } }\n    },\n    series\n  }, true);\n}\n\nfunction renderTable() {\n  const s = SNAP;\n  document.getElementById('mcapLine').textContent =\n    `流通市值 ${fmtM(s.price.mcap)} · FDV ${fmtM(s.price.fdv)} · UNI $${s.price.usd != null ? s.price.usd.toFixed(2) : '—'}`;\n  const tb = document.querySelector('#yTable tbody');\n  tb.innerHTML = s.yieldTable.map((r, i) => `\n    <tr>\n      <td>${r.name}</td>\n      <td>${fmtM(r.v)}</td>\n      <td class=\"${i === 2 ? 'hl' : ''}\">${(r.vsMcap * 100).toFixed(2)}%</td>\n      <td class=\"${i === 2 ? 'hl' : ''}\">${(r.vsFdv * 100).toFixed(2)}%</td>\n    </tr>`).join('');\n}\n\nfunction renderGauge() {\n  const y = SNAP.verdict.yieldPct;\n  if (!gaugeChart) gaugeChart = echarts.init(document.getElementById('gauge'));\n  gaugeChart.setOption({\n    backgroundColor: 'transparent',\n    series: [{\n      type: 'gauge', min: 0, max: 8,\n      progress: { show: false },\n      axisLine: {\n        lineStyle: {\n          width: 20,\n          color: [[0.25, '#f0524f'], [0.375, '#e8a33d'], [0.5, '#d9c93d'], [0.75, '#7fc96b'], [1, '#34d17b']]\n        }\n      },\n      axisTick: { show: false }, splitLine: { show: false },\n      axisLabel: { color: '#5d687d', fontSize: 11, formatter: (v) => v + '%' },\n      pointer: { itemStyle: { color: '#e8edf5' } },\n      anchor: { show: true, itemStyle: { color: '#e8edf5' } },\n      detail: { valueAnimation: true, formatter: '{value}%', color: '#e8edf5', fontSize: 30, fontWeight: 700, offsetCenter: [0, '55%'] },\n      title: { show: false },\n      data: [{ value: +y.toFixed(2) }]\n    }]\n  }, true);\n}\n\nfunction renderDivergence() {\n  const p = SNAP.price;\n  document.getElementById('priceMeta').textContent =\n    `UNI $${p.usd != null ? p.usd.toFixed(2) : '—'} · 7天 ${fmtPct(p.chg7d)} · 30天 ${fmtPct(p.chg30d)}`;\n  const el = document.getElementById('divText');\n  el.textContent = SNAP.divergence;\n  el.classList.toggle('warn', /背离/.test(SNAP.divergence));\n}\n\ndocument.getElementById('tabs').addEventListener('click', (e) => {\n  const b = e.target.closest('button');\n  if (!b) return;\n  curWin = b.dataset.w;\n  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));\n  renderChart();\n});\n\ndocument.getElementById('btnRefresh').addEventListener('click', async (e) => {\n  const btn = e.target;\n  btn.disabled = true;\n  btn.textContent = '刷新中…';\n  try {\n    const r = await fetch('/api/refresh', { method: 'POST' });\n    const j = await r.json();\n    if (!r.ok) throw new Error(j.error || 'refresh failed');\n    await load();\n  } catch (err) {\n    alert('刷新失败：' + err.message);\n  } finally {\n    btn.disabled = false;\n    btn.textContent = '立即刷新';\n  }\n});\n\nwindow.addEventListener('resize', () => { chart && chart.resize(); gaugeChart && gaugeChart.resize(); });\n\nload();\n</script>\n</body>\n</html>\n";

const LLAMA_URL = 'https://api.llama.fi/summary/fees/uniswap?dataType=dailyRevenue';
const CG_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=uniswap&price_change_percentage=7d,30d';

// DeFiLlama 价格备用源（CoinGecko 常屏蔽数据中心 IP）
const LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/coingecko:uniswap';
const llamaHist = (ts) => `https://coins.llama.fi/prices/historical/${ts}/coingecko:uniswap`;
const UNI_TOTAL_SUPPLY = 1e9; // UNI 总供应 10 亿固定，FDV = 现价 × 1e9

// UTC 时间戳（秒）
const AUG_START = 1785542400; // 2026-08-01T00:00:00Z
const AUG_END = 1788220800; // 2026-09-01T00:00:00Z
const YTD_START = 1767225600; // 2026-01-01T00:00:00Z

// 分链堆叠展示的主力链（按近 30 天协议收入排序），其余并入"其他"
const TOP_CHAINS = [
  'Robinhood Chain',
  'Ethereum',
  'Base',
  'Arbitrum',
  'BSC',
  'Polygon',
  'OP Mainnet',
];

function dayTotal(bd) {
  let s = 0;
  for (const ch of Object.values(bd)) for (const v of Object.values(ch)) s += v;
  return s;
}

function chainTotal(bd, chain) {
  const c = bd[chain];
  if (!c) return 0;
  let s = 0;
  for (const v of Object.values(c)) s += v;
  return s;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const fmtDate = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

// 估值档位：主收益率 = 30天日均协议收入 × 365 ÷ FDV
function tierOf(y) {
  if (y < 0.02) return '贵';
  if (y < 0.03) return '中间偏贵';
  if (y < 0.04) return '中间';
  if (y < 0.06) return '便宜';
  return '很便宜';
}

// 结论矩阵：估值档位 × 收入方向
function verdictOf(tier, dir) {
  const cheap = tier === '便宜' || tier === '很便宜';
  const mid = tier === '中间';
  if (cheap && dir === '在涨') return '可以买（不贵）';
  if (cheap) return '便宜但动量弱，等企稳或分批';
  if (mid && dir === '在涨') return '合理，等回调';
  if (mid) return '不动';
  if (dir === '在涨') return '不动，等回调';
  return '不动（贵）';
}

const EXPLAINS = {
  '可以买（不贵）': '收益率进入便宜区间，且短期收入趋势向上。',
  '便宜但动量弱，等企稳或分批': '估值已便宜，但短期收入动量转弱，等企稳或分批。',
  '合理，等回调': '估值合理，短期收入在涨，等回调。',
  '不动': '估值中等，短期收入动量不足，先不动。',
  '不动，等回调': '估值偏贵但短期收入在涨，等回调。',
  '不动（贵）': '收益率偏低，同时短期协议收入未强于30日趋势。',
};

function buildSnapshot(rev, cg) {
  const rows = rev.totalDataChartBreakdown;
  if (!rows || !rows.length) throw new Error('empty llama payload');

  // D0 = 最近一个完整 UTC 日：必须排除 UTC 当天未完成的数据点
  const nowSec = Math.floor(Date.now() / 1000);
  const utcMidnight = nowSec - (nowSec % 86400);
  const done = rows.filter((r) => r[0] < utcMidnight);
  if (!done.length) throw new Error('no complete day');

  const totals = done.map((r) => dayTotal(r[1]));
  const dates = done.map((r) => fmtDate(r[0]));
  const n = done.length;

  const today = totals[n - 1];
  const avg7 = mean(totals.slice(-7));
  const avg30 = mean(totals.slice(-30));

  // 8月基线 = 2026-08-01~08-31 日均协议收入（动态计算）
  const augRows = done.filter((r) => r[0] >= AUG_START && r[0] < AUG_END);
  const augBaseline = augRows.length ? mean(augRows.map((r) => dayTotal(r[1]))) : 0;

  // 年初至今
  const ytdRows = done.filter((r) => r[0] >= YTD_START);
  const ytdSum = ytdRows.reduce((s, r) => s + dayTotal(r[1]), 0);
  const ytdAvg = ytdRows.length ? ytdSum / ytdRows.length : 0;

  // 收入方向：7天均值 vs 30天均值，±5% 阈值
  const dirPct = avg30 ? (avg7 - avg30) / avg30 : 0;
  const direction = dirPct > 0.05 ? '在涨' : dirPct < -0.05 ? '在跌' : '走平';

  const price = cg || {};
  const fdv = price.fully_diluted_valuation || 0;
  const mcap = price.market_cap || 0;
  const yld = fdv > 0 ? (avg30 * 365) / fdv : 0;
  const tier = tierOf(yld);
  const verdictText = verdictOf(tier, direction);

  // Robinhood 收入占比：7天 / 30天双口径
  const sumTot = (arr) => arr.reduce((s, r) => s + dayTotal(r[1]), 0);
  const sumRh = (arr) => arr.reduce((s, r) => s + chainTotal(r[1], 'Robinhood Chain'), 0);
  const last7 = done.slice(-7);
  const last30 = done.slice(-30);
  const rh7 = sumTot(last7) ? sumRh(last7) / sumTot(last7) : 0;
  const rh30 = sumTot(last30) ? sumRh(last30) / sumTot(last30) : 0;

  // 分链日序列（主力链 + 其他）
  const chains = {};
  for (const ch of TOP_CHAINS) chains[ch] = done.map((r) => chainTotal(r[1], ch));
  chains['其他'] = done.map((r) => {
    let s = dayTotal(r[1]);
    for (const ch of TOP_CHAINS) s -= chainTotal(r[1], ch);
    return Math.max(0, s);
  });

  // 7/30天均线（数据不足处为 null）
  const ma = (k) =>
    totals.map((_, i) => (i + 1 >= k ? mean(totals.slice(i + 1 - k, i + 1)) : null));

  // 四种收入年化 × 流通市值 / FDV 收益率表
  const ann = (v) => v * 365;
  const yieldTable = [
    { name: '今日年化', v: ann(today) },
    { name: '7天年化', v: ann(avg7) },
    { name: '30天年化', v: ann(avg30) },
    { name: '8月基线年化', v: ann(augBaseline) },
  ].map((r) => ({
    ...r,
    vsMcap: mcap ? r.v / mcap : 0,
    vsFdv: fdv ? r.v / fdv : 0,
  }));

  // 价格与收入背离提示
  const chg7 = price.price_change_percentage_7d_in_currency ?? null;
  let divergence;
  if (direction === '在跌' && chg7 !== null && chg7 > 5) {
    divergence = `价格7天上涨 ${chg7.toFixed(1)}%，但协议收入在跌（7天相对30天 ${(dirPct * 100).toFixed(1)}%），注意背离。`;
  } else if (direction === '在涨' && chg7 !== null && chg7 < -5) {
    divergence = `协议收入在涨（7天相对30天 +${(dirPct * 100).toFixed(1)}%），但价格7天 ${chg7.toFixed(1)}%，数据在涨、价格不动。`;
  } else {
    divergence = '价格与收入方向暂无明显背离。';
  }

  return {
    fetchedAt: new Date().toISOString(),
    d0: fmtDate(done[n - 1][0]), // 文案统一用"今日"，此处仅存日期
    price: {
      usd: price.current_price ?? null,
      mcap,
      fdv,
      chg24h: price.price_change_percentage_24h ?? null,
      chg7d: chg7,
      chg30d: price.price_change_percentage_30d_in_currency ?? null,
    },
    augBaseline,
    kpi: {
      today: { v: today, mult: augBaseline ? today / augBaseline : 0 },
      avg7: { v: avg7, mult: augBaseline ? avg7 / augBaseline : 0 },
      avg30: { v: avg30, mult: augBaseline ? avg30 / augBaseline : 0 },
      ytd: {
        sum: ytdSum,
        days: ytdRows.length,
        avg: ytdAvg,
        mult: augBaseline ? ytdAvg / augBaseline : 0,
      },
      robinhood: { share7: rh7, share30: rh30 },
    },
    verdict: {
      yieldPct: yld * 100,
      tier,
      direction,
      dirPct: dirPct * 100,
      text: verdictText,
      explain: EXPLAINS[verdictText],
    },
    yieldTable,
    divergence,
    series: { dates, totals, chains, ma7: ma(7), ma30: ma(30) },
  };
}

async function getPriceFromLlama() {
  const now = Math.floor(Date.now() / 1000);
  const urls = [
    LLAMA_PRICE_URL,
    llamaHist(now - 86400),
    llamaHist(now - 7 * 86400),
    llamaHist(now - 30 * 86400),
  ];
  const rs = await Promise.all(urls.map((u) => fetch(u)));
  if (rs.some((r) => !r.ok)) throw new Error('llama price failed');
  const js = await Promise.all(rs.map((r) => r.json()));
  const px = (j) => j.coins['coingecko:uniswap'].price;
  const [p0, p1, p7, p30] = js.map(px);
  if (!p0) throw new Error('llama price empty');
  const chg = (p) => (((p0 - p) / p) * 100);
  return {
    current_price: p0,
    fully_diluted_valuation: p0 * UNI_TOTAL_SUPPLY,
    market_cap: null, // 备用源无流通市值，前端显示 —
    price_change_percentage_24h: chg(p1),
    price_change_percentage_7d_in_currency: chg(p7),
    price_change_percentage_30d_in_currency: chg(p30),
  };
}

// 价格：优先 CoinGecko（带完整市值），被屏蔽时降级到 DeFiLlama
async function getPrice() {
  try {
    const r = await fetch(CG_URL, { headers: { 'user-agent': 'uni-dashboard/1.0' } });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr[0] && arr[0].current_price) return arr[0];
    }
  } catch {}
  try {
    return await getPriceFromLlama();
  } catch {}
  return null;
}

async function refreshSnapshot(env) {
  try {
    const [rr, price] = await Promise.all([fetch(LLAMA_URL), getPrice()]);
    if (!rr.ok) throw new Error(`upstream ${rr.status}`);
    const rev = await rr.json();
    const snap = buildSnapshot(rev, price);
    await env.CACHE.put('snapshot', JSON.stringify(snap));
    return snap;
  } catch (e) {
    // 抓取失败：保留 KV 中的旧快照，不覆盖
    return await env.CACHE.get('snapshot', 'json');
  }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  // Cron Trigger：每小时整点刷新快照
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshSnapshot(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/snapshot' && request.method === 'GET') {
      let snap = await env.CACHE.get('snapshot', 'json');
      if (!snap) snap = await refreshSnapshot(env); // KV 为空时先触发一次抓取
      if (!snap) return json({ error: 'snapshot unavailable' }, 503);
      return json(snap);
    }

    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      const snap = await refreshSnapshot(env);
      if (!snap) return json({ error: 'refresh failed, kept old snapshot' }, 502);
      return json({ ok: true, fetchedAt: snap.fetchedAt });
    }

    // 静态前端（构建时已内联进 INDEX_HTML，不再依赖 ASSETS 绑定）
    return new Response(INDEX_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    });
  },
};
